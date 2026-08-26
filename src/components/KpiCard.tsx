import { ResponsiveContainer, LineChart, Line, Tooltip } from 'recharts';
import { colors, typography, spacing, borderRadius, shadow } from '../tokens';

interface KpiCardProps {
  label:        string;
  value:        string;
  sparkData?:   number[];
  sparkColor?:  string;
  isNull?:      boolean;
}

export function KpiCard({ label, value, sparkData, sparkColor, isNull }: KpiCardProps) {
  const chartData = sparkData?.map((v, i) => ({ i, v })) ?? [];

  return (
    <div
      style={{
        backgroundColor: colors.background.card,
        border: `1px solid ${colors.border.default}`,
        borderRadius: borderRadius.lg,
        boxShadow: shadow.sm,
        padding: spacing.md,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.xs,
      }}
    >
      <span
        style={{
          fontSize: typography.fontSize.xs,
          fontWeight: typography.fontWeight.medium,
          color: colors.text.secondary,
        }}
      >
        {label}
      </span>

      <span
        style={{
          fontSize: typography.fontSize['2xl'],
          fontWeight: typography.fontWeight.bold,
          color: isNull ? colors.text.disabled : colors.text.primary,
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>

      {chartData.length > 1 && (
        <div style={{ height: '40px', marginTop: spacing.xs }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={sparkColor ?? colors.brand.primary}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Tooltip
                formatter={(v: unknown) => [v as number, label]}
                contentStyle={{ fontSize: typography.fontSize.xs }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
