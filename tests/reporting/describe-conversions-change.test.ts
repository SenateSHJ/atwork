import { describe, it, expect } from 'vitest';
import { describeConversionsChange } from '@/lib/reporting';
import { compare, period } from './_helpers';

describe('describeConversionsChange', () => {
  it('happy: material MoM movement fires', () => {
    const cur = period({ metrics: { conversions: 30 } });
    const pri = period({ id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30', metrics: { conversions: 20 } });
    const out = describeConversionsChange.fire(compare(cur, pri));
    expect(out).toHaveLength(1);
    expect(out[0].text).toMatch(/Conversions moved from 20 to 30/);
    expect(out[0].text).toMatch(/up 50%/);
  });

  it('null prior: precondition fails', () => {
    const cur = period({ metrics: { conversions: 10 } });
    expect(describeConversionsChange.precondition(compare(cur, null)).ok).toBe(false);
  });

  it('zero-crossing prior=0, current=15: fires with "began registering"', () => {
    const cur = period({ metrics: { conversions: 15 } });
    const pri = period({ id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30', metrics: { conversions: 0 } });
    const out = describeConversionsChange.fire(compare(cur, pri));
    expect(out[0].text).toMatch(/began registering/);
    expect(out[0].materiality).toBe(100);
  });
});
