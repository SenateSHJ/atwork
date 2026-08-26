// Shared helpers for computing PeriodStats and ComparisonStats from raw
// atWork data. Kept in the atWork adapters folder rather than in the library
// so the library remains client-agnostic.

import type {
  ComparisonStats,
  DailyPoint,
  Entity,
  NormalisedPeriod,
  PeriodStats,
} from '@/lib/reporting';

export function computePeriodStats(entities: Entity[], daily: DailyPoint[]): PeriodStats {
  const spendValues       = entities.map(e => e.metrics.spend       ?? 0);
  const conversionValues  = entities.map(e => e.metrics.conversions ?? 0);

  return {
    dispersion:    {
      spend:       coefficientOfVariation(spendValues),
      conversions: coefficientOfVariation(conversionValues),
    },
    concentration: concentrationFromValues(spendValues, entities),
    tail_share:    tailShareTop3Top5(spendValues),
    outlier_days:  computeOutlierDays(daily, ['conversions', 'spend', 'lead_events']),
  };
}

export function computeComparisonStats(entities: Entity[], totalSpend: number | null, totalConversions: number | null): ComparisonStats {
  const withSpend = entities.filter(e => (e.metrics.spend ?? 0) > 0);
  const _withConversions = entities.filter(e => (e.metrics.conversions ?? 0) > 0);

  const cpaValues = withSpend
    .filter(e => (e.metrics.conversions ?? 0) > 0)
    .map(e => (e.metrics.spend ?? 0) / (e.metrics.conversions ?? 1));
  const conversionRateValues = withSpend
    .filter(e => (e.metrics.clicks ?? 0) > 0)
    .map(e => ((e.metrics.conversions ?? 0) / (e.metrics.clicks ?? 1)) * 100);
  const ctrValues = withSpend
    .filter(e => (e.metrics.impressions ?? 0) > 0)
    .map(e => ((e.metrics.clicks ?? 0) / (e.metrics.impressions ?? 1)) * 100);

  return {
    account_avg_cpa:             cpaValues.length          > 0 ? avg(cpaValues)             : null,
    account_avg_conversion_rate: conversionRateValues.length > 0 ? avg(conversionRateValues) : null,
    account_avg_ctr:             ctrValues.length          > 0 ? avg(ctrValues)             : null,
    account_total_spend:         totalSpend,
    account_total_conversions:   totalConversions,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────

function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

function concentrationFromValues(values: number[], entities: Entity[]): { top_share: number; top_id: string } {
  const positive = values.filter(v => v > 0);
  const total    = positive.reduce((s, v) => s + v, 0);
  if (total === 0) return { top_share: 0, top_id: '' };
  const sorted = entities
    .map((e, i) => ({ id: e.id, value: values[i] ?? 0 }))
    .filter(x => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const top = sorted[0];
  if (!top) return { top_share: 0, top_id: '' };
  return { top_share: top.value / total, top_id: top.id };
}

function tailShareTop3Top5(values: number[]): { top3_share: number; top5_share: number; tail_count: number } {
  const positive = values.filter(v => v > 0);
  const total    = positive.reduce((s, v) => s + v, 0);
  if (total === 0) return { top3_share: 0, top5_share: 0, tail_count: 0 };
  const sorted = [...positive].sort((a, b) => b - a);
  const top3   = sorted.slice(0, 3).reduce((s, v) => s + v, 0);
  const top5   = sorted.slice(0, 5).reduce((s, v) => s + v, 0);
  return { top3_share: top3 / total, top5_share: top5 / total, tail_count: positive.length };
}

function computeOutlierDays(daily: DailyPoint[], metrics: string[]): Array<{ date: string; metric: string; share: number }> {
  const results: Array<{ date: string; metric: string; share: number }> = [];
  for (const metric of metrics) {
    const total = daily.reduce((s, d) => {
      const v = (d.metrics as unknown as Record<string, number | null | undefined>)[metric];
      return s + Number(v ?? 0);
    }, 0);
    if (total <= 0) continue;
    for (const d of daily) {
      const v = Number((d.metrics as unknown as Record<string, number | null | undefined>)[metric] ?? 0);
      if (v <= 0) continue;
      const share = v / total;
      if (share >= 0.25) results.push({ date: d.date, metric, share });
    }
  }
  return results.sort((a, b) => b.share - a.share);
}

function avg(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Build a 4-period NormalisedPeriod history array (current plus prior 3).
 * Feeds Tier 3 charts and F-category trend rules. Any period that returns
 * null from the fetch is skipped; consumers should tolerate short arrays.
 */
export async function buildHistory(
  fetchFn:      (month: string) => Promise<NormalisedPeriod | null>,
  currentMonth: string,
  count:        number = 4,
): Promise<NormalisedPeriod[]> {
  const months: string[] = [];
  let m = currentMonth;
  for (let i = 0; i < count; i++) {
    months.push(m);
    m = priorMonthOf(m);
  }
  const periods = await Promise.all(months.map(fetchFn));
  return periods.filter((p): p is NormalisedPeriod => p !== null).reverse();
}

function priorMonthOf(month: string): string {
  const [y, mm] = month.split('-').map(Number);
  const d = new Date(y!, mm! - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
