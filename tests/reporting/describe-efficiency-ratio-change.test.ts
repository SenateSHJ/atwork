import { describe, it, expect } from 'vitest';
import { describeEfficiencyRatioChange } from '@/lib/reporting';
import { compare, period } from './_helpers';

describe('describeEfficiencyRatioChange', () => {
  it('happy: material movement on CTR + CPC fires', () => {
    const cur = period({ metrics: { ctr: 5, cpc: 2, cpm: 10 } });
    const pri = period({ id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30', metrics: { ctr: 4, cpc: 1, cpm: 9.5 } });
    const out = describeEfficiencyRatioChange.fire(compare(cur, pri));
    // CTR +25% material, CPC +100% material, CPM ~+5% not material
    const texts = out.map(s => s.text).join(' ');
    expect(texts).toMatch(/CTR moved from 4\.00% to 5\.00%/);
    expect(texts).toMatch(/CPC moved from \$1\.00 to \$2\.00/);
    expect(texts).not.toMatch(/CPM/);
  });

  it('null prior: precondition fails', () => {
    const cur = period({ metrics: { ctr: 5 } });
    expect(describeEfficiencyRatioChange.precondition(compare(cur, null)).ok).toBe(false);
  });

  it('zero-crossing on CTR: fires with "up from zero"', () => {
    const cur = period({ metrics: { ctr: 2 } });
    const pri = period({ id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30', metrics: { ctr: 0 } });
    const out = describeEfficiencyRatioChange.fire(compare(cur, pri));
    expect(out[0].text).toMatch(/CTR.*up from zero/);
  });
});
