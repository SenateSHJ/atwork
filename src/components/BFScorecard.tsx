'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { colors, typography, borderRadius, shadow } from '../tokens';

interface BFScorecardProps {
  title:         string;
  value:         string;
  sparklineData?: number[];
  color?:        'blue' | 'grey';
  size?:         'small' | 'normal';
  // Period-over-period delta rendered as "▲ 12.3%" between value and
  // sparkline. `pct` null = no baseline to compare against (prior = 0).
  // `goodDirection` picks the semantic color: matching direction → green,
  // opposite → red, null → neutral (used for metrics like Spend where
  // direction of change isn't inherently good or bad).
  delta?: {
    pct:           number | null;
    goodDirection: 'up' | 'down' | null;
  };
}

export function BFScorecard({
  title,
  value,
  sparklineData,
  color,
  size = 'normal',
  delta,
}: BFScorecardProps) {
  const bg    = color === 'blue' ? colors.ui.teal : color === 'grey' ? '#6B7280' : colors.ui.black;
  const w     = size === 'small' ? 160 : 220;
  const h     = size === 'small' ? 160 : 200;
  const tsz   = size === 'small' ? typography.fontSize.xs  : typography.fontSize.sm;
  const vsz   = size === 'small' ? '1.3rem' : '1.6rem';
  const csz   = size === 'small' ? 40 : 60;

  const chartData = useMemo(() => {
    if (!sparklineData || sparklineData.length === 0) return [];
    return sparklineData.map((v, i) => ({ i, v: typeof v === 'number' && !isNaN(v) ? v : 0 }));
  }, [sparklineData]);

  const showChart = chartData.length > 0;

  return (
    <div
      style={{
        backgroundColor: bg,
        border: `2px solid ${colors.ui.black}`,
        borderRadius: borderRadius.md,
        boxShadow: shadow.md,
        padding: size === 'small' ? '12px' : '16px',
        width: w,
        height: h,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
        <span
          style={{
            color: colors.text.inverse,
            fontWeight: typography.fontWeight.medium,
            fontSize: tsz,
            textAlign: 'center',
            display: 'block',
            marginBottom: 4,
          }}
        >
          {title}
        </span>
        <span
          style={{
            color: colors.text.inverse,
            fontWeight: typography.fontWeight.bold,
            fontSize: vsz,
            textAlign: 'center',
            display: 'block',
            lineHeight: 1.2,
            marginBottom: 2,
          }}
        >
          {value}
        </span>
        {(() => {
          // Delta line — takes the AUD slot's vertical space so card
          // rhythm stays consistent whether or not a delta is present.
          const fs = size === 'small' ? '0.65rem' : '0.75rem';
          if (!delta || delta.pct == null) {
            return <div style={{ height: size === 'small' ? '0.8rem' : '1rem' }} />;
          }
          const p = delta.pct;
          const arrow = p > 0 ? '▲' : p < 0 ? '▼' : '●';
          const abs   = Math.abs(p).toFixed(1);
          let color = 'rgba(255,255,255,0.75)';
          if (delta.goodDirection && p !== 0) {
            const isGood = (delta.goodDirection === 'up' && p > 0) || (delta.goodDirection === 'down' && p < 0);
            color = isGood ? '#86efac' : '#fca5a5';
          }
          return (
            <span style={{ color, fontSize: fs, fontWeight: typography.fontWeight.semibold, textAlign: 'center', display: 'block', fontVariantNumeric: 'tabular-nums' }}>
              {arrow} {abs}%
            </span>
          );
        })()}
      </div>

      {sparklineData ? (
        <div style={{ height: csz, width: '100%' }}>
          {showChart ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#ffffff"
                  fill="rgba(255,255,255,0.4)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div
              style={{
                textAlign: 'center',
                color: 'rgba(255,255,255,0.5)',
                fontSize: typography.fontSize.xs,
                paddingTop: 8,
              }}
            >
              No data
            </div>
          )}
        </div>
      ) : (
        <div style={{ height: csz, width: '100%' }} />
      )}
    </div>
  );
}
