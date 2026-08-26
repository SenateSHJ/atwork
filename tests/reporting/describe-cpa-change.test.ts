import { describe, it, expect } from 'vitest';
import { describeCpaChange } from '@/lib/reporting';
import { compare, period } from './_helpers';

describe('describeCpaChange', () => {
  it('happy: material MoM movement fires', () => {
    const cur = period({ metrics: { cpa: 50 } });
    const pri = period({ id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30', metrics: { cpa: 40 } });
    const out = describeCpaChange.fire(compare(cur, pri));
    expect(out).toHaveLength(1);
    expect(out[0].text).toMatch(/Cost per conversion moved from \$40 to \$50/);
  });

  it('null prior: precondition fails', () => {
    const cur = period({ metrics: { cpa: 50 } });
    expect(describeCpaChange.precondition(compare(cur, null)).ok).toBe(false);
  });

  it('zero-crossing prior=null: precondition fails (CPA undefined when no conversions)', () => {
    const cur = period({ metrics: { cpa: 20 } });
    const pri = period({ id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30', metrics: { cpa: null } });
    expect(describeCpaChange.precondition(compare(cur, pri)).ok).toBe(false);
  });
});
