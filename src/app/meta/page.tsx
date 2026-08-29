'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { format, parseISO } from 'date-fns';
import { FallbackBanner, readBannerDismissed, persistBannerDismissed } from '@/components/FallbackBanner';
import { colors, typography, spacing } from '@/tokens';
import { BFScorecard } from '@/components/BFScorecard';
import { ChartContainer } from '@/components/ChartContainer';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { SearchableMultiSelect } from '@/components/hq/SearchableMultiSelect';
import { DailySummaryTable, type DSTColumn } from '@/components/hq/DailySummaryTable';

// Recharts is ~90KB gzipped — lazy-load so the initial page bundle stays
// small and above-fold scorecards paint before the chart lib finishes
// downloading. Loading placeholder holds the row height so layout doesn't
// jump when the chart mounts.
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
  fetchAboveFold, fetchBelowFold, fetchEntityTables, getFilterOptions,
  fetchEngagement, fetchVideoWatch, fetchTargeting, fetchDevices, fetchDayOfWeek,
  type MetaFilters, type MetaFilterOptions,
  type Totals, type DailyRow, type AgencyRow, type TrendRow,
  type EntityRow, type EngagementRow, type VideoWatchResult, type TargetingRow,
  type DevicesResult, type DayOfWeekRow,
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
function entityColumns(nameLabel: string, opts?: { withMediaType?: boolean; withObjective?: boolean; withPreview?: boolean; withAdCopy?: boolean }): DSTColumn[] {
  const cols: DSTColumn[] = [
    { key: 'name', label: nameLabel, align: 'left' },
  ];
  if (opts?.withPreview) {
    cols.push({
      key: 'thumbnail_url',
      label: 'Preview',
      align: 'left',
      render: r => {
        // Preview quality fallback chain:
        //   1. Instagram embed — real ad video/carousel with actual quality,
        //      playable inline. Works because atWork's ads cross-post to IG
        //      and IG posts are publicly embeddable (unlike FB dark posts).
        //   2. image_url — high-res static image (image ads only)
        //   3. video_thumbnail_array[0] — Meta's 160×160 video poster
        //   4. thumbnail_url — last resort, 64px signed URL
        const igMediaId = r.effective_instagram_media_id as string | null | undefined;
        if (igMediaId) {
          // Public IG-media-id → shortcode conversion (base64-alphabet chunking).
          const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
          let n = BigInt(igMediaId), sc = '';
          while (n > 0n) { sc = ALPH[Number(n & 63n)] + sc; n >>= 6n; }
          if (sc) {
            return (
              <iframe
                src={`https://www.instagram.com/p/${sc}/embed/?cr=1`}
                loading="lazy"
                style={{ width: 280, height: 380, border: '1px solid #e5e7eb', display: 'block' }}
                title="Instagram post preview"
                allow="autoplay; encrypted-media; picture-in-picture"
                scrolling="no"
              />
            );
          }
        }
        let src: string | null = (r.image_url as string | null | undefined) ?? null;
        const objType = String(r.object_type ?? '').toUpperCase();
        const isVideo = objType === 'VIDEO' || Boolean(r.video_thumbnail_array);
        if (!src) {
          const arr = r.video_thumbnail_array as string | null | undefined;
          if (arr) {
            try {
              const parsed = JSON.parse(arr) as unknown;
              if (Array.isArray(parsed) && parsed.length && typeof parsed[0] === 'string') {
                src = parsed[0];
              }
            } catch { /* fall through */ }
          }
        }
        if (!src) src = (r.thumbnail_url as string | null | undefined) ?? null;
        if (!src) return '—';
        return (
          <div style={{ position: 'relative', width: 200, height: 200, backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt="Ad creative"
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'scale-down', display: 'block' }}
            />
            {isVideo && (
              <div style={{
                position: 'absolute', bottom: 6, left: 6,
                padding: '2px 6px',
                fontSize: typography.fontSize.xs,
                fontWeight: typography.fontWeight.semibold,
                color: '#fff',
                backgroundColor: 'rgba(0,0,0,0.65)',
                letterSpacing: '0.05em',
                pointerEvents: 'none',
              }}>▶ VIDEO</div>
            )}
          </div>
        );
      },
    });
  }
  if (opts?.withAdCopy) {
    cols.push({
      key: 'creative_body',
      label: 'Ad Copy',
      align: 'left',
      render: r => {
        const title = (r.creative_title as string | null | undefined) ?? '';
        const body  = (r.creative_body  as string | null | undefined) ?? '';
        const cta   = (r.call_to_action_type as string | null | undefined) ?? '';
        if (!title && !body && !cta) return '—';
        const bodyShort = body.length > 160 ? body.slice(0, 160).trim() + '…' : body;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {title && <div style={{ fontWeight: typography.fontWeight.semibold, color: colors.text.primary }}>{title}</div>}
            {bodyShort && <div style={{ color: colors.text.secondary, fontSize: typography.fontSize.xs, lineHeight: 1.4 }}>{bodyShort}</div>}
            {cta && (
              <span style={{ display: 'inline-block', padding: '2px 8px', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, backgroundColor: colors.brand.primaryFaint, color: colors.brand.primaryDark, width: 'fit-content' }}>
                {cta.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        );
      },
    });
  }
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
const _VIDEO_WATCH_COLUMNS: DSTColumn[] = [
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
  const [devicesData,      setDevicesData]      = useState<DevicesResult>({ devices: [], placements: [] });
  const [dowData,          setDowData]          = useState<DayOfWeekRow[]>([]);
  const [fallbackActive,   setFallbackActive]   = useState(false);
  const [bannerDismissed,  setBannerDismissed]  = useState(readBannerDismissed);

  // Filter options — filter-independent, refetch on date change only
  useEffect(() => {
    getFilterOptions(startDate, endDate).then(setFilterOptions).catch(console.error);
  }, [startDate, endDate]);

  // Below-fold lazy fetch — sentinel-triggered for the heavy tables.
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

  // Trends charts live visually above the fold, so their data has to load with
  // the above-fold pass — bundling them in the below-fold Promise.all made them
  // wait for the slowest of six queries (~2s). Fire this in parallel with the
  // above-fold fetch and setState the moment trends resolve.
  const fetchTrendsCb = useCallback(async (sd: string, ed: string, f: MetaFilters) => {
    try {
      const data = await fetchBelowFold(sd, ed, f);
      setTrendsData(data.trends);
    } catch (e) { console.error(e); }
  }, []);

  // Heavy tables that stay behind the scroll sentinel. Split into two Promise.all
  // groups: the four medium fetches together, then targeting separately so if it
  // hangs it can't hold up engagement/video/devices.
  const fetchBelowFoldCb = useCallback(async (sd: string, ed: string, f: MetaFilters) => {
    try {
      const [entities, engRows, videoRows, devRows, dowRows] = await Promise.all([
        fetchEntityTables(sd, ed, f),
        fetchEngagement(sd, ed, f),
        fetchVideoWatch(sd, ed),
        fetchDevices(sd, ed),
        fetchDayOfWeek(sd, ed),
      ]);
      setEntityCampaigns(entities.campaigns);
      setEntityAdsets(entities.adsets);
      setEntityAds(entities.ads);
      setEngagement(engRows);
      setVideoWatch(videoRows);
      setDevicesData(devRows);
      setDowData(dowRows);
      // Targeting last — heaviest single query, independent state update.
      fetchTargeting(sd, ed, f).then(setTargeting).catch(console.error);
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
        className="scorecard-grid"
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

      {/* Top Performers — client-side pick from entityAds with noise floors so
          a 1-impression ad can't take the top spot. Teal borders match the
          scorecard visual language. */}
      {entityAds.length > 0 && (() => {
        const withImpr = entityAds.filter(a => a.impressions >= 500);
        const withConv = entityAds.filter(a => (a.conversions ?? 0) >= 3);
        const withReach = entityAds.filter(a => a.reach >= 500);
        const bestCtr = withImpr.slice().sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0))[0];
        const bestCpa = withConv.slice().sort((a, b) => (a.cost_per_conversion ?? Infinity) - (b.cost_per_conversion ?? Infinity))[0];
        const bestCpc = withReach.slice().sort((a, b) => (a.cpc ?? Infinity) - (b.cpc ?? Infinity))[0];
        const highlights: { label: string; value: string; ad: EntityRow | undefined }[] = [
          { label: 'Best CTR (500+ impr)',    value: bestCtr ? `${(bestCtr.ctr ?? 0).toFixed(2)}%`                : '—', ad: bestCtr },
          { label: 'Best CPA (3+ conv)',      value: bestCpa ? `$${(bestCpa.cost_per_conversion ?? 0).toFixed(2)}` : '—', ad: bestCpa },
          { label: 'Cheapest CPC (500+ reach)', value: bestCpc ? `$${(bestCpc.cpc ?? 0).toFixed(2)}`               : '—', ad: bestCpc },
        ];
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg }}>
            {highlights.map(h => (
              <div key={h.label} style={{ flex: '1 1 260px', minWidth: 0, border: `2px solid ${colors.ui.teal}`, borderRadius: 0, padding: spacing.md, backgroundColor: colors.background.card }}>
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

        {/* Three 1/3-width horizontal bar charts: Video Watch Funnel, Devices,
            Placements. All account-level. Label widths trimmed to fit 1/3
            columns. Wraps to stacked when a column can't hold 260px. */}
        {(() => {
          const funnelMax = videoWatch.funnel.reduce((m, r) => Math.max(m, r.count), 0);
          const deviceMax = devicesData.devices.reduce((m, r) => Math.max(m, r.impressions), 0);
          const placeMax  = devicesData.placements.reduce((m, r) => Math.max(m, r.impressions), 0);
          const panels: {
            title: string;
            emptyLabel: string;
            rows: { key: string; label: string; barPct: number; primary: string; secondary: string }[];
          }[] = [
            {
              title: 'Video Watch Funnel',
              emptyLabel: 'No video watch data in the selected window.',
              rows: videoWatch.funnel.map(r => ({
                key: r.milestone,
                label: r.milestone,
                barPct: funnelMax > 0 ? (r.count / funnelMax) * 100 : 0,
                primary: fmtInt(r.count),
                secondary: r.rate == null ? '—' : `${Number(r.rate).toFixed(1)}%`,
              })),
            },
            {
              title: 'Devices',
              emptyLabel: 'No device data in the selected window.',
              rows: devicesData.devices.map(r => ({
                key: r.name,
                label: r.name,
                barPct: deviceMax > 0 ? (r.impressions / deviceMax) * 100 : 0,
                primary: fmtInt(r.impressions),
                secondary: `${fmtInt(r.clicks)} clk`,
              })),
            },
            {
              title: 'Placements',
              emptyLabel: 'No placement data in the selected window.',
              rows: devicesData.placements.map(r => ({
                key: r.name,
                label: r.name,
                barPct: placeMax > 0 ? (r.impressions / placeMax) * 100 : 0,
                primary: fmtInt(r.impressions),
                secondary: `${fmtInt(r.clicks)} clk`,
              })),
            },
          ];
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.lg }}>
              {panels.map(panel => (
                <div key={panel.title} style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <ChartContainer title={panel.title}>
                    <div style={{ padding: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                      {panel.rows.length === 0 || panel.rows.every(r => r.barPct === 0) ? (
                        <div style={{ padding: spacing.md, color: colors.text.secondary, fontSize: typography.fontSize.sm, textAlign: 'center' }}>
                          {panel.emptyLabel}
                        </div>
                      ) : panel.rows.map(row => (
                        <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                          <div style={{
                            width: 90,
                            flexShrink: 0,
                            fontSize: typography.fontSize.xs,
                            fontWeight: typography.fontWeight.semibold,
                            color: colors.text.primary,
                            textAlign: 'right',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }} title={row.label}>
                            {row.label}
                          </div>
                          <div style={{ flex: 1, position: 'relative', height: 24, backgroundColor: colors.background.panel, minWidth: 30 }}>
                            <div style={{
                              width: `${row.barPct}%`,
                              height: '100%',
                              backgroundColor: colors.ui.teal,
                              transition: 'width 240ms ease-out',
                            }} />
                          </div>
                          <div style={{
                            width: 90,
                            flexShrink: 0,
                            fontSize: typography.fontSize.xs,
                            color: colors.text.primary,
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 4,
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            <span style={{ fontWeight: typography.fontWeight.semibold }}>{row.primary}</span>
                            <span style={{ color: colors.text.secondary }}>{row.secondary}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ChartContainer>
                </div>
              ))}
            </div>
          );
        })()}

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
                    paginate={20}
            />
                );
              case 'ads':
                return (
                  <>
                    <DailySummaryTable
                      data={visibleEntityAds as unknown as DailyRow[]}
                      columns={entityColumns('Ad Name', { withMediaType: true, withPreview: true, withAdCopy: true })}
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
                    paginate={20}
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
            paginate={20}
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
                      <div style={{ width: 220, flexShrink: 0, fontSize: typography.fontSize.sm, color: colors.text.primary, display: 'flex', justifyContent: 'space-between', gap: spacing.xs, fontVariantNumeric: 'tabular-nums' }}>
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

        <ChartContainer title="Targeting (per ad set)">
          <DailySummaryTable
            data={targeting as unknown as DailyRow[]}
            columns={TARGETING_COLUMNS}
            sortable
            initialSort={{ key: 'spend', direction: 'desc' }}
            paginate={20}
            />
        </ChartContainer>

      </div>
    </div>
  );
}
