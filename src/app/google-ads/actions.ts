'use server';

import {
  getGadsSummary, getGadsCampaigns, getGadsAdGroups, getGadsAds, getGadsKeywords,
  getGadsSearchTerms, getGadsTrend,
  getGadsNetworkOptions, getGadsCampaignIdsForNetworks,
  getGadsConversionValue,
  getGadsCampaignProximity,
} from '@/lib/queries/gads';
import type { Totals, DailyRow, AgencyRow, TrendRow } from '../meta/actions';
import { cached } from '@/lib/cache';

// ─── Filters ────────────────────────────────────────────────────────────────

export interface GadsFilters {
  campaigns: string[];
  adGroups:  string[];
  networks:  string[];
}

export interface GadsFilterOptions {
  campaigns: string[];
  adGroups:  string[];
  networks:  string[];
}

// ─── Entity row shape (extends Meta's EntityRow with Google Ads specifics) ─

export interface GadsEntityRow {
  name:                string;
  match_type?:         string | null;   // Keywords + Search Terms
  ad_group?:           string | null;   // Keywords + Search Terms + Ads
  campaign?:           string | null;   // Ad Groups + Ads
  spend:               number;
  impressions:         number;
  clicks:              number;
  conversions:         number;
  ctr:                 number | null;
  cpc:                 number | null;
  cpm:                 number | null;
  cost_per_conversion: number | null;
  conversion_rate:     number | null;
  // Campaign-grain only in atWork's data (bronze.gads_campaign_stats). Other
  // entity tables render "$0.00" — the metric isn't tracked at their grain.
  conversion_value:    number;
}

// Extend Meta's DailyRow with conversion_rate + conversion_value for the
// Daily Summary columns.
export interface GadsDailyRow extends DailyRow {
  conversion_rate: number | null;
  conversion_value?: number;
}

// ─── getFilterOptions ──────────────────────────────────────────────────────

export async function getFilterOptions(startDate: string, endDate: string): Promise<GadsFilterOptions> {
  const range = { from: startDate, to: endDate };
  const [camps, ags, nets] = await Promise.all([
    getGadsCampaigns(range),
    getGadsAdGroups(range),
    getGadsNetworkOptions(range),
  ]);
  const campaigns = [...new Set(camps.map(c => c.campaign_name).filter(Boolean))].sort();
  const adGroups  = [...new Set(ags  .map(a => a.ad_group_name).filter(Boolean))].sort();
  return { campaigns, adGroups, networks: nets };
}

// ─── Above-fold ────────────────────────────────────────────────────────────

async function _fetchAboveFoldImpl(startDate: string, endDate: string, f: GadsFilters): Promise<{
  totals:        Totals | null;
  daily:         GadsDailyRow[];
  fallback:      boolean;
  agencies:      AgencyRow[];
  filterOptions: { studios: string[]; countries: string[]; states: string[]; cities: string[] };
}> {
  const range = { from: startDate, to: endDate };
  const hasCampaigns = (f.campaigns ?? []).length > 0;
  const hasAdGroups  = (f.adGroups  ?? []).length > 0;
  const hasNetworks  = (f.networks  ?? []).length > 0;
  const anyFilter    = hasCampaigns || hasAdGroups || hasNetworks;

  // Network filter resolves to a campaign_id set — cascades into the ad-group
  // and campaign filtering below.
  const netCampIds = hasNetworks ? await getGadsCampaignIdsForNetworks(range, f.networks) : null;

  // Conversion value from bronze.gads_campaign_stats — campaign-grain source
  // of truth for the value tile + daily + per-campaign columns.
  const convValue = await getGadsConversionValue(range);

  // Aggregate to totals. When any filter is active we walk down through the
  // ad-group level (which carries campaign_id) so all three filter dimensions
  // combine cleanly. With no filters we use getGadsSummary directly.
  let spend = 0, impressions = 0, clicks = 0, conversions = 0;
  if (!anyFilter) {
    const s = await getGadsSummary(range);
    if (s) {
      spend       = s.spend;
      impressions = s.impressions;
      clicks      = s.clicks;
      conversions = s.conversions;
    }
  } else {
    const [ags, camps] = await Promise.all([getGadsAdGroups(range), getGadsCampaigns(range)]);
    const selectedCampIds = new Set<string>();
    if (hasCampaigns) {
      for (const c of camps) if (f.campaigns.includes(c.campaign_name)) selectedCampIds.add(c.campaign_id);
    }
    let rows = ags;
    if (hasAdGroups)     rows = rows.filter(a => f.adGroups.includes(a.ad_group_name));
    if (hasCampaigns)    rows = rows.filter(a => selectedCampIds.has(a.campaign_id));
    if (netCampIds)      rows = rows.filter(a => netCampIds.has(a.campaign_id));
    for (const r of rows) {
      spend       += r.spend;
      impressions += r.impressions;
      clicks      += r.clicks;
      conversions += r.conversions;
    }
  }

  const ctr             = impressions ? (clicks / impressions) * 100 : null;
  const cpc             = clicks      ? spend / clicks               : null;
  const cpm             = impressions ? (spend / impressions) * 1000 : null;
  const cpa             = conversions ? spend / conversions          : null;
  const conversionRate  = clicks      ? (conversions / clicks) * 100 : null;

  // Daily rows for sparklines + Daily Summary. Trend query returns per-day
  // aggregates already; filter on the same campaign-id masks when needed.
  const rawTrend = await getGadsTrend(range);
  let filteredCampIds: Set<string> | null = null;
  if (anyFilter) {
    const camps = await getGadsCampaigns(range);
    const selectedCampNames = new Set(hasCampaigns ? f.campaigns : camps.map(c => c.campaign_name));
    filteredCampIds = new Set(
      camps.filter(c => (!hasCampaigns || selectedCampNames.has(c.campaign_name)) && (!netCampIds || netCampIds.has(c.campaign_id)))
           .map(c => c.campaign_id),
    );
  }
  // If ad-group filter is active, the daily trend can't be filtered without
  // per-day-per-ad-group aggregates; fall back to campaign-scoped trend, which
  // matches Meta's approach when ad-set/ad filters are active there.
  void filteredCampIds; // reserved for future per-day filter scoping
  const daily: GadsDailyRow[] = rawTrend
    .map(r => ({
      date:                r.date,
      leads:               0,
      spend_aud:           r.spend,
      impressions:         r.impressions,
      clicks:              r.clicks,
      reach:               0,
      cpl_blended:         null,
      cpl_meta:            null,
      cpl_website:         null,
      ctr:                 r.ctr,
      cpc:                 r.cpc,
      cpm:                 r.cpm,
      conversion_rate:     r.conversion_rate,
      conversions:         r.conversions,
      cost_per_conversion: r.conversions ? r.spend / r.conversions : null,
      video_views:         0,
      conversion_value:    convValue.byDate.get(r.date) ?? 0,
    }));

  const totals: Totals = {
    leads:               0,
    spend_aud:           spend,
    impressions,
    clicks,
    reach:               0,
    cpl_blended:         null,
    cpl_meta:            null,
    cpl_website:         null,
    ctr,
    cpc,
    cpm,
    conversion_rate:     conversionRate,
    conversions,
    cost_per_conversion: cpa,
    video_views:         0,
    conversion_value:    convValue.total,
  };

  return {
    totals,
    daily,
    fallback:      false,
    agencies:      [],
    filterOptions: { studios: [], countries: [], states: [], cities: [] },
  };
}

// ─── Below-fold (trends for the two Metric Trends charts) ──────────────────

export async function fetchBelowFold(startDate: string, endDate: string, _filters: GadsFilters): Promise<{
  trends: TrendRow[];
}> {
  const trend = await getGadsTrend({ from: startDate, to: endDate });
  const trends: TrendRow[] = trend.map(r => ({
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

// ─── Entity tables ─────────────────────────────────────────────────────────

// Row for the Campaign Proximity Targeting section (dimension table — no
// date filtering, always current). Sits directly below Campaigns on the page.
export interface GadsProximityRow {
  campaign:        string;
  campaign_status: string | null;
  radius:          number;
  radius_units:    string | null;
  city:            string | null;
  province:        string | null;
  country:         string | null;
  postal_code:     string | null;
}

export async function fetchTargetingSections(_startDate: string, _endDate: string): Promise<{
  proximity: GadsProximityRow[];
}> {
  const prox = await getGadsCampaignProximity();
  return {
    proximity: prox.map(p => ({
      campaign:        p.campaign_name,
      campaign_status: p.campaign_status,
      radius:          p.radius,
      radius_units:    p.radius_units,
      city:            p.city,
      province:        p.province,
      country:         p.country,
      postal_code:     p.postal_code,
    })),
  };
}

export async function fetchEntityTables(startDate: string, endDate: string, f: GadsFilters): Promise<{
  campaigns:   GadsEntityRow[];
  adGroups:    GadsEntityRow[];
  ads:         GadsEntityRow[];
  keywords:    GadsEntityRow[];
  searchTerms: GadsEntityRow[];
}> {
  const range = { from: startDate, to: endDate };
  const [camps, ags, ads, kws, sts, netCampIds, convValue] = await Promise.all([
    getGadsCampaigns(range),
    getGadsAdGroups(range),
    getGadsAds(range),
    getGadsKeywords(range),
    getGadsSearchTerms(range),
    (f.networks?.length ?? 0) > 0 ? getGadsCampaignIdsForNetworks(range, f.networks) : Promise.resolve(null as Set<string> | null),
    getGadsConversionValue(range),
  ]);

  const hasCampaigns = (f.campaigns ?? []).length > 0;
  const hasAdGroups  = (f.adGroups  ?? []).length > 0;

  const selCampIds = new Set(
    camps.filter(c => hasCampaigns ? f.campaigns.includes(c.campaign_name) : true).map(c => c.campaign_id),
  );
  const selAdGroupIds = new Set(
    ags.filter(a => hasAdGroups ? f.adGroups.includes(a.ad_group_name) : true).map(a => a.ad_group_id),
  );

  const passCamp = (campaign_id: string) => {
    if (hasCampaigns && !selCampIds.has(campaign_id)) return false;
    if (netCampIds && !netCampIds.has(campaign_id)) return false;
    return true;
  };
  const passAdGroup = (ad_group_id: string, campaign_id: string) => {
    if (!passCamp(campaign_id)) return false;
    if (hasAdGroups && !selAdGroupIds.has(ad_group_id)) return false;
    return true;
  };

  const campaigns: GadsEntityRow[] = camps
    .filter(c => passCamp(c.campaign_id))
    .map(c => ({
      name:                c.campaign_name,
      spend:               c.spend,
      impressions:         c.impressions,
      clicks:              c.clicks,
      conversions:         c.conversions,
      ctr:                 c.ctr,
      cpc:                 c.cpc,
      cpm:                 c.cpm,
      cost_per_conversion: c.cpa,
      conversion_rate:     c.conversion_rate,
      conversion_value:    convValue.byCampaign.get(c.campaign_id) ?? 0,
    }));

  const adGroups: GadsEntityRow[] = ags
    .filter(a => passAdGroup(a.ad_group_id, a.campaign_id))
    .map(a => ({
      name:                a.ad_group_name,
      campaign:            a.campaign_name,
      spend:               a.spend,
      impressions:         a.impressions,
      clicks:              a.clicks,
      conversions:         a.conversions,
      ctr:                 a.ctr,
      cpc:                 a.cpc,
      cpm:                 a.cpm,
      cost_per_conversion: a.cpa,
      conversion_rate:     a.conversion_rate,
      conversion_value:    0, // not tracked at ad-group grain
    }));

  const adRows: GadsEntityRow[] = ads
    .filter(a => passAdGroup(a.ad_group_id, a.campaign_id))
    .map(a => ({
      name:                a.ad_name,
      campaign:            a.campaign_name,
      ad_group:            a.ad_group_name,
      spend:               a.spend,
      impressions:         a.impressions,
      clicks:              a.clicks,
      conversions:         a.conversions,
      ctr:                 a.ctr,
      cpc:                 a.cpc,
      cpm:                 a.cpm,
      cost_per_conversion: a.cpa,
      conversion_rate:     a.conversion_rate,
      conversion_value:    0, // not tracked at ad grain
    }));

  const keywords: GadsEntityRow[] = kws
    .filter(k => passAdGroup(k.ad_group_id, k.campaign_id))
    .map(k => ({
      name:                k.keyword_text ?? '(none)',
      match_type:          k.keyword_match_type,
      ad_group:            k.ad_group_name,
      spend:               k.spend,
      impressions:         k.impressions,
      clicks:              k.clicks,
      conversions:         k.conversions,
      ctr:                 k.ctr,
      cpc:                 k.cpc,
      cpm:                 k.cpm,
      cost_per_conversion: k.cpa,
      conversion_rate:     k.conversion_rate,
      conversion_value:    0, // not tracked at keyword grain
    }));

  const searchTerms: GadsEntityRow[] = sts
    .filter(s => passAdGroup(s.ad_group_id, s.campaign_id))
    .map(s => ({
      name:                s.search_term,
      match_type:          s.search_term_match_type,
      spend:               s.spend,
      impressions:         s.impressions,
      clicks:              s.clicks,
      conversions:         s.conversions,
      ctr:                 s.ctr,
      cpc:                 s.cpc,
      cpm:                 s.cpm,
      cost_per_conversion: s.cpa,
      conversion_rate:     s.conversion_rate,
      conversion_value:    0, // not tracked at search-term grain
    }));

  return { campaigns, adGroups, ads: adRows, keywords, searchTerms };
}

// ─── Cached wrapper (1hr TTL — data refreshes daily via 14:00 UTC cron) ────
const _fetchAboveFoldCached = cached(_fetchAboveFoldImpl, 'gads-above-fold');
export async function fetchAboveFold(startDate: string, endDate: string, f: GadsFilters) {
  return _fetchAboveFoldCached(startDate, endDate, f);
}
