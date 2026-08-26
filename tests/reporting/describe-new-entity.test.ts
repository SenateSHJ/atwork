import { describe, it, expect } from 'vitest';
import { describeNewEntity } from '@/lib/reporting';
import { compare, period, entity } from './_helpers';

describe('describeNewEntity', () => {
  it('happy: one entity started, single-line sentence', () => {
    const cur = period({
      metrics: { spend: 5000 },
      entities: [entity('c1', 'Old', { spend: 3000 }), entity('c2', 'Winter Special', { spend: 2000 })],
    });
    const pri = period({
      id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30',
      metrics: { spend: 3000 },
      entities: [entity('c1', 'Old', { spend: 3000 })],
    });
    const out = describeNewEntity.fire(compare(cur, pri));
    expect(out).toHaveLength(1);
    expect(out[0].text).toContain('Winter Special started in July 2026');
    expect(out[0].text).toContain('no prior activity in June 2026');
    expect(out[0].entity_id).toBe('c2');
  });

  it('null prior: precondition fails', () => {
    const cur = period({ metrics: {}, entities: [entity('a', 'A', { spend: 100 })] });
    expect(describeNewEntity.precondition(compare(cur, null)).ok).toBe(false);
  });

  it('zero-crossing (entity had zero spend prior, positive now): treated as new', () => {
    const cur = period({
      metrics: { spend: 100 },
      entities: [entity('x', 'X', { spend: 100 })],
    });
    const pri = period({
      id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30',
      metrics: { spend: 0 },
      entities: [entity('x', 'X', { spend: 0 })],
    });
    const out = describeNewEntity.fire(compare(cur, pri));
    expect(out).toHaveLength(1);
    expect(out[0].text).toMatch(/X started in July 2026/);
  });
});
