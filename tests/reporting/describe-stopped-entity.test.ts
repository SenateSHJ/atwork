import { describe, it, expect } from 'vitest';
import { describeStoppedEntity } from '@/lib/reporting';
import { compare, period, entity } from './_helpers';

describe('describeStoppedEntity', () => {
  it('happy: one entity stopped, single-line sentence', () => {
    const cur = period({
      metrics: { spend: 3000 },
      entities: [entity('c1', 'Still Live', { spend: 3000 })],
    });
    const pri = period({
      id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30',
      metrics: { spend: 5000 },
      entities: [
        entity('c1', 'Still Live', { spend: 3000 }),
        entity('c2', 'Old Promo',  { spend: 2000 }),
      ],
    });
    const out = describeStoppedEntity.fire(compare(cur, pri));
    expect(out).toHaveLength(1);
    expect(out[0].text).toContain('Old Promo stopped in July 2026');
    expect(out[0].entity_id).toBe('c2');
  });

  it('null prior: precondition fails', () => {
    const cur = period({ metrics: {}, entities: [entity('a', 'A', { spend: 100 })] });
    expect(describeStoppedEntity.precondition(compare(cur, null)).ok).toBe(false);
  });

  it('zero-crossing (entity had spend prior, zero now): treated as stopped', () => {
    const cur = period({
      metrics: { spend: 0 },
      entities: [entity('x', 'X', { spend: 0 })],
    });
    const pri = period({
      id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30',
      metrics: { spend: 100 },
      entities: [entity('x', 'X', { spend: 100 })],
    });
    const out = describeStoppedEntity.fire(compare(cur, pri));
    expect(out).toHaveLength(1);
    expect(out[0].text).toMatch(/X stopped in July 2026/);
  });
});
