// Locale + currency aware formatters. All numbers rendered into prose route
// through these so a leaf never sees a raw float. No em/en dashes anywhere.

import type { Locale } from '../contract/types';

export interface Formatters {
  fmtInt:      (v: number | null | undefined) => string;
  fmtMoney:    (v: number | null | undefined) => string;
  fmtPct:      (v: number | null | undefined) => string;
  fmtDuration: (secs: number | null | undefined) => string;
  fmtDelta:    (pct: number | null | undefined) => string;
}

const currencySymbol: Record<string, string> = {
  AUD: '$', USD: '$', GBP: '£', EUR: '€',
};

export function createFormatters(locale: Locale, currency: string): Formatters {
  const sym = currencySymbol[currency] ?? currency + ' ';
  return {
    fmtInt: v => {
      if (v == null || !Number.isFinite(v)) return '0';
      return Math.round(v).toLocaleString(locale);
    },
    fmtMoney: v => {
      if (v == null || !Number.isFinite(v)) return sym + '0';
      if (v < 10) return sym + v.toFixed(2);
      return sym + Math.round(v).toLocaleString(locale);
    },
    fmtPct: v => {
      if (v == null || !Number.isFinite(v)) return '0.00%';
      return v.toFixed(2) + '%';
    },
    fmtDuration: secs => {
      if (secs == null || !Number.isFinite(secs) || secs <= 0) return '0s';
      if (secs < 60) return `${Math.round(secs)}s`;
      const m = Math.floor(secs / 60);
      const s = Math.round(secs % 60);
      return s === 0 ? `${m}m` : `${m}m ${s}s`;
    },
    fmtDelta: pct => {
      if (pct == null) return 'unchanged';
      if (!Number.isFinite(pct)) return pct > 0 ? 'up from zero' : 'down to zero';
      if (Math.abs(pct) < 0.5) return 'roughly flat';
      return `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(0)}%`;
    },
  };
}

export function pctChange(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null) return null;
  if (prior === 0 && current === 0) return null;
  if (prior === 0) return current > 0 ? Infinity : -Infinity;
  return ((current - prior) / prior) * 100;
}
