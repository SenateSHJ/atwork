'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, Cell,
} from 'recharts';
import { colors, typography } from '../../tokens';

interface AgencyRow {
  agency_name: string;
  value:       number | null;
}

interface ByAgencyBarChartProps {
  data:               AgencyRow[];
  benchmark?:         number | null;
  regionalBenchmark?: number | null;
  lowerIsBetter?:     boolean;
  formatter?:         (v: number) => string;
  hideLabels?:        boolean;
  quarterLabel?:      string;
}

const defaultFmt = (v: number) => `$${v.toFixed(2)}`;

const GLOBAL_COLOR   = colors.status.error;
const REGIONAL_COLOR = '#000000';

export function ByAgencyBarChart({
  data,
  benchmark,
  regionalBenchmark,
  lowerIsBetter = true,
  formatter = defaultFmt,
  hideLabels = false,
  quarterLabel,
}: ByAgencyBarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{ width: '100%' }}>
        {quarterLabel && (
          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, textAlign: 'center' }}>
            {quarterLabel}
          </p>
        )}
        <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.text.secondary, fontSize: typography.fontSize.sm }}>
          No data
        </div>
      </div>
    );
  }

  const sorted = [...data]
    .filter(d => d.value != null)
    .sort((a, b) => lowerIsBetter
      ? (a.value ?? Infinity) - (b.value ?? Infinity)
      : (b.value ?? -Infinity) - (a.value ?? -Infinity)
    );

  const isGood = (v: number | null): boolean => {
    if (v == null || benchmark == null) return true;
    return lowerIsBetter ? v <= benchmark : v >= benchmark;
  };

  return (
    <div style={{ width: '100%' }}>
      {quarterLabel && (
        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, textAlign: 'center' }}>
          {quarterLabel}
        </p>
      )}
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sorted} margin={{ top: 8, right: 8, bottom: hideLabels ? 8 : 48, left: 8 }}>
            <XAxis
              dataKey="agency_name"
              tick={hideLabels ? false : { fontSize: 10, fill: colors.text.secondary }}
              angle={hideLabels ? 0 : -35}
              textAnchor="end"
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 10, fill: colors.text.secondary }}
              tickFormatter={formatter}
              width={60}
              domain={[
                0,
                (dataMax: number) => {
                  const ceiling = Math.max(dataMax, benchmark ?? 0, regionalBenchmark ?? 0);
                  return Math.ceil(ceiling * 1.15);
                },
              ]}
            />
            <Tooltip
              formatter={(v: unknown) => [formatter(v as number), 'Value']}
              contentStyle={{ fontSize: typography.fontSize.xs }}
            />
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {sorted.map((entry) => (
                <Cell
                  key={entry.agency_name}
                  fill={isGood(entry.value) ? colors.status.success : colors.status.error}
                />
              ))}
            </Bar>
            {benchmark != null && (
              <ReferenceLine
                y={benchmark}
                stroke={GLOBAL_COLOR}
                strokeWidth={2}
                strokeDasharray="4 2"
              />
            )}
            {regionalBenchmark != null && (
              <ReferenceLine
                y={regionalBenchmark}
                stroke={REGIONAL_COLOR}
                strokeWidth={2}
                strokeDasharray="4 2"
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {regionalBenchmark != null && (
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 6 }}>
          {benchmark != null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: colors.text.secondary }}>
              <svg width="22" height="10" style={{ flexShrink: 0 }}>
                <line x1="0" y1="5" x2="22" y2="5" stroke={GLOBAL_COLOR} strokeWidth="2" strokeDasharray="4 2" />
              </svg>
              Global
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: colors.text.secondary }}>
            <svg width="22" height="10" style={{ flexShrink: 0 }}>
              <line x1="0" y1="5" x2="22" y2="5" stroke={REGIONAL_COLOR} strokeWidth="2" strokeDasharray="4 2" />
            </svg>
            Regional
          </span>
        </div>
      )}
    </div>
  );
}
