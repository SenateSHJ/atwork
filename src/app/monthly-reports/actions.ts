'use server';

// Server actions for the Monthly Reports page. Fetches the current + prior
// NormalisedPeriod for each channel via the atWork adapters and hands them
// to the reporting library's compose() for deterministic prose. The library
// owns all rule logic; this file owns only the fetch orchestration and the
// binding of the atWork ClientConfig.

import { fetchAtWorkMetaPeriod }    from './adapters/meta';
import { fetchAtWorkGadsPeriod }    from './adapters/gads';
import { fetchAtWorkWebsitePeriod } from './adapters/website';
import { ATWORK_CONFIG, atworkMonthLabel, priorMonth } from './adapters/config';
import { buildHistory, computeComparisonStats } from './adapters/helpers';
import { compose, SPINE_RULES, type NormalisedPeriod } from '@/lib/reporting';

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
  const [
    metaCur, metaPri, metaHist,
    gadsCur, gadsPri, gadsHist,
    webCur,  webPri,  webHist,
  ] = await Promise.all([
    fetchAtWorkMetaPeriod(month),    fetchAtWorkMetaPeriod(prior),    buildHistory(fetchAtWorkMetaPeriod,    month),
    fetchAtWorkGadsPeriod(month),    fetchAtWorkGadsPeriod(prior),    buildHistory(fetchAtWorkGadsPeriod,    month),
    fetchAtWorkWebsitePeriod(month), fetchAtWorkWebsitePeriod(prior), buildHistory(fetchAtWorkWebsitePeriod, month),
  ]);

  return {
    month,
    monthLabel: atworkMonthLabel(month),
    prior,
    priorLabel: atworkMonthLabel(prior),
    meta:    composeSection(metaCur, metaPri, metaHist, 'Meta Ads'),
    gads:    composeSection(gadsCur, gadsPri, gadsHist, 'Google Ads'),
    website: composeSection(webCur,  webPri,  webHist,  'Website'),
  };
}

function composeSection(
  current: NormalisedPeriod | null,
  prior:   NormalisedPeriod | null,
  history: NormalisedPeriod[],
  label:   string,
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
  return compose(
    { current, prior, yoy: null, baseline: null, history, stats, config: ATWORK_CONFIG },
    SPINE_RULES,
    label,
  );
}
