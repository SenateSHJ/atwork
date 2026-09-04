'use client';

import { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { colors, typography, spacing, shadow, borderWidth, cellPadding, card, chart } from '@/tokens';
import { BFScorecard } from '@/components/BFScorecard';
import { ChartContainer } from '@/components/ChartContainer';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import {
  fetchSemrushOverview,
  fetchSemrushTopKeywords,
  fetchSemrushTrend,
  type SemrushOverviewPair,
  type SemrushKeyword,
  type SemrushTrendPoint,
} from './actions';

// ─── Formatters ───────────────────────────────────────────────────────────
function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
const fmtInt   = (v: number | null) => v != null ? Math.round(v).toLocaleString('en-AU') : '—';
const fmtMoney = (v: number | null) => v != null ? `$${v.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—';

function deltaPct(curr: number | null | undefined, prior: number | null | undefined): number | null {
  if (curr == null || prior == null || prior === 0) return null;
  return ((curr - prior) / prior) * 100;
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function SemrushPage() {
  const [startDate, setStartDate] = useState(() => toIso(daysAgo(89)));
  const [endDate,   setEndDate]   = useState(() => toIso(new Date()));

  const [overview, setOverview]   = useState<SemrushOverviewPair | null>(null);
  const [keywords, setKeywords]   = useState<SemrushKeyword[]>([]);
  const [trend,    setTrend]      = useState<SemrushTrendPoint[]>([]);
  const [loading,  setLoading]    = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchSemrushOverview(startDate, endDate),
      fetchSemrushTopKeywords(startDate, endDate, 50),
      fetchSemrushTrend(startDate, endDate),
    ])
      .then(([ov, kw, tr]) => {
        if (cancelled) return;
        setOverview(ov);
        setKeywords(kw);
        setTrend(tr);
      })
      .catch(e => { console.error(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  const c = overview?.current ?? null;
  const p = overview?.prior   ?? null;
  const hasData = c != null;

  const chartData = useMemo(() => trend.map(t => ({
    date:             t.snapshot_date,
    organic_keywords: t.organic_keywords,
    organic_traffic:  t.organic_traffic,
    total_backlinks:  t.total_backlinks,
  })), [trend]);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: `${spacing.md} ${spacing.lg}` }}>
      <h1 style={{
        textAlign: 'center',
        fontWeight: typography.fontWeight.bold,
        fontSize: typography.fontSize['3xl'],
        color: colors.text.primary,
        marginBottom: spacing.xs,
      }}>
        SEO Intelligence — atworkaustralia.com.au
      </h1>
      <p style={{ textAlign: 'center', color: colors.text.secondary, fontSize: typography.fontSize.sm, marginBottom: spacing.lg }}>
        Powered by SEMrush. Deltas compare the latest snapshot in the range against the snapshot from the equivalent prior period.
      </p>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: spacing.lg }}>
        <DateRangePicker startDate={startDate} endDate={endDate} onChange={(from, to) => { setStartDate(from); setEndDate(to); }} />
      </div>

      {!hasData && !loading && (
        <div style={{
          padding: spacing.lg, textAlign: 'center', color: colors.text.secondary,
          border: `${borderWidth.thin} solid ${colors.border.default}`,
          background: colors.background.card, boxShadow: shadow.md,
          marginBottom: spacing.lg,
        }}>
          No SEMrush snapshot available for the selected range yet. The first snapshot lands after the nightly ingest runs.
        </div>
      )}

      {/* Scorecards: 5x2 grid mirroring the other atWork pages. */}
      <div className="scorecard-grid" style={{
        display: 'grid',
        gridTemplateColumns: `repeat(5, ${card.gridCardMin})`,
        gap: spacing.sm,
        justifyContent: 'center',
        marginBottom: spacing.lg,
      }}>
        <BFScorecard title="Global Rank"        value={fmtInt(c?.rank ?? null)}              color="blue" size="small" delta={{ pct: deltaPct(c?.rank,              p?.rank),              goodDirection: 'down' }} />
        <BFScorecard title="Organic Keywords"   value={fmtInt(c?.organic_keywords ?? null)}  color="blue" size="small" delta={{ pct: deltaPct(c?.organic_keywords,  p?.organic_keywords),  goodDirection: 'up'   }} />
        <BFScorecard title="Est. Organic Traffic" value={fmtInt(c?.organic_traffic ?? null)} color="blue" size="small" delta={{ pct: deltaPct(c?.organic_traffic,   p?.organic_traffic),   goodDirection: 'up'   }} />
        <BFScorecard title="Est. Traffic Value" value={fmtMoney(c?.organic_cost ?? null)}    color="blue" size="small" delta={{ pct: deltaPct(c?.organic_cost,      p?.organic_cost),      goodDirection: 'up'   }} />
        <BFScorecard title="Top-3 Positions"    value={fmtInt(c?.top3_keywords ?? null)}     color="blue" size="small" delta={{ pct: deltaPct(c?.top3_keywords,     p?.top3_keywords),     goodDirection: 'up'   }} />
        <BFScorecard title="Top-10 Positions"   value={fmtInt(c?.top10_keywords ?? null)}    color="blue" size="small" delta={{ pct: deltaPct(c?.top10_keywords,    p?.top10_keywords),    goodDirection: 'up'   }} />
        <BFScorecard title="Backlinks"          value={fmtInt(c?.total_backlinks ?? null)}   color="blue" size="small" delta={{ pct: deltaPct(c?.total_backlinks,   p?.total_backlinks),   goodDirection: 'up'   }} />
        <BFScorecard title="Referring Domains"  value={fmtInt(c?.referring_domains ?? null)} color="blue" size="small" delta={{ pct: deltaPct(c?.referring_domains, p?.referring_domains), goodDirection: 'up'   }} />
        <BFScorecard title="Trust Score"        value={c?.trust_score != null ? c.trust_score.toFixed(0) : '—'} color="blue" size="small" delta={{ pct: deltaPct(c?.trust_score, p?.trust_score), goodDirection: 'up' }} />
        <BFScorecard title="Snapshot"           value={c?.snapshot_date ?? '—'}              color="blue" size="small" delta={{ pct: null, goodDirection: null }} />
      </div>

      {/* Trend chart */}
      <div style={{ marginBottom: spacing.lg }}>
        <ChartContainer title="Organic keywords + est. traffic over time">
          <div style={{ padding: spacing.md, height: chart.loadingHeight }}>
            {chartData.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: colors.text.secondary, fontSize: typography.fontSize.sm }}>
                No trend data yet — needs at least two nightly snapshots.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.border.default} />
                  <XAxis dataKey="date" tick={{ fill: colors.text.secondary, fontSize: 12 }} />
                  <YAxis yAxisId="left"  tick={{ fill: colors.text.secondary, fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: colors.text.secondary, fontSize: 12 }} />
                  <RTooltip />
                  <Legend />
                  <Line yAxisId="left"  type="monotone" dataKey="organic_keywords" name="Organic Keywords" stroke={colors.chart[0]} strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="organic_traffic"  name="Est. Organic Traffic"  stroke={colors.chart[1]} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartContainer>
      </div>

      {/* Top organic keywords */}
      <div style={{ marginBottom: spacing.lg }}>
        <ChartContainer title={`Top organic keywords (top ${keywords.length})`}>
          <div style={{ padding: spacing.md }}>
            {keywords.length === 0 ? (
              <div style={{ color: colors.text.secondary, fontSize: typography.fontSize.sm, padding: spacing.md, textAlign: 'center' }}>
                No keywords yet.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.fontSize.sm }}>
                  <thead>
                    <tr style={{ borderBottom: `${borderWidth.medium} solid ${colors.ui.black}`, background: colors.brand.secondaryFaint }}>
                      <th style={{ textAlign: 'left',  padding: cellPadding.compact, color: colors.text.primary, fontWeight: typography.fontWeight.semibold }}>Keyword</th>
                      <th style={{ textAlign: 'right', padding: cellPadding.compact, color: colors.text.primary, fontWeight: typography.fontWeight.semibold }}>Position</th>
                      <th style={{ textAlign: 'right', padding: cellPadding.compact, color: colors.text.primary, fontWeight: typography.fontWeight.semibold }}>Δ vs prior</th>
                      <th style={{ textAlign: 'right', padding: cellPadding.compact, color: colors.text.primary, fontWeight: typography.fontWeight.semibold }}>Search Volume</th>
                      <th style={{ textAlign: 'right', padding: cellPadding.compact, color: colors.text.primary, fontWeight: typography.fontWeight.semibold }}>CPC</th>
                      <th style={{ textAlign: 'right', padding: cellPadding.compact, color: colors.text.primary, fontWeight: typography.fontWeight.semibold }}>Traffic %</th>
                      <th style={{ textAlign: 'left',  padding: cellPadding.compact, color: colors.text.primary, fontWeight: typography.fontWeight.semibold }}>Landing URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keywords.map((k, i) => {
                      const posDelta = (k.previous_position != null && k.position != null) ? (k.previous_position - k.position) : null;
                      const posDeltaColor = posDelta == null ? colors.text.secondary : posDelta > 0 ? colors.status.success : posDelta < 0 ? colors.status.error : colors.text.secondary;
                      return (
                        <tr key={i} style={{ borderBottom: `${borderWidth.thin} solid ${colors.border.default}`, background: i % 2 === 1 ? colors.table.rowAlt : 'transparent' }}>
                          <td style={{ padding: cellPadding.compact, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k.keyword}>{k.keyword}</td>
                          <td style={{ padding: cellPadding.compact, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{k.position ?? '—'}</td>
                          <td style={{ padding: cellPadding.compact, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: posDeltaColor }}>
                            {posDelta == null ? '—' : posDelta > 0 ? `▲ ${posDelta}` : posDelta < 0 ? `▼ ${Math.abs(posDelta)}` : '—'}
                          </td>
                          <td style={{ padding: cellPadding.compact, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtInt(k.search_volume)}</td>
                          <td style={{ padding: cellPadding.compact, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{k.cpc > 0 ? `$${k.cpc.toFixed(2)}` : '—'}</td>
                          <td style={{ padding: cellPadding.compact, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{k.traffic_pct > 0 ? `${k.traffic_pct.toFixed(2)}%` : '—'}</td>
                          <td style={{ padding: cellPadding.compact, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k.url ?? ''}>
                            {k.url ? (
                              <a href={k.url} target="_blank" rel="noreferrer" style={{ color: colors.brand.secondary, textDecoration: 'none' }}>{k.url}</a>
                            ) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </ChartContainer>
      </div>
    </div>
  );
}
