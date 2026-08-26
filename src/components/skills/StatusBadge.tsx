/**
 * StatusBadge
 *
 * Pill badge with a fixed palette of semantic variants. Replaces the
 * inline `<span class="bg-color-900/40 text-color-400 border-color-700 …">`
 * pattern that recurs across the security/billing/usage/health pages.
 *
 *   <StatusBadge variant="success">Paid</StatusBadge>
 *   <StatusBadge variant="danger">Failed</StatusBadge>
 *
 * Variants are intentionally limited — if a page needs a colour outside
 * this set, that's a signal it shouldn't be a status badge.
 */
import type { ReactNode } from 'react';

export type StatusBadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const VARIANT_CLASSES: Record<StatusBadgeVariant, string> = {
  success: 'bg-green-900/40 text-green-400 border-green-700',
  warning: 'bg-yellow-900/40 text-yellow-400 border-yellow-700',
  danger:  'bg-red-900/40 text-red-400 border-red-700',
  info:    'bg-blue-900/40 text-blue-400 border-blue-700',
  neutral: 'bg-gray-800 text-gray-400 border-gray-700',
};

export interface StatusBadgeProps {
  children:   ReactNode;
  variant?:   StatusBadgeVariant;
  className?: string;
}

export function StatusBadge({ children, variant = 'neutral', className }: StatusBadgeProps) {
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium border ${VARIANT_CLASSES[variant]} ${className ?? ''}`}>
      {children}
    </span>
  );
}
