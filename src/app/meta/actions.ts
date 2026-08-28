'use server';

import {
  getMetaSummary, getMetaCampaigns, getMetaAdsets, getMetaAds, getMetaTrend,
  getMetaCreativeOptions, getMetaAdsCreative,
} from '@/lib/queries/meta';
import { getGa4Trend } from '@/lib/queries/ga4';
import { supabaseServer } from '@/lib/supabase/server';
import { cached } from '@/lib/cache';

// ─── BFT-shaped response types (kept for compatibility with the page shell) ─

export interface Totals {
  leads:           number;
  spend_aud:       number;
  impressions:     number;
  clicks:          number;
  reach:           number;
  cpl_blended:     number | null;
  cpl_meta:        number | null;
  cpl_website:     number | null;
  ctr:             number | null;
  cpc:             number | null;
  cpm:             number | null;
  conversion_rate: number | null;
  // Meta-attributed conversions per META_CONVERSION_DEFINITION.
  conversions:         number;
  cost_per_conversion: number | null;
  video_views:         number;
  // Google Ads-only: revenue value assigned to conversions (empty on Meta / GA4).
  conversion_value?:   number;
}

export interface DailyRow {
  date:                 string;
  leads:                number;
  spend_aud:            number;
  impressions:          number;
  clicks:               number;
  reach:                number;
  cpl_blended:          number | null;
  cpl_meta:             number | null;
  cpl_website:          number | null;
  ctr:                  number | null;
  cpc:                  number | null;
  cpm:                  number | null;
  conversion_rate:      number | null;
  conversions?:         number;
  cost_per_conversion?: number | null;
  video_views?:         number;
}

export interface AgencyRow {
  agency_name:  string;
  leads:        number;
  spend_aud:    number;
  cpl_blended:  number | null;
  cpl_meta:     number | null;
  cpl_website:  number | null;
  ctr:          number | null;
  cpc:          number | null;
  cpm:          number | null;
}

export interface StudioRow {
  studio_name:  string;
  agency_name:  string;
  leads:        number;
  spend_aud:    number;
  cpl_blended:  number | null;
  cpl_meta:     number | null;
  cpl_website:  number | null;
  ctr:          number | null;
  cpc:          number | null;
  cpm:          number | null;
}

export interface Benchmarks {
  cpl_blended:  number | null;
  cpl_meta:     number | null;
  cpl_website:  number | null;
  ctr:          number | null;
  cpc:          number | null;
  cpm:          number | null;
}

export interface TrendRow {
  date:        string;
  cpl_blended: number | null;
  cpl_meta:    number | null;
  cpl_website: number | null;
  ctr:         number | null;
  cpc:         number | null;
  cpm:         number | null;
  spend?:      number | null;   // Meta-only: primary chart series (left axis)
  clicks?:     number | null;   // Meta-only: primary chart series (right axis)
  sessions?:         number | null;  // GA4-only: chart series
  total_users?:      number | null;  // GA4-only: chart series
  page_views?:       number | null;  // GA4-only: chart series
  engaged_sessions?: number | null;  // GA4-only: chart series
}

// ─── Meta-specific filter shape + options ───────────────────────────────────

export interface MetaFilters {
  campaigns:     string[];
  adsets:        string[];
  ads:           string[];
  creativeTypes: string[];
  objectives:    string[];
}

export interface MetaFilterOptions {
  campaigns:     string[];
  adsets:        string[];
  ads:           string[];
  creativeTypes: string[];
  objectives:    string[];
}

export async function getFilterOptions(startDate: string, endDate: string): Promise<MetaFilterOptions> {
  const range = { from: startDate, to: endDate };
  const sb = supabaseServer();
  const [c, a, ad, ct, obj] = await Promise.all([
    getMetaCampaigns(range),
    getMetaAdsets(range),
    getMetaAds(range),
    getMetaCreativeOptions(range),
    sb.schema('silver').from('meta_campaign').select('objective'),
  ]);
  return {
    campaigns:     [...new Set(c.map(x => x.campaign_name).filter(Boolean) as string[])].sort(),
    adsets:        [...new Set(a.map(x => x.adset_name   ).filter(Boolean) as string[])].sort(),
    ads:           [...new Set(ad.map(x => x.ad_name     ).filter(Boolean) as string[])].sort(),
    creativeTypes: ct,
    objectives:    [...new Set((obj.data ?? []).map(r => (r as { objective: string | null }).objective).filter(Boolean) as string[])].sort(),
  };
}

// ─── Aggregation helper ────────────────────────────────────────────────────

interface AggRow { spend: number; impressions: number; clicks: number; reach?: number }

function aggregate(rows: AggRow[]) {
  const spend       = rows.reduce((s, r) => s + Number(r.spend       || 0), 0);
  const impressions = rows.reduce((s, r) => s + Number(r.impressions || 0), 0);
  const clicks      = rows.reduce((s, r) => s + Number(r.clicks      || 0), 0);
  const reach       = rows.reduce((s, r) => s + Number(r.reach       || 0), 0);
  return {
    spend_aud: spend,
    impressions,
    clicks,
    reach,
    ctr: impressions ? (clicks / impressions) * 100 : null,
    cpc: clicks      ? spend / clicks               : null,
    cpm: impressions ? (spend / impressions) * 1000 : null,
  };
}

// ─── Above-fold fetch (filter-aware) ───────────────────────────────────────

async function _fetchAboveFoldImpl(startDate: string, endDate: string, f: MetaFilters): Promise<{
  totals:        Totals | null;
  daily:         DailyRow[];
  fallback:      boolean;
  agencies:      AgencyRow[];
  filterOptions: { studios: string[]; countries: string[]; states: string[]; cities: string[] };
}> {
  const range = { from: startDate, to: endDate };
  const hasAds        = (f.ads           ?? []).length > 0;
  const hasAdsets     = (f.adsets        ?? []).length > 0;
  const hasCampaigns  = (f.campaigns     ?? []).length > 0;
  const hasCreative   = (f.creativeTypes ?? []).length > 0;
  const hasObjectives = (f.objectives    ?? []).length > 0;
  const anyFilter     = hasAds || hasAdsets || hasCampaigns || hasCreative || hasObjectives;

  const sb = supabaseServer();

  // Objective filter → campaign_id set (constrain downstream filter cascade).
  let objectiveCampIds: Set<string> | null = null;
  if (hasObjectives) {
    const { data } = await sb.schema('silver').from('meta_campaign')
      .select('campaign_id,objective').in('objective', f.objectives);
    objectiveCampIds = new Set((data ?? []).map(r => (r as { campaign_id: string }).campaign_id));
  }

  let totalsCore: ReturnType<typeof aggregate>;
  let daily: DailyRow[] = [];

  // GA4 daily lead events — kept for the daily leads sparkline only (Click to
  // Lead Rate tile is removed; Conversions / CPA below is the new source).
  const ga4Trend = await getGa4Trend(range);
  const leadsByDate: Record<string, number> = {};
  for (const g of ga4Trend) leadsByDate[g.date] = g.lead_events;
  const totalLeads = ga4Trend.reduce((s, g) => s + g.lead_events, 0);

  if (!anyFilter) {
    const [summary, trend] = await Promise.all([getMetaSummary(range), getMetaTrend(range)]);
    totalsCore = summary
      ? {
          spend_aud:   summary.spend,
          impressions: summary.impressions,
          clicks:      summary.clicks,
          reach:       summary.reach,
          ctr:         summary.ctr,
          cpc:         summary.cpc,
          cpm:         summary.cpm,
        }
      : { spend_aud: 0, impressions: 0, clicks: 0, reach: 0, ctr: null, cpc: null, cpm: null };
    daily = trend.map(r => {
      const dailyLeads = leadsByDate[r.date] ?? 0;
      return {
        date:            r.date,
        leads:           dailyLeads,
        spend_aud:       r.spend,
        impressions:     r.impressions,
        clicks:          r.clicks,
        reach:           r.reach,
        cpl_blended:     null,
        cpl_meta:        null,
        cpl_website:     null,
        ctr:             r.ctr,
        cpc:             r.cpc,
        cpm:             r.cpm,
        conversion_rate: r.clicks ? (dailyLeads / r.clicks) * 100 : null,
      };
    });
  } else if (hasCreative || hasAds) {
    // silver.meta_ads_with_creative carries media_type + ad_name + IDs — the
    // single source that lets creative + ad-name filters combine cleanly.
    const ads = await getMetaAdsCreative(range);
    let rows = ads;
    if (hasCreative)         rows = rows.filter(a => f.creativeTypes.includes(a.media_type ?? ''));
    if (hasAds)              rows = rows.filter(a => f.ads          .includes(a.ad_name    ?? ''));
    if (objectiveCampIds)    rows = rows.filter(a => objectiveCampIds!.has(a.campaign_id));
    totalsCore = aggregate(rows);
  } else if (hasAdsets) {
    const adsets = await getMetaAdsets(range);
    let rows = adsets.filter(a => f.adsets.includes(a.adset_name));
    if (hasCampaigns)        rows = rows.filter(a => f.campaigns.includes(a.campaign_name));
    if (objectiveCampIds)    rows = rows.filter(a => objectiveCampIds!.has(a.campaign_id));
    totalsCore = aggregate(rows);
  } else if (hasCampaigns) {
    const campaigns = await getMetaCampaigns(range);
    let rows = campaigns.filter(c => f.campaigns.includes(c.campaign_name));
    if (objectiveCampIds)    rows = rows.filter(c => objectiveCampIds!.has(c.campaign_id));
    totalsCore = aggregate(rows);
  } else {
    // hasObjectives alone — no name filters, restrict campaigns by objective.
    const campaigns = await getMetaCampaigns(range);
    const rows = campaigns.filter(c => objectiveCampIds!.has(c.campaign_id));
    totalsCore = aggregate(rows);
  }

  // ─── Conversions (Meta-attributed, per META_CONVERSION_DEFINITION) ─────
  // Aggregate silver.meta_ad_conversion_insights across the date window,
  // narrowed by whichever cascading filter is active. Same filter mask as
  // the entity tables so the top-of-page total agrees with per-entity sums.
  const convQuery = sb.schema('silver').from('meta_ad_conversion_insights')
    .select('date,campaign_id,adset_id,ad_id,lead,video_view')
    .gte('date', startDate).lte('date', endDate);
  const { data: convRows } = await convQuery;
  let convFiltered = convRows ?? [];
  // Reuse the ad-level mask by walking through the same filter dims.
  if (hasCreative || hasAds) {
    const ads = await getMetaAdsCreative(range);
    let passingAds = ads;
    if (hasCreative)      passingAds = passingAds.filter(a => f.creativeTypes.includes(a.media_type ?? ''));
    if (hasAds)           passingAds = passingAds.filter(a => f.ads          .includes(a.ad_name    ?? ''));
    if (objectiveCampIds) passingAds = passingAds.filter(a => objectiveCampIds!.has(a.campaign_id));
    const passingAdIds = new Set(passingAds.map(a => a.ad_id));
    convFiltered = convFiltered.filter(r => passingAdIds.has((r as { ad_id: string }).ad_id));
  } else if (hasAdsets) {
    const adsets = await getMetaAdsets(range);
    let passingAdsets = adsets.filter(a => f.adsets.includes(a.adset_name));
    if (hasCampaigns)     passingAdsets = passingAdsets.filter(a => f.campaigns.includes(a.campaign_name));
    if (objectiveCampIds) passingAdsets = passingAdsets.filter(a => objectiveCampIds!.has(a.campaign_id));
    const passingAdsetIds = new Set(passingAdsets.map(a => a.adset_id));
    convFiltered = convFiltered.filter(r => passingAdsetIds.has((r as { adset_id: string }).adset_id));
  } else if (hasCampaigns || hasObjectives) {
    const campaigns = await getMetaCampaigns(range);
    let passingCamps = campaigns;
    if (hasCampaigns)     passingCamps = passingCamps.filter(c => f.campaigns.includes(c.campaign_name));
    if (objectiveCampIds) passingCamps = passingCamps.filter(c => objectiveCampIds!.has(c.campaign_id));
    const passingCampIds = new Set(passingCamps.map(c => c.campaign_id));
    convFiltered = convFiltered.filter(r => passingCampIds.has((r as { campaign_id: string }).campaign_id));
  }
  type ConvRow = { date: string; lead: number | null; video_view: number | null };
  const conversions = convFiltered.reduce(
    (s, r) => s + Number((r as ConvRow).lead || 0), 0,
  );
  const videoViews = convFiltered.reduce(
    (s, r) => s + Number((r as ConvRow).video_view || 0), 0,
  );
  const costPerConversion = conversions > 0 ? totalsCore.spend_aud / conversions : null;

  // Per-day rollups for the Daily Summary conversions / CPA / video views columns.
  const convByDate  = new Map<string, number>();
  const videoByDate = new Map<string, number>();
  for (const r of convFiltered as ConvRow[]) {
    const cw = Number(r.lead || 0);
    const vv = Number(r.video_view      || 0);
    if (cw) convByDate.set (r.date, (convByDate.get (r.date) ?? 0) + cw);
    if (vv) videoByDate.set(r.date, (videoByDate.get(r.date) ?? 0) + vv);
  }
  daily = daily.map(d => {
    const dayConv  = convByDate.get(d.date)  ?? 0;
    const dayVideo = videoByDate.get(d.date) ?? 0;
    return {
      ...d,
      conversions:         dayConv,
      cost_per_conversion: dayConv > 0 ? d.spend_aud / dayConv : null,
      video_views:         dayVideo,
    };
  });

  const totals: Totals = {
    leads:               totalLeads,
    spend_aud:           totalsCore.spend_aud,
    impressions:         totalsCore.impressions,
    clicks:              totalsCore.clicks,
    reach:               totalsCore.reach,
    cpl_blended:         null,
    cpl_meta:            null,
    cpl_website:         null,
    ctr:                 totalsCore.ctr,
    cpc:                 totalsCore.cpc,
    cpm:                 totalsCore.cpm,
    conversion_rate:     null,
    conversions:         conversions,
    cost_per_conversion: costPerConversion,
    video_views:         videoViews,
  };

  return {
    totals,
    daily,
    fallback:      false,
    agencies:      [],
    filterOptions: { studios: [], countries: [], states: [], cities: [] },
  };
}

// ─── Below-fold (unchanged — atWork has no studios/agencies/trends set) ────

export async function fetchBelowFold(startDate: string, endDate: string, _filters: MetaFilters): Promise<{
  trends: TrendRow[];
}> {
  // MetricTrendsChart source — CPL fields stay null (no lead-attribution
  // model on Meta side), CTR/CPC/CPM come from the day-level derived ratios
  // inside getMetaTrend. Studios / studiosPerAgency removed — those sections
  // were BFT-only and always empty on Meta, so no query fires for them.
  const trendRows = await getMetaTrend({ from: startDate, to: endDate });
  const trends: TrendRow[] = trendRows.map(r => ({
    date:        r.date,
    cpl_blended: null,
    cpl_meta:    null,
    cpl_website: null,
    ctr:         r.ctr,
    cpc:         r.cpc,
    cpm:         r.cpm,
    spend:       r.spend,
    clicks:      r.clicks,
  }));
  return { trends };
}

export async function fetchBenchmarks(): Promise<Benchmarks | null> {
  return null;
}

export async function fetchCampaigns(startDate: string, endDate: string) {
  return getMetaCampaigns({ from: startDate, to: endDate });
}

// ─── Entity tables (Campaigns / Ad Sets / Ads) ─────────────────────────────
//
// Per-entity aggregation with the filter set applied. Uses each entity's own
// pre-aggregated silver table for correct reach at that granularity, and
// intersects with an ad-level filter mask when a cross-dim filter is active.

export interface EntityRow {
  name:                string;
  media_type?:         string | null;
  objective?:          string | null;   // Campaigns table only
  spend:               number;
  impressions:         number;
  clicks:              number;
  reach:               number;
  conversions:         number;          // Meta-attributed lead events (Meta pixel `lead` action_type)
  cost_per_conversion: number | null;
  video_views:         number;          // silver.meta_ad_conversion_insights.video_view
  ctr:                 number | null;
  cpc:                 number | null;
  cpm:                 number | null;
}

async function _fetchEntityTablesImpl(startDate: string, endDate: string, f: MetaFilters): Promise<{
  campaigns: EntityRow[];
  adsets:    EntityRow[];
  ads:       EntityRow[];
}> {
  const range = { from: startDate, to: endDate };
  const sb = supabaseServer();
  const [campaigns, adsets, adsCreative, convData, campDim] = await Promise.all([
    getMetaCampaigns(range),
    getMetaAdsets(range),
    getMetaAdsCreative(range),
    sb.schema('silver').from('meta_ad_conversion_insights')
      .select('campaign_id,adset_id,ad_id,lead,video_view')
      .gte('date', startDate).lte('date', endDate),
    sb.schema('silver').from('meta_campaign').select('campaign_id,objective'),
  ]);

  const hasCampaigns  = (f.campaigns     ?? []).length > 0;
  const hasAdsets     = (f.adsets        ?? []).length > 0;
  const hasAds        = (f.ads           ?? []).length > 0;
  const hasCreative   = (f.creativeTypes ?? []).length > 0;
  const hasObjectives = (f.objectives    ?? []).length > 0;

  const campIdByName  = new Map<string, string>();
  for (const c of campaigns) campIdByName.set(c.campaign_name, c.campaign_id);
  const adsetIdByName = new Map<string, string>();
  for (const a of adsets)    adsetIdByName.set(a.adset_name,   a.adset_id);

  const selCampIds  = new Set(f.campaigns.map(n => campIdByName.get(n)).filter(Boolean) as string[]);
  const selAdsetIds = new Set(f.adsets.map(n => adsetIdByName.get(n)).filter(Boolean) as string[]);
  const selAdNames  = new Set(f.ads);
  const selCreative = new Set(f.creativeTypes);

  // Objective → campaign_id set + campaign_id → objective map.
  const objectiveByCampId = new Map<string, string | null>();
  for (const r of (campDim.data ?? []) as { campaign_id: string; objective: string | null }[]) {
    objectiveByCampId.set(r.campaign_id, r.objective);
  }
  const selObjCampIds = hasObjectives
    ? new Set([...objectiveByCampId.entries()]
        .filter(([, o]) => o != null && f.objectives.includes(o))
        .map(([id]) => id))
    : null;

  // Conversions + video views aggregated per ad_id, adset_id, campaign_id from
  // the silver view. Video views tracked in parallel so entity tables and
  // scorecards agree.
  const convByCamp   = new Map<string, number>();
  const convByAdset  = new Map<string, number>();
  const convByAd     = new Map<string, number>();
  const videoByCamp  = new Map<string, number>();
  const videoByAdset = new Map<string, number>();
  const videoByAd    = new Map<string, number>();
  type ConvRow = { campaign_id: string; adset_id: string; ad_id: string; lead: number | null; video_view: number | null };
  for (const r of (convData.data ?? []) as ConvRow[]) {
    const cw = Number(r.lead || 0);
    const vv = Number(r.video_view      || 0);
    if (cw) {
      convByCamp.set (r.campaign_id, (convByCamp.get (r.campaign_id) ?? 0) + cw);
      convByAdset.set(r.adset_id,    (convByAdset.get(r.adset_id)    ?? 0) + cw);
      convByAd.set   (r.ad_id,       (convByAd.get   (r.ad_id)       ?? 0) + cw);
    }
    if (vv) {
      videoByCamp.set (r.campaign_id, (videoByCamp.get (r.campaign_id) ?? 0) + vv);
      videoByAdset.set(r.adset_id,    (videoByAdset.get(r.adset_id)    ?? 0) + vv);
      videoByAd.set   (r.ad_id,       (videoByAd.get   (r.ad_id)       ?? 0) + vv);
    }
  }
  const cpa = (spend: number, conv: number) => conv > 0 ? spend / conv : null;

  // Filter the ad-level source with every active dim.
  let filteredAds = adsCreative;
  if (hasCampaigns)  filteredAds = filteredAds.filter(a => selCampIds.has(a.campaign_id));
  if (hasAdsets)     filteredAds = filteredAds.filter(a => selAdsetIds.has(a.adset_id));
  if (hasAds)        filteredAds = filteredAds.filter(a => selAdNames.has(a.ad_name ?? ''));
  if (hasCreative)   filteredAds = filteredAds.filter(a => selCreative.has(a.media_type ?? ''));
  if (selObjCampIds) filteredAds = filteredAds.filter(a => selObjCampIds.has(a.campaign_id));

  const passingCampIds  = new Set(filteredAds.map(a => a.campaign_id));
  const passingAdsetIds = new Set(filteredAds.map(a => a.adset_id));

  // Campaigns table — attach objective from silver.meta_campaign + conversions.
  let campRows = campaigns;
  if (hasCampaigns)  campRows = campRows.filter(c => selCampIds.has(c.campaign_id));
  if (selObjCampIds) campRows = campRows.filter(c => selObjCampIds.has(c.campaign_id));
  if (hasAdsets || hasAds || hasCreative) campRows = campRows.filter(c => passingCampIds.has(c.campaign_id));

  const campaignsTable: EntityRow[] = campRows
    .map(c => {
      const conv = convByCamp.get(c.campaign_id) ?? 0;
      return {
        name:                c.campaign_name,
        objective:           objectiveByCampId.get(c.campaign_id) ?? null,
        spend:               c.spend,
        impressions:         c.impressions,
        clicks:              c.clicks,
        reach:               c.reach,
        conversions:         conv,
        cost_per_conversion: cpa(c.spend, conv),
        video_views:         videoByCamp.get(c.campaign_id) ?? 0,
        ctr:                 c.ctr,
        cpc:                 c.cpc,
        cpm:                 c.impressions ? (c.spend / c.impressions) * 1000 : null,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  // Ad Sets table.
  let adsetRows = adsets;
  if (hasAdsets)     adsetRows = adsetRows.filter(a => selAdsetIds.has(a.adset_id));
  if (hasCampaigns)  adsetRows = adsetRows.filter(a => selCampIds.has(a.campaign_id));
  if (selObjCampIds) adsetRows = adsetRows.filter(a => selObjCampIds.has(a.campaign_id));
  if (hasAds || hasCreative) adsetRows = adsetRows.filter(a => passingAdsetIds.has(a.adset_id));

  const adsetsTable: EntityRow[] = adsetRows
    .map(a => {
      const conv = convByAdset.get(a.adset_id) ?? 0;
      return {
        name:                a.adset_name,
        spend:               a.spend,
        impressions:         a.impressions,
        clicks:              a.clicks,
        reach:               a.reach,
        conversions:         conv,
        cost_per_conversion: cpa(a.spend, conv),
        video_views:         videoByAdset.get(a.adset_id) ?? 0,
        ctr:                 a.ctr,
        cpc:                 a.cpc,
        cpm:                 a.impressions ? (a.spend / a.impressions) * 1000 : null,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  // Ads table.
  const adsTable: EntityRow[] = filteredAds
    .map(a => {
      const conv = convByAd.get(a.ad_id) ?? 0;
      return {
        name:                a.ad_name ?? '(unnamed)',
        media_type:          a.media_type ?? null,
        spend:               a.spend,
        impressions:         a.impressions,
        clicks:              a.clicks,
        reach:               a.reach,
        conversions:         conv,
        cost_per_conversion: cpa(a.spend, conv),
        video_views:         videoByAd.get(a.ad_id) ?? 0,
        ctr:                 a.impressions ? (a.clicks / a.impressions) * 100 : null,
        cpc:                 a.clicks      ? a.spend / a.clicks               : null,
        cpm:                 a.impressions ? (a.spend / a.impressions) * 1000 : null,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  return { campaigns: campaignsTable, adsets: adsetsTable, ads: adsTable };
}

// ─── New server actions: Engagement, Video Watch Funnel, Targeting ────────

export interface EngagementRow {
  ad_id:             string;
  ad_name:           string | null;
  post_engagement:   number;
  post_reaction:     number;
  comment_count:     number;
  video_view:        number;
  landing_page_view: number;
}

export async function fetchEngagement(startDate: string, endDate: string, f: MetaFilters): Promise<EngagementRow[]> {
  const range = { from: startDate, to: endDate };
  const sb = supabaseServer();
  const [rows, ads, campDim] = await Promise.all([
    sb.schema('silver').from('meta_ad_conversion_insights')
      .select('ad_id,campaign_id,adset_id,post_engagement,post_reaction,comment_count,video_view,landing_page_view')
      .gte('date', startDate).lte('date', endDate),
    getMetaAdsCreative(range),
    sb.schema('silver').from('meta_campaign').select('campaign_id,objective'),
  ]);
  const adNameById = new Map<string, string | null>();
  for (const a of ads) adNameById.set(a.ad_id, a.ad_name ?? null);

  // Apply the same filter cascade the entity tables use so this table stays
  // consistent with what's above it on the page.
  const hasCampaigns  = (f.campaigns     ?? []).length > 0;
  const hasAdsets     = (f.adsets        ?? []).length > 0;
  const hasAds        = (f.ads           ?? []).length > 0;
  const hasCreative   = (f.creativeTypes ?? []).length > 0;
  const hasObjectives = (f.objectives    ?? []).length > 0;

  const campaigns = await getMetaCampaigns(range);
  const adsets    = await getMetaAdsets(range);
  const campIdByName  = new Map(campaigns.map(c => [c.campaign_name, c.campaign_id]));
  const adsetIdByName = new Map(adsets   .map(a => [a.adset_name,    a.adset_id]));
  const selCampIds  = new Set(f.campaigns.map(n => campIdByName.get(n)).filter(Boolean) as string[]);
  const selAdsetIds = new Set(f.adsets   .map(n => adsetIdByName.get(n)).filter(Boolean) as string[]);
  const selAdNames  = new Set(f.ads);
  const selCreative = new Set(f.creativeTypes);
  const objSet = hasObjectives
    ? new Set(((campDim.data ?? []) as { campaign_id: string; objective: string | null }[])
        .filter(r => r.objective != null && f.objectives.includes(r.objective))
        .map(r => r.campaign_id))
    : null;

  let filteredAds = ads;
  if (hasCampaigns)  filteredAds = filteredAds.filter(a => selCampIds.has(a.campaign_id));
  if (hasAdsets)     filteredAds = filteredAds.filter(a => selAdsetIds.has(a.adset_id));
  if (hasAds)        filteredAds = filteredAds.filter(a => selAdNames.has(a.ad_name ?? ''));
  if (hasCreative)   filteredAds = filteredAds.filter(a => selCreative.has(a.media_type ?? ''));
  if (objSet)        filteredAds = filteredAds.filter(a => objSet.has(a.campaign_id));
  const passingAdIds = new Set(filteredAds.map(a => a.ad_id));

  const perAd = new Map<string, EngagementRow>();
  for (const r of (rows.data ?? []) as {
    ad_id: string; post_engagement: number | null; post_reaction: number | null;
    comment_count: number | null; video_view: number | null; landing_page_view: number | null;
  }[]) {
    if (passingAdIds.size && !passingAdIds.has(r.ad_id)) continue;
    const cur = perAd.get(r.ad_id) ?? {
      ad_id: r.ad_id, ad_name: adNameById.get(r.ad_id) ?? null,
      post_engagement: 0, post_reaction: 0, comment_count: 0, video_view: 0, landing_page_view: 0,
    };
    cur.post_engagement   += Number(r.post_engagement   || 0);
    cur.post_reaction     += Number(r.post_reaction     || 0);
    cur.comment_count     += Number(r.comment_count     || 0);
    cur.video_view        += Number(r.video_view        || 0);
    cur.landing_page_view += Number(r.landing_page_view || 0);
    perAd.set(r.ad_id, cur);
  }
  return [...perAd.values()].sort((a, b) => b.post_engagement - a.post_engagement);
}

// Aggregated funnel (one row per milestone) over the selected window.
// Video Views (video_view, 3-sec+) is surfaced as a standalone count above the
// funnel table because it uses a different Meta definition than p25_watched
// (25% of duration) and comparing them directly can produce >100% ratios.
export interface VideoWatchFunnelRow {
  milestone: string;   // "25% Watched" | "50%..." | "100% Watched" | "Thruplay"
  count:     number;
  rate:      number | null; // % of p25_watched (funnel entry point)
}
export interface VideoWatchResult {
  videoViews: number;
  funnel:     VideoWatchFunnelRow[];
}

// Account-level (source has no ad_id — see migration comment on silver.meta_video_watch).
export async function fetchVideoWatch(startDate: string, endDate: string): Promise<VideoWatchResult> {
  const sb = supabaseServer();
  // videoViews is surfaced standalone above the funnel (different Meta
  // definition — 3-sec+ plays vs. 25%-of-duration). Funnel percentages are
  // computed against p25_watched so the funnel descends cleanly from 100%.
  const [conv, watch] = await Promise.all([
    sb.schema('silver').from('meta_ad_conversion_insights')
      .select('video_view')
      .gte('date', startDate).lte('date', endDate),
    sb.schema('silver').from('meta_video_watch')
      .select('p25_watched,p50_watched,p75_watched,p100_watched,thruplay')
      .gte('date', startDate).lte('date', endDate),
  ]);
  const videoViews = (conv.data ?? []).reduce(
    (s, r) => s + Number((r as { video_view: number | null }).video_view || 0), 0,
  );
  const sumCol = (col: 'p25_watched' | 'p50_watched' | 'p75_watched' | 'p100_watched' | 'thruplay') =>
    (watch.data ?? []).reduce(
      (s, r) => s + Number((r as Record<string, number | null>)[col] || 0), 0,
    );
  const p25 = sumCol('p25_watched');
  const p50 = sumCol('p50_watched');
  const p75 = sumCol('p75_watched');
  const p100 = sumCol('p100_watched');
  const thru = sumCol('thruplay');
  const pct = (n: number) => p25 > 0 ? (n / p25) * 100 : null;
  return {
    videoViews,
    funnel: [
      { milestone: '25% Watched',  count: p25,  rate: pct(p25)  },
      { milestone: '50% Watched',  count: p50,  rate: pct(p50)  },
      { milestone: '75% Watched',  count: p75,  rate: pct(p75)  },
      { milestone: '100% Watched', count: p100, rate: pct(p100) },
      { milestone: 'Thruplay',     count: thru, rate: pct(thru) },
    ],
  };
}

export interface TargetingRow {
  adset_id:                          string;
  adset_name:                        string;
  campaign_name:                     string | null;
  status:                            string | null;
  age_range:                         string;
  countries:                         string | null;
  publisher_platforms:               string | null;
  facebook_positions:                string | null;
  instagram_positions:               string | null;
  device_platforms:                  string | null;
  spend:                             number;
  impressions:                       number;
  clicks:                            number;
  ctr:                               number | null;
}

export async function fetchTargeting(startDate: string, endDate: string, f: MetaFilters): Promise<TargetingRow[]> {
  const range = { from: startDate, to: endDate };
  const sb = supabaseServer();
  const [dim, perf, campDim] = await Promise.all([
    sb.schema('silver').from('meta_adset')
      .select('adset_id,name,campaign_id,status,targeting_age_min,targeting_age_max,targeting_geo_locations_countries,targeting_publisher_platforms,targeting_facebook_positions,targeting_instagram_positions,targeting_device_platforms'),
    getMetaAdsets(range),
    sb.schema('silver').from('meta_campaign').select('campaign_id,objective,name'),
  ]);

  const hasCampaigns  = (f.campaigns  ?? []).length > 0;
  const hasAdsets     = (f.adsets     ?? []).length > 0;
  const hasObjectives = (f.objectives ?? []).length > 0;

  const campaigns = await getMetaCampaigns(range);
  const campIdByName = new Map(campaigns.map(c => [c.campaign_name, c.campaign_id]));
  const campNameById = new Map(((campDim.data ?? []) as { campaign_id: string; name: string | null }[])
    .map(c => [c.campaign_id, c.name] as [string, string | null]));

  const selCampIds  = new Set(f.campaigns.map(n => campIdByName.get(n)).filter(Boolean) as string[]);
  const selObjCampIds = hasObjectives
    ? new Set(((campDim.data ?? []) as { campaign_id: string; objective: string | null }[])
        .filter(r => r.objective != null && f.objectives.includes(r.objective))
        .map(r => r.campaign_id))
    : null;

  // Sum performance per adset over the range from getMetaAdsets (silver aggregated).
  const perfByAdset = new Map<string, { spend: number; impressions: number; clicks: number }>();
  for (const p of perf) {
    const cur = perfByAdset.get(p.adset_id) ?? { spend: 0, impressions: 0, clicks: 0 };
    cur.spend       += Number(p.spend || 0);
    cur.impressions += Number(p.impressions || 0);
    cur.clicks      += Number(p.clicks || 0);
    perfByAdset.set(p.adset_id, cur);
  }

  const rows: TargetingRow[] = [];
  for (const d of (dim.data ?? []) as {
    adset_id: string; name: string; campaign_id: string; status: string | null;
    targeting_age_min: number | null; targeting_age_max: number | null;
    targeting_geo_locations_countries: string | null;
    targeting_publisher_platforms: string | null;
    targeting_facebook_positions: string | null;
    targeting_instagram_positions: string | null;
    targeting_device_platforms: string | null;
  }[]) {
    if (hasAdsets    && !f.adsets.includes(d.name)) continue;
    if (hasCampaigns && !selCampIds.has(d.campaign_id)) continue;
    if (selObjCampIds && !selObjCampIds.has(d.campaign_id)) continue;
    const p = perfByAdset.get(d.adset_id) ?? { spend: 0, impressions: 0, clicks: 0 };
    // Skip ad sets with no activity in the selected window — dim rows for
    // paused / archived / never-ran adsets otherwise dominate the table.
    if (p.spend === 0 && p.impressions === 0 && p.clicks === 0) continue;
    rows.push({
      adset_id:            d.adset_id,
      adset_name:          d.name,
      campaign_name:       campNameById.get(d.campaign_id) ?? null,
      status:              d.status,
      age_range:           `${d.targeting_age_min ?? '?'}–${d.targeting_age_max ?? '?'}`,
      countries:           d.targeting_geo_locations_countries,
      publisher_platforms: d.targeting_publisher_platforms,
      facebook_positions:  d.targeting_facebook_positions,
      instagram_positions: d.targeting_instagram_positions,
      device_platforms:    d.targeting_device_platforms,
      spend:               p.spend,
      impressions:         p.impressions,
      clicks:              p.clicks,
      ctr:                 p.impressions ? (p.clicks / p.impressions) * 100 : null,
    });
  }
  return rows.sort((a, b) => b.spend - a.spend);
}

// ─── Cached wrappers (1hr TTL — data refreshes daily via 14:00 UTC cron) ────

const _fetchAboveFoldCached    = cached(_fetchAboveFoldImpl,    'meta-above-fold');
const _fetchEntityTablesCached = cached(_fetchEntityTablesImpl, 'meta-entity-tables');

export async function fetchAboveFold(startDate: string, endDate: string, f: MetaFilters) {
  return _fetchAboveFoldCached(startDate, endDate, f);
}
export async function fetchEntityTables(startDate: string, endDate: string, f: MetaFilters) {
  return _fetchEntityTablesCached(startDate, endDate, f);
}
