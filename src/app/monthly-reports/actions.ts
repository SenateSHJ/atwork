'use server';

// Server actions for the Monthly Reports page. Fetches the current + prior
// NormalisedPeriod for each channel via the atWork adapters and hands them
// to the reporting library's compose() for deterministic prose. The library
// owns all rule logic; this file owns only the fetch orchestration and the
// binding of the atWork ClientConfig.

import { fetchAtWorkMetaPeriod }    from './adapters/meta';
import { fetchAtWorkGadsPeriod }    from './adapters/gads';
import { fetchAtWorkWebsitePeriod } from './adapters/website';
import { atworkMonthLabel, priorMonth } from './adapters/config';
import { loadConfig } from '@prism/executive-summaries';
import type { ClientConfig } from '@prism/executive-summaries';
import { supabaseServer } from '@/lib/supabase/server';
import { buildHistory, computeComparisonStats } from './adapters/helpers';

const CLIENT_SLUG = 'atwork';
import {
  compose,
  DERIVED_RULES,
  type NormalisedPeriod,
  // Every describe*/flag* rule PRISM ships. Assembled locally rather
  // than pulled through the SPINE_RULES aggregate: rule firing is
  // arbitrated at engine time by config_rule + the K-rule dependency
  // gates, and passing a hand-curated subset bypasses those gates.
  // If PRISM adds a rule, add it to ATWORK_RULES below.
  describeAnchor,
  describeOutcomeDefinition,
  describeGrowthComposition,
  describeGrowthCompositionWeb,
  describeOutcomeDecomposition,
  describeOutcomeDecompositionWeb,
  describeSustainedTrend,
  describeTrendBreak,
  describeStatisticallySignificantRateChange,
  flagSampleSizeInsufficient,
  flagDataCliff,
  describeAnchorDeltas,
  describeAnchorWeb,
  describeAnchorDeltasWeb,
  describePagesPerSession,
  describeSpendDecomposition,
  describeSeasonalNormalcy,
  describeSeasonalDeviation,
  describeAcceleration,
  describeDeceleration,
  describeLatestStepSurge,
  describeTrendReturnedToPriorLevel,
  describeOutlierDay,
  describeSpendPulse,
  flagAttributionWindowChangedBetweenPeriods,
  flagAttributionWindowSuspectedDrift,
} from '@prism/executive-summaries';

const ATWORK_RULES = [
  describeAnchor,
  describeOutcomeDefinition,
  describeGrowthComposition,
  describeGrowthCompositionWeb,
  describeOutcomeDecomposition,
  describeOutcomeDecompositionWeb,
  describeSustainedTrend,
  describeTrendBreak,
  describeStatisticallySignificantRateChange,
  flagSampleSizeInsufficient,
  flagDataCliff,
  describeAnchorDeltas,
  describeAnchorWeb,
  describeAnchorDeltasWeb,
  describePagesPerSession,
  describeSpendDecomposition,
  describeSeasonalNormalcy,
  describeSeasonalDeviation,
  describeAcceleration,
  describeDeceleration,
  describeLatestStepSurge,
  describeTrendReturnedToPriorLevel,
  describeOutlierDay,
  describeSpendPulse,
  flagAttributionWindowChangedBetweenPeriods,
  flagAttributionWindowSuspectedDrift,
];

export interface SectionReport {
  paragraphs:    string[];
  basisSubtitle: string;
}

export interface MonthlyReport {
  month:      string;
  monthLabel: string;
  prior:      string;
  priorLabel: string;
  meta:      SectionReport;
  gads:      SectionReport;
  website:   SectionReport;
}

export async function getDefaultMonth(): Promise<string> {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function getAvailableMonths(): Promise<string[]> {
  const now = new Date();
  const out: string[] = [];
  for (let i = 1; i <= 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

// Fetches all three channels current + prior in parallel, plus 4-period
// history for Tier 3 charts and F-category rules, then composes each
// section's prose with the spine ruleset.
export async function fetchMonthlyReport(month: string): Promise<MonthlyReport> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`fetchMonthlyReport: month must be YYYY-MM, got "${month}"`);
  }
  const prior = priorMonth(month);
  // loadConfig hits reporting.* and hydrates the ClientConfig at request
  // time. No static ATWORK_CONFIG fallback here; if the seed has not run,
  // loadConfig throws and the error surfaces as an empty section rather
  // than a silent render against defaults.
  const [
    config,
    metaCur, metaPri, metaHist,
    gadsCur, gadsPri, gadsHist,
    webCur,  webPri,  webHist,
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loadConfig({ supabase: supabaseServer() as unknown as any, clientSlug: CLIENT_SLUG }),
    fetchAtWorkMetaPeriod(month),    fetchAtWorkMetaPeriod(prior),    buildHistory(fetchAtWorkMetaPeriod,    month),
    fetchAtWorkGadsPeriod(month),    fetchAtWorkGadsPeriod(prior),    buildHistory(fetchAtWorkGadsPeriod,    month),
    fetchAtWorkWebsitePeriod(month), fetchAtWorkWebsitePeriod(prior), buildHistory(fetchAtWorkWebsitePeriod, month),
  ]);

  return {
    month,
    monthLabel: atworkMonthLabel(month),
    prior,
    priorLabel: atworkMonthLabel(prior),
    meta:    composeSection(metaCur, metaPri, metaHist, 'Meta Ads',   config),
    gads:    composeSection(gadsCur, gadsPri, gadsHist, 'Google Ads', config),
    website: composeSection(webCur,  webPri,  webHist,  'Website',    config),
  };
}

function composeSection(
  current: NormalisedPeriod | null,
  prior:   NormalisedPeriod | null,
  history: NormalisedPeriod[],
  label:   string,
  config:  ClientConfig,
): SectionReport {
  if (!current) {
    return {
      paragraphs:    [`No ${label} data available for the selected month.`],
      basisSubtitle: '',
    };
  }
  const stats = computeComparisonStats(
    current.entities,
    current.metrics.spend,
    current.metrics.conversions,
  );
  const output = compose({
    comparison: { current, prior, yoy: null, baseline: null, history, stats, config, change_events: [] },
    rules:      ATWORK_RULES,
    derived:    DERIVED_RULES,
    section:    label,
  });
  return {
    paragraphs:    output.section_report.paragraphs.map(p => p.text),
    basisSubtitle: output.section_report.basis_subtitle,
  };
}
