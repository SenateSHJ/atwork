// Public entry point for the reporting library. Everything a client project
// needs to compose deterministic prose lives behind these exports; nothing
// else in this directory should be imported directly by application code.

export type {
  BasisRef,
  Category,
  ChannelRef,
  ClientConfig,
  Comparison,
  ComparisonStats,
  DailyPoint,
  Entity,
  Locale,
  Metrics,
  NormalisedPeriod,
  PeriodRef,
  PeriodStats,
  PreconditionResult,
  RuleSpec,
  Sentence,
  Thresholds,
} from './contract/types';

export { compose, type ComposeResult } from './engine/compose';
export { validateComparison, validateNormalisedPeriod } from './engine/validation';
export { DEFAULT_THRESHOLDS } from './config/thresholds';
export { createFormatters, pctChange, type Formatters } from './config/formatters';

// The v1 spine ruleset. 12 rules: headline stability floor, volume (spend +
// impressions/clicks), efficiency (paid ratios + engagement quality), four
// conversion rules, concentration, and two lifecycle rules. Rules deliberately
// omitted from v1 (seasonality, ranking, anomaly) are designed but unbuilt —
// add them here when their fetch paths are wired up.

import type { RuleSpec } from './contract/types';
import { describeStabilityFloor }            from './rules/headline/describe-stability-floor';
import { describeSpendChange }               from './rules/volume/describe-spend-change';
import { describeVolumeChange }              from './rules/volume/describe-volume-change';
import { describeEfficiencyRatioChange }     from './rules/efficiency/describe-efficiency-ratio-change';
import { describeEngagementQualityChange }   from './rules/efficiency/describe-engagement-quality-change';
import { describeConversionsChange }         from './rules/conversion/describe-conversions-change';
import { describeCpaChange }                 from './rules/conversion/describe-cpa-change';
import { describeConversionRateChange }      from './rules/conversion/describe-conversion-rate-change';
import { describeConversionValueChange }     from './rules/conversion/describe-conversion-value-change';
import { describeTopEntityConcentration }    from './rules/concentration/describe-top-entity-concentration';
import { describeNewEntity }                 from './rules/lifecycle/describe-new-entity';
import { describeStoppedEntity }             from './rules/lifecycle/describe-stopped-entity';

export const SPINE_RULES: RuleSpec[] = [
  describeStabilityFloor,
  describeSpendChange,
  describeVolumeChange,
  describeEfficiencyRatioChange,
  describeEngagementQualityChange,
  describeConversionsChange,
  describeCpaChange,
  describeConversionRateChange,
  describeConversionValueChange,
  describeTopEntityConcentration,
  describeNewEntity,
  describeStoppedEntity,
];

// Re-export individual rules so tests + clients can import them by name.
export {
  describeStabilityFloor,
  describeSpendChange,
  describeVolumeChange,
  describeEfficiencyRatioChange,
  describeEngagementQualityChange,
  describeConversionsChange,
  describeCpaChange,
  describeConversionRateChange,
  describeConversionValueChange,
  describeTopEntityConcentration,
  describeNewEntity,
  describeStoppedEntity,
};
