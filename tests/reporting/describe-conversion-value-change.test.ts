import { describe, it, expect } from 'vitest';
import { describeConversionValueChange } from '@/lib/reporting';
import { compare, period } from './_helpers';

describe('describeConversionValueChange', () => {
  it('happy: material MoM movement fires', () => {
    const cur = period({ metrics: { conversion_value: 15000 } });
    const pri = period({ id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30', metrics: { conversion_value: 10000 } });
    const out = describeConversionValueChange.fire(compare(cur, pri));
    expect(out).toHaveLength(1);
    expect(out[0].text).toMatch(/Conversion value moved from \$10,000 to \$15,000/);
  });

  it('null prior: precondition fails', () => {
    const cur = period({ metrics: { conversion_value: 100 } });
    expect(describeConversionValueChange.precondition(compare(cur, null)).ok).toBe(false);
  });

  it('zero-crossing prior=0: fires with "up from zero"', () => {
    const cur = period({ metrics: { conversion_value: 5000 } });
    const pri = period({ id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30', metrics: { conversion_value: 0 } });
    const out = describeConversionValueChange.fire(compare(cur, pri));
    expect(out[0].text).toMatch(/up from zero/);
  });
});
