'use client';

import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { colors, typography } from '../../tokens';

interface TrendRow {
  date:        string;
  cpl_blended: number | null;
  cpl_meta:    number | null;
  cpl_website: number | null;
  ctr:         number | null;
  cpc:         number | null;
  cpm:         number | null;
}

export interface MetricSeries {
  key:      string;
  label:    string;
  color:    string;
  // Optional axis binding for dual-axis charts. Omit → single-axis mode.
  yAxisId?: 'left' | 'right';
}

export type YUnit = 'currency' | 'percent' | 'number';

interface MetricTrendsChartProps {
  data:        TrendRow[];
  series?:     readonly MetricSeries[];
  // Single-axis mode: applies to the sole y-axis.
  yUnit?:      YUnit;
  // Dual-axis mode: set both when any series carries `yAxisId`.
  leftYUnit?:  YUnit;
  rightYUnit?: YUnit;
}

// Round the y-axis top up to a clean step (e.g. 430 → 500, 34 → 40, 6.3 → 7)
// so the tick labels land on whole numbers. Recharts still picks the intermediate
// ticks — this just widens the ceiling. Prevents floating-point junk like
// 343.20000000000005 leaking into the top tick.
function niceMax(dataMax: number): number {
  if (!Number.isFinite(dataMax) || dataMax <= 0) return 1;
  const padded = dataMax * 1.1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(padded)));
  const step =
    padded / magnitude <= 1 ? 0.1 :
    padded / magnitude <= 2 ? 0.2 :
    padded / magnitude <= 5 ? 0.5 : 1;
  return Math.ceil(padded / (step * magnitude)) * (step * magnitude);
}

function fmtY(v: number, unit: YUnit): string {
  if (unit === 'currency') return v >= 1 ? `$${Math.round(v).toLocaleString()}` : `$${v.toFixed(2)}`;
  if (unit === 'percent')  return `${v.toFixed(v >= 10 ? 0 : 1)}%`;
  // Number: round + comma-separate for readability. k/M shorthand at scale.
  // Rounding kills the `343.20000000000005` floating-point artifact that
  // otherwise slips through to the tick label.
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000)    return `${Math.round(v / 1000)}k`;
  return Math.round(v).toLocaleString();
}

function fmtTooltip(v: number, unit: YUnit): string {
  if (unit === 'currency') return `$${v.toFixed(2)}`;
  if (unit === 'percent')  return `${v.toFixed(2)}%`;
  return v.toLocaleString();
}

const DEFAULT_SERIES: readonly MetricSeries[] = [
  { key: 'cpl_blended', label: 'CPL - Blended', color: colors.chart[0] },
  { key: 'cpl_meta',    label: 'CPL - Meta',    color: colors.chart[1] },
  { key: 'cpl_website', label: 'CPL - Landing Page', color: colors.chart[2] },
  { key: 'ctr',         label: 'CTR',           color: colors.chart[3] },
  { key: 'cpc',         label: 'CPC',           color: colors.chart[4] },
  { key: 'cpm',         label: 'CPM',           color: colors.chartDark[0] },
];

export function MetricTrendsChart({
  data, series = DEFAULT_SERIES, yUnit = 'number',
  leftYUnit, rightYUnit,
}: MetricTrendsChartProps) {
  const SERIES = series;
  if (!data || data.length === 0) {
    return (
      <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.text.secondary, fontSize: typography.fontSize.sm }}>
        No data
      </div>
    );
  }
  const dualAxis = SERIES.some(s => s.yAxisId);
  const leftUnit  = leftYUnit  ?? yUnit;
  const rightUnit = rightYUnit ?? yUnit;
  const unitForSeries = (s: MetricSeries): YUnit =>
    dualAxis ? (s.yAxisId === 'right' ? rightUnit : leftUnit) : yUnit;

  return (
    <div style={{ height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border.default} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: colors.text.secondary }}
            tickFormatter={d => format(parseISO(d), 'MMMM-d')}
            interval={Math.max(0, Math.ceil(data.length / 12) - 1)}
          />
          {dualAxis && (
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: colors.text.secondary }}
              domain={[0, (dataMax: number) => niceMax(dataMax)]}
              tickFormatter={v => fmtY(v, leftUnit)}
            />
          )}
          {dualAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: colors.text.secondary }}
              domain={[0, (dataMax: number) => niceMax(dataMax)]}
              tickFormatter={v => fmtY(v, rightUnit)}
            />
          )}
          {!dualAxis && (
            <YAxis
              tick={{ fontSize: 10, fill: colors.text.secondary }}
              domain={[0, (dataMax: number) => niceMax(dataMax)]}
              tickFormatter={v => fmtY(v, yUnit)}
            />
          )}
          <Tooltip
            labelFormatter={l => format(parseISO(String(l)), 'MMMM d, yyyy')}
            formatter={(v: unknown, name: unknown) => {
              const s = SERIES.find(x => x.label === name);
              return [fmtTooltip(v as number, s ? unitForSeries(s) : yUnit), name as string];
            }}
            contentStyle={{ fontSize: typography.fontSize.xs }}
          />
          <Legend wrapperStyle={{ fontSize: typography.fontSize.xs }} />
          {SERIES.map(s => (
            <Line
              key={s.key}
              {...(dualAxis ? { yAxisId: s.yAxisId ?? 'left' } : {})}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
