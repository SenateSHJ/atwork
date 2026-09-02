'use server';

import {
  getSemrushOverview,
  getSemrushTopKeywords,
  getSemrushTrend,
  type SemrushOverviewPair,
  type SemrushKeyword,
  type SemrushTrendPoint,
} from '@/lib/queries/semrush';

export type { SemrushOverviewPair, SemrushKeyword, SemrushTrendPoint };

export async function fetchSemrushOverview(from: string, to: string) {
  return getSemrushOverview({ from, to });
}

export async function fetchSemrushTopKeywords(from: string, to: string, limit = 50) {
  return getSemrushTopKeywords({ from, to }, limit);
}

export async function fetchSemrushTrend(from: string, to: string) {
  return getSemrushTrend({ from, to });
}
