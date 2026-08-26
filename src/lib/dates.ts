import { format, subDays } from 'date-fns';

export type DateRange = { from: string; to: string };

export function defaultRange(days = 29): DateRange {
  const to = new Date();
  const from = subDays(to, days);
  return { from: format(from, 'yyyy-MM-dd'), to: format(to, 'yyyy-MM-dd') };
}

export function rangeFromSearchParams(
  sp: Record<string, string | string[] | undefined>,
  days = 29,
): DateRange {
  const from = typeof sp.from === 'string' ? sp.from : undefined;
  const to   = typeof sp.to   === 'string' ? sp.to   : undefined;
  if (from && to) return { from, to };
  return defaultRange(days);
}
