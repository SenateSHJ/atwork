'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { FallbackBanner, readBannerDismissed, persistBannerDismissed } from '@/components/FallbackBanner';
import { colors, typography, spacing } from '@/tokens';
import { BFScorecard } from '@/components/BFScorecard';
import { ChartContainer } from '@/components/ChartContainer';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { SearchableMultiSelect } from '@/components/hq/SearchableMultiSelect';
import { MetricTrendsChart } from '@/components/hq/MetricTrendsChart';
import { DailySummaryTable, type DSTColumn } from '@/components/hq/DailySummaryTable';
import {
  fetchAboveFold, fetchBelowFold, fetchEntityTables, getFilterOptions,
  fetchEngagement, fetchVideoWatch, fetchTargeting,
  type MetaFilters, type MetaFilterOptions,
  type Totals, type DailyRow, type AgencyRow, type TrendRow,
  type EntityRow, type EngagementRow, type VideoWatchResult, type TargetingRow,
} from './actions';
import { META_CONVERSION_DEFINITION } from './constants';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
// Table date column format — "21-Jul-2026" for real ISO dates, pass-through
// for anything else (totals row uses "Total" as the value).
const fmtDate  = (v: unknown) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? format(parseISO(v), 'd-MMM-yyyy')
    : String(v ?? '');

// Column config for the entity tables — entity name + optional Objective /
// Creative Type + shared metric block (Spend/Impressions/Clicks/Reach, CTR/CPC/CPM,
// Conversions, Cost per Conversion).
function entityColumns(nameLabel: string, opts?: { withMediaType?: boolean; withObjective?: boolean }): DSTColumn[] {
  const cols: DSTColumn[] = [
    { key: 'name', label: nameLabel, align: 'left' },
  ];
  if (opts?.withObjective) {
    cols.push({ key: 'objective', label: 'Objective', align: 'left', render: r => String(r.objective ?? '—') });
  }
  if (opts?.withMediaType) {
    cols.push({ key: 'media_type', label: 'Creative Type', align: 'left', render: r => String(r.media_type ?? '—') });
  }
  cols.push(
    { key: 'spend',               label: 'Spend',               numeric: true, render: r => `$${Math.round(Number(r.spend       || 0)).toLocaleString()}` },
    { key: 'impressions',         label: 'Impressions',         numeric: true, render: r => Number(r.impressions || 0).toLocaleString() },
    { key: 'clicks',              label: 'Clicks',              numeric: true, render: r => Number(r.clicks      || 0).toLocaleString() },
    { key: 'reach',               label: 'Reach',               numeric: true, render: r => Number(r.reach       || 0).toLocaleString() },
    { key: 'ctr',                 label: 'CTR',                 numeric: true, render: r => r.ctr == null ? '—' : `${Number(r.ctr).toFixed(2)}%` },
    { key: 'cpc',                 label: 'CPC',                 numeric: true, render: r => r.cpc == null ? '—' : `$${Number(r.cpc).toFixed(2)}` },
    { key: 'cpm',                 label: 'CPM',                 numeric: true, render: r => r.cpm == null ? '—' : `$${Number(r.cpm).toFixed(2)}` },
    { key: 'conversions',         label: 'Conversions',         numeric: true, render: r => Number(r.conversions || 0).toLocaleString() },
    { key: 'cost_per_conversion', label: 'CPA',        numeric: true, render: r => r.cost_per_conversion == null ? '—' : `$${Number(r.cost_per_conversion).toFixed(2)}` },
    { key: 'video_views',         label: 'Video Views',         numeric: true, render: r => Number(r.video_views || 0).toLocaleString() },
  );
  return cols;
}

// Column configs for the three new sections.
const ENGAGEMENT_COLUMNS: DSTColumn[] = [
  { key: 'ad_name',           label: 'Ad',                align: 'left', render: r => String(r.ad_name ?? '(unnamed)') },
  { key: 'post_engagement',   label: 'Post Engagement',   numeric: true, render: r => Number(r.post_engagement   || 0).toLocaleString() },
  { key: 'post_reaction',     label: 'Post Reactions',    numeric: true, render: r => Number(r.post_reaction     || 0).toLocaleString() },
  { key: 'comment_count',     label: 'Comments',          numeric: true, render: r => Number(r.comment_count     || 0).toLocaleString() },
  { key: 'video_view',        label: 'Video Views',       numeric: true, render: r => Number(r.video_view        || 0).toLocaleString() },
  { key: 'landing_page_view', label: 'Landing Page Views',numeric: true, render: r => Number(r.landing_page_view || 0).toLocaleString() },
];

// Video Watch Funnel — one row per milestone across the selected window,
// count + % of 25% Watched (funnel entry point). Video Views is displayed
// standalone above the table because it uses a different Meta definition.
const VIDEO_WATCH_COLUMNS: DSTColumn[] = [
  { key: 'milestone', label: 'Milestone',   align: 'left' },
  { key: 'count',     label: 'Count',       numeric: true, render: r => Number(r.count || 0).toLocaleString() },
  { key: 'rate',      label: '% of 25%',    numeric: true, render: r => r.rate == null ? '—' : `${Number(r.rate).toFixed(1)}%` },
];

const TARGETING_COLUMNS: DSTColumn[] = [
  { key: 'adset_name',          label: 'Ad Set',              align: 'left' },
  { key: 'campaign_name',       label: 'Campaign',            align: 'left', render: r => String(r.campaign_name ?? '—') },
  { key: 'age_range',           label: 'Age',                 align: 'left' },
  { key: 'spend',               label: 'Spend',               numeric: true, render: r => `$${Math.round(Number(r.spend       || 0)).toLocaleString()}` },
  { key: 'impressions',         label: 'Impressions',         numeric: true, render: r => Number(r.impressions || 0).toLocaleString() },
  { key: 'clicks',              label: 'Clicks',              numeric: true, render: r => Number(r.clicks      || 0).toLocaleString() },
  { key: 'ctr',                 label: 'CTR',                 numeric: true, render: r => r.ctr == null ? '—' : `${Number(r.ctr).toFixed(2)}%` },
];

// Column config for the Daily Summary table on Meta — mirrors the 10 scorecard
// metrics + Date. Totals row uses the same render functions.
const DAILY_COLUMNS: DSTColumn[] = [
  { key: 'date',                label: 'Date',        align: 'left', render: r => fmtDate(r.date) },
  { key: 'spend_aud',           label: 'Spend',       numeric: true, render: r => `$${Math.round(Number(r.spend_aud   || 0)).toLocaleString()}` },
  { key: 'impressions',         label: 'Impressions', numeric: true, render: r => Number(r.impressions || 0).toLocaleString() },
  { key: 'clicks',              label: 'Clicks',      numeric: true, render: r => Number(r.clicks      || 0).toLocaleString() },
  { key: 'reach',               label: 'Reach',       numeric: true, render: r => Number(r.reach       || 0).toLocaleString() },
  { key: 'ctr',                 label: 'CTR',         numeric: true, render: r => r.ctr == null ? '—' : `${Number(r.ctr).toFixed(2)}%` },
  { key: 'cpc',                 label: 'CPC',         numeric: true, render: r => r.cpc == null ? '—' : `$${Number(r.cpc).toFixed(2)}` },
  { key: 'cpm',                 label: 'CPM',         numeric: true, render: r => r.cpm == null ? '—' : `$${Number(r.cpm).toFixed(2)}` },
  { key: 'conversions',         label: 'Conversions', numeric: true, render: r => Number(r.conversions || 0).toLocaleString() },
  { key: 'cost_per_conversion', label: 'CPA',numeric: true, render: r => r.cost_per_conversion == null ? '—' : `$${Number(r.cost_per_conversion).toFixed(2)}` },
  { key: 'video_views',         label: 'Video Views', numeric: true, render: r => Number(r.video_views || 0).toLocaleString() },
];

const ADS_SPEND_THRESHOLD = 5;
// Engagement threshold — hide ads with negligible engagement (post_engagement <
// 5) so the table surfaces creatives that actually earned interaction. Matches
// the pattern used on the Ads table, with a "N hidden" note beneath.
const ENGAGEMENT_THRESHOLD = 5;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MetaPage() {
  const [startDate, setStartDate] = useState(() => toIso(daysAgo(29)));
  const [endDate,   setEndDate]   = useState(() => toIso(new Date()));

  const [filters, setFilters] = useState<MetaFilters>({ campaigns: [], adsets: [], ads: [], creativeTypes: [], objectives: [] });
  const [filterOptions, setFilterOptions] = useState<MetaFilterOptions>({ campaigns: [], adsets: [], ads: [], creativeTypes: [], objectives: [] });

  const [summaryTotals,    setSummaryTotals]    = useState<Totals | null>(null);
  const [dailyRows,        setDailyRows]        = useState<DailyRow[]>([]);
  const [, setAgencyPerf]                       = useState<AgencyRow[]>([]);
  const [trendsData,       setTrendsData]       = useState<TrendRow[]>([]);
  const [entityCampaigns,  setEntityCampaigns]  = useState<EntityRow[]>([]);
  const [entityAdsets,     setEntityAdsets]     = useState<EntityRow[]>([]);
  const [entityAds,        setEntityAds]        = useState<EntityRow[]>([]);
  type MetaGroupBy = 'campaigns' | 'adsets' | 'ads';
  const [metaGroupBy, setMetaGroupBy] = useState<MetaGroupBy>('campaigns');
  const [engagement,       setEngagement]       = useState<EngagementRow[]>([]);
  const [videoWatch,       setVideoWatch]       = useState<VideoWatchResult>({ videoViews: 0, funnel: [] });
  const [targeting,        setTargeting]        = useState<TargetingRow[]>([]);
  const [fallbackActive,   setFallbackActive]   = useState(false);
  const [bannerDismissed,  setBannerDismissed]  = useState(readBannerDismissed);

  // Filter options — filter-independent, refetch on date change only
  useEffect(() => {
    getFilterOptions(startDate, endDate).then(setFilterOptions).catch(console.error);
  }, [startDate, endDate]);

  // Below-fold lazy fetch (Snainton port 838ade8).
  const [belowFoldRequested, setBelowFoldRequested] = useState(false);
  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null);

  const fetchAboveFoldCb = useCallback(async (sd: string, ed: string, f: MetaFilters) => {
    try {
      const data = await fetchAboveFold(sd, ed, f);
      setSummaryTotals(data.totals);
      setDailyRows(data.daily);
      setFallbackActive(data.fallback);
      setAgencyPerf(data.agencies);
    } catch (e) { console.error(e); }
  }, []);

  const fetchBelowFoldCb = useCallback(async (sd: string, ed: string, f: MetaFilters) => {
    try {
      const [data, entities, engRows, videoRows, targetRows] = await Promise.all([
        fetchBelowFold(sd, ed, f),
        fetchEntityTables(sd, ed, f),
        fetchEngagement(sd, ed, f),
        fetchVideoWatch(sd, ed),
        fetchTargeting(sd, ed, f),
      ]);
      setTrendsData(data.trends);
      setEntityCampaigns(entities.campaigns);
      setEntityAdsets(entities.adsets);
      setEntityAds(entities.ads);
      setEngagement(engRows);
      setVideoWatch(videoRows);
      setTargeting(targetRows);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchAboveFoldCb(startDate, endDate, filters);
  }, [startDate, endDate, filters, fetchAboveFoldCb]);
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

  // Sparklines — widened; every tile gets a series. Null → 0 fallback per spec.
  const spark = useMemo(() => ({
    spend:       dailyRows.map(d => d.spend_aud            ?? 0),
    impressions: dailyRows.map(d => d.impressions          ?? 0),
    clicks:      dailyRows.map(d => d.clicks               ?? 0),
    reach:       dailyRows.map(d => d.reach                ?? 0),
    ctr:         dailyRows.map(d => d.ctr                  ?? 0),
    cpc:         dailyRows.map(d => d.cpc                  ?? 0),
    cpm:         dailyRows.map(d => d.cpm                  ?? 0),
    leads:       dailyRows.map(d => d.leads                ?? 0),
    conversions: dailyRows.map(d => d.conversions          ?? 0),
    cpa:         dailyRows.map(d => d.cost_per_conversion  ?? 0),
    videoViews:  dailyRows.map(d => d.video_views          ?? 0),
  }), [dailyRows]);

  // Daily Summary totals row — sums over the full range, matching the totals
  // convention (visible rows are paginated to 10 via Show More; totals are
  // computed across every row in `dailyRows`).
  const dailyTotals = useMemo(() => {
    const spend       = dailyRows.reduce((s, r) => s + r.spend_aud,             0);
    const impressions = dailyRows.reduce((s, r) => s + r.impressions,           0);
    const clicks      = dailyRows.reduce((s, r) => s + r.clicks,                0);
    const reach       = dailyRows.reduce((s, r) => s + r.reach,                 0);
    const conversions = dailyRows.reduce((s, r) => s + (r.conversions ?? 0),    0);
    const videoViews  = dailyRows.reduce((s, r) => s + (r.video_views ?? 0),    0);
    return {
      date:                'Total',
      spend_aud:           spend,
      impressions,
      clicks,
      reach,
      ctr:                 impressions ? (clicks / impressions) * 100 : null,
      cpc:                 clicks      ? spend / clicks               : null,
      cpm:                 impressions ? (spend / impressions) * 1000 : null,
      conversions,
      cost_per_conversion: conversions ? spend / conversions          : null,
      video_views:         videoViews,
    };
  }, [dailyRows]);

  // Ads table $5 spend threshold — drops noisy near-zero-spend ads and
  // surfaces the count so it's visible below the table.
  const visibleEntityAds = useMemo(
    () => entityAds.filter(a => a.spend >= ADS_SPEND_THRESHOLD),
    [entityAds],
  );
  const hiddenAdsCount = entityAds.length - visibleEntityAds.length;

  // Engagement table threshold — mirror the ads-table pattern.
  const visibleEngagement = useMemo(
    () => engagement.filter(e => e.post_engagement >= ENGAGEMENT_THRESHOLD),
    [engagement],
  );
  const hiddenEngagementCount = engagement.length - visibleEngagement.length;

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = () => {
    setRefreshing(true);
    setFilters({ campaigns: [], adsets: [], ads: [], creativeTypes: [], objectives: [] });
    setStartDate(toIso(daysAgo(29)));
    setEndDate(toIso(new Date()));
    setBelowFoldRequested(false); // re-arm the below-fold IntersectionObserver
    window.setTimeout(() => setRefreshing(false), 600);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

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
        Meta Ads
      </h2>

      <FallbackBanner
        active={fallbackActive}
        dismissed={bannerDismissed}
        onDismiss={() => persistBannerDismissed(setBannerDismissed)}
      />

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
          label="Ad Set"
          options={filterOptions.adsets}
          value={filters.adsets}
          onChange={vals => setFilters(prev => ({ ...prev, adsets: vals }))}
        />
        <SearchableMultiSelect
          label="Ad Name"
          options={filterOptions.ads}
          value={filters.ads}
          onChange={vals => setFilters(prev => ({ ...prev, ads: vals }))}
        />
        <SearchableMultiSelect
          label="Creative Type"
          options={filterOptions.creativeTypes}
          value={filters.creativeTypes}
          onChange={vals => setFilters(prev => ({ ...prev, creativeTypes: vals }))}
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

      {/* ── Blue scorecards (atWork roster: summed range totals + ratios) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 160px)',
          gap: spacing.sm,
          justifyContent: 'center',
          marginBottom: spacing.xs,
        }}
      >
        <BFScorecard title="Spend"              value={fmtMoney(t?.spend_aud          ?? 0)}    sparklineData={spark.spend}       color="blue" size="small" />
        <BFScorecard title="Impressions"        value={fmtInt(t?.impressions          ?? 0)}    sparklineData={spark.impressions} color="blue" size="small" />
        <BFScorecard title="Clicks"             value={fmtInt(t?.clicks               ?? 0)}    sparklineData={spark.clicks}      color="blue" size="small" />
        <BFScorecard title="Reach"              value={fmtInt(t?.reach                ?? 0)}    sparklineData={spark.reach}       color="blue" size="small" />
        <BFScorecard title="CTR"                value={fmtCtr(t?.ctr                  ?? null)} sparklineData={spark.ctr}         color="blue" size="small" />
        <BFScorecard title="CPC"                value={fmtMoney(t?.cpc                ?? null)} sparklineData={spark.cpc}         color="blue" size="small" />
        <BFScorecard title="CPM"                value={fmtMoney(t?.cpm                ?? null)} sparklineData={spark.cpm}         color="blue" size="small" />
        <BFScorecard title="Conversions"        value={fmtInt(t?.conversions          ?? 0)}    sparklineData={spark.conversions} color="blue" size="small" />
        <BFScorecard title="Cost per Conversion"value={fmtMoney(t?.cost_per_conversion?? null)} sparklineData={spark.cpa}         color="blue" size="small" />
        <BFScorecard title="Video Views"        value={fmtInt(t?.video_views          ?? 0)}    sparklineData={spark.videoViews}  color="blue" size="small" />
      </div>
      <div
        style={{
          textAlign: 'center',
          fontSize: typography.fontSize.xs,
          color: colors.text.secondary,
          marginBottom: spacing.lg,
        }}
      >
        Conversions = {META_CONVERSION_DEFINITION}
      </div>

      {/* B2 sentinel: fires below-fold fetch when user scrolls near this point */}
      <div ref={setSentinelEl} aria-hidden style={{ height: 1 }} />
      {/* ── Full-width bottom sections ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>

        {/* Primary chart: Spend + Clicks on a dual axis. Spend (currency,
            left) and Clicks (count, right) live on different scales, so each
            gets its own y-axis. CPC and CPM removed as trend charts — both
            appear as scorecards and per-day in Daily Summary. */}
        <ChartContainer title="Metric Trends — Spend & Clicks">
          <MetricTrendsChart
            data={trendsData}
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
            data={trendsData}
            yUnit="percent"
            series={[{ key: 'ctr', label: 'CTR', color: colors.chart[3] }]}
          />
        </ChartContainer>

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

        {/* One consolidated grouped table — replaces the previous 3 standalone
            tables (Campaigns, Ad Sets, Ads). Group By dropdown swaps the data
            + entity column config. Defaults to Campaigns. Mirrors the Snainton
            SalesPage.tsx pattern. */}
        <ChartContainer title="Performance">
          <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap', marginBottom: spacing.md, paddingLeft: spacing.md }}>
            <span style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.text.secondary }}>Group by:</span>
            {([
              { key: 'campaigns', label: 'Campaigns' },
              { key: 'adsets',    label: 'Ad Sets'   },
              { key: 'ads',       label: 'Ads'       },
            ] as { key: MetaGroupBy; label: string }[]).map(opt => {
              const active = metaGroupBy === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setMetaGroupBy(opt.key)}
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
            switch (metaGroupBy) {
              case 'adsets':
                return (
                  <DailySummaryTable
                    data={entityAdsets as unknown as DailyRow[]}
                    columns={entityColumns('Ad Set')}
                    sortable
                    initialSort={{ key: 'spend', direction: 'desc' }}
                    autoHeight
                  />
                );
              case 'ads':
                return (
                  <>
                    <DailySummaryTable
                      data={visibleEntityAds as unknown as DailyRow[]}
                      columns={entityColumns('Ad Name', { withMediaType: true })}
                      sortable
                      initialSort={{ key: 'spend', direction: 'desc' }}
                      autoHeight
                    />
                    {hiddenAdsCount > 0 && (
                      <div style={{
                        marginTop: spacing.sm,
                        textAlign: 'right',
                        fontSize: typography.fontSize.xs,
                        color: colors.text.secondary,
                      }}>
                        {hiddenAdsCount} ad{hiddenAdsCount === 1 ? '' : 's'} hidden — spend below ${ADS_SPEND_THRESHOLD} over the selected range.
                      </div>
                    )}
                  </>
                );
              case 'campaigns':
              default:
                return (
                  <DailySummaryTable
                    data={entityCampaigns as unknown as DailyRow[]}
                    columns={entityColumns('Campaign', { withObjective: true })}
                    sortable
                    initialSort={{ key: 'spend', direction: 'desc' }}
                    autoHeight
                  />
                );
            }
          })()}
        </ChartContainer>

        <ChartContainer title="Engagement (per ad)">
          <DailySummaryTable
            data={visibleEngagement as unknown as DailyRow[]}
            columns={ENGAGEMENT_COLUMNS}
            sortable
            initialSort={{ key: 'post_engagement', direction: 'desc' }}
            autoHeight
          />
          {hiddenEngagementCount > 0 && (
            <div style={{
              marginTop: spacing.sm,
              textAlign: 'right',
              fontSize: typography.fontSize.xs,
              color: colors.text.secondary,
            }}>
              {hiddenEngagementCount} ad{hiddenEngagementCount === 1 ? '' : 's'} hidden — post engagement below {ENGAGEMENT_THRESHOLD} over the selected range.
            </div>
          )}
        </ChartContainer>

        <ChartContainer title="Video Watch Funnel (account level)">
          <div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              padding: `${spacing.sm} ${spacing.md}`,
              backgroundColor: colors.background.panel,
              borderBottom: `1px solid ${colors.border.default}`,
              marginBottom: spacing.sm,
            }}>
              <div>
                <span style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary }}>Video Views</span>{' '}
                <span style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.text.primary, marginLeft: spacing.sm }}>
                  {fmtInt(videoWatch.videoViews)}
                </span>
              </div>
              <div style={{ fontSize: typography.fontSize.xs, color: colors.text.secondary, maxWidth: 640, textAlign: 'right' }}>
                Video Views uses Meta&apos;s 3-sec definition; 25% Watched uses 25%-of-duration. They&apos;re counted differently, so the funnel below is a % of 25% Watched, not of Video Views.
              </div>
            </div>
            <DailySummaryTable
              data={videoWatch.funnel as unknown as DailyRow[]}
              columns={VIDEO_WATCH_COLUMNS}
            />
          </div>
        </ChartContainer>

        <ChartContainer title="Targeting (per ad set)">
          <DailySummaryTable
            data={targeting as unknown as DailyRow[]}
            columns={TARGETING_COLUMNS}
            sortable
            initialSort={{ key: 'spend', direction: 'desc' }}
            autoHeight
          />
        </ChartContainer>

      </div>
    </div>
  );
}
