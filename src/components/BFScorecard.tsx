'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { colors, typography, borderRadius } from '../tokens';

interface BFScorecardProps {
  title:         string;
  value:         string;
  sparklineData?: number[];
  color?:        'blue' | 'grey';
  size?:         'small' | 'normal';
}

export function BFScorecard({
  title,
  value,
  sparklineData,
  color,
  size = 'normal',
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
        {value.startsWith('$') ? (
          <span
            style={{
              color: 'rgba(255,255,255,0.8)',
              fontSize: size === 'small' ? '0.6rem' : '0.7rem',
              textAlign: 'center',
              display: 'block',
            }}
          >
            AUD
          </span>
        ) : (
          <div style={{ height: size === 'small' ? '0.8rem' : '1rem' }} />
        )}
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
