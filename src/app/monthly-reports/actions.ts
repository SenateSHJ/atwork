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
  describeAnchorDirectionalCoherence,
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
  describeAnchorDirectionalCoherence,
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

export type SectionStateKind = 'normal' | 'partial' | 'suppressed';
export type Direction        = 'up' | 'down' | 'flat' | 'neutral';
export type ParagraphCategory = string;   // A/B/C/D/E/F/G/H/J/K per PRISM's Category union

export interface SectionSuppressionReason {
  sourceRuleId: string;
  category:     string;
  note:         string;
}

export interface ChipTile          { label: string; materiality: number; direction: Direction; }
export interface ScorecardTile     { metricId: string; label: string; value: string; deltaPct: number | null; deltaDir: Direction; }
export interface TrendPoint        { periodId: string; label: string; value: number | null; }
export interface DriverRow         { driver: string; contribution: number; direction: Direction; entityName?: string; lifecycle?: 'continuing' | 'new' | 'stopped'; role?: string; shareOfAbsolute?: number; }
export interface ParagraphItem     { category: ParagraphCategory; slot: string; text: string; emittingRules: string[]; }
export interface RecommendationRow { signal: string; actionTitle: string; rationale: string; }
export interface FlagRow           { situation: string; question: string; pairedSignals: string[]; }
export interface EvidenceTopEntity { entityId: string; name: string; spend: number | null; conversions: number | null; cpa: number | null; }
export interface EvidenceSummary   { topEntities: EvidenceTopEntity[]; dailyPoints: number; references: Record<string, number>; }

export interface SectionReport {
  basisSubtitle:   string;
  verdict:         string | null;
  chips:           ChipTile[];
  scorecard:       ScorecardTile[];
  trends:          { volume: TrendPoint[]; outcome: TrendPoint[] };
  decomposition:   DriverRow[];
  paragraphs:      ParagraphItem[];
  recommendations: RecommendationRow[];
  flags:           FlagRow[];
  evidence:        EvidenceSummary;
  /**
   * Section state per PRISM's ADR 0043. Page reads state.kind to switch
   * between full render, partial-suppression banner, and minimal shell.
   * state.reasons is empty when kind === 'normal'.
   */
  state:           { kind: SectionStateKind; reasons: SectionSuppressionReason[] };
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
    meta:    composeSection(metaCur, metaPri, metaHist, 'Meta Ads',   config, month, prior),
    gads:    composeSection(gadsCur, gadsPri, gadsHist, 'Google Ads', config, month, prior),
    website: composeSection(webCur,  webPri,  webHist,  'Website',    config, month, prior),
  };
}

function emptySection(basis: string): SectionReport {
  return {
    basisSubtitle:   basis,
    verdict:         null,
    chips:           [],
    scorecard:       [],
    trends:          { volume: [], outcome: [] },
    decomposition:   [],
    paragraphs:      [],
    recommendations: [],
    flags:           [],
    evidence:        { topEntities: [], dailyPoints: 0, references: {} },
    state:           { kind: 'normal', reasons: [] },
  };
}

function composeSection(
  current: NormalisedPeriod | null,
  prior:   NormalisedPeriod | null,
  history: NormalisedPeriod[],
  label:   string,
  config:  ClientConfig,
  month:   string,
  priorMonthId: string,
): SectionReport {
  if (!current) {
    // Empty-data section still names the period it covers. PRISM's
    // basisSubtitle formatter runs from a Comparison and can't fire when
    // current is null, so we reproduce the "Reporting on X compared to Y."
    // shape here from the month labels. Anything else (verdict, chips,
    // paragraphs, evidence) stays empty because there is nothing to say
    // beyond "no data for this period".
    const basis = `Reporting on ${atworkMonthLabel(month)} compared to ${atworkMonthLabel(priorMonthId)}.`;
    return {
      ...emptySection(basis),
      paragraphs: [{ category: 'A', slot: 'anchor', text: `No ${label} data available for the selected month.`, emittingRules: [] }],
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
  const sr = output.section_report;
  return {
    basisSubtitle: sr.basis_subtitle,
    verdict:       sr.verdict,
    chips: sr.chips.map(c => ({
      label:       c.label,
      materiality: c.materiality,
      direction:   c.direction as Direction,
    })),
    scorecard: sr.scorecard.map(t => ({
      metricId: t.metric_id,
      label:    t.label,
      value:    t.value,
      deltaPct: t.delta_pct,
      deltaDir: t.delta_dir as Direction,
    })),
    trends: {
      volume:  sr.trends.volume.map(p => ({ periodId: p.period_id, label: p.label, value: p.value })),
      outcome: sr.trends.outcome.map(p => ({ periodId: p.period_id, label: p.label, value: p.value })),
    },
    decomposition: sr.decomposition.map(d => ({
      driver:          d.driver,
      contribution:    d.contribution,
      direction:       d.direction as Direction,
      entityName:      d.entity_name,
      lifecycle:       d.lifecycle,
      role:            d.role,
      shareOfAbsolute: d.share_of_absolute,
    })),
    paragraphs: sr.paragraphs.map(p => ({ category: p.category, slot: p.slot, text: p.text, emittingRules: p.emitting_rules })),
    recommendations: sr.recommendations.map(r => ({
      signal:      r.signal,
      actionTitle: r.action_title,
      rationale:   r.rationale,
    })),
    flags: sr.flags.map(f => ({
      situation:     f.situation,
      question:      f.question,
      pairedSignals: f.paired_signals,
    })),
    evidence: {
      topEntities: sr.evidence.top_entities.slice(0, 5).map(e => ({
        entityId:    e.entity_id,
        name:        e.name,
        spend:       e.metrics.spend       ?? null,
        conversions: e.metrics.conversions ?? null,
        cpa:         e.metrics.cpa         ?? null,
      })),
      dailyPoints: sr.evidence.daily.length,
      references:  sr.evidence.references,
    },
    state: {
      kind:    sr.state.kind,
      reasons: sr.state.reasons.map(r => ({
        sourceRuleId: r.source_rule_id,
        category:     r.category,
        note:         r.note,
      })),
    },
  };
}
