import { describe, it, expect } from 'vitest';
import { describeTopEntityConcentration } from '@/lib/reporting';
import { compare, period, entity } from './_helpers';

describe('describeTopEntityConcentration', () => {
  it('happy: top entity holds >50% of spend, fires with share + amounts', () => {
    const cur = period({
      metrics: { spend: 10000 },
      entities: [
        entity('c1', 'Prospecting AU', { spend: 7000 }),
        entity('c2', 'Retargeting',     { spend: 2000 }),
        entity('c3', 'Awareness',       { spend: 1000 }),
      ],
    });
    const c = compare(cur, null);
    const out = describeTopEntityConcentration.fire(c);
    expect(out).toHaveLength(1);
    expect(out[0].text).toMatch(/Prospecting AU accounted for 70% of Meta Ads spend/);
    expect(out[0].entity_id).toBe('c1');
  });

  it('null prior: rule works without prior (concentration is a within-period shape)', () => {
    const cur = period({
      metrics: { spend: 1000 },
      entities: [
        entity('a', 'Only', { spend: 800 }),
        entity('b', 'Tiny', { spend: 200 }),
      ],
    });
    const out = describeTopEntityConcentration.fire(compare(cur, null));
    expect(out).toHaveLength(1);
  });

  it('zero-crossing: no spend + no conversions in entities = no sentence', () => {
    const cur = period({
      metrics: { spend: 0 },
      entities: [entity('a', 'A', {}), entity('b', 'B', {})],
    });
    const out = describeTopEntityConcentration.fire(compare(cur, null));
    expect(out).toHaveLength(0);
  });
});
