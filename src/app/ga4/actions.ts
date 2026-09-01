'use server';

import {
  getGa4LeadEvents, getGa4Trend,
  getGa4Channels, getGa4Devices, getGa4BrowserOs, getGa4TopPages,
  getGa4Campaigns, getGa4Social,
} from '@/lib/queries/ga4';
import type {
  Totals, DailyRow, AgencyRow, TrendRow,
} from '../meta/actions';
import { cached } from '@/lib/cache';

export interface Ga4Totals {
  users:               number;
  new_users:           number;
  sessions:            number;
  page_views:          number;
  avg_engagement_secs: number;
  bounce_rate:         number | null;
  lead_events:         number;
  conversion_rate:     number;
  engaged_sessions:    number;
  engagement_rate:     number | null;
  sessions_per_user:   number | null;
  views_per_session:   number | null;
  // Freshness metadata — GA4 sync often runs several days behind, and the
  // very last day of data typically shows a partial-day cliff. Both are
  // computed once server-side and passed to the page.
  last_complete_date:  string | null;
  days_behind:         number;
}

export interface Ga4TrendPoint {
  date:                     string;
  sessions:                 number;
  total_users:              number;
  new_users:                number;
  page_views:               number;
  engaged_sessions:         number;
  engagement_duration_secs: number;
  avg_engagement_secs:      number;
  bounce_rate_pct:          number | null;
  conversions:              number;
  conversion_rate:          number | null;
  lead_events:              number;
}

export interface Ga4Filters {
  channels:     string[];
  devices:      string[];
  landingPages: string[];
}

export interface Ga4FilterOptions {
  channels:     string[];
  devices:      string[];
  landingPages: string[];
}

// Row shapes for the five bottom tables.
export interface Ga4TrafficRow {
  channel:          string;
  sessions:         number;
  users:            number;
  engagement_rate:  number;
  bounce_rate:      number | null;
  lead_events:      number;   // account-level — GA4 events not attributed per channel
  conversion_rate:  number;
}
export interface Ga4PageRow {
  page_path:        string;
  page_views:       number;
  users:            number;
  avg_engagement:   number;   // approximation from silver.ga4_pages.avg_time_on_page_secs
}
export interface Ga4DeviceRow {
  device:           string;
  sessions:         number;   // 0 — silver.ga4_device doesn't carry sessions
  users:            number;
  engagement_rate:  number;
}
export interface Ga4BrowserOsRow {
  operating_system: string;
  browser:          string;
  users:            number;
  engaged_sessions: number;
  engagement_rate:  number;
}
export interface Ga4LeadEventRow {
  event_name: string;
  count:      number;
}
// UTM Campaign performance — sourced from bronze.ga4_campaign_performance
// (session_campaign_name × sessions/users/engaged/conversions). Weld's GA4
// connector does NOT ship utm_source, utm_medium, utm_content, or utm_term
// as separate columns — only the campaign name — so this is the finest
// UTM-attribution we can surface without a connector expansion.
export interface Ga4UtmRow {
  campaign:         string;
  sessions:         number;
  users:            number;
  engaged_sessions: number;
  conversions:      number;
}
// Ad-platform referrals — sourced from bronze.ga4_social_media
// (session_source_platform). Despite the "social_media" table name the
// dimension returns paid-ad platforms (Google Ads, Meta Ads, LinkedIn Ads,
// Other Ads, Unlabeled) not organic social — hence the "Ad Platforms"
// label in the UI. True referrer-URL data is not synced by Weld.
export interface Ga4PlatformRow {
  platform:         string;
  sessions:         number;
  users:            number;
  engaged_sessions: number;
  conversions:      number;
}

export async function getFilterOptions(startDate: string, endDate: string): Promise<Ga4FilterOptions> {
  const range = { from: startDate, to: endDate };
  const [c, d, p] = await Promise.all([
    getGa4Channels(range),
    getGa4Devices(range),
    getGa4TopPages(range, 200),
  ]);
  return {
    channels:     [...new Set(c.map(x => x.channel     ).filter(Boolean) as string[])].sort(),
    devices:      [...new Set(d.map(x => x.device_type ).filter(Boolean) as string[])].sort(),
    landingPages: [...new Set(p.map(x => x.page_path   ).filter(Boolean) as string[])].sort(),
  };
}

// Partial-day cliff detector — GA4 late-arriving data means the very last
// date silver has is usually incomplete. Drop it if its sessions are less
// than half of the median of the prior up-to-7 days. Returns the trimmed
// trend + the last date that survived.
function trimIncompleteTail(trend: Ga4TrendPoint[]): { trimmed: Ga4TrendPoint[]; lastCompleteDate: string | null } {
  if (!trend.length) return { trimmed: [], lastCompleteDate: null };
  const sorted = [...trend].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return { trimmed: sorted, lastCompleteDate: sorted[0].date };
  const last = sorted[sorted.length - 1];
  const prior = sorted.slice(-8, -1).map(r => r.sessions).sort((a, b) => a - b);
  const median = prior.length ? prior[Math.floor(prior.length / 2)] : 0;
  const cliff  = median > 0 && last.sessions < median * 0.5;
  const trimmed = cliff ? sorted.slice(0, -1) : sorted;
  return { trimmed, lastCompleteDate: trimmed.length ? trimmed[trimmed.length - 1].date : null };
}
function daysBetween(a: string, b: string): number {
  const ms = new Date(a).getTime() - new Date(b).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

async function _fetchAboveFoldImpl(startDate: string, endDate: string, _filters: Ga4Filters): Promise<{
  totals:        Totals | null;
  ga4Totals:     Ga4Totals | null;
  ga4Trend:      Ga4TrendPoint[];
  daily:         DailyRow[];
  fallback:      boolean;
  agencies:      AgencyRow[];
  filterOptions: { studios: string[]; countries: string[]; states: string[]; cities: string[] };
}> {
  const range = { from: startDate, to: endDate };
  const [leads, rawTrend] = await Promise.all([
    getGa4LeadEvents(range),
    getGa4Trend(range),
  ]);
  const { trimmed: trend, lastCompleteDate } = trimIncompleteTail(rawTrend);

  // All totals re-derived from the trimmed trend so scorecards, the chart
  // and the Daily Summary agree.
  const users      = trend.reduce((s, r) => s + r.total_users,              0);
  const new_users  = trend.reduce((s, r) => s + r.new_users,                0);
  const sessions   = trend.reduce((s, r) => s + r.sessions,                 0);
  const page_views = trend.reduce((s, r) => s + r.page_views,               0);
  const engDur     = trend.reduce((s, r) => s + r.engagement_duration_secs, 0);
  const engaged    = trend.reduce((s, r) => s + r.engaged_sessions,         0);
  const convs      = trend.reduce((s, r) => s + r.conversions,              0);
  const trimmedLeadDates = new Set(trend.map(r => r.date));
  const totalLeads = leads.reduce((s, l) => s + l.total, 0); // whitelist-safe, trend already includes lead_events
  // Prefer the trimmed-trend lead sum so partial-day removal cascades cleanly.
  const trimmedTrendLeads = trend.reduce((s, r) => s + r.lead_events, 0);
  const leadEventsTotal = trimmedLeadDates.size ? trimmedTrendLeads : totalLeads;

  let brw = 0, brs = 0;
  for (const d of trend) {
    if (d.bounce_rate_pct != null && d.sessions > 0) {
      brw += d.sessions * d.bounce_rate_pct;
      brs += d.sessions;
    }
  }
  const bounce = brs > 0 ? brw / brs : null;

  const ga4Totals: Ga4Totals = {
    users,
    new_users,
    sessions,
    page_views,
    avg_engagement_secs: sessions ? engDur / sessions : 0,
    bounce_rate:         bounce,
    lead_events:         leadEventsTotal,
    conversion_rate:     sessions ? (convs / sessions) * 100 : 0,
    engaged_sessions:    engaged,
    engagement_rate:     sessions ? (engaged / sessions) * 100 : null,
    sessions_per_user:   users ? sessions / users : null,
    views_per_session:   sessions ? page_views / sessions : null,
    last_complete_date:  lastCompleteDate,
    days_behind:         lastCompleteDate ? daysBetween(endDate, lastCompleteDate) : 0,
  };
  // BFT-shape totals kept at zero — the Website page renders a GA4-native
  // roster driven by ga4Totals; the shared Totals interface is only carried
  // so other pages can consume DailyRow / TrendRow / AgencyRow without
  // ga4-specific imports.
  const totals: Totals = {
    leads: 0, spend_aud: 0, impressions: 0, clicks: 0, reach: 0,
    cpl_blended: null, cpl_meta: null, cpl_website: null,
    ctr: null, cpc: null, cpm: null, conversion_rate: null,
    conversions: 0, cost_per_conversion: null, video_views: 0,
  };
  return {
    totals,
    ga4Totals,
    ga4Trend: trend,
    daily:         [],
    fallback:      false,
    agencies:      [],
    filterOptions: { studios: [], countries: [], states: [], cities: [] },
  };
}

export async function fetchBelowFold(startDate: string, endDate: string, _filters: Ga4Filters): Promise<{
  trends:      TrendRow[];
  traffic:     Ga4TrafficRow[];
  topPages:    Ga4PageRow[];
  devices:     Ga4DeviceRow[];
  browserOs:   Ga4BrowserOsRow[];
  leadEvents:  Ga4LeadEventRow[];
  utm:         Ga4UtmRow[];
  platforms:   Ga4PlatformRow[];
}> {
  const range = { from: startDate, to: endDate };
  const [rawTrend, channels, pages, devices, browserOs, leads, utmCamps, plats] = await Promise.all([
    getGa4Trend(range),
    getGa4Channels(range),
    getGa4TopPages(range, 50),
    getGa4Devices(range),
    getGa4BrowserOs(range),
    getGa4LeadEvents(range),
    getGa4Campaigns(range, 200),  // higher limit than the query default so the tab shows the long tail
    getGa4Social(range),
  ]);
  const { trimmed: trend } = trimIncompleteTail(rawTrend);
  // Map the Ga4TrendPoint set into the shared TrendRow shape so the Metric
  // Trends chart (which lives in the Meta type universe) can render.
  // page_views carried on the `clicks` slot so the dual-axis chart's right
  // series shows Page Views (rebranded server-side; the shared MetricSeries
  // key is what the chart reads).
  const trends: TrendRow[] = trend.map(t => ({
    date:             t.date,
    cpl_blended:      null, cpl_meta: null, cpl_website: null,
    ctr:              null, cpc:      null, cpm: null,
    sessions:         t.sessions,
    total_users:      t.total_users,
    page_views:       t.page_views,
    engaged_sessions: t.engaged_sessions,
  }));
  return {
    trends,
    traffic: channels.map(c => ({
      channel:         c.channel,
      sessions:        c.sessions,
      users:           c.total_users,
      engagement_rate: c.engagement_rate_pct,
      bounce_rate:     c.bounce_rate_pct,
      lead_events:     0, // GA4 events aren't split by channel in the synced schema
      conversion_rate: c.conversion_rate_pct,
    })),
    topPages: pages.map(p => ({
      page_path:      p.page_path,
      page_views:     p.page_views,
      users:          p.total_users,
      avg_engagement: 0, // silver.ga4_pages doesn't expose an aggregable engagement metric
    })),
    devices: devices.map(d => ({
      device:          d.device_type,
      sessions:        0, // silver.ga4_device carries users + engaged sessions, not raw sessions
      users:           d.total_users,
      engagement_rate: d.total_users > 0 ? (d.engaged_sessions / d.total_users) * 100 : 0,
    })),
    browserOs: browserOs.map(b => ({
      operating_system: b.operating_system,
      browser:          b.browser,
      users:            b.total_users,
      engaged_sessions: b.engaged_sessions,
      engagement_rate:  b.engagement_rate_pct,
    })),
    leadEvents: leads.map(l => ({ event_name: l.event_name, count: l.total })),
    utm: utmCamps.map(c => ({
      campaign:         c.campaign,
      sessions:         c.sessions,
      users:            c.total_users,
      engaged_sessions: c.engaged_sessions,
      conversions:      c.conversions,
    })),
    platforms: plats.map(p => ({
      platform:         p.platform,
      sessions:         p.sessions,
      users:            p.total_users,
      engaged_sessions: p.engaged_sessions,
      conversions:      p.conversions,
    })),
  };
}

// ─── Cached wrapper (1hr TTL — data refreshes daily via 14:00 UTC cron) ────
const _fetchAboveFoldCached = cached(_fetchAboveFoldImpl, 'ga4-above-fold');
export async function fetchAboveFold(startDate: string, endDate: string, filters: Ga4Filters) {
  return _fetchAboveFoldCached(startDate, endDate, filters);
}
