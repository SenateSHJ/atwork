'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { FallbackBanner, readBannerDismissed, persistBannerDismissed } from '@/components/FallbackBanner';
import { colors, typography, spacing } from '@/tokens';
import { BFScorecard } from '@/components/BFScorecard';
import { ChartContainer } from '@/components/ChartContainer';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { SearchableMultiSelect } from '@/components/hq/SearchableMultiSelect';
import dynamic from 'next/dynamic';
const MetricTrendsChart = dynamic(
  () => import('@/components/hq/MetricTrendsChart').then(m => ({ default: m.MetricTrendsChart })),
  { ssr: false, loading: () => <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 14 }}>Loading chart…</div> },
);
import { ByAgencyBarChart } from '@/components/hq/ByAgencyBarChart';
import { DailySummaryTable, type DSTColumn } from '@/components/hq/DailySummaryTable';
import {
  fetchAboveFold, fetchBelowFold, getFilterOptions,
  type Ga4Filters, type Ga4FilterOptions, type Ga4Totals, type Ga4TrendPoint,
  type Ga4TrafficRow, type Ga4PageRow, type Ga4DeviceRow, type Ga4BrowserOsRow, type Ga4LeadEventRow,
} from './actions';
import type { AgencyRow, TrendRow } from '../meta/actions';
import { fmtDuration } from '@/lib/fmt';

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
const fmtNum2  = (v: number | null) => v != null ? v.toFixed(2)         : '0.00';
const fmtInt   = (v: number)        => Math.round(v).toLocaleString();
const fmtDate  = (v: unknown) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? format(parseISO(v), 'd-MMM-yyyy')
    : String(v ?? '');

// Daily Summary columns — mirrors the 10 core scorecard metrics + Date.
const DAILY_COLUMNS: DSTColumn[] = [
  { key: 'date',              label: 'Date',             align: 'left', render: r => fmtDate(r.date) },
  { key: 'total_users',       label: 'Users',            numeric: true, render: r => Number(r.total_users      || 0).toLocaleString() },
  { key: 'new_users',         label: 'New Users',        numeric: true, render: r => Number(r.new_users        || 0).toLocaleString() },
  { key: 'sessions',          label: 'Sessions',         numeric: true, render: r => Number(r.sessions         || 0).toLocaleString() },
  { key: 'page_views',        label: 'Page Views',       numeric: true, render: r => Number(r.page_views       || 0).toLocaleString() },
  { key: 'engaged_sessions',  label: 'Engaged Sessions', numeric: true, render: r => Number(r.engaged_sessions || 0).toLocaleString() },
  { key: 'bounce_rate_pct',   label: 'Bounce Rate',      numeric: true, render: r => r.bounce_rate_pct == null ? '—' : `${Number(r.bounce_rate_pct).toFixed(2)}%` },
  { key: 'avg_engagement_secs', label: 'Avg. Engagement', numeric: true, render: r => fmtDuration(Number(r.avg_engagement_secs || 0)) },
  { key: 'lead_events',       label: 'Lead Events',      numeric: true, render: r => Number(r.lead_events      || 0).toLocaleString() },
  { key: 'conversion_rate',   label: 'Conv. Rate',       numeric: true, render: r => r.conversion_rate == null ? '—' : `${Number(r.conversion_rate).toFixed(2)}%` },
];

// Entity table column configs — 5 tables.
const TRAFFIC_COLUMNS: DSTColumn[] = [
  { key: 'channel',         label: 'Channel',         align: 'left' },
  { key: 'sessions',        label: 'Sessions',        numeric: true, render: r => Number(r.sessions || 0).toLocaleString() },
  { key: 'users',           label: 'Users',           numeric: true, render: r => Number(r.users    || 0).toLocaleString() },
  { key: 'engagement_rate', label: 'Engagement Rate', numeric: true, render: r => `${Number(r.engagement_rate || 0).toFixed(2)}%` },
  { key: 'bounce_rate',     label: 'Bounce Rate',     numeric: true, render: r => r.bounce_rate == null ? '—' : `${Number(r.bounce_rate).toFixed(2)}%` },
  { key: 'conversion_rate', label: 'Conv. Rate',      numeric: true, render: r => `${Number(r.conversion_rate || 0).toFixed(2)}%` },
];
const TOP_PAGES_COLUMNS: DSTColumn[] = [
  { key: 'page_path',  label: 'Page Path',  align: 'left' },
  { key: 'page_views', label: 'Page Views', numeric: true, render: r => Number(r.page_views || 0).toLocaleString() },
  { key: 'users',      label: 'Users',      numeric: true, render: r => Number(r.users      || 0).toLocaleString() },
];
// DEVICE_COLUMNS removed 2026-08-20 — Devices table dropped in favour of the
// "Users by Device" bar chart above + the finer Browser & OS section below.
// `devices` state is still needed for the bar chart, so the Ga4DeviceRow type
// and the fetch stay.

const BROWSER_OS_COLUMNS: DSTColumn[] = [
  { key: 'operating_system', label: 'OS',              align: 'left' },
  { key: 'browser',          label: 'Browser',         align: 'left' },
  { key: 'users',            label: 'Users',           numeric: true, render: r => Number(r.users || 0).toLocaleString() },
  { key: 'engaged_sessions', label: 'Engaged Sessions',numeric: true, render: r => Number(r.engaged_sessions || 0).toLocaleString() },
  { key: 'engagement_rate',  label: 'Engagement Rate', numeric: true, render: r => `${Number(r.engagement_rate || 0).toFixed(2)}%` },
];
const LEAD_EVENT_COLUMNS: DSTColumn[] = [
  { key: 'event_name', label: 'Event',  align: 'left' },
  { key: 'count',      label: 'Count',  numeric: true, render: r => Number(r.count || 0).toLocaleString() },
];

// ─── Page ─────────────────────────────────────────────────────────────────

export default function Ga4Page() {
  const [startDate, setStartDate] = useState(() => toIso(daysAgo(29)));
  const [endDate,   setEndDate]   = useState(() => toIso(new Date()));

  const [filters, setFilters] = useState<Ga4Filters>({ channels: [], devices: [], landingPages: [] });
  const [filterOptions, setFilterOptions] = useState<Ga4FilterOptions>({ channels: [], devices: [], landingPages: [] });

  const [summaryTotals,    setSummaryTotals]    = useState<Ga4Totals | null>(null);
  const [ga4Trend,         setGa4Trend]         = useState<Ga4TrendPoint[]>([]);
  const [, setAgencyPerf]                       = useState<AgencyRow[]>([]);
  const [trendsData,       setTrendsData]       = useState<TrendRow[]>([]);
  const [traffic,          setTraffic]          = useState<Ga4TrafficRow[]>([]);
  const [topPages,         setTopPages]         = useState<Ga4PageRow[]>([]);
  const [devices,          setDevices]          = useState<Ga4DeviceRow[]>([]);
  const [browserOs,        setBrowserOs]        = useState<Ga4BrowserOsRow[]>([]);
  const [leadEvents,       setLeadEvents]       = useState<Ga4LeadEventRow[]>([]);
  const [fallbackActive,   setFallbackActive]   = useState(false);
  const [bannerDismissed,  setBannerDismissed]  = useState(readBannerDismissed);

  useEffect(() => {
    getFilterOptions(startDate, endDate).then(setFilterOptions).catch(console.error);
  }, [startDate, endDate]);

  const [belowFoldRequested, setBelowFoldRequested] = useState(false);
  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null);

  const fetchAboveFoldCb = useCallback(async (sd: string, ed: string, f: Ga4Filters) => {
    try {
      const data = await fetchAboveFold(sd, ed, f);
      setSummaryTotals(data.ga4Totals);
      setGa4Trend(data.ga4Trend);
      setFallbackActive(data.fallback);
      setAgencyPerf(data.agencies);
    } catch (e) { console.error(e); }
  }, []);

  const fetchBelowFoldCb = useCallback(async (sd: string, ed: string, f: Ga4Filters) => {
    try {
      const data = await fetchBelowFold(sd, ed, f);
      setTrendsData(data.trends);
      setTraffic(data.traffic);
      setTopPages(data.topPages);
      setDevices(data.devices);
      setBrowserOs(data.browserOs);
      setLeadEvents(data.leadEvents);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchAboveFoldCb(startDate, endDate, filters);
  }, [startDate, endDate, filters, fetchAboveFoldCb]);
  useEffect(() => {
    if (belowFoldRequested) fetchBelowFoldCb(startDate, endDate, filters);
  }, [startDate, endDate, filters, belowFoldRequested, fetchBelowFoldCb]);
  useEffect(() => {
    if (!sentinelEl || belowFoldRequested) return;
    const io = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) { setBelowFoldRequested(true); io.disconnect(); } },
      { rootMargin: '400px' },
    );
    io.observe(sentinelEl);
    return () => io.disconnect();
  }, [sentinelEl, belowFoldRequested]);

  const t = summaryTotals;

  // Sparklines from the daily GA4 trend.
  const spark = useMemo(() => ({
    users:            ga4Trend.map(d => d.total_users              ?? 0),
    new_users:        ga4Trend.map(d => d.new_users                ?? 0),
    sessions:         ga4Trend.map(d => d.sessions                 ?? 0),
    page_views:       ga4Trend.map(d => d.page_views               ?? 0),
    avg_engagement:   ga4Trend.map(d => d.avg_engagement_secs      ?? 0),
    bounce:           ga4Trend.map(d => d.bounce_rate_pct          ?? 0),
    leads:            ga4Trend.map(d => d.lead_events              ?? 0),
    conversion_rate:  ga4Trend.map(d => d.conversion_rate          ?? 0),
    engaged_sessions: ga4Trend.map(d => d.engaged_sessions         ?? 0),
    engagement_rate:  ga4Trend.map(d => d.sessions
      ? (d.engaged_sessions / d.sessions) * 100 : 0),
    sessions_per_user: ga4Trend.map(d => d.total_users
      ? d.sessions / d.total_users : 0),
    views_per_session: ga4Trend.map(d => d.sessions
      ? d.page_views / d.sessions : 0),
  }), [ga4Trend]);

  // Daily Summary totals row — session-weighted derived rates.
  const dailyTotals = useMemo(() => {
    const users            = ga4Trend.reduce((s, r) => s + r.total_users,      0);
    const new_users        = ga4Trend.reduce((s, r) => s + r.new_users,        0);
    const sessions         = ga4Trend.reduce((s, r) => s + r.sessions,         0);
    const page_views       = ga4Trend.reduce((s, r) => s + r.page_views,       0);
    const engaged_sessions = ga4Trend.reduce((s, r) => s + r.engaged_sessions, 0);
    const lead_events      = ga4Trend.reduce((s, r) => s + r.lead_events,      0);
    let brw = 0, brs = 0, engDur = 0;
    for (const r of ga4Trend) {
      if (r.bounce_rate_pct != null && r.sessions > 0) {
        brw += r.sessions * r.bounce_rate_pct; brs += r.sessions;
      }
      engDur += r.engagement_duration_secs;
    }
    const bounce = brs > 0 ? brw / brs : null;
    const conversions = ga4Trend.reduce((s, r) => s + r.conversions, 0);
    return {
      date:                 'Total',
      total_users:          users,
      new_users,
      sessions,
      page_views,
      engaged_sessions,
      bounce_rate_pct:      bounce,
      avg_engagement_secs:  sessions ? engDur / sessions : 0,
      lead_events,
      conversion_rate:      sessions ? (conversions / sessions) * 100 : null,
    };
  }, [ga4Trend]);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = () => {
    setRefreshing(true);
    setFilters({ channels: [], devices: [], landingPages: [] });
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
    borderTop: `1px solid ${colors.border.default}`,
  };
  const landingPagesNote = (
    <div style={noteBox}>
      No data. Verified in the atWork BigQuery dataset — Weld&apos;s Google
      Analytics 4 connector doesn&apos;t expose a landing-page report for
      this property. The seven synced tables (audience_overview, page_path,
      channel_traffic, events_overview, browser_and_operating_system_overview,
      social_media_acquisitions, campaign_performance) don&apos;t include a
      landing_page / landingPagePlusQueryString column or an entrances metric.
      This is a connector capability limitation, not a sync gap.
    </div>
  );
  const geographyNote = (
    <div style={noteBox}>
      Country and city are unavailable. Verified in the atWork BigQuery
      dataset — none of the seven synced GA4 tables carry a country / city /
      region / geo_* / location_* column. Weld&apos;s GA4 connector does not
      offer a geographic report for this property.
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
        Website
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
          label="Channel"
          options={filterOptions.channels}
          value={filters.channels}
          onChange={vals => setFilters(prev => ({ ...prev, channels: vals }))}
        />
        <SearchableMultiSelect
          label="Device"
          options={filterOptions.devices}
          value={filters.devices}
          onChange={vals => setFilters(prev => ({ ...prev, devices: vals }))}
        />
        <SearchableMultiSelect
          label="Landing Page"
          options={filterOptions.landingPages}
          value={filters.landingPages}
          onChange={vals => setFilters(prev => ({ ...prev, landingPages: vals }))}
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
            border: 'none', borderRadius: 0, padding: '0 16px',
            fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium,
            cursor: refreshing ? 'wait' : 'pointer',
            opacity: refreshing ? 0.6 : 1,
            transition: 'background-color 120ms, opacity 120ms',
          }}
        >
          {refreshing ? 'Resetting…' : 'Reset Filters'}
        </button>
      </div>

      {/* ── Scorecards — 12 tiles, 2 rows of 6 ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 160px)',
        gap: spacing.sm,
        justifyContent: 'center',
        marginBottom: spacing.lg,
      }}>
        <BFScorecard title="Users"             value={fmtInt(t?.users             ?? 0)}    sparklineData={spark.users}            color="blue" size="small" />
        <BFScorecard title="New Users"         value={fmtInt(t?.new_users         ?? 0)}    sparklineData={spark.new_users}        color="blue" size="small" />
        <BFScorecard title="Sessions"          value={fmtInt(t?.sessions          ?? 0)}    sparklineData={spark.sessions}         color="blue" size="small" />
        <BFScorecard title="Page Views"        value={fmtInt(t?.page_views        ?? 0)}    sparklineData={spark.page_views}       color="blue" size="small" />
        <BFScorecard title="Avg. Engagement"   value={fmtDuration(t?.avg_engagement_secs ?? 0)} sparklineData={spark.avg_engagement} color="blue" size="small" />
        <BFScorecard title="Bounce Rate"       value={fmtCtr(t?.bounce_rate       ?? null)} sparklineData={spark.bounce}           color="blue" size="small" />
        <BFScorecard title="Lead Events"       value={fmtInt(t?.lead_events       ?? 0)}    sparklineData={spark.leads}            color="blue" size="small" />
        <BFScorecard title="Conversion Rate"   value={fmtCtr(t?.conversion_rate   ?? null)} sparklineData={spark.conversion_rate}  color="blue" size="small" />
        <BFScorecard title="Engaged Sessions"  value={fmtInt(t?.engaged_sessions  ?? 0)}    sparklineData={spark.engaged_sessions} color="blue" size="small" />
        <BFScorecard title="Engagement Rate"   value={fmtCtr(t?.engagement_rate   ?? null)} sparklineData={spark.engagement_rate}  color="blue" size="small" />
        <BFScorecard title="Sessions / User"   value={fmtNum2(t?.sessions_per_user?? null)} sparklineData={spark.sessions_per_user}color="blue" size="small" />
        <BFScorecard title="Views / Session"   value={fmtNum2(t?.views_per_session?? null)} sparklineData={spark.views_per_session}color="blue" size="small" />
      </div>

      {/* Definition + freshness subtitle */}
      <div style={{
        textAlign: 'center', fontSize: typography.fontSize.xs,
        color: colors.text.secondary, marginBottom: spacing.md,
        lineHeight: 1.5,
      }}>
        <div>
          Avg. Engagement = GA4 average engagement time per session. The low
          figure reflects short visits (glance-and-leave menu / hours
          checks), not a measurement fault.
        </div>
        {t?.last_complete_date && t.days_behind > 0 && (
          <div style={{ marginTop: 4 }}>
            GA4 data is currently {t.days_behind} {t.days_behind === 1 ? 'day' : 'days'} behind
            (last complete day: {fmtDate(t.last_complete_date)}). Charts and Daily
            Summary end there; partial-day data is trimmed automatically.
          </div>
        )}
      </div>

      {/* Below-fold sentinel */}
      <div ref={setSentinelEl} aria-hidden style={{ height: 1 }} />

      {/* ── Charts + tables ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>

        <ChartContainer title="Metric Trends — Traffic & Engagement">
          <MetricTrendsChart
            data={trendsData}
            yUnit="number"
            series={[
              { key: 'page_views',       label: 'Page Views',       color: colors.chartDark[0] },
              { key: 'sessions',         label: 'Sessions',         color: colors.chart[1]     },
              { key: 'engaged_sessions', label: 'Engaged Sessions', color: colors.chart[3]     },
            ]}
          />
        </ChartContainer>

        <ChartContainer title="Traffic by Channel">
          <ByAgencyBarChart
            data={traffic.map(x => ({ agency_name: x.channel, value: x.sessions }))}
            lowerIsBetter={false}
            formatter={v => Number(v).toLocaleString()}
          />
        </ChartContainer>

        <ChartContainer title="Users by Device">
          <ByAgencyBarChart
            data={devices.map(x => ({ agency_name: x.device, value: x.users }))}
            lowerIsBetter={false}
            formatter={v => Number(v).toLocaleString()}
          />
        </ChartContainer>

        <ChartContainer title="Daily Summary">
          <DailySummaryTable
            data={ga4Trend as unknown as Record<string, unknown>[]}
            columns={DAILY_COLUMNS}
            sortable
            initialSort={{ key: 'date', direction: 'desc' }}
            totalsRow={dailyTotals as unknown as Record<string, unknown>}
            paginate={20}
          />
        </ChartContainer>

        <ChartContainer title="Traffic Sources">
          <DailySummaryTable
            data={traffic as unknown as Record<string, unknown>[]}
            columns={TRAFFIC_COLUMNS}
            sortable
            initialSort={{ key: 'sessions', direction: 'desc' }}
            paginate={20}
          />
        </ChartContainer>

        <ChartContainer title="Top Pages">
          <DailySummaryTable
            data={topPages as unknown as Record<string, unknown>[]}
            columns={TOP_PAGES_COLUMNS}
            sortable
            initialSort={{ key: 'page_views', direction: 'desc' }}
            paginate={20}
          />
        </ChartContainer>

        <ChartContainer title="Landing Pages">
          <DailySummaryTable
            data={[] as unknown as Record<string, unknown>[]}
            columns={TOP_PAGES_COLUMNS}
            sortable
            initialSort={{ key: 'page_views', direction: 'desc' }}
            paginate={20}
          />
          {landingPagesNote}
        </ChartContainer>

        <ChartContainer title="Browser & OS">
          <DailySummaryTable
            data={browserOs as unknown as Record<string, unknown>[]}
            columns={BROWSER_OS_COLUMNS}
            sortable
            initialSort={{ key: 'users', direction: 'desc' }}
            paginate={20}
          />
        </ChartContainer>

        <ChartContainer title="Lead Events">
          <DailySummaryTable
            data={leadEvents as unknown as Record<string, unknown>[]}
            columns={LEAD_EVENT_COLUMNS}
            sortable
            initialSort={{ key: 'count', direction: 'desc' }}
            paginate={20}
          />
        </ChartContainer>

        <ChartContainer title="Geography">
          <DailySummaryTable
            data={[] as unknown as Record<string, unknown>[]}
            columns={[
              { key: 'country', label: 'Country', align: 'left' },
              { key: 'users',   label: 'Users',   numeric: true, render: r => Number(r.users || 0).toLocaleString() },
              { key: 'sessions',label: 'Sessions',numeric: true, render: r => Number(r.sessions || 0).toLocaleString() },
            ]}
            paginate={20}
          />
          {geographyNote}
        </ChartContainer>

      </div>
    </div>
  );
}
