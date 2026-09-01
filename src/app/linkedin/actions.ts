'use server';

import { supabaseServer } from '@/lib/supabase/server';
import { cached } from '@/lib/cache';

// ─── Shared row/response shapes ────────────────────────────────────────────

export interface Totals {
  spend:                    number;
  impressions:              number;
  clicks:                   number;
  reach:                    number;
  ctr:                      number | null;
  cpc:                      number | null;
  cpm:                      number | null;
  engagements:              number;
  video_views:              number;
  video_completions:        number;
  video_completion_rate:    number | null;
  cost_per_video_view:      number | null;
  cost_per_completion:      number | null;
  fullscreen_plays:         number;
  video_starts:             number;
  video_q1:                 number;
  video_mid:                number;
  video_q3:                 number;
  leads:                    number;
  cost_per_lead:            number | null;
}

export interface DailyRow {
  date:              string;
  spend:             number;
  impressions:       number;
  clicks:            number;
  reach:             number;
  ctr:               number | null;
  cpc:               number | null;
  cpm:               number | null;
  engagements:       number;
  video_views:       number;
  video_completions: number;
  leads:             number;
  cost_per_lead:     number | null;
}

export interface TrendRow {
  date:         string;
  spend:        number;
  clicks:       number;
  ctr:          number | null;
  cpc:          number | null;
  cpm:          number | null;
  impressions:  number;
}

// LinkedIn ad grain: Campaigns + Creatives (no Ad Set). One row shape covers
// both — creative rows carry `campaign_name` as the parent link.
export interface EntityRow {
  name:               string;
  post_text?:         string | null;   // Creatives table only — ad copy
  landing_url?:       string | null;   // Creatives table only — click destination
  content_reference?: string | null;   // Creatives table only — LinkedIn post URN for embed
  campaign_name?:     string | null;   // Creatives table only
  objective?:         string | null;
  status?:            string | null;   // Campaigns only — ACTIVE / PAUSED / COMPLETED
  format?:            string | null;   // Campaigns only — SPONSORED_UPDATES / VIDEO / etc.
  spend:             number;
  impressions:       number;
  clicks:            number;
  ctr:               number | null;
  cpc:               number | null;
  cpm:               number | null;
  leads:             number;
  landing_page_clicks: number;
  video_views:       number;
  video_completions: number;
  completion_rate:   number | null;
  cost_per_completion: number | null;
  engagements:       number;
  cost_per_lead:     number | null;
}

// ─── Filter shape ──────────────────────────────────────────────────────────

export interface LinkedinFilters {
  campaigns:  string[];
  objectives: string[];
}

export interface LinkedinFilterOptions {
  campaigns:  string[];
  objectives: string[];
}

// ─── Row types coming out of Supabase ──────────────────────────────────────
type CampaignStatRow = {
  date: string;
  campaign_id: string;
  impressions: number | null;
  clicks: number | null;
  cost: number | null;
  one_click_leads: number | null;
  landing_page_clicks: number | null;
  video_views: number | null;
  video_completions: number | null;
  video_starts: number | null;
  video_q1: number | null;
  video_mid: number | null;
  video_q3: number | null;
  fullscreen_plays: number | null;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  follows: number | null;
  total_engagements: number | null;
  approximate_unique_impressions: number | null;
};
type CreativeStatRow = {
  date: string;
  creative_id: string;
  impressions: number | null;
  clicks: number | null;
  cost: number | null;
  one_click_leads: number | null;
  landing_page_clicks: number | null;
  video_views: number | null;
  total_engagements: number | null;
  approximate_unique_impressions: number | null;
};
type CampaignDim = {
  id: string;
  name: string | null;
  status: string | null;
  objective_type: string | null;
  format: string | null;
};
type CreativeDim = {
  id: string;
  campaign_id: string | null;
  name: string | null;
  post_text: string | null;
  landing_url: string | null;
  media_title: string | null;
  content_reference: string | null;
};

// ─── Helpers ───────────────────────────────────────────────────────────────

// Convenience: pull the full campaign_stats window in one call.
async function loadCampaignStats(startDate: string, endDate: string): Promise<CampaignStatRow[]> {
  const sb = supabaseServer();
  const { data } = await sb.schema('bronze').from('linkedin_campaign_stats')
    .select('date,campaign_id,impressions,clicks,cost,one_click_leads,landing_page_clicks,video_views,video_completions,reactions,comments,shares,follows,total_engagements,approximate_unique_impressions')
    .gte('date', startDate).lte('date', endDate);
  return (data ?? []) as CampaignStatRow[];
}

async function loadCreativeStats(startDate: string, endDate: string): Promise<CreativeStatRow[]> {
  const sb = supabaseServer();
  const { data } = await sb.schema('bronze').from('linkedin_creative_stats')
    .select('date,creative_id,impressions,clicks,cost,one_click_leads,landing_page_clicks,video_views,total_engagements,approximate_unique_impressions')
    .gte('date', startDate).lte('date', endDate);
  return (data ?? []) as CreativeStatRow[];
}

async function loadCampaignDim(): Promise<CampaignDim[]> {
  const sb = supabaseServer();
  const { data } = await sb.schema('bronze').from('linkedin_campaign')
    .select('id,name,status,objective_type,format');
  return (data ?? []) as CampaignDim[];
}

async function loadCreativeDim(): Promise<CreativeDim[]> {
  const sb = supabaseServer();
  const { data } = await sb.schema('bronze').from('linkedin_creative')
    .select('id,campaign_id,name,post_text,landing_url,media_title,content_reference');
  return (data ?? []) as CreativeDim[];
}

// Aggregate stats rows into a Totals object.
function aggregateTotals(rows: CampaignStatRow[]): Totals {
  const spend       = rows.reduce((s, r) => s + Number(r.cost                           || 0), 0);
  const impressions = rows.reduce((s, r) => s + Number(r.impressions                    || 0), 0);
  const clicks      = rows.reduce((s, r) => s + Number(r.clicks                         || 0), 0);
  const reach       = rows.reduce((s, r) => s + Number(r.approximate_unique_impressions || 0), 0);
  const engagements = rows.reduce((s, r) => s + Number(r.total_engagements              || 0), 0);
  const videoViews  = rows.reduce((s, r) => s + Number(r.video_views                    || 0), 0);
  const videoCompl  = rows.reduce((s, r) => s + Number(r.video_completions              || 0), 0);
  const videoStarts = rows.reduce((s, r) => s + Number(r.video_starts                   || 0), 0);
  const videoQ1     = rows.reduce((s, r) => s + Number(r.video_q1                       || 0), 0);
  const videoMid    = rows.reduce((s, r) => s + Number(r.video_mid                      || 0), 0);
  const videoQ3     = rows.reduce((s, r) => s + Number(r.video_q3                       || 0), 0);
  const fullscreen  = rows.reduce((s, r) => s + Number(r.fullscreen_plays               || 0), 0);
  const leads       = rows.reduce((s, r) => s + Number(r.one_click_leads                || 0), 0);
  return {
    spend,
    impressions,
    clicks,
    reach,
    ctr:                   impressions ? (clicks / impressions) * 100 : null,
    cpc:                   clicks      ? spend / clicks               : null,
    cpm:                   impressions ? (spend / impressions) * 1000 : null,
    engagements,
    video_views:           videoViews,
    video_completions:     videoCompl,
    video_completion_rate: videoViews  ? (videoCompl / videoViews) * 100 : null,
    cost_per_video_view:   videoViews  ? spend / videoViews : null,
    cost_per_completion:   videoCompl  ? spend / videoCompl : null,
    fullscreen_plays:      fullscreen,
    video_starts:          videoStarts,
    video_q1:              videoQ1,
    video_mid:             videoMid,
    video_q3:              videoQ3,
    leads,
    cost_per_lead:         leads       ? spend / leads                : null,
  };
}

// Roll rows into per-day summaries.
function rollDaily(rows: CampaignStatRow[]): DailyRow[] {
  const map = new Map<string, {
    date: string; spend: number; impressions: number; clicks: number; reach: number;
    engagements: number; video_views: number; video_completions: number; leads: number;
  }>();
  for (const r of rows) {
    const k = r.date;
    const cur = map.get(k) ?? {
      date: k, spend: 0, impressions: 0, clicks: 0, reach: 0,
      engagements: 0, video_views: 0, video_completions: 0, leads: 0,
    };
    cur.spend             += Number(r.cost                           || 0);
    cur.impressions       += Number(r.impressions                    || 0);
    cur.clicks            += Number(r.clicks                         || 0);
    cur.reach             += Number(r.approximate_unique_impressions || 0);
    cur.engagements       += Number(r.total_engagements              || 0);
    cur.video_views       += Number(r.video_views                    || 0);
    cur.video_completions += Number(r.video_completions              || 0);
    cur.leads             += Number(r.one_click_leads                || 0);
    map.set(k, cur);
  }
  return [...map.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({
      ...d,
      ctr:           d.impressions ? (d.clicks / d.impressions) * 100 : null,
      cpc:           d.clicks      ? d.spend / d.clicks               : null,
      cpm:           d.impressions ? (d.spend / d.impressions) * 1000 : null,
      cost_per_lead: d.leads       ? d.spend / d.leads                : null,
    }));
}

// ─── Filter options ────────────────────────────────────────────────────────

async function _getFilterOptionsImpl(startDate: string, endDate: string): Promise<LinkedinFilterOptions> {
  const [stats, dim] = await Promise.all([
    loadCampaignStats(startDate, endDate),
    loadCampaignDim(),
  ]);
  // Only show filter values for campaigns that actually spent in the window.
  const activeCampIds = new Set(stats.map(r => r.campaign_id));
  const active = dim.filter(d => activeCampIds.has(d.id));
  return {
    campaigns:  [...new Set(active.map(d => d.name).filter(Boolean) as string[])].sort(),
    objectives: [...new Set(active.map(d => d.objective_type).filter(Boolean) as string[])].sort(),
  };
}

// ─── Above-fold (totals + daily rollup) ────────────────────────────────────

async function _fetchAboveFoldImpl(startDate: string, endDate: string, f: LinkedinFilters): Promise<{
  totals: Totals;
  daily:  DailyRow[];
}> {
  const [stats, dim] = await Promise.all([
    loadCampaignStats(startDate, endDate),
    loadCampaignDim(),
  ]);

  const hasCampaigns  = (f.campaigns  ?? []).length > 0;
  const hasObjectives = (f.objectives ?? []).length > 0;

  const nameToId = new Map(dim.map(d => [d.name ?? '', d.id]));
  const objToIds = new Map<string, Set<string>>();
  for (const d of dim) {
    if (!d.objective_type) continue;
    const set = objToIds.get(d.objective_type) ?? new Set<string>();
    set.add(d.id);
    objToIds.set(d.objective_type, set);
  }

  const selCampIds = new Set(
    hasCampaigns ? (f.campaigns.map(n => nameToId.get(n)).filter(Boolean) as string[]) : [],
  );
  const selObjIds = new Set<string>();
  if (hasObjectives) {
    for (const o of f.objectives) {
      const set = objToIds.get(o);
      if (set) for (const id of set) selObjIds.add(id);
    }
  }

  let rows = stats;
  if (hasCampaigns)  rows = rows.filter(r => selCampIds.has(r.campaign_id));
  if (hasObjectives) rows = rows.filter(r => selObjIds.has(r.campaign_id));

  return {
    totals: aggregateTotals(rows),
    daily:  rollDaily(rows),
  };
}

// ─── Below-fold (trends for MetricTrendsChart) ─────────────────────────────

async function _fetchBelowFoldImpl(startDate: string, endDate: string, f: LinkedinFilters): Promise<{
  trends: TrendRow[];
}> {
  // Reuse the above-fold rollup so the trend chart shares filter semantics.
  const { daily } = await _fetchAboveFoldImpl(startDate, endDate, f);
  const trends: TrendRow[] = daily.map(d => ({
    date:        d.date,
    spend:       d.spend,
    clicks:      d.clicks,
    ctr:         d.ctr,
    cpc:         d.cpc,
    cpm:         d.cpm,
    impressions: d.impressions,
  }));
  return { trends };
}

// ─── Entity tables (Campaigns + Ads) ───────────────────────────────────────

async function _fetchEntityTablesImpl(startDate: string, endDate: string, f: LinkedinFilters): Promise<{
  campaigns: EntityRow[];
  ads:       EntityRow[];
}> {
  const [campStats, creStats, campDim, creDim] = await Promise.all([
    loadCampaignStats(startDate, endDate),
    loadCreativeStats(startDate, endDate),
    loadCampaignDim(),
    loadCreativeDim(),
  ]);

  const hasCampaigns  = (f.campaigns  ?? []).length > 0;
  const hasObjectives = (f.objectives ?? []).length > 0;

  const nameToId = new Map(campDim.map(d => [d.name ?? '', d.id]));
  const idToName = new Map(campDim.map(d => [d.id, d.name ?? '(unnamed)']));
  const idToObj    = new Map(campDim.map(d => [d.id, d.objective_type ?? null]));
  const idToStatus = new Map(campDim.map(d => [d.id, d.status ?? null]));
  const idToFormat = new Map(campDim.map(d => [d.id, d.format ?? null]));

  const selCampIds = new Set(
    hasCampaigns ? (f.campaigns.map(n => nameToId.get(n)).filter(Boolean) as string[]) : [],
  );
  const selObjIds = new Set<string>();
  if (hasObjectives) {
    for (const d of campDim) {
      if (d.objective_type && f.objectives.includes(d.objective_type)) selObjIds.add(d.id);
    }
  }
  const passCamp = (id: string) =>
    (!hasCampaigns  || selCampIds.has(id)) &&
    (!hasObjectives || selObjIds.has(id));

  // ── Campaign roll-up ──
  const campAgg = new Map<string, {
    campaign_id: string;
    spend: number; impressions: number; clicks: number;
    leads: number; landing_page_clicks: number; video_views: number;
    video_completions: number; engagements: number;
  }>();
  for (const r of campStats) {
    if (!passCamp(r.campaign_id)) continue;
    const cur = campAgg.get(r.campaign_id) ?? {
      campaign_id: r.campaign_id,
      spend: 0, impressions: 0, clicks: 0,
      leads: 0, landing_page_clicks: 0, video_views: 0,
      video_completions: 0, engagements: 0,
    };
    cur.spend               += Number(r.cost                || 0);
    cur.impressions         += Number(r.impressions         || 0);
    cur.clicks              += Number(r.clicks              || 0);
    cur.leads               += Number(r.one_click_leads     || 0);
    cur.landing_page_clicks += Number(r.landing_page_clicks || 0);
    cur.video_views         += Number(r.video_views         || 0);
    cur.video_completions   += Number(r.video_completions   || 0);
    cur.engagements         += Number(r.total_engagements   || 0);
    campAgg.set(r.campaign_id, cur);
  }
  const campaigns: EntityRow[] = [...campAgg.values()]
    .map(c => ({
      name:                idToName.get(c.campaign_id) ?? '(unnamed)',
      objective:           idToObj.get(c.campaign_id) ?? null,
      status:              idToStatus.get(c.campaign_id) ?? null,
      format:              idToFormat.get(c.campaign_id) ?? null,
      spend:               c.spend,
      impressions:         c.impressions,
      clicks:              c.clicks,
      ctr:                 c.impressions ? (c.clicks / c.impressions) * 100 : null,
      cpc:                 c.clicks      ? c.spend / c.clicks               : null,
      cpm:                 c.impressions ? (c.spend / c.impressions) * 1000 : null,
      leads:               c.leads,
      landing_page_clicks: c.landing_page_clicks,
      video_views:         c.video_views,
      video_completions:   c.video_completions,
      completion_rate:     c.video_views ? (c.video_completions / c.video_views) * 100 : null,
      cost_per_completion: c.video_completions ? c.spend / c.video_completions : null,
      engagements:         c.engagements,
      cost_per_lead:       c.leads ? c.spend / c.leads : null,
    }))
    .sort((a, b) => b.spend - a.spend);

  // ── Creative roll-up ──
  const creIdToDim = new Map(creDim.map(d => [d.id, d]));
  const creAgg = new Map<string, {
    creative_id: string;
    spend: number; impressions: number; clicks: number;
    leads: number; landing_page_clicks: number; video_views: number;
    video_completions: number; engagements: number;
  }>();
  for (const r of creStats) {
    const dim = creIdToDim.get(r.creative_id);
    const parentId = dim?.campaign_id ?? '';
    // Filter by campaign / objective via the parent campaign_id when present.
    if ((hasCampaigns || hasObjectives) && (!parentId || !passCamp(parentId))) continue;
    const cur = creAgg.get(r.creative_id) ?? {
      creative_id: r.creative_id,
      spend: 0, impressions: 0, clicks: 0,
      leads: 0, landing_page_clicks: 0, video_views: 0,
      video_completions: 0, engagements: 0,
    };
    cur.spend               += Number(r.cost                || 0);
    cur.impressions         += Number(r.impressions         || 0);
    cur.clicks              += Number(r.clicks              || 0);
    cur.leads               += Number(r.one_click_leads     || 0);
    cur.landing_page_clicks += Number(r.landing_page_clicks || 0);
    cur.video_views         += Number(r.video_views         || 0);
    // Creative-level video_completions not synced separately — approximate
    // from completion rate * video_views computed at campaign level. For
    // Top Performer callouts we only use campaign-grain data anyway.
    cur.engagements         += Number(r.total_engagements   || 0);
    creAgg.set(r.creative_id, cur);
  }
  const ads: EntityRow[] = [...creAgg.values()]
    .map(c => {
      const dim = creIdToDim.get(c.creative_id);
      // LinkedIn's `creative.title` is often null — fall back to the id so the
      // row is at least identifiable in the table.
      // Fallback chain for a human-readable creative label:
      //   creative.title (rarely set) → media_content.title (video/media title)
      //   → the raw creative ID
      const name = dim?.name ?? dim?.media_title ?? `Creative ${c.creative_id}`;
      const parentId = dim?.campaign_id ?? '';
      return {
        name,
        post_text:           dim?.post_text ?? null,
        landing_url:         dim?.landing_url ?? null,
        content_reference:   dim?.content_reference ?? null,
        campaign_name:       parentId ? (idToName.get(parentId) ?? null) : null,
        objective:           parentId ? (idToObj.get(parentId) ?? null) : null,
        spend:               c.spend,
        impressions:         c.impressions,
        clicks:              c.clicks,
        ctr:                 c.impressions ? (c.clicks / c.impressions) * 100 : null,
        cpc:                 c.clicks      ? c.spend / c.clicks               : null,
        cpm:                 c.impressions ? (c.spend / c.impressions) * 1000 : null,
        leads:               c.leads,
        landing_page_clicks: c.landing_page_clicks,
        video_views:         c.video_views,
        video_completions:   c.video_completions,
        completion_rate:     c.video_views ? (c.video_completions / c.video_views) * 100 : null,
        cost_per_completion: c.video_completions ? c.spend / c.video_completions : null,
        engagements:         c.engagements,
        cost_per_lead:       c.leads ? c.spend / c.leads : null,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  return { campaigns, ads };
}

// ─── Day-of-week performance ──────────────────────────────────────────────
// Aggregate campaign_stats by weekday over the date range so the client can
// see whether LinkedIn engagement peaks midweek / weekends. Returns 7 rows,
// Mon → Sun.
export interface DayOfWeekRow {
  weekday:      string;   // 'Mon' | 'Tue' | ...
  weekday_idx:  number;   // 1 (Mon) .. 7 (Sun)
  spend:        number;
  impressions:  number;
  clicks:       number;
  ctr:          number | null;
}
async function _fetchDayOfWeekImpl(startDate: string, endDate: string): Promise<DayOfWeekRow[]> {
  const sb = supabaseServer();
  const { data } = await sb.schema('bronze').from('linkedin_campaign_stats')
    .select('date,cost,impressions,clicks')
    .gte('date', startDate).lte('date', endDate);
  type Row = { date: string; cost: number | null; impressions: number | null; clicks: number | null };
  const buckets = new Map<number, { spend: number; impressions: number; clicks: number }>();
  for (const raw of (data ?? []) as Row[]) {
    // JS getUTCDay: 0=Sunday..6=Saturday. Shift to 1=Mon..7=Sun for display.
    const d = new Date(raw.date + 'T00:00:00Z');
    const js = d.getUTCDay();
    const idx = js === 0 ? 7 : js;
    const cur = buckets.get(idx) ?? { spend: 0, impressions: 0, clicks: 0 };
    cur.spend       += Number(raw.cost        || 0);
    cur.impressions += Number(raw.impressions || 0);
    cur.clicks      += Number(raw.clicks      || 0);
    buckets.set(idx, cur);
  }
  const labels = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const result: DayOfWeekRow[] = [];
  for (let i = 1; i <= 7; i++) {
    const b = buckets.get(i) ?? { spend: 0, impressions: 0, clicks: 0 };
    result.push({
      weekday: labels[i],
      weekday_idx: i,
      spend: b.spend,
      impressions: b.impressions,
      clicks: b.clicks,
      ctr: b.impressions ? (b.clicks / b.impressions) * 100 : null,
    });
  }
  return result;
}

// ─── Cached wrappers ───────────────────────────────────────────────────────

const _getFilterOptionsCached = cached(_getFilterOptionsImpl, 'linkedin-filter-options');
const _fetchAboveFoldCached   = cached(_fetchAboveFoldImpl,   'linkedin-above-fold');
const _fetchBelowFoldCached   = cached(_fetchBelowFoldImpl,   'linkedin-below-fold');
const _fetchEntityTablesCached = cached(_fetchEntityTablesImpl, 'linkedin-entity-tables');
const _fetchDayOfWeekCached    = cached(_fetchDayOfWeekImpl,    'linkedin-dow');

export async function getFilterOptions(startDate: string, endDate: string) {
  return _getFilterOptionsCached(startDate, endDate);
}
export async function fetchAboveFold(startDate: string, endDate: string, f: LinkedinFilters) {
  return _fetchAboveFoldCached(startDate, endDate, f);
}
export async function fetchBelowFold(startDate: string, endDate: string, f: LinkedinFilters) {
  return _fetchBelowFoldCached(startDate, endDate, f);
}
export async function fetchDayOfWeek(startDate: string, endDate: string) {
  return _fetchDayOfWeekCached(startDate, endDate);
}
export async function fetchEntityTables(startDate: string, endDate: string, f: LinkedinFilters) {
  return _fetchEntityTablesCached(startDate, endDate, f);
}
