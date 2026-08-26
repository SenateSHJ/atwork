// Universal reporting contract. Applies to any client, any channel.
// Client-specific field mapping lives in the per-project adapters layer,
// not here. This file must never import a atWork-specific symbol.
//
// NOTE: this file previously re-exported ten types from
// @prism/executive-summaries via a file: dependency. That was reverted
// because Vercel's builder cannot resolve a sibling-directory path. The
// types below duplicate the library's contract for the v1 spine's lifetime;
// a proper distribution method for the library is being decided (see the
// S1 Item 1 reply).

export type Category =
  | 'headline'
  | 'volume'
  | 'efficiency'
  | 'conversion'
  | 'concentration'
  | 'lifecycle';

export type Locale = 'en-AU' | 'en-GB' | 'en-US';

export type BasisRef = 'mom' | 'yoy' | 'baseline' | 'none';

export interface PeriodRef {
  id:    string; // "2026-07"
  label: string; // "July 2026"
  from:  string; // "2026-07-01"
  to:    string; // "2026-07-31"
}

export interface ChannelRef {
  id:      string; // "meta" | "gads" | "website"
  display: string; // "Meta Ads" | "Google Ads" | "Website"
}

export interface Metrics {
  spend:            number | null;
  impressions:      number | null;
  clicks:           number | null;
  conversions:      number | null;
  ctr:              number | null;
  cpc:              number | null;
  cpm:              number | null;
  cpa:              number | null;
  conversion_rate:  number | null;
  conversion_value: number | null;
  custom:           Record<string, number | null>;
}

export interface Entity {
  id:      string;
  name:    string;
  grain:   string;
  metrics: Metrics;
}

export interface DailyPoint {
  date:    string;
  metrics: Partial<Metrics>;
}

export interface PeriodStats {
  dispersion:    { spend: number; conversions: number };
  concentration: { top_share: number; top_id: string };
  tail_share:    { top3_share: number; top5_share: number; tail_count: number };
  outlier_days:  Array<{ date: string; metric: string; share: number }>;
}

export interface ComparisonStats {
  account_avg_cpa:             number | null;
  account_avg_conversion_rate: number | null;
  account_avg_ctr:             number | null;
  account_total_spend:         number | null;
  account_total_conversions:   number | null;
}

export interface NormalisedPeriod {
  period:                PeriodRef;
  channel:               ChannelRef;
  metrics:               Metrics;
  entities:              Entity[];
  daily:                 DailyPoint[];
  stats:                 PeriodStats;
  conversion_definition: string;
}

export interface Thresholds {
  materialPct:           number;
  minSampleForBestWorst: number;
  materialityCap:        number;
  baselinePeriods:       number;
}

export interface ClientConfig {
  currency:   string;
  locale:     Locale;
  thresholds: Thresholds;
}

export interface Comparison {
  current:  NormalisedPeriod;
  prior:    NormalisedPeriod | null;
  yoy:      NormalisedPeriod | null;
  baseline: NormalisedPeriod[] | null;
  history:  NormalisedPeriod[] | null;
  stats:    ComparisonStats;
  config:   ClientConfig;
}

export interface Sentence {
  text:        string;
  category:    Category;
  materiality: number;
  entity_id:   string | null;
  basis:       BasisRef;
}

export type PreconditionResult =
  | { ok: true }
  | { ok: false; reason: 'insufficient_sample' | 'basis_missing' | 'metric_null' | 'filtered_out' };

export interface RuleSpec {
  id:           string;
  category:     Category;
  precondition: (c: Comparison) => PreconditionResult;
  fire:         (c: Comparison) => Sentence[];
}
