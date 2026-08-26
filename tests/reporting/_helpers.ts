// Shared test builders. Keeps each rule spec focused on the rule under test
// rather than repeating fixture construction.

import type { Comparison, Metrics, NormalisedPeriod, Entity, ClientConfig } from '@/lib/reporting';
import { DEFAULT_THRESHOLDS } from '@/lib/reporting';

export const TEST_CONFIG: ClientConfig = {
  currency:   'AUD',
  locale:     'en-AU',
  thresholds: DEFAULT_THRESHOLDS,
};

export function nullMetrics(): Metrics {
  return {
    spend: null, impressions: null, clicks: null, conversions: null,
    ctr: null, cpc: null, cpm: null, cpa: null,
    conversion_rate: null, conversion_value: null,
    custom: {},
  };
}

export function metrics(partial: Partial<Metrics>): Metrics {
  const base = nullMetrics();
  return { ...base, ...partial, custom: { ...base.custom, ...(partial.custom ?? {}) } };
}

export function entity(id: string, name: string, m: Partial<Metrics>, grain = 'campaign'): Entity {
  return { id, name, grain, metrics: metrics(m) };
}

export function period(opts: {
  id?: string; label?: string; from?: string; to?: string;
  channel?: { id: string; display: string };
  metrics: Partial<Metrics>;
  entities?: Entity[];
  conversion_definition?: string;
}): NormalisedPeriod {
  return {
    period: {
      id:    opts.id    ?? '2026-07',
      label: opts.label ?? 'July 2026',
      from:  opts.from  ?? '2026-07-01',
      to:    opts.to    ?? '2026-07-31',
    },
    channel: opts.channel ?? { id: 'meta', display: 'Meta Ads' },
    metrics: metrics(opts.metrics),
    entities: opts.entities ?? [],
    conversion_definition: opts.conversion_definition ?? 'test conversion definition',
  };
}

export function compare(current: NormalisedPeriod, prior: NormalisedPeriod | null): Comparison {
  return { current, prior, yoy: null, baseline: null, config: TEST_CONFIG };
}
