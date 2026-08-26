/**
 * StatCard
 *
 * Top-of-page metric tile used across the internal dashboard pages:
 * label (optionally with an icon) + a prominent value + optional subtext.
 *
 * Supports a loading skeleton so callers don't have to manually swap a
 * pulse-animation in place of the value.
 *
 *   <StatCard icon={<Users />} label="Active Studios" value={123} />
 *   <StatCard label="Total Credits" value={formatCurrency(amount)}
 *             valueClassName="text-blue-400" subtext="Applied credits" />
 *   <StatCard label="…" value={n} loading={isFetching} />
 */
import type { ReactNode } from 'react';

export interface StatCardProps {
  label:           string;
  value:           ReactNode;
  icon?:           ReactNode;
  subtext?:        string;
  valueClassName?: string;
  size?:           'md' | 'lg';
  loading?:        boolean;
}

export function StatCard({
  label, value, icon, subtext, valueClassName, size = 'md', loading = false,
}: StatCardProps) {
  const valueSize = size === 'lg' ? 'text-3xl' : 'text-2xl';
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
        {icon}
        {label}
      </div>
      {loading
        ? <div className={`h-9 w-20 bg-gray-800 rounded animate-pulse`} />
        : <p className={`${valueSize} font-bold ${valueClassName ?? 'text-white'}`}>{value}</p>}
      {subtext && <p className="text-xs text-gray-600 mt-1">{subtext}</p>}
    </div>
  );
}
