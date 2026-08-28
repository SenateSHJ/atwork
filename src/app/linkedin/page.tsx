'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { format, parseISO } from 'date-fns';
import { colors, typography, spacing } from '@/tokens';
import { BFScorecard } from '@/components/BFScorecard';
import { ChartContainer } from '@/components/ChartContainer';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { SearchableMultiSelect } from '@/components/hq/SearchableMultiSelect';
import { DailySummaryTable, type DSTColumn } from '@/components/hq/DailySummaryTable';

// Recharts is ~90KB gzipped — lazy-load so scorecards paint before the chart
// lib finishes downloading.
const MetricTrendsChart = dynamic(
  () => import('@/components/hq/MetricTrendsChart').then(m => ({ default: m.MetricTrendsChart })),
  {
    ssr: false,
    loading: () => (
      <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 14 }}>
        Loading chart…
      </div>
    ),
  },
);

import {
  fetchAboveFold, fetchBelowFold, fetchEntityTables, fetchDayOfWeek, getFilterOptions,
  type LinkedinFilters, type LinkedinFilterOptions,
  type Totals, type DailyRow, type TrendRow, type EntityRow, type DayOfWeekRow,
} from './actions';

// Local mirror of MetricTrendsChart's exported TrendRow (which carries
// BFT-era cpl_* fields we don't use on LinkedIn). We cast trendsData
// through this so TS is happy — the chart only reads the keys named in
// its `series` prop.
type ChartTrendRow = {
  date:        string;
  cpl_blended: number | null;
  cpl_meta:    number | null;
  cpl_website: number | null;
  ctr:         number | null;
  cpc:         number | null;
  cpm:         number | null;
} & Record<string, unknown>;

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
const fmtMoney = (v: number | null) => v != null ? `$${v.toFixed(2)}` : '$0.00';
const fmtInt   = (v: number)        => Math.round(v).toLocaleString();
const fmtDate  = (v: unknown) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? format(parseISO(v), 'd-MMM-yyyy')
    : String(v ?? '');

// Entity table column config — the two group-by options share this shape,
// with the "Campaign" parent link inserted only for creatives.
function entityColumns(nameLabel: string, opts?: { withParentCampaign?: boolean; withObjective?: boolean; withAdCopy?: boolean; withPreview?: boolean; withStatusFormat?: boolean }): DSTColumn[] {
  const cols: DSTColumn[] = [
    { key: 'name', label: nameLabel, align: 'left' },
  ];
  if (opts?.withStatusFormat) {
    cols.push({
      key: 'status',
      label: 'Status',
      align: 'left',
      render: r => {
        const s = String(r.status ?? '').toUpperCase();
        const cfg: Record<string, { bg: string; fg: string }> = {
          ACTIVE:    { bg: colors.brand.secondaryFaint, fg: colors.brand.secondaryDark },
          PAUSED:    { bg: colors.brand.primaryFaint,   fg: colors.brand.primaryDark },
          COMPLETED: { bg: '#f3f4f6',                    fg: '#6b7280' },
          DRAFT:     { bg: '#f3f4f6',                    fg: '#6b7280' },
        };
        const style = cfg[s] ?? { bg: '#f3f4f6', fg: '#6b7280' };
        if (!s) return '—';
        return (
          <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            fontSize: typography.fontSize.xs,
            fontWeight: typography.fontWeight.semibold,
            backgroundColor: style.bg,
            color: style.fg,
            textTransform: 'capitalize',
          }}>{s.toLowerCase()}</span>
        );
      },
    });
    cols.push({
      key: 'format',
      label: 'Format',
      align: 'left',
      render: r => {
        const f = String(r.format ?? '').replace(/_/g, ' ').toLowerCase();
        if (!f) return '—';
        return (
          <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            fontSize: typography.fontSize.xs,
            fontWeight: typography.fontWeight.medium,
            backgroundColor: '#f3f4f6',
            color: colors.text.primary,
            textTransform: 'capitalize',
          }}>{f}</span>
        );
      },
    });
  }
  if (opts?.withPreview) {
    cols.push({
      key: 'content_reference',
      label: 'Preview',
      align: 'left',
      render: r => {
        const urn = r.content_reference as string | null | undefined;
        if (!urn) return '—';
        // LinkedIn's public embed endpoint — renders the ad's poster image
        // + text + engagement bar in an iframe. No auth required, lazy-loaded
        // so only iframes scrolled into view make network requests.
        const src = `https://www.linkedin.com/embed/feed/update/${encodeURIComponent(urn)}`;
        return (
          <iframe
            src={src}
            loading="lazy"
            style={{
              width: 220,
              height: 200,
              border: '1px solid #e5e7eb',
              borderRadius: 0,
              display: 'block',
            }}
            title="LinkedIn post preview"
            allow="fullscreen"
          />
        );
      },
    });
  }
  if (opts?.withParentCampaign) {
    cols.push({ key: 'campaign_name', label: 'Campaign', align: 'left', render: r => String(r.campaign_name ?? '—') });
  }
  if (opts?.withAdCopy) {
    cols.push({
      key: 'post_text',
      label: 'Ad Copy',
      align: 'left',
      render: r => {
        const t = r.post_text as string | null | undefined;
        if (!t) return '—';
        const short = t.length > 140 ? t.slice(0, 140).trim() + '…' : t;
        return short;
      },
    });
  }
  if (opts?.withObjective) {
    cols.push({ key: 'objective', label: 'Objective', align: 'left', render: r => String(r.objective ?? '—') });
  }
  cols.push(
    { key: 'spend',               label: 'Spend',        numeric: true, render: r => `$${Math.round(Number(r.spend       || 0)).toLocaleString()}` },
    { key: 'impressions',         label: 'Impressions',  numeric: true, render: r => Number(r.impressions || 0).toLocaleString() },
    { key: 'clicks',              label: 'Clicks',       numeric: true, render: r => Number(r.clicks      || 0).toLocaleString() },
    { key: 'ctr',                 label: 'CTR',          numeric: true, render: r => r.ctr == null ? '—' : `${Number(r.ctr).toFixed(2)}%` },
    { key: 'cpc',                 label: 'CPC',          numeric: true, render: r => r.cpc == null ? '—' : `$${Number(r.cpc).toFixed(2)}` },
    { key: 'cpm',                 label: 'CPM',          numeric: true, render: r => r.cpm == null ? '—' : `$${Number(r.cpm).toFixed(2)}` },
    { key: 'leads',               label: 'Leads',        numeric: true, render: r => Number(r.leads || 0).toLocaleString() },
    { key: 'cost_per_lead',       label: 'CPL',          numeric: true, render: r => r.cost_per_lead == null ? '—' : `$${Number(r.cost_per_lead).toFixed(2)}` },
    { key: 'landing_page_clicks', label: 'LP Clicks',    numeric: true, render: r => Number(r.landing_page_clicks || 0).toLocaleString() },
    { key: 'video_views',         label: 'Video Views',  numeric: true, render: r => Number(r.video_views || 0).toLocaleString() },
    { key: 'engagements',         label: 'Engagements',  numeric: true, render: r => Number(r.engagements || 0).toLocaleString() },
  );
  return cols;
}

// Daily Summary table — mirrors the 10 scorecard metrics + Date.
const DAILY_COLUMNS: DSTColumn[] = [
  { key: 'date',          label: 'Date',        align: 'left', render: r => fmtDate(r.date) },
  { key: 'spend',         label: 'Spend',       numeric: true, render: r => `$${Math.round(Number(r.spend       || 0)).toLocaleString()}` },
  { key: 'impressions',   label: 'Impressions', numeric: true, render: r => Number(r.impressions || 0).toLocaleString() },
  { key: 'clicks',        label: 'Clicks',      numeric: true, render: r => Number(r.clicks      || 0).toLocaleString() },
  { key: 'reach',         label: 'Reach',       numeric: true, render: r => Number(r.reach       || 0).toLocaleString() },
  { key: 'ctr',           label: 'CTR',         numeric: true, render: r => r.ctr == null ? '—' : `${Number(r.ctr).toFixed(2)}%` },
  { key: 'cpc',           label: 'CPC',         numeric: true, render: r => r.cpc == null ? '—' : `$${Number(r.cpc).toFixed(2)}` },
  { key: 'cpm',           label: 'CPM',         numeric: true, render: r => r.cpm == null ? '—' : `$${Number(r.cpm).toFixed(2)}` },
  { key: 'engagements',   label: 'Engagements', numeric: true, render: r => Number(r.engagements || 0).toLocaleString() },
  { key: 'video_views',   label: 'Video Views', numeric: true, render: r => Number(r.video_views || 0).toLocaleString() },
  { key: 'leads',         label: 'Leads',       numeric: true, render: r => Number(r.leads || 0).toLocaleString() },
];

const ADS_SPEND_THRESHOLD = 5;

// ─── Page ─────────────────────────────────────────────────────────────────

export default function LinkedinPage() {
  const [startDate, setStartDate] = useState(() => toIso(daysAgo(29)));
  const [endDate,   setEndDate]   = useState(() => toIso(new Date()));

  const [filters, setFilters] = useState<LinkedinFilters>({ campaigns: [], objectives: [] });
  const [filterOptions, setFilterOptions] = useState<LinkedinFilterOptions>({ campaigns: [], objectives: [] });

  const [summaryTotals,   setSummaryTotals]   = useState<Totals | null>(null);
  const [dailyRows,       setDailyRows]       = useState<DailyRow[]>([]);
  const [trendsData,      setTrendsData]      = useState<TrendRow[]>([]);
  const [entityCampaigns, setEntityCampaigns] = useState<EntityRow[]>([]);
  const [entityAds,       setEntityAds]       = useState<EntityRow[]>([]);
  const [dowData,         setDowData]         = useState<DayOfWeekRow[]>([]);
  type LinkedinGroupBy = 'campaigns' | 'ads';
  const [linkedinGroupBy, setLinkedinGroupBy] = useState<LinkedinGroupBy>('campaigns');

  // Filter options — date-only dependency
  useEffect(() => {
    getFilterOptions(startDate, endDate).then(setFilterOptions).catch(console.error);
  }, [startDate, endDate]);

  // Below-fold lazy fetch — sentinel-triggered for entity tables.
  const [belowFoldRequested, setBelowFoldRequested] = useState(false);
  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null);

  const fetchAboveFoldCb = useCallback(async (sd: string, ed: string, f: LinkedinFilters) => {
    try {
      const data = await fetchAboveFold(sd, ed, f);
      setSummaryTotals(data.totals);
      setDailyRows(data.daily);
    } catch (e) { console.error(e); }
  }, []);

  // Trends chart is visually above the fold — fetch in parallel with
  // above-fold so it doesn't wait behind entity tables.
  const fetchTrendsCb = useCallback(async (sd: string, ed: string, f: LinkedinFilters) => {
    try {
      const data = await fetchBelowFold(sd, ed, f);
      setTrendsData(data.trends);
    } catch (e) { console.error(e); }
  }, []);

  const fetchBelowFoldCb = useCallback(async (sd: string, ed: string, f: LinkedinFilters) => {
    try {
      const [entities, dow] = await Promise.all([
        fetchEntityTables(sd, ed, f),
        fetchDayOfWeek(sd, ed),
      ]);
      setEntityCampaigns(entities.campaigns);
      setEntityAds(entities.ads);
      setDowData(dow);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchAboveFoldCb(startDate, endDate, filters);
    fetchTrendsCb   (startDate, endDate, filters);
  }, [startDate, endDate, filters, fetchAboveFoldCb, fetchTrendsCb]);
  useEffect(() => {
    if (belowFoldRequested) { fetchBelowFoldCb(startDate, endDate, filters); }
  }, [startDate, endDate, filters, belowFoldRequested, fetchBelowFoldCb]);
  useEffect(() => {
    if (!sentinelEl || belowFoldRequested) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some(e => e.isIntersecting)) { setBelowFoldRequested(true); io.disconnect(); } },
      { rootMargin: '400px' },
    );
    io.observe(sentinelEl);
    return () => io.disconnect();
  }, [sentinelEl, belowFoldRequested]);

  const t = summaryTotals;

  // Sparklines — one series per tile, null→0 fallback.
  const spark = useMemo(() => ({
    spend:            dailyRows.map(d => d.spend             ?? 0),
    impressions:      dailyRows.map(d => d.impressions       ?? 0),
    clicks:           dailyRows.map(d => d.clicks            ?? 0),
    ctr:              dailyRows.map(d => d.ctr               ?? 0),
    cpc:              dailyRows.map(d => d.cpc               ?? 0),
    cpm:              dailyRows.map(d => d.cpm               ?? 0),
    engagements:      dailyRows.map(d => d.engagements       ?? 0),
    videoViews:       dailyRows.map(d => d.video_views       ?? 0),
    videoCompletions: dailyRows.map(d => (d.video_completions ?? 0)),
    completionRate:   dailyRows.map(d => (d.video_views ? ((d.video_completions ?? 0) / d.video_views) * 100 : 0)),
  }), [dailyRows]);

  // Daily Summary totals row — sums over the full range.
  const dailyTotals = useMemo(() => {
    const spend       = dailyRows.reduce((s, r) => s + r.spend,       0);
    const impressions = dailyRows.reduce((s, r) => s + r.impressions, 0);
    const clicks      = dailyRows.reduce((s, r) => s + r.clicks,      0);
    const reach       = dailyRows.reduce((s, r) => s + r.reach,       0);
    const engagements = dailyRows.reduce((s, r) => s + r.engagements, 0);
    const videoViews  = dailyRows.reduce((s, r) => s + r.video_views, 0);
    const leads       = dailyRows.reduce((s, r) => s + r.leads,       0);
    return {
      date:        'Total',
      spend, impressions, clicks, reach,
      ctr:         impressions ? (clicks / impressions) * 100 : null,
      cpc:         clicks      ? spend / clicks               : null,
      cpm:         impressions ? (spend / impressions) * 1000 : null,
      engagements,
      video_views: videoViews,
      leads,
    };
  }, [dailyRows]);

  // Ads table $5 spend threshold — matches the Meta page filter for noise.
  const visibleEntityAds = useMemo(
    () => entityAds.filter(a => a.spend >= ADS_SPEND_THRESHOLD),
    [entityAds],
  );
  const hiddenAdsCount = entityAds.length - visibleEntityAds.length;

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = () => {
    setRefreshing(true);
    setFilters({ campaigns: [], objectives: [] });
    setStartDate(toIso(daysAgo(29)));
    setEndDate(toIso(new Date()));
    setBelowFoldRequested(false);
    window.setTimeout(() => setRefreshing(false), 600);
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  if (summaryTotals === null) {
    return (
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: `${spacing.xl} ${spacing.lg}`, textAlign: 'center', color: colors.text.secondary }}>
        Loading summary…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: `${spacing.md} ${spacing.lg}` }}>

      <h2
        style={{
          textAlign: 'center',
          fontWeight: typography.fontWeight.bold,
          fontSize: typography.fontSize['3xl'],
          color: colors.text.primary,
          marginBottom: spacing.lg,
        }}
      >
        LinkedIn Ads
      </h2>

      {/* ── Filters row ── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: spacing.sm,
          justifyContent: 'center',
          alignItems: 'flex-end',
          marginBottom: spacing.lg,
        }}
      >
        <SearchableMultiSelect
          label="Campaign"
          options={filterOptions.campaigns}
          value={filters.campaigns}
          onChange={vals => setFilters(prev => ({ ...prev, campaigns: vals }))}
        />
        <SearchableMultiSelect
          label="Objective"
          options={filterOptions.objectives}
          value={filters.objectives}
          onChange={vals => setFilters(prev => ({ ...prev, objectives: vals }))}
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
            height: '36.5px',
            backgroundColor: colors.ui.tealAlt,
            color: colors.text.inverse,
            border: 'none',
            borderRadius: 0,
            padding: '0 16px',
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.medium,
            cursor: refreshing ? 'wait' : 'pointer',
            opacity: refreshing ? 0.6 : 1,
            transition: 'background-color 120ms, opacity 120ms',
          }}
        >
          {refreshing ? 'Resetting…' : 'Reset Filters'}
        </button>
      </div>

      {/* ── Scorecards (12 tiles, 6-col grid) ── */}
      <div
        className="scorecard-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 160px)',
          gap: spacing.sm,
          justifyContent: 'center',
          marginBottom: spacing.lg,
        }}
      >
        <BFScorecard title="Spend"          value={fmtMoney(t?.spend         ?? 0)}    sparklineData={spark.spend}       color="blue" size="small" />
        <BFScorecard title="Impressions"    value={fmtInt(t?.impressions     ?? 0)}    sparklineData={spark.impressions} color="blue" size="small" />
        <BFScorecard title="Clicks"         value={fmtInt(t?.clicks          ?? 0)}    sparklineData={spark.clicks}      color="blue" size="small" />
        <BFScorecard title="CTR"            value={fmtCtr(t?.ctr             ?? null)} sparklineData={spark.ctr}         color="blue" size="small" />
        <BFScorecard title="CPC"            value={fmtMoney(t?.cpc           ?? null)} sparklineData={spark.cpc}         color="blue" size="small" />
        <BFScorecard title="CPM"            value={fmtMoney(t?.cpm           ?? null)} sparklineData={spark.cpm}         color="blue" size="small" />
        <BFScorecard title="Video Views"    value={fmtInt(t?.video_views     ?? 0)}    sparklineData={spark.videoViews}  color="blue" size="small" />
        <BFScorecard title="Video Compl."   value={fmtInt(t?.video_completions ?? 0)}  sparklineData={spark.videoCompletions} color="blue" size="small" />
        <BFScorecard title="Compl. Rate"    value={fmtCtr(t?.video_completion_rate ?? null)} sparklineData={spark.completionRate} color="blue" size="small" />
        <BFScorecard title="Cost/View"      value={fmtMoney(t?.cost_per_video_view ?? null)} sparklineData={spark.videoViews}  color="blue" size="small" />
        <BFScorecard title="Cost/Compl."    value={fmtMoney(t?.cost_per_completion ?? null)} sparklineData={spark.videoCompletions} color="blue" size="small" />
        <BFScorecard title="Fullscreen"     value={fmtInt(t?.fullscreen_plays ?? 0)}   sparklineData={spark.videoCompletions} color="blue" size="small" />
      </div>

      {/* B2 sentinel: fires below-fold entity table fetch when user scrolls near this point */}
      <div ref={setSentinelEl} aria-hidden style={{ height: 1 }} />

      {/* ── Full-width sections ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>

        <ChartContainer title="Metric Trends — Spend & Clicks">
          <MetricTrendsChart
            // MetricTrendsChart's internal TrendRow shape carries BFT-era
            // cpl_* fields that don't apply to LinkedIn — cast through
            // unknown, the chart only reads the keys named in `series`.
            data={trendsData as unknown as ChartTrendRow[]}
            leftYUnit="currency"
            rightYUnit="number"
            series={[
              { key: 'spend',  label: 'Spend',  color: colors.chart[1],     yAxisId: 'left'  },
              { key: 'clicks', label: 'Clicks', color: colors.chartDark[0], yAxisId: 'right' },
            ]}
          />
        </ChartContainer>

        <ChartContainer title="Metric Trends — CTR">
          <MetricTrendsChart
            data={trendsData as unknown as ChartTrendRow[]}
            yUnit="percent"
            series={[{ key: 'ctr', label: 'CTR', color: colors.chart[3] }]}
          />
        </ChartContainer>

        {/* Video Watch Funnel — full 6-step drop-off (Starts → 25% → 50% → 75% → Complete → Fullscreen).
            LinkedIn-specific because atWork's LinkedIn spend is almost all video ads.
            % column expresses share of Video Starts (funnel entry) — matches Meta's funnel semantics. */}
        {t && t.video_starts > 0 && (
          <ChartContainer title="Video Watch Funnel">
            <div style={{ padding: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {(() => {
                const starts = t.video_starts;
                const steps: [string, number][] = [
                  ['Video Starts', t.video_starts],
                  ['25% Watched', t.video_q1],
                  ['50% Watched', t.video_mid],
                  ['75% Watched', t.video_q3],
                  ['Completed',   t.video_completions],
                  ['Fullscreen',  t.fullscreen_plays],
                ];
                return steps.map(([label, count]) => {
                  const pct = starts > 0 ? (count / starts) * 100 : 0;
                  return (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                      <div style={{ width: 130, flexShrink: 0, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.text.primary, textAlign: 'right' }}>
                        {label}
                      </div>
                      <div style={{ flex: 1, position: 'relative', height: 28, backgroundColor: colors.background.panel, minWidth: 40 }}>
                        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: colors.ui.teal, transition: 'width 240ms ease-out' }} />
                      </div>
                      <div style={{ width: 140, flexShrink: 0, fontSize: typography.fontSize.sm, color: colors.text.primary, display: 'flex', justifyContent: 'space-between', gap: spacing.xs, fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ fontWeight: typography.fontWeight.semibold }}>{fmtInt(count)}</span>
                        <span style={{ color: colors.text.secondary }}>{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </ChartContainer>
        )}

        <ChartContainer title="Daily Summary">
          <DailySummaryTable
            data={dailyRows as unknown as Record<string, unknown>[]}
            columns={DAILY_COLUMNS}
            sortable
            initialSort={{ key: 'date', direction: 'desc' }}
            totalsRow={dailyTotals as unknown as Record<string, unknown>}
            paginate={10}
          />
        </ChartContainer>

        {/* Top Performers — client-side pick from entityAds (ads-grain), with
            small-volume noise-floors so the "best" ad isn't a 1-view outlier. */}
        {entityAds.length > 0 && (() => {
          const withVideo = entityAds.filter(a => a.video_views >= 500);
          const withImpr  = entityAds.filter(a => a.impressions >= 500);
          const withCompl = entityAds.filter(a => (a.video_completions ?? 0) >= 100);
          const bestCtr    = withImpr.slice().sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0))[0];
          const bestRate   = withVideo.slice().sort((a, b) => (b.completion_rate ?? 0) - (a.completion_rate ?? 0))[0];
          const bestCPCompl = withCompl.slice().sort((a, b) => (a.cost_per_completion ?? Infinity) - (b.cost_per_completion ?? Infinity))[0];
          const highlights: { label: string; value: string; ad: EntityRow | undefined }[] = [
            { label: 'Best CTR (500+ impr)',              value: bestCtr    ? `${(bestCtr.ctr ?? 0).toFixed(2)}%`                                              : '—', ad: bestCtr },
            { label: 'Highest Completion Rate (500+ vv)', value: bestRate   ? `${(bestRate.completion_rate ?? 0).toFixed(1)}%`                                 : '—', ad: bestRate },
            { label: 'Best Cost/Completion (100+ compl)', value: bestCPCompl ? `$${(bestCPCompl.cost_per_completion ?? 0).toFixed(3)}`                          : '—', ad: bestCPCompl },
          ];
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.md }}>
              {highlights.map(h => (
                <div key={h.label} style={{ flex: '1 1 260px', minWidth: 0, border: `1px solid ${colors.border.default}`, borderRadius: 0, padding: spacing.md, backgroundColor: colors.background.card }}>
                  <div style={{ fontSize: typography.fontSize.xs, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    {h.label}
                  </div>
                  <div style={{ fontSize: '1.75rem', fontWeight: typography.fontWeight.bold, color: colors.text.primary, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>
                    {h.value}
                  </div>
                  {h.ad && (
                    <div style={{ fontSize: typography.fontSize.xs, color: colors.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }} title={h.ad.name}>
                      {h.ad.name}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })()}

        {/* Day-of-week performance — LinkedIn is B2B, expect a mid-week peak.
            Bars sized to spend; CTR labelled on the right. */}
        {dowData.some(d => d.spend > 0) && (
          <ChartContainer title="Performance by Day of Week">
            <div style={{ padding: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {(() => {
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
                      <div style={{ width: 200, flexShrink: 0, fontSize: typography.fontSize.sm, color: colors.text.primary, display: 'flex', justifyContent: 'space-between', gap: spacing.xs, fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ fontWeight: typography.fontWeight.semibold }}>{`$${Math.round(d.spend).toLocaleString()}`}</span>
                        <span style={{ color: colors.text.secondary }}>{Number(d.impressions).toLocaleString()} impr</span>
                        <span style={{ color: colors.text.secondary }}>{d.ctr == null ? '—' : `${d.ctr.toFixed(2)}%`}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </ChartContainer>
        )}

        {/* Consolidated grouped table — LinkedIn grain is Campaigns + Ads
            (creatives) only. No Ad Set level in the source. */}
        <ChartContainer title="Performance">
          <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap', marginBottom: spacing.md, paddingLeft: spacing.md }}>
            <span style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.text.secondary }}>Group by:</span>
            {([
              { key: 'campaigns', label: 'Campaigns' },
              { key: 'ads',       label: 'Ads'       },
            ] as { key: LinkedinGroupBy; label: string }[]).map(opt => {
              const active = linkedinGroupBy === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setLinkedinGroupBy(opt.key)}
                  style={{
                    padding: '6px 12px',
                    fontSize: typography.fontSize.sm,
                    fontWeight: typography.fontWeight.semibold,
                    fontFamily: typography.fontFamily.sans,
                    cursor: 'pointer',
                    border: `1px solid ${active ? colors.brand.primary : colors.border.default}`,
                    backgroundColor: active ? colors.brand.primary : '#fff',
                    color: active ? colors.brand.primaryText : colors.text.primary,
                    borderRadius: 0,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {(() => {
            switch (linkedinGroupBy) {
              case 'ads':
                return (
                  <>
                    <DailySummaryTable
                      data={visibleEntityAds as unknown as Record<string, unknown>[]}
                      columns={entityColumns('Creative', { withParentCampaign: true, withPreview: true, withAdCopy: true })}
                      sortable
                      initialSort={{ key: 'spend', direction: 'desc' }}
                      paginate={20}
                    />
                    {hiddenAdsCount > 0 && (
                      <div style={{
                        marginTop: spacing.sm,
                        textAlign: 'right',
                        fontSize: typography.fontSize.xs,
                        color: colors.text.secondary,
                      }}>
                        {hiddenAdsCount} creative{hiddenAdsCount === 1 ? '' : 's'} hidden — spend below ${ADS_SPEND_THRESHOLD} over the selected range.
                      </div>
                    )}
                  </>
                );
              case 'campaigns':
              default:
                return (
                  <DailySummaryTable
                    data={entityCampaigns as unknown as Record<string, unknown>[]}
                    columns={entityColumns('Campaign', { withObjective: true, withStatusFormat: true })}
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
