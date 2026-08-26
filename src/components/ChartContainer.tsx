import type { ReactNode } from 'react';
import { colors, typography, borderRadius, spacing } from '../tokens';

interface ChartContainerProps {
  title:    string;
  children: ReactNode;
}

export function ChartContainer({ title, children }: ChartContainerProps) {
  return (
    <div
      style={{
        border: `2px solid ${colors.ui.black}`,
        borderRadius: borderRadius.md,
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <div
        style={{
          backgroundColor: colors.ui.black,
          padding: `${spacing.sm} ${spacing.md}`,
        }}
      >
        <span
          style={{
            color: colors.text.inverse,
            fontWeight: typography.fontWeight.semibold,
            fontSize: typography.fontSize.base,
            display: 'block',
            textAlign: 'center',
          }}
        >
          {title}
        </span>
      </div>
      <div
        style={{
          padding: spacing.md,
          backgroundColor: colors.background.card,
        }}
      >
        {children}
      </div>
    </div>
  );
}
