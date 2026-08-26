'use client';

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { colors, typography } from '../../tokens';

interface DailyRow {
  date:  string;
  leads: number;
}

interface DailyLeadsChartProps {
  data: DailyRow[];
}

export function DailyLeadsChart({ data }: DailyLeadsChartProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.text.secondary, fontSize: typography.fontSize.sm }}>
        No data
      </div>
    );
  }

  return (
    <div style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border.default} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: colors.text.secondary }}
            tickFormatter={d => d.slice(5)}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 10, fill: colors.text.secondary }} />
          <Tooltip
            formatter={(v: unknown) => [v as number, 'Leads']}
            contentStyle={{ fontSize: typography.fontSize.xs }}
          />
          <Line
            type="monotone"
            dataKey="leads"
            stroke={colors.chart[0]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
