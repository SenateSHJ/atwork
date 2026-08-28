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
import { DailySummaryTable, type DSTColumn } from '@/components/hq/DailySummaryTable';
import {
  fetchAboveFold, fetchBelowFold, fetchEntityTables, fetchTargetingSections, getFilterOptions,
  type GadsFilters, type GadsFilterOptions,
  type GadsEntityRow, type GadsDailyRow,
  type GadsProximityRow,
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
const fmtMoney = (v: number | null) => v != null ? `$${v.toFixed(2)}` : '$0.00';
const fmtInt   = (v: number)        => Math.round(v).toLocaleString();
const fmtDate  = (v: unknown) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? format(parseISO(v), 'd-MMM-yyyy')
    : String(v ?? '');

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
    { key: 'cpc',                 label: 'CPC',             numeric: true, render: r => r.cpc == null ? '—' : `$${Number(r.cpc).toFixed(2)}` },
    { key: 'cpm',                 label: 'CPM',             numeric: true, render: r => r.cpm == null ? '—' : `$${Number(r.cpm).toFixed(2)}` },
    { key: 'cost_per_conversion', label: 'CPA',             numeric: true, render: r => r.cost_per_conversion == null ? '—' : `$${Number(r.cost_per_conversion).toFixed(2)}` },
    { key: 'conversion_rate',     label: 'Conv. Rate',      numeric: true, render: r => r.conversion_rate == null ? '—' : `${Number(r.conversion_rate).toFixed(2)}%` },
    { key: 'conversion_value',    label: 'Conv. Value',     numeric: true, render: r => `$${Number(r.conversion_value || 0).toFixed(2)}` },
  );
  return cols;
}

// Campaign proximity — 1 row per radius ring per campaign.
const _PROXIMITY_COLUMNS: DSTColumn[] = [
  { key: 'campaign',        label: 'Campaign',    align: 'left' },
  { key: 'campaign_status', label: 'Status',      align: 'left', render: r => String(r.campaign_status ?? '—') },
  { key: 'radius',          label: 'Radius',      numeric: true, render: r => `${Number(r.radius || 0).toFixed(1)} ${String(r.radius_units ?? '')}`.trim() },
  { key: 'city',            label: 'City',        align: 'left', render: r => String(r.city ?? '—') },
  { key: 'province',        label: 'Province',    align: 'left', render: r => String(r.province ?? '—') },
  { key: 'country',         label: 'Country',     align: 'left', render: r => String(r.country ?? '—') },
  { key: 'postal_code',     label: 'Postal Code', align: 'left', render: r => String(r.postal_code ?? '—') },
];

// Daily Summary columns — Date + all 9 scorecard metrics.
const DAILY_COLUMNS: DSTColumn[] = [
  { key: 'date',                label: 'Date',        align: 'left', render: r => fmtDate(r.date) },
  { key: 'spend_aud',           label: 'Spend',       numeric: true, render: r => `$${Math.round(Number(r.spend_aud   || 0)).toLocaleString()}` },
  { key: 'impressions',         label: 'Impressions', numeric: true, render: r => Number(r.impressions || 0).toLocaleString() },
  { key: 'clicks',              label: 'Clicks',      numeric: true, render: r => Number(r.clicks      || 0).toLocaleString() },
  { key: 'conversions',         label: 'Conversions', numeric: true, render: r => Number(r.conversions || 0).toLocaleString() },
  { key: 'ctr',                 label: 'CTR',         numeric: true, render: r => r.ctr == null ? '—' : `${Number(r.ctr).toFixed(2)}%` },
  { key: 'cpc',                 label: 'CPC',         numeric: true, render: r => r.cpc == null ? '—' : `$${Number(r.cpc).toFixed(2)}` },
  { key: 'cpm',                 label: 'CPM',         numeric: true, render: r => r.cpm == null ? '—' : `$${Number(r.cpm).toFixed(2)}` },
  { key: 'cost_per_conversion', label: 'CPA',         numeric: true, render: r => r.cost_per_conversion == null ? '—' : `$${Number(r.cost_per_conversion).toFixed(2)}` },
  { key: 'conversion_rate',     label: 'Conv. Rate',  numeric: true, render: r => r.conversion_rate == null ? '—' : `${Number(r.conversion_rate).toFixed(2)}%` },
  { key: 'conversion_value',    label: 'Conv. Value', numeric: true, render: r => `$${Number(r.conversion_value || 0).toFixed(2)}` },
];

// ─── Page ─────────────────────────────────────────────────────────────────

export default function GoogleAdsPage() {
  const [startDate, setStartDate] = useState(() => toIso(daysAgo(29)));
  const [endDate,   setEndDate]   = useState(() => toIso(new Date()));

  const [filters, setFilters] = useState<GadsFilters>({ campaigns: [], adGroups: [], networks: [] });
  const [filterOptions, setFilterOptions] = useState<GadsFilterOptions>({ campaigns: [], adGroups: [], networks: [] });

  const [summaryTotals,    setSummaryTotals]    = useState<Totals | null>(null);
  const [dailyRows,        setDailyRows]        = useState<GadsDailyRow[]>([]);
  const [, setAgencyPerf]                       = useState<AgencyRow[]>([]);
  const [trendsData,       setTrendsData]       = useState<TrendRow[]>([]);
  const [entityCampaigns,  setEntityCampaigns]  = useState<GadsEntityRow[]>([]);
  const [entityAdGroups,   setEntityAdGroups]   = useState<GadsEntityRow[]>([]);
  const [entityAds,        setEntityAds]        = useState<GadsEntityRow[]>([]);
  const [entityKeywords,   setEntityKeywords]   = useState<GadsEntityRow[]>([]);
  const [entitySearchTerms,setEntitySearchTerms]= useState<GadsEntityRow[]>([]);
  const [_proximity,       _setProximity]       = useState<GadsProximityRow[]>([]);
  const [fallbackActive,   setFallbackActive]   = useState(false);
  const [bannerDismissed,  setBannerDismissed]  = useState(readBannerDismissed);

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

  const fetchBelowFoldCb = useCallback(async (sd: string, ed: string, f: GadsFilters) => {
    try {
      const [data, entities, targeting] = await Promise.all([
        fetchBelowFold(sd, ed, f),
        fetchEntityTables(sd, ed, f),
        fetchTargetingSections(sd, ed),
      ]);
      setTrendsData(data.trends);
      setEntityCampaigns(entities.campaigns);
      setEntityAdGroups(entities.adGroups);
      setEntityAds(entities.ads);
      setEntityKeywords(entities.keywords);
      setEntitySearchTerms(entities.searchTerms);
      _setProximity(targeting.proximity);
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
    convValue:   dailyRows.map(d => Number(d.conversion_value ?? 0)),
  }), [dailyRows]);

  const dailyTotals = useMemo(() => {
    const spend       = dailyRows.reduce((s, r) => s + r.spend_aud,                    0);
    const impressions = dailyRows.reduce((s, r) => s + r.impressions,                  0);
    const clicks      = dailyRows.reduce((s, r) => s + r.clicks,                       0);
    const conversions = dailyRows.reduce((s, r) => s + (r.conversions ?? 0),           0);
    const convValue   = dailyRows.reduce((s, r) => s + Number(r.conversion_value ?? 0), 0);
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
      conversion_value:    convValue,
    };
  }, [dailyRows]);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = () => {
    setRefreshing(true);
    setFilters({ campaigns: [], adGroups: [], networks: [] });
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
        <SearchableMultiSelect
          label="Network"
          options={filterOptions.networks}
          value={filters.networks}
          onChange={vals => setFilters(prev => ({ ...prev, networks: vals }))}
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

      {/* ── Inactive-account banner ────────────────────────────────
          Shows when totals are all zero — the atWork Google Ads
          account has been marked Inactive in Weld since Apr 2024;
          no recent stats will land until it's reactivated. Once
          the account starts flowing again the banner auto-hides.
      */}
      {(t && t.spend_aud === 0 && t.impressions === 0 && t.clicks === 0) && (
        <div style={{
          border: `1px solid ${colors.brand.secondary}`,
          backgroundColor: colors.brand.secondaryFaint,
          color: colors.text.primary,
          padding: `${spacing.md} ${spacing.lg}`,
          marginBottom: spacing.lg,
          borderRadius: 0,
          fontSize: typography.fontSize.sm,
          lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: typography.fontWeight.semibold, marginBottom: 4 }}>
            Google Ads account is inactive
          </div>
          <div style={{ color: colors.text.secondary }}>
            The atWork Google Ads account stopped delivering ads on 2024-04-08 and is marked Inactive in Weld. Campaign / ad-group / keyword dimensions are still synced (visible below) but no new stats will land until the account is reactivated in Google Ads.
          </div>
        </div>
      )}

      {/* ── Scorecards (9 tiles, 5-col grid) ── */}
      <div className="scorecard-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 160px)',
        gap: spacing.sm,
        justifyContent: 'center',
        marginBottom: spacing.xs,
      }}>
        <BFScorecard title="Spend"               value={fmtMoney(t?.spend_aud           ?? 0)}    sparklineData={spark.spend}       color="blue" size="small" />
        <BFScorecard title="Impressions"         value={fmtInt(t?.impressions           ?? 0)}    sparklineData={spark.impressions} color="blue" size="small" />
        <BFScorecard title="Clicks"              value={fmtInt(t?.clicks                ?? 0)}    sparklineData={spark.clicks}      color="blue" size="small" />
        <BFScorecard title="Conversions"         value={fmtInt(t?.conversions           ?? 0)}    sparklineData={spark.conversions} color="blue" size="small" />
        <BFScorecard title="CTR"                 value={fmtCtr(t?.ctr                   ?? null)} sparklineData={spark.ctr}         color="blue" size="small" />
        <BFScorecard title="CPC"                 value={fmtMoney(t?.cpc                 ?? null)} sparklineData={spark.cpc}         color="blue" size="small" />
        <BFScorecard title="CPM"                 value={fmtMoney(t?.cpm                 ?? null)} sparklineData={spark.cpm}         color="blue" size="small" />
        <BFScorecard title="Cost per Conversion" value={fmtMoney(t?.cost_per_conversion ?? null)} sparklineData={spark.cpa}         color="blue" size="small" />
        <BFScorecard title="Conversion Rate"     value={fmtCtr(t?.conversion_rate       ?? null)} sparklineData={spark.convRate}    color="blue" size="small" />
        <BFScorecard title="Conversion Value"    value={fmtMoney(t?.conversion_value    ?? 0)}    sparklineData={spark.convValue}   color="blue" size="small" />
      </div>
      <div style={{
        textAlign: 'center', fontSize: typography.fontSize.xs,
        color: colors.text.secondary, marginBottom: spacing.lg,
      }}>
        Conversions = {GADS_CONVERSION_DEFINITION}
      </div>

      {/* Sentinel for lazy below-fold fetch */}
      <div ref={setSentinelEl} aria-hidden style={{ height: 1 }} />

      {/* ── Charts + tables ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>

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
            data={dailyRows as unknown as DailyRow[]}
            columns={DAILY_COLUMNS}
            sortable
            initialSort={{ key: 'date', direction: 'desc' }}
            totalsRow={dailyTotals as unknown as Record<string, unknown>}
            paginate={10}
          />
        </ChartContainer>

        <ChartContainer title="Campaigns">
          <DailySummaryTable
            data={entityCampaigns as unknown as DailyRow[]}
            columns={entityColumns('Campaign')}
            sortable
            initialSort={{ key: 'spend', direction: 'desc' }}
            paginate={20}
            />
        </ChartContainer>

        <ChartContainer title="Ad Groups">
          <DailySummaryTable
            data={entityAdGroups as unknown as DailyRow[]}
            columns={entityColumns('Ad Group', { withCampaign: true })}
            sortable
            initialSort={{ key: 'spend', direction: 'desc' }}
            paginate={20}
            />
          {entityAdGroups.length === 0 && searchPausedNote}
        </ChartContainer>

        <ChartContainer title="Asset Groups">
          <DailySummaryTable
            data={[] as unknown as DailyRow[]}
            columns={entityColumns('Asset Group', { withCampaign: true })}
            sortable
            initialSort={{ key: 'spend', direction: 'desc' }}
            paginate={20}
            />
          {assetGroupsNote}
        </ChartContainer>

        <ChartContainer title="Ads">
          <DailySummaryTable
            data={entityAds as unknown as DailyRow[]}
            columns={entityColumns('Ad', { withAdGroup: true, withCampaign: true })}
            sortable
            initialSort={{ key: 'spend', direction: 'desc' }}
            paginate={20}
            />
          {entityAds.length === 0 && searchPausedNote}
        </ChartContainer>

        <ChartContainer title="Keywords">
          <DailySummaryTable
            data={entityKeywords as unknown as DailyRow[]}
            columns={entityColumns('Keyword', { withMatchType: true, withAdGroup: true })}
            sortable
            initialSort={{ key: 'spend', direction: 'desc' }}
            paginate={20}
          />
          {entityKeywords.length === 0 && searchPausedNote}
        </ChartContainer>

        <ChartContainer title="Search Terms">
          <DailySummaryTable
            data={entitySearchTerms as unknown as DailyRow[]}
            columns={entityColumns('Search Term', { withMatchType: true })}
            sortable
            initialSort={{ key: 'spend', direction: 'desc' }}
            paginate={20}
          />
          {entitySearchTerms.length === 0 && searchPausedNote}
        </ChartContainer>

        <ChartContainer title="Audience">
          <DailySummaryTable
            data={[] as unknown as DailyRow[]}
            columns={entityColumns('Audience', { withCampaign: true })}
            sortable
            initialSort={{ key: 'spend', direction: 'desc' }}
            paginate={20}
            />
          {audienceNote}
        </ChartContainer>

      </div>
    </div>
  );
}
