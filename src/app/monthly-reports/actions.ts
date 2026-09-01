'use server';

// Server actions for the Monthly Reports page.
//
// Meta / Google Ads / Website use PRISM's canonical silver adapters via
// `assembleComparison` (one call per channel returns a full Comparison
// including current + prior + 3-month history + change_events). atWork's
// silver views were verified against PRISM's contracts at
// contracts/silver/*.sql on 2026-09-01; every column PRISM's adapter
// reads is present with the correct type. Bespoke shim adapters
// (previously at src/app/monthly-reports/adapters/{meta,gads,website}.ts)
// were deleted in the same commit that landed this file's rewrite.
//
// LinkedIn keeps the bespoke shim at
// src/app/monthly-reports/adapters/linkedin.ts per the ownership rule
// in CLAUDE.md ("atWork owns LinkedIn"). It uses the old
// current/prior/history flow that composeSection knows how to handle.

import { fetchAtWorkLinkedinPeriod } from './adapters/linkedin';
import { atworkMonthLabel, priorMonth } from './adapters/config';
import { supabaseServer } from '@/lib/supabase/server';
import { buildHistory, computeComparisonStats } from './adapters/helpers';
import { makeAtWorkConfig, ATWORK_META_CONVERSION_COLUMN } from '@/config/atwork';
import { assembleComparison } from '@prism/executive-summaries';
import type { ClientConfig, Comparison, SilverSupabaseClient } from '@prism/executive-summaries';

const CLIENT_SLUG = 'atwork';
import {
  compose,
  DERIVED_RULES,
  type NormalisedPeriod,
  // Every describe*/flag* rule PRISM ships that has an authored wording
  // template AND emits signals reachable from atWork's data. Rule
  // firing is arbitrated at engine time by config_rule + K-rule
  // dependency gates and per-rule sample gates. Rules that would
  // silent-skip on Meta's thin lead volume (10 leads/month) simply
  // silent-skip; nothing bad happens.
  //
  // Rule additions 2026-09-01:
  //   T1 web:   describeSourceMixShift, describeLandingPageDistribution,
  //             describeDeviceMixShift, describeBrowserAnomaly,
  //             describeConversionRateTrend, describeLeadEventComposition,
  //             describeT1CombinedRecommendations,
  //             flagPaidSocialDataOutOfScope,
  //             flagLifecycleTaggingSuspicion.
  //   T2/T8 Meta: describeAudienceSaturation, describeCreativeFatigue,
  //               describeLaunchCohortGroupSummary,
  //               describeRankedPerformersByChangeOnPrior,
  //               describeRankedPerformersByEfficiency,
  //               describeSpendConcentrationVsRank.
  //   T3 Google Ads: describeMatchTypeShift, describeCampaignAttribution,
  //                  describeCampaignImprovementConflatesCull,
  //                  describeDeviceParity, describeDevicePaidRateRegression,
  //                  describeImpressionShare,
  //                  describeQualityScoreComponentMovement,
  //                  describeSearchTermConcentration,
  //                  describeTrendWithStepChange, describeTrendWithLatestSurge,
  //                  recommendBudgetFromImpressionShare,
  //                  recommendCompetitorReview,
  //                  recommendLandingPageFromWeakestQS,
  //                  hedgeRecencyAndIntervention.
  //   Small-account rec: recommendInvestigateMaterialRateMove (derived).
  describeAnchor,
  describeOutcomeDefinition,
  describeCampaignGoalCompletions,
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
  // T1 web
  describeSourceMixShift,
  describeLandingPageDistribution,
  describeDeviceMixShift,
  describeBrowserAnomaly,
  describeConversionRateTrend,
  describeLeadEventComposition,
  describeT1CombinedRecommendations,
  flagPaidSocialDataOutOfScope,
  flagLifecycleTaggingSuspicion,
  // T2/T8 Meta
  describeAudienceSaturation,
  describeCreativeFatigue,
  describeLaunchCohortGroupSummary,
  describeRankedPerformersByChangeOnPrior,
  describeRankedPerformersByEfficiency,
  describeSpendConcentrationVsRank,
  // T3 Google Ads
  describeMatchTypeShift,
  describeCampaignAttribution,
  describeCampaignImprovementConflatesCull,
  describeDeviceParity,
  describeDevicePaidRateRegression,
  describeImpressionShare,
  describeQualityScoreComponentMovement,
  describeSearchTermConcentration,
  describeTrendWithStepChange,
  describeTrendWithLatestSurge,
  recommendBudgetFromImpressionShare,
  recommendCompetitorReview,
  recommendLandingPageFromWeakestQS,
  hedgeRecencyAndIntervention,
  // Paid section recommendation (2026-09-01). Fires when spend fell
  // >=5% and CPA rose >=10% on the aggregate; independent of G1 and
  // of below-campaign attribution. Sits alongside
  // recommendInvestigateMaterialRateMove as the small-account paid
  // recommendation family.
  recommendInvestigateEfficiencyLoss,
} from '@prism/executive-summaries';

const ATWORK_RULES = [
  describeAnchor,
  describeOutcomeDefinition,
  describeCampaignGoalCompletions,
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
  // T1 web batch
  describeSourceMixShift,
  describeLandingPageDistribution,
  describeDeviceMixShift,
  describeBrowserAnomaly,
  describeConversionRateTrend,
  describeLeadEventComposition,
  describeT1CombinedRecommendations,
  flagPaidSocialDataOutOfScope,
  flagLifecycleTaggingSuspicion,
  // T2 + T8 Meta batch
  describeAudienceSaturation,
  describeCreativeFatigue,
  describeLaunchCohortGroupSummary,
  describeRankedPerformersByChangeOnPrior,
  describeRankedPerformersByEfficiency,
  describeSpendConcentrationVsRank,
  // T3 Google Ads batch
  describeMatchTypeShift,
  describeCampaignAttribution,
  describeCampaignImprovementConflatesCull,
  describeDeviceParity,
  describeDevicePaidRateRegression,
  describeImpressionShare,
  describeQualityScoreComponentMovement,
  describeSearchTermConcentration,
  describeTrendWithStepChange,
  describeTrendWithLatestSurge,
  recommendBudgetFromImpressionShare,
  recommendCompetitorReview,
  recommendLandingPageFromWeakestQS,
  hedgeRecencyAndIntervention,
  // Paid recommendation family (2026-09-01).
  recommendInvestigateEfficiencyLoss,
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
  linkedin:  SectionReport;
}

export async function getDefaultMonth(): Promise<string> {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function getAvailableMonths(): Promise<string[]> {
  const now = new Date();
  const out: string[] = [];
  // Include the current (in-progress) month. Prior version started at
  // i=1 (last complete month) which meant the dropdown didn't list the
  // current month even when the URL param ?month= selected it —
  // "Monthly Report — August 2026" title over "Month: July 2026"
  // dropdown label was the visible symptom. i=0 fixes the mismatch and
  // is consistent with the URL param loosening from d7e1166.
  for (let i = 0; i <= 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

// Fetches all four channels' Comparison objects in parallel, then
// composes each section's prose with the spine ruleset. Meta / Google
// Ads / Website flow through PRISM's assembleComparison (canonical
// silver adapter) since atWork's silver views match PRISM contracts.
// LinkedIn stays on the bespoke shim adapter per the ownership rule.
//
// Config: makeAtWorkConfig() from src/config/atwork.ts is the source
// of truth. Static rather than loadConfig() from reporting.*_config —
// the seeded row set is a duplicate of what the code declares, and
// bypassing loadConfig makes atWork's report render deterministically
// against the checked-in config rather than whatever last happened to
// be written to Supabase.
export async function fetchMonthlyReport(month: string): Promise<MonthlyReport> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`fetchMonthlyReport: month must be YYYY-MM, got "${month}"`);
  }
  const prior  = priorMonth(month);
  const config = makeAtWorkConfig();
  const client = supabaseServer() as unknown as SilverSupabaseClient;

  const [metaCmp, gadsCmp, webCmp, liCmp] = await Promise.all([
    assembleComparison({
      client, channelId: 'meta', currentMonth: month, config,
      clientSlug: CLIENT_SLUG,
      metaConversionColumn: ATWORK_META_CONVERSION_COLUMN,
    }),
    assembleComparison({
      client, channelId: 'google-ads', currentMonth: month, config,
      clientSlug: CLIENT_SLUG,
    }),
    assembleComparison({
      client, channelId: 'web', currentMonth: month, config,
      clientSlug: CLIENT_SLUG,
    }),
    buildLinkedInComparison(month, prior, config),
  ]);

  return {
    month,
    monthLabel: atworkMonthLabel(month),
    prior,
    priorLabel: atworkMonthLabel(prior),
    meta:     composeSection(metaCmp, 'Meta Ads',   month, prior),
    gads:     composeSection(gadsCmp, 'Google Ads', month, prior),
    website:  composeSection(webCmp,  'Website',    month, prior),
    linkedin: composeSection(liCmp,   'LinkedIn',   month, prior),
  };
}

// LinkedIn keeps the bespoke shim adapter. Its fetch returns
// NormalisedPeriod | null; we assemble the Comparison here from
// current + prior + history + computed stats, mirroring what
// assembleComparison does internally for the other channels.
// change_events kept empty per atWork's LinkedIn shim convention
// (change_event table not populated for LinkedIn).
async function buildLinkedInComparison(
  month:  string,
  prior:  string,
  config: ClientConfig,
): Promise<Comparison | null> {
  const [current, priorPeriod, history] = await Promise.all([
    fetchAtWorkLinkedinPeriod(month),
    fetchAtWorkLinkedinPeriod(prior),
    buildHistory(fetchAtWorkLinkedinPeriod, month),
  ]);
  if (!current) return null;
  const stats = computeComparisonStats(
    current.entities,
    current.metrics.spend,
    current.metrics.conversions,
  );
  return {
    current, prior: priorPeriod, yoy: null, baseline: null,
    history, stats, config, change_events: [],
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
  comparison:   Comparison | null,
  label:        string,
  month:        string,
  priorMonthId: string,
): SectionReport {
  if (!comparison || !comparison.current) {
    // Empty-data section still names the period it covers. PRISM's
    // basisSubtitle formatter runs from a Comparison and can't fire
    // when current is null, so we reproduce the "Reporting on X
    // compared to Y." shape from the month labels. Anything else
    // stays empty because there is nothing to say beyond "no data".
    const basis = `Reporting on ${atworkMonthLabel(month)} compared to ${atworkMonthLabel(priorMonthId)}.`;
    return {
      ...emptySection(basis),
      paragraphs: [{ category: 'A', slot: 'anchor', text: `No ${label} data available for the selected month.`, emittingRules: [] }],
    };
  }
  const output = compose({
    comparison,
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
