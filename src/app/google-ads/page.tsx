'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { FallbackBanner, readBannerDismissed, persistBannerDismissed } from '@/components/FallbackBanner';
import { colors, typography, spacing, shadow, controls, borderRadius, borderWidth, cellPadding, chart, card, grey } from '@/tokens';
import { BFScorecard } from '@/components/BFScorecard';
import { ChartContainer } from '@/components/ChartContainer';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { SearchableMultiSelect } from '@/components/hq/SearchableMultiSelect';
import dynamic from 'next/dynamic';
const MetricTrendsChart = dynamic(
  () => import('@/components/hq/MetricTrendsChart').then(m => ({ default: m.MetricTrendsChart })),
  { ssr: false, loading: () => <div style={{ height: chart.loadingHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: grey.placeholder, fontSize: typography.fontSize.sm }}>Loading chart…</div> },
);
import { DailySummaryTable, type DSTColumn } from '@/components/hq/DailySummaryTable';
import {
  fetchAboveFold, fetchEntityTables, getFilterOptions,
  type GadsFilters, type GadsFilterOptions,
  type GadsEntityRow, type GadsDailyRow,
} from './actions';
import type { Totals, DailyRow, AgencyRow, TrendRow } from '../meta/actions';
import { GADS_CONVERSION_DEFINITION } from './constants';

// ─── Helpers ──────────────────────────────────────────────────────────────

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

const fmtCtr   = (v: number | null) => v != null ? `${v.toFixed(2)}%` : '0.00%';
const fmtMoney = (v: number | null) => v != null ? `$${v.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00';
const fmtInt   = (v: number)        => Math.round(v).toLocaleString();
const fmtDate  = (v: unknown) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? format(parseISO(v), 'd-MMM-yyyy')
    : String(v ?? '');

// Period-over-period % change. Returns null when there's no baseline
// (prior=0) — the scorecard renders "—" instead of "▲ Infinity%".
function deltaPct(curr: number | null | undefined, prior: number | null | undefined): number | null {
  const c = Number(curr ?? 0);
  const p = Number(prior ?? 0);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null;
  return ((c - p) / p) * 100;
}

// Entity table columns — mirrors the Meta pattern, adapted to Google Ads
// (no reach, no video_views; adds Conversion Rate as the 9th metric).
function entityColumns(nameLabel: string, opts?: { withCampaign?: boolean; withAdGroup?: boolean; withMatchType?: boolean }): DSTColumn[] {
  const cols: DSTColumn[] = [
    { key: 'name', label: nameLabel, align: 'left' },
  ];
  if (opts?.withMatchType) cols.push({ key: 'match_type', label: 'Match Type', align: 'left', render: r => String(r.match_type ?? '—') });
  if (opts?.withAdGroup)   cols.push({ key: 'ad_group',   label: 'Ad Group',   align: 'left', render: r => String(r.ad_group ?? '—') });
  if (opts?.withCampaign)  cols.push({ key: 'campaign',   label: 'Campaign',   align: 'left', render: r => String(r.campaign ?? '—') });
  cols.push(
    { key: 'spend',               label: 'Spend',           numeric: true, render: r => `$${Math.round(Number(r.spend       || 0)).toLocaleString()}` },
    { key: 'impressions',         label: 'Impressions',     numeric: true, render: r => Number(r.impressions || 0).toLocaleString() },
    { key: 'clicks',              label: 'Clicks',          numeric: true, render: r => Number(r.clicks      || 0).toLocaleString() },
    { key: 'conversions',         label: 'Conversions',     numeric: true, render: r => Number(r.conversions || 0).toLocaleString() },
    { key: 'ctr',                 label: 'CTR',             numeric: true, render: r => r.ctr == null ? '—' : `${Number(r.ctr).toFixed(2)}%` },
    { key: 'cpc',                 label: 'CPC',             numeric: true, render: r => r.cpc == null ? '—' : `$${Number(r.cpc).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { key: 'cpm',                 label: 'CPM',             numeric: true, render: r => r.cpm == null ? '—' : `$${Number(r.cpm).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { key: 'cost_per_conversion', label: 'CPA',             numeric: true, render: r => r.cost_per_conversion == null ? '—' : `$${Number(r.cost_per_conversion).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { key: 'conversion_rate',     label: 'Conv. Rate',      numeric: true, render: r => r.conversion_rate == null ? '—' : `${Number(r.conversion_rate).toFixed(2)}%` },
    // Conv. Value column removed 2026-09-01 — see scorecard-grid comment.
  );
  return cols;
}

// Daily Summary columns — Date + all scorecard metrics.
const DAILY_COLUMNS: DSTColumn[] = [
  { key: 'date',                label: 'Date',        align: 'left', render: r => fmtDate(r.date) },
  { key: 'spend_aud',           label: 'Spend',       numeric: true, render: r => `$${Math.round(Number(r.spend_aud   || 0)).toLocaleString()}` },
  { key: 'impressions',         label: 'Impressions', numeric: true, render: r => Number(r.impressions || 0).toLocaleString() },
  { key: 'clicks',              label: 'Clicks',      numeric: true, render: r => Number(r.clicks      || 0).toLocaleString() },
  { key: 'conversions',         label: 'Conversions', numeric: true, render: r => Number(r.conversions || 0).toLocaleString() },
  { key: 'ctr',                 label: 'CTR',         numeric: true, render: r => r.ctr == null ? '—' : `${Number(r.ctr).toFixed(2)}%` },
  { key: 'cpc',                 label: 'CPC',         numeric: true, render: r => r.cpc == null ? '—' : `$${Number(r.cpc).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  { key: 'cpm',                 label: 'CPM',         numeric: true, render: r => r.cpm == null ? '—' : `$${Number(r.cpm).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  { key: 'cost_per_conversion', label: 'CPA',         numeric: true, render: r => r.cost_per_conversion == null ? '—' : `$${Number(r.cost_per_conversion).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  { key: 'conversion_rate',     label: 'Conv. Rate',  numeric: true, render: r => r.conversion_rate == null ? '—' : `${Number(r.conversion_rate).toFixed(2)}%` },
  // Conv. Value column removed 2026-09-01 — see scorecard-grid comment.
];

// ─── Page ─────────────────────────────────────────────────────────────────

export default function GoogleAdsPage() {
  const [startDate, setStartDate] = useState(() => toIso(daysAgo(29)));
  const [endDate,   setEndDate]   = useState(() => toIso(new Date()));

  const [filters, setFilters] = useState<GadsFilters>({ campaigns: [], adGroups: [] });
  const [filterOptions, setFilterOptions] = useState<GadsFilterOptions>({ campaigns: [], adGroups: [] });

  const [summaryTotals,    setSummaryTotals]    = useState<Totals | null>(null);
  const [priorTotals,      setPriorTotals]      = useState<Totals | null>(null);
  const [dailyRows,        setDailyRows]        = useState<GadsDailyRow[]>([]);
  const [, setAgencyPerf]                       = useState<AgencyRow[]>([]);
  const [entityCampaigns,  setEntityCampaigns]  = useState<GadsEntityRow[]>([]);
  const [entityAdGroups,   setEntityAdGroups]   = useState<GadsEntityRow[]>([]);
  const [entityAds,        setEntityAds]        = useState<GadsEntityRow[]>([]);
  const [entityKeywords,   setEntityKeywords]   = useState<GadsEntityRow[]>([]);
  const [entitySearchTerms,setEntitySearchTerms]= useState<GadsEntityRow[]>([]);
  const [fallbackActive,   setFallbackActive]   = useState(false);
  const [bannerDismissed,  setBannerDismissed]  = useState(readBannerDismissed);

  type PerfTab =
    | 'campaigns' | 'adgroups' | 'ads' | 'daily'
    | 'keywords' | 'wasted' | 'searchterms' | 'assetgroups' | 'audience';
  const [perfTab, setPerfTab] = useState<PerfTab>('campaigns');

  type TrendTab =
    | 'spend_clicks' | 'impressions'
    | 'ctr' | 'cpc' | 'cpm'
    | 'conversions' | 'cpa' | 'conv_rate';
  const [trendTab, setTrendTab] = useState<TrendTab>('spend_clicks');

  useEffect(() => {
    getFilterOptions(startDate, endDate).then(setFilterOptions).catch(console.error);
  }, [startDate, endDate]);

  const [belowFoldRequested, setBelowFoldRequested] = useState(false);
  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null);

  const fetchAboveFoldCb = useCallback(async (sd: string, ed: string, f: GadsFilters) => {
    try {
      const data = await fetchAboveFold(sd, ed, f);
      setSummaryTotals(data.totals);
      setDailyRows(data.daily);
      setFallbackActive(data.fallback);
      setAgencyPerf(data.agencies);
    } catch (e) { console.error(e); }
  }, []);

  // Prior-period fetch — same length immediately before the current range,
  // filters preserved. Powers the delta arrows on every scorecard.
  const fetchPriorCb = useCallback(async (sd: string, ed: string, f: GadsFilters) => {
    try {
      const currStart = new Date(sd).getTime();
      const currEnd   = new Date(ed).getTime();
      const lenMs     = currEnd - currStart;
      const priorEnd  = new Date(currStart - 86_400_000);
      const priorStart = new Date(priorEnd.getTime() - lenMs);
      const data = await fetchAboveFold(toIso(priorStart), toIso(priorEnd), f);
      setPriorTotals(data.totals);
    } catch (e) { console.error(e); }
  }, []);

  const fetchBelowFoldCb = useCallback(async (sd: string, ed: string, f: GadsFilters) => {
    try {
      const entities = await fetchEntityTables(sd, ed, f);
      setEntityCampaigns(entities.campaigns);
      setEntityAdGroups(entities.adGroups);
      setEntityAds(entities.ads);
      setEntityKeywords(entities.keywords);
      setEntitySearchTerms(entities.searchTerms);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchAboveFoldCb(startDate, endDate, filters);
    fetchPriorCb    (startDate, endDate, filters);
  }, [startDate, endDate, filters, fetchAboveFoldCb, fetchPriorCb]);
  useEffect(() => {
    if (belowFoldRequested) fetchBelowFoldCb(startDate, endDate, filters);
  }, [startDate, endDate, filters, belowFoldRequested, fetchBelowFoldCb]);
  useEffect(() => {
    if (!sentinelEl || belowFoldRequested) return;
    const io = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) { setBelowFoldRequested(true); io.disconnect(); } },
      { rootMargin: chart.scrollRootMargin },
    );
    io.observe(sentinelEl);
    return () => io.disconnect();
  }, [sentinelEl, belowFoldRequested]);

  const t = summaryTotals;

  // ROAS + Value per Conversion + Conversion Value removed 2026-09-01
  // (see scorecard-grid comment). atWork's Google Ads conversion actions
  // have no monetary value configured, so any ratio involving
  // conversions_value degenerates. Restore when values are set in
  // Google Ads Manager.

  // Avg. Daily Spend — derived pacing signal for the 10th tile. Denominator
  // is calendar days in the selected window (inclusive), matching how
  // "average daily" typically reads on a media report. Current + prior
  // windows are the same length by construction (see fetchPriorCb), so
  // the delta collapses to the spend delta but the absolute number is
  // a different, useful quantity.
  const daysInWindow = useMemo(() => {
    const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
    return Math.max(1, Math.round(ms / 86_400_000) + 1);
  }, [startDate, endDate]);
  const avgDailySpend      = (t?.spend_aud            ?? 0) / daysInWindow;
  const priorAvgDailySpend = (priorTotals?.spend_aud  ?? 0) / daysInWindow;

  const spark = useMemo(() => ({
    spend:       dailyRows.map(d => d.spend_aud            ?? 0),
    impressions: dailyRows.map(d => d.impressions          ?? 0),
    clicks:      dailyRows.map(d => d.clicks               ?? 0),
    conversions: dailyRows.map(d => Number(d.conversions   ?? 0)),
    ctr:         dailyRows.map(d => d.ctr                  ?? 0),
    cpc:         dailyRows.map(d => d.cpc                  ?? 0),
    cpm:         dailyRows.map(d => d.cpm                  ?? 0),
    cpa:         dailyRows.map(d => Number(d.cost_per_conversion ?? 0)),
    convRate:    dailyRows.map(d => d.conversion_rate      ?? 0),
  }), [dailyRows]);

  // Trend chart source — normalize dailyRows into the shape MetricTrendsChart
  // wants (Recharts indexes by series.key). Same pattern as Meta page.
  const chartData = useMemo(() => dailyRows.map(d => ({
    date:                d.date,
    spend:               d.spend_aud,
    impressions:         d.impressions,
    clicks:              d.clicks,
    ctr:                 d.ctr,
    cpc:                 d.cpc,
    cpm:                 d.cpm,
    conversions:         Number(d.conversions ?? 0),
    cost_per_conversion: d.cost_per_conversion,
    conversion_rate:     d.conversion_rate,
  })), [dailyRows]);

  // Day-of-Week aggregation — derive client-side from dailyRows. Google Ads
  // doesn't ship a per-DOW breakdown so we reduce daily rows into a fixed
  // Sun→Sat array (index 0..6). Sum volume, weighted CTR from clicks/impr.
  const dowData = useMemo(() => {
    const buckets: { spend: number; impressions: number; clicks: number; conversions: number }[] =
      Array.from({ length: 7 }, () => ({ spend: 0, impressions: 0, clicks: 0, conversions: 0 }));
    for (const d of dailyRows) {
      if (!d.date) continue;
      const idx = new Date(d.date).getDay(); // 0=Sun … 6=Sat
      buckets[idx].spend       += d.spend_aud   ?? 0;
      buckets[idx].impressions += d.impressions ?? 0;
      buckets[idx].clicks      += d.clicks      ?? 0;
      buckets[idx].conversions += Number(d.conversions ?? 0);
    }
    // Reorder to Mon..Sun which reads more naturally for a business-week view.
    const order = [1, 2, 3, 4, 5, 6, 0];
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return order.map(i => ({
      weekday: labels[i],
      weekday_idx: i,
      ...buckets[i],
      ctr: buckets[i].impressions ? (buckets[i].clicks / buckets[i].impressions) * 100 : null,
    }));
  }, [dailyRows]);

  // Match Type distribution — bucket entityKeywords spend by match type. atWork
  // ran Search campaigns until Jan 2025 so historical ranges show the mix.
  const matchTypeData = useMemo(() => {
    const map = new Map<string, { spend: number; clicks: number; impressions: number; conversions: number }>();
    for (const k of entityKeywords) {
      const key = (k.match_type ?? 'Unknown').toString().toUpperCase();
      const e = map.get(key) ?? { spend: 0, clicks: 0, impressions: 0, conversions: 0 };
      e.spend       += k.spend       ?? 0;
      e.clicks      += k.clicks      ?? 0;
      e.impressions += k.impressions ?? 0;
      e.conversions += Number(k.conversions ?? 0);
      map.set(key, e);
    }
    return [...map.entries()]
      .map(([match_type, m]) => ({ match_type, ...m, ctr: m.impressions ? (m.clicks / m.impressions) * 100 : null }))
      .sort((a, b) => b.spend - a.spend);
  }, [entityKeywords]);

  // Wasted Spend — keywords that spent $5+ but returned zero conversions
  // over the selected range. Sorted by spend desc so the biggest bleeders
  // sit at the top for immediate action.
  const wastedKeywords = useMemo(
    () => entityKeywords
      .filter(k => (k.spend ?? 0) >= 5 && Number(k.conversions ?? 0) === 0)
      .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0)),
    [entityKeywords],
  );

  const dailyTotals = useMemo(() => {
    const spend       = dailyRows.reduce((s, r) => s + r.spend_aud,          0);
    const impressions = dailyRows.reduce((s, r) => s + r.impressions,        0);
    const clicks      = dailyRows.reduce((s, r) => s + r.clicks,             0);
    const conversions = dailyRows.reduce((s, r) => s + (r.conversions ?? 0), 0);
    return {
      date:                'Total',
      spend_aud:           spend,
      impressions,
      clicks,
      conversions,
      ctr:                 impressions ? (clicks / impressions) * 100 : null,
      cpc:                 clicks      ? spend / clicks               : null,
      cpm:                 impressions ? (spend / impressions) * 1000 : null,
      cost_per_conversion: conversions ? spend / conversions          : null,
      conversion_rate:     clicks      ? (conversions / clicks) * 100 : null,
    };
  }, [dailyRows]);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = () => {
    setRefreshing(true);
    setFilters({ campaigns: [], adGroups: [] });
    setStartDate(toIso(daysAgo(29)));
    setEndDate(toIso(new Date()));
    setBelowFoldRequested(false);
    window.setTimeout(() => setRefreshing(false), 600);
  };

  if (summaryTotals === null) {
    return (
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: `${spacing.xl} ${spacing.lg}`, textAlign: 'center', color: colors.text.secondary }}>
        Loading summary…
      </div>
    );
  }

  const noteBox: React.CSSProperties = {
    padding: spacing.md,
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    backgroundColor: colors.background.panel,
    borderTop: `${borderWidth.thin} solid ${colors.border.default}`,
  };
  const searchPausedNote = (
    <div style={noteBox}>
      No data for this range. Ad group, ad, keyword and search-term reporting
      require an active Search campaign, and atWork&apos;s Search campaigns have
      been paused since January 2025 (last data 2026-07-17). Widen the date
      range to see historical figures.
    </div>
  );
  const assetGroupsNote = (
    <div style={noteBox}>
      No data. Weld&apos;s Google Ads connector does not expose Performance
      Max asset-group reporting — there is no asset_group / asset_group_stats
      table available to sync. Asset-level PMax performance would need to
      come from the Google Ads UI or a direct API pull outside Weld.
    </div>
  );
  const audienceNote = (
    <div style={noteBox}>
      No data. audience_stats is synced from Weld but has landed with zero
      rows, most likely because atWork&apos;s active Performance Max campaign
      uses Google&apos;s auto-audience system, which has no per-audience
      segment breakdown to report. This section will populate if a standard
      Search or Display campaign with audience segments is ever added.
    </div>
  );

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: `${spacing.md} ${spacing.lg}` }}>
      <h2 style={{
        textAlign: 'center',
        fontWeight: typography.fontWeight.bold,
        fontSize: typography.fontSize['3xl'],
        color: colors.text.primary,
        marginBottom: spacing.lg,
      }}>
        Google Ads
      </h2>

      <FallbackBanner
        active={fallbackActive}
        dismissed={bannerDismissed}
        onDismiss={() => persistBannerDismissed(setBannerDismissed)}
      />

      {/* ── Filters row ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: spacing.sm,
        justifyContent: 'center', alignItems: 'flex-end', marginBottom: spacing.lg,
      }}>
        <SearchableMultiSelect
          label="Campaign"
          options={filterOptions.campaigns}
          value={filters.campaigns}
          onChange={vals => setFilters(prev => ({ ...prev, campaigns: vals }))}
        />
        <SearchableMultiSelect
          label="Ad Group"
          options={filterOptions.adGroups}
          value={filters.adGroups}
          onChange={vals => setFilters(prev => ({ ...prev, adGroups: vals }))}
        />

        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={(s, e) => { setStartDate(s); setEndDate(e); }}
        />

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          onMouseEnter={e => { if (!refreshing) e.currentTarget.style.backgroundColor = colors.brand.primaryDark; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = colors.ui.tealAlt; }}
          style={{
            height: controls.selectHeight,
            backgroundColor: colors.ui.tealAlt,
            color: colors.text.inverse,
            border: 'none', borderRadius: borderRadius.none, padding: cellPadding.pillLg,
            fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium,
            cursor: refreshing ? 'wait' : 'pointer',
            opacity: refreshing ? 0.6 : 1,
            transition: 'background-color 120ms, opacity 120ms',
          }}
        >
          {refreshing ? 'Resetting…' : 'Reset Filters'}
        </button>
      </div>

      {/* ── Inactive-account banner ──────────────────────────────── */}
      {(t && t.spend_aud === 0 && t.impressions === 0 && t.clicks === 0) && (
        <div style={{
          border: `${borderWidth.thin} solid ${colors.brand.secondary}`,
          backgroundColor: colors.brand.secondaryFaint,
          color: colors.text.primary,
          padding: `${spacing.md} ${spacing.lg}`,
          marginBottom: spacing.lg,
          borderRadius: borderRadius.none,
          fontSize: typography.fontSize.sm,
          lineHeight: 1.5,
          boxShadow: shadow.md,
        }}>
          <div style={{ fontWeight: typography.fontWeight.semibold, marginBottom: 4 }}>
            Google Ads account is inactive
          </div>
          <div style={{ color: colors.text.secondary }}>
            The atWork Google Ads account stopped delivering ads on 2024-04-08 and is marked Inactive in Weld. Campaign / ad-group / keyword dimensions are still synced (visible below) but no new stats will land until the account is reactivated in Google Ads.
          </div>
        </div>
      )}

      {/* ── Scorecards (10 tiles, 5-per-row grid, deltas on every tile) ──
           Previously 12 tiles in a 6x2 grid. Conversion Value, Value /
           Conversion, and ROAS removed 2026-09-01: atWork's Google Ads
           conversion actions have no monetary value configured, so BQ's
           conversions_value column reads exactly equal to conversions
           and all three metrics degenerate to arithmetic-of-count. Grid
           re-tuned to 5x2 with Avg. Daily Spend as the tenth tile — a
           purely-derived pacing signal (spend / days-with-spend) that
           does not need any new column in bronze/silver. If conversion
           values ever land in the account, restore the three tiles +
           revert to 6x2. */}
      <div className="scorecard-grid" style={{
        display: 'grid',
        gridTemplateColumns: `repeat(5, ${card.gridCardMin})`,
        gap: spacing.sm,
        justifyContent: 'center',
        marginBottom: spacing.xs,
      }}>
        <BFScorecard title="Spend"               value={fmtMoney(t?.spend_aud           ?? 0)}    sparklineData={spark.spend}       color="blue" size="small" delta={{ pct: deltaPct(t?.spend_aud,           priorTotals?.spend_aud),           goodDirection: null   }} />
        <BFScorecard title="Avg. Daily Spend"    value={fmtMoney(avgDailySpend                )}   sparklineData={spark.spend}       color="blue" size="small" delta={{ pct: deltaPct(avgDailySpend,          priorAvgDailySpend),               goodDirection: null   }} />
        <BFScorecard title="Impressions"         value={fmtInt(t?.impressions           ?? 0)}    sparklineData={spark.impressions} color="blue" size="small" delta={{ pct: deltaPct(t?.impressions,         priorTotals?.impressions),         goodDirection: 'up'   }} />
        <BFScorecard title="Clicks"              value={fmtInt(t?.clicks                ?? 0)}    sparklineData={spark.clicks}      color="blue" size="small" delta={{ pct: deltaPct(t?.clicks,              priorTotals?.clicks),              goodDirection: 'up'   }} />
        <BFScorecard title="CTR"                 value={fmtCtr(t?.ctr                   ?? null)} sparklineData={spark.ctr}         color="blue" size="small" delta={{ pct: deltaPct(t?.ctr,                 priorTotals?.ctr),                 goodDirection: 'up'   }} />
        <BFScorecard title="CPC"                 value={fmtMoney(t?.cpc                 ?? null)} sparklineData={spark.cpc}         color="blue" size="small" delta={{ pct: deltaPct(t?.cpc,                 priorTotals?.cpc),                 goodDirection: 'down' }} />
        <BFScorecard title="CPM"                 value={fmtMoney(t?.cpm                 ?? null)} sparklineData={spark.cpm}         color="blue" size="small" delta={{ pct: deltaPct(t?.cpm,                 priorTotals?.cpm),                 goodDirection: 'down' }} />
        <BFScorecard title="Conversions"         value={fmtInt(t?.conversions           ?? 0)}    sparklineData={spark.conversions} color="blue" size="small" delta={{ pct: deltaPct(t?.conversions,         priorTotals?.conversions),         goodDirection: 'up'   }} />
        <BFScorecard title="Conversion Rate"     value={fmtCtr(t?.conversion_rate       ?? null)} sparklineData={spark.convRate}    color="blue" size="small" delta={{ pct: deltaPct(t?.conversion_rate,     priorTotals?.conversion_rate),     goodDirection: 'up'   }} />
        <BFScorecard title="Cost per Conversion" value={fmtMoney(t?.cost_per_conversion ?? null)} sparklineData={spark.cpa}         color="blue" size="small" delta={{ pct: deltaPct(t?.cost_per_conversion, priorTotals?.cost_per_conversion), goodDirection: 'down' }} />
      </div>
      <div style={{
        textAlign: 'center', fontSize: typography.fontSize.xs,
        color: colors.text.secondary, marginBottom: spacing.lg,
        lineHeight: 1.5,
      }}>
        <div>
          ▲ / ▼ arrows compare against the equivalent immediately-prior period
          of the same length as the selected date range.
        </div>
        <div>Conversions = {GADS_CONVERSION_DEFINITION}</div>
      </div>

      {/* Top Performers — client-side pick with per-metric noise floors so a
          1-impression row can't take the top spot. Four highlights: two
          campaign-grain (CTR / CPA) plus one ad-group and one keyword.
          Top Search Term removed 2026-09-01 — search-term conversions
          are effectively empty in this account so the tile sat at "—"
          and consumed a full flex-wrapped row on its own. Restore if
          search-term-level conversions start landing. */}
      {(entityCampaigns.length > 0 || entityAdGroups.length > 0 || entityKeywords.length > 0) && (() => {
        // Campaign-grain
        const withImpr   = entityCampaigns.filter(c => c.impressions >= 500);
        const withConv   = entityCampaigns.filter(c => Number(c.conversions ?? 0) >= 3);
        const bestCtr    = withImpr .slice().sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0))[0];
        const bestCpa    = withConv .slice().sort((a, b) => (a.cost_per_conversion ?? Infinity) - (b.cost_per_conversion ?? Infinity))[0];
        // Ad-group-grain
        const agClicks   = entityAdGroups.filter(a => a.clicks >= 100);
        const bestAgRate = agClicks.slice().sort((a, b) => (b.conversion_rate ?? 0) - (a.conversion_rate ?? 0))[0];
        // Keyword-grain — cheapest CPC among keywords that actually got seen
        const kwImpr     = entityKeywords.filter(k => k.impressions >= 500 && k.cpc != null);
        const cheapestKw = kwImpr.slice().sort((a, b) => (a.cpc ?? Infinity) - (b.cpc ?? Infinity))[0];

        // Best ROAS highlight removed 2026-09-01 alongside the ROAS /
        // Conversion Value / Value / Conversion scorecards: atWork's Google
        // Ads conversion actions have no monetary value configured, so
        // conversions_value equals conversions in BQ and any ROAS
        // computation renders as arithmetic-of-count. Restore when
        // conversion values are set in Google Ads Manager.
        const highlights: { label: string; value: string; row: GadsEntityRow | undefined }[] = [
          { label: 'Best CTR — Campaign (500+ impr)',     value: bestCtr    ? `${(bestCtr.ctr ?? 0).toFixed(2)}%`                                     : '—', row: bestCtr },
          { label: 'Best CPA — Campaign (3+ conv)',       value: bestCpa    ? `$${(bestCpa.cost_per_conversion ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`                     : '—', row: bestCpa },
          { label: 'Best Conv. Rate — Ad Group (100+ clk)', value: bestAgRate ? `${(bestAgRate.conversion_rate ?? 0).toFixed(2)}%`                       : '—', row: bestAgRate },
          { label: 'Cheapest CPC — Keyword (500+ impr)',  value: cheapestKw ? `$${(cheapestKw.cpc ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`                                  : '—', row: cheapestKw },
        ];
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg }}>
            {highlights.map(h => (
              <div key={h.label} style={{ flex: `1 1 ${card.flexBasis}`, minWidth: 0, border: `${borderWidth.medium} solid ${colors.ui.teal}`, borderRadius: borderRadius.none, padding: spacing.md, backgroundColor: colors.background.card, boxShadow: shadow.md }}>
                <div style={{ fontSize: typography.fontSize.xs, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  {h.label}
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: typography.fontWeight.bold, color: colors.text.primary, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>
                  {h.value}
                </div>
                {h.row && (
                  <div style={{ fontSize: typography.fontSize.xs, color: colors.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }} title={String(h.row.name)}>
                    {String(h.row.name)}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Sentinel for lazy below-fold fetch */}
      <div ref={setSentinelEl} aria-hidden style={{ height: 1 }} />

      {/* ── Full-width bottom sections ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>

        {/* Two bar charts side by side: Day of Week + Match Type. Both derive
            from state we already have on the client — no server change. */}
        {/* Note on missing breakdowns: Weld's Google Ads sync doesn't ship
            ad_network_type, advertising_channel_type, or device dimensions
            (verified via bronze schema 2026-08-29). Spend-by-Network,
            Campaign-Type, and Device bar charts would need a connector
            expansion — not possible with the current sync. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.lg }}>
          <div style={{ flex: `1 1 ${card.flexHalf}`, minWidth: card.minWidth }}>
            <ChartContainer title="Performance by Day of Week">
              <div style={{ padding: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                {dowData.every(d => d.spend === 0) ? (
                  <div style={{ padding: spacing.md, color: colors.text.secondary, fontSize: typography.fontSize.sm, textAlign: 'center' }}>
                    No spend in the selected range.
                  </div>
                ) : (() => {
                  const maxSpend = Math.max(...dowData.map(d => d.spend));
                  return dowData.map(d => {
                    const pct = maxSpend > 0 ? (d.spend / maxSpend) * 100 : 0;
                    return (
                      <div key={d.weekday_idx} style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                        <div style={{ width: 46, flexShrink: 0, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.text.primary, textAlign: 'right' }}>
                          {d.weekday}
                        </div>
                        <div style={{ flex: 1, position: 'relative', height: 24, backgroundColor: colors.background.panel, minWidth: 40 }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: colors.ui.teal, transition: 'width 240ms ease-out' }} />
                        </div>
                        <div style={{ width: 180, flexShrink: 0, fontSize: typography.fontSize.xs, color: colors.text.primary, display: 'flex', justifyContent: 'space-between', gap: 4, fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{ fontWeight: typography.fontWeight.semibold }}>{`$${Math.round(d.spend).toLocaleString()}`}</span>
                          <span style={{ color: colors.text.secondary }}>{fmtInt(d.clicks)} clk</span>
                          <span style={{ color: colors.text.secondary }}>{d.ctr == null ? '—' : `${d.ctr.toFixed(2)}%`}</span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </ChartContainer>
          </div>
          <div style={{ flex: `1 1 ${card.flexHalf}`, minWidth: card.minWidth }}>
            <ChartContainer title="Match Type Distribution">
              <div style={{ padding: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                {matchTypeData.length === 0 ? (
                  <div style={{ padding: spacing.md, color: colors.text.secondary, fontSize: typography.fontSize.sm, textAlign: 'center' }}>
                    No keyword data in the selected range.
                  </div>
                ) : (() => {
                  const maxSpend = Math.max(...matchTypeData.map(m => m.spend));
                  return matchTypeData.map(m => {
                    const pct = maxSpend > 0 ? (m.spend / maxSpend) * 100 : 0;
                    const label = m.match_type.charAt(0) + m.match_type.slice(1).toLowerCase();
                    return (
                      <div key={m.match_type} style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                        <div style={{ width: 80, flexShrink: 0, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.text.primary, textAlign: 'right' }} title={m.match_type}>
                          {label}
                        </div>
                        <div style={{ flex: 1, position: 'relative', height: 24, backgroundColor: colors.background.panel, minWidth: 30 }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: colors.ui.teal, transition: 'width 240ms ease-out' }} />
                        </div>
                        <div style={{ width: 160, flexShrink: 0, fontSize: typography.fontSize.xs, color: colors.text.primary, display: 'flex', justifyContent: 'space-between', gap: 4, fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{ fontWeight: typography.fontWeight.semibold }}>{`$${Math.round(m.spend).toLocaleString()}`}</span>
                          <span style={{ color: colors.text.secondary }}>{m.ctr == null ? '—' : `${m.ctr.toFixed(2)}%`}</span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </ChartContainer>
          </div>
        </div>

        {/* One tabbed line-chart card — same pattern as Meta. Data derived
            from dailyRows so each tab reads its own key without a separate
            fetch. */}
        <ChartContainer title="Metric Trends">
          <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap', marginBottom: spacing.md, paddingLeft: spacing.md }}>
            <span style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.text.secondary }}>Metric:</span>
            {([
              { key: 'spend_clicks', label: 'Spend & Clicks'    },
              { key: 'impressions',  label: 'Impressions'       },
              { key: 'ctr',          label: 'CTR'               },
              { key: 'cpc',          label: 'CPC'               },
              { key: 'cpm',          label: 'CPM'               },
              { key: 'conversions',  label: 'Conversions'       },
              { key: 'cpa',          label: 'CPA'               },
              { key: 'conv_rate',    label: 'Conv. Rate'        },
              // conv_value + roas removed 2026-09-01 — see scorecard-grid comment.
            ] as { key: TrendTab; label: string }[]).map(opt => {
              const active = trendTab === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setTrendTab(opt.key)}
                  style={{
                    padding: cellPadding.button,
                    fontSize: typography.fontSize.sm,
                    fontWeight: typography.fontWeight.semibold,
                    fontFamily: typography.fontFamily.sans,
                    cursor: 'pointer',
                    border: `${borderWidth.thin} solid ${active ? colors.brand.primary : colors.border.default}`,
                    backgroundColor: active ? colors.brand.primary : '#fff',
                    color: active ? colors.brand.primaryText : colors.text.primary,
                    borderRadius: borderRadius.none,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {(() => {
            const data = chartData as unknown as TrendRow[];
            switch (trendTab) {
              case 'impressions':
                return <MetricTrendsChart data={data} yUnit="number"   series={[{ key: 'impressions',         label: 'Impressions',      color: colors.chart[1] }]} />;
              case 'ctr':
                return <MetricTrendsChart data={data} yUnit="percent"  series={[{ key: 'ctr',                 label: 'CTR',              color: colors.chart[3] }]} />;
              case 'cpc':
                return <MetricTrendsChart data={data} yUnit="currency" series={[{ key: 'cpc',                 label: 'CPC',              color: colors.chart[4] }]} />;
              case 'cpm':
                return <MetricTrendsChart data={data} yUnit="currency" series={[{ key: 'cpm',                 label: 'CPM',              color: colors.chartDark[0] }]} />;
              case 'conversions':
                return <MetricTrendsChart data={data} yUnit="number"   series={[{ key: 'conversions',         label: 'Conversions',      color: colors.chartDark[1] }]} />;
              case 'cpa':
                return <MetricTrendsChart data={data} yUnit="currency" series={[{ key: 'cost_per_conversion', label: 'CPA',              color: colors.chartDark[2] }]} />;
              case 'conv_rate':
                return <MetricTrendsChart data={data} yUnit="percent"  series={[{ key: 'conversion_rate',     label: 'Conv. Rate',       color: colors.chart[2] }]} />;
              case 'spend_clicks':
              default:
                return (
                  <MetricTrendsChart
                    data={data}
                    leftYUnit="currency"
                    rightYUnit="number"
                    series={[
                      { key: 'spend',  label: 'Spend',  color: colors.chart[1],     yAxisId: 'left'  },
                      { key: 'clicks', label: 'Clicks', color: colors.chartDark[0], yAxisId: 'right' },
                    ]}
                  />
                );
            }
          })()}
        </ChartContainer>

        {/* One consolidated tabbed table — folds every table on the old
            layout (Campaigns, Ad Groups, Ads, Daily Summary, Keywords,
            Search Terms, Asset Groups, Audience) into a single card
            with a tab row. */}
        <ChartContainer title="Performance">
          <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap', marginBottom: spacing.md, paddingLeft: spacing.md }}>
            <span style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.text.secondary }}>View:</span>
            {([
              { key: 'campaigns',   label: 'Campaigns'     },
              { key: 'adgroups',    label: 'Ad Groups'     },
              { key: 'ads',         label: 'Ads'           },
              { key: 'daily',       label: 'Daily Summary' },
              { key: 'keywords',    label: 'Keywords'      },
              { key: 'wasted',      label: 'Wasted Spend'  },
              { key: 'searchterms', label: 'Search Terms'  },
              { key: 'assetgroups', label: 'Asset Groups'  },
              { key: 'audience',    label: 'Audience'      },
            ] as { key: PerfTab; label: string }[]).map(opt => {
              const active = perfTab === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setPerfTab(opt.key)}
                  style={{
                    padding: cellPadding.button,
                    fontSize: typography.fontSize.sm,
                    fontWeight: typography.fontWeight.semibold,
                    fontFamily: typography.fontFamily.sans,
                    cursor: 'pointer',
                    border: `${borderWidth.thin} solid ${active ? colors.brand.primary : colors.border.default}`,
                    backgroundColor: active ? colors.brand.primary : '#fff',
                    color: active ? colors.brand.primaryText : colors.text.primary,
                    borderRadius: borderRadius.none,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {(() => {
            switch (perfTab) {
              case 'adgroups':
                return (
                  <>
                    <DailySummaryTable
                      data={entityAdGroups as unknown as DailyRow[]}
                      columns={entityColumns('Ad Group', { withCampaign: true })}
                      sortable
                      initialSort={{ key: 'spend', direction: 'desc' }}
                      paginate={20}
                    />
                    {entityAdGroups.length === 0 && searchPausedNote}
                  </>
                );
              case 'ads':
                return (
                  <>
                    <DailySummaryTable
                      data={entityAds as unknown as DailyRow[]}
                      columns={entityColumns('Ad', { withAdGroup: true, withCampaign: true })}
                      sortable
                      initialSort={{ key: 'spend', direction: 'desc' }}
                      paginate={20}
                    />
                    {entityAds.length === 0 && searchPausedNote}
                  </>
                );
              case 'daily':
                return (
                  <DailySummaryTable
                    data={dailyRows as unknown as DailyRow[]}
                    columns={DAILY_COLUMNS}
                    sortable
                    initialSort={{ key: 'date', direction: 'desc' }}
                    totalsRow={dailyTotals as unknown as Record<string, unknown>}
                    paginate={10}
                  />
                );
              case 'keywords':
                return (
                  <>
                    <DailySummaryTable
                      data={entityKeywords as unknown as DailyRow[]}
                      columns={entityColumns('Keyword', { withMatchType: true, withAdGroup: true })}
                      sortable
                      initialSort={{ key: 'spend', direction: 'desc' }}
                      paginate={20}
                    />
                    {entityKeywords.length === 0 && searchPausedNote}
                  </>
                );
              case 'wasted':
                return (
                  <>
                    <DailySummaryTable
                      data={wastedKeywords as unknown as DailyRow[]}
                      columns={entityColumns('Keyword', { withMatchType: true, withAdGroup: true })}
                      sortable
                      initialSort={{ key: 'spend', direction: 'desc' }}
                      paginate={20}
                    />
                    {wastedKeywords.length === 0 ? (
                      <div style={noteBox}>
                        No wasted spend in the selected range. Keywords listed here
                        would have spent $5 or more with zero conversions —
                        candidates for pausing, negating, or bid reduction.
                      </div>
                    ) : (
                      <div style={{ marginTop: spacing.sm, textAlign: 'right', fontSize: typography.fontSize.xs, color: colors.text.secondary }}>
                        {wastedKeywords.length} keyword{wastedKeywords.length === 1 ? '' : 's'} spent $5+ with zero conversions. Sorted by spend descending.
                      </div>
                    )}
                  </>
                );
              case 'searchterms':
                return (
                  <>
                    <DailySummaryTable
                      data={entitySearchTerms as unknown as DailyRow[]}
                      columns={entityColumns('Search Term', { withMatchType: true })}
                      sortable
                      initialSort={{ key: 'spend', direction: 'desc' }}
                      paginate={20}
                    />
                    {entitySearchTerms.length === 0 && searchPausedNote}
                  </>
                );
              case 'assetgroups':
                return (
                  <>
                    <DailySummaryTable
                      data={[] as unknown as DailyRow[]}
                      columns={entityColumns('Asset Group', { withCampaign: true })}
                      sortable
                      initialSort={{ key: 'spend', direction: 'desc' }}
                      paginate={20}
                    />
                    {assetGroupsNote}
                  </>
                );
              case 'audience':
                return (
                  <>
                    <DailySummaryTable
                      data={[] as unknown as DailyRow[]}
                      columns={entityColumns('Audience', { withCampaign: true })}
                      sortable
                      initialSort={{ key: 'spend', direction: 'desc' }}
                      paginate={20}
                    />
                    {audienceNote}
                  </>
                );
              case 'campaigns':
              default:
                return (
                  <DailySummaryTable
                    data={entityCampaigns as unknown as DailyRow[]}
                    columns={entityColumns('Campaign')}
                    sortable
                    initialSort={{ key: 'spend', direction: 'desc' }}
                    paginate={20}
                  />
                );
            }
          })()}
        </ChartContainer>

      </div>
    </div>
  );
}
