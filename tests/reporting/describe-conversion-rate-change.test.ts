import { describe, it, expect } from 'vitest';
import { describeConversionRateChange } from '@/lib/reporting';
import { compare, period } from './_helpers';

describe('describeConversionRateChange', () => {
  it('happy: material MoM movement fires', () => {
    const cur = period({ metrics: { conversion_rate: 3 } });
    const pri = period({ id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30', metrics: { conversion_rate: 2 } });
    const out = describeConversionRateChange.fire(compare(cur, pri));
    expect(out).toHaveLength(1);
    expect(out[0].text).toMatch(/Conversion rate moved from 2\.00% to 3\.00%/);
  });

  it('null prior: precondition fails', () => {
    const cur = period({ metrics: { conversion_rate: 3 } });
    expect(describeConversionRateChange.precondition(compare(cur, null)).ok).toBe(false);
  });

  it('zero-crossing prior=0, current=2: fires with "up from zero"', () => {
    const cur = period({ metrics: { conversion_rate: 2 } });
    const pri = period({ id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30', metrics: { conversion_rate: 0 } });
    const out = describeConversionRateChange.fire(compare(cur, pri));
    expect(out[0].text).toMatch(/up from zero/);
  });
});
