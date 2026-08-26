import { describe, it, expect } from 'vitest';
import { describeSpendChange } from '@/lib/reporting';
import { compare, period } from './_helpers';

describe('describeSpendChange', () => {
  it('happy: material MoM movement fires with amount, prior, delta', () => {
    const cur = period({ metrics: { spend: 15000 } });
    const pri = period({ id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30', metrics: { spend: 10000 } });
    const c = compare(cur, pri);
    expect(describeSpendChange.precondition(c).ok).toBe(true);
    const out = describeSpendChange.fire(c);
    expect(out).toHaveLength(1);
    expect(out[0].text).toMatch(/Meta Ads spend in July 2026 was \$15,000/);
    expect(out[0].text).toMatch(/up 50%/);
    expect(out[0].text).toMatch(/from \$10,000 in June 2026/);
    expect(out[0].basis).toBe('mom');
    expect(out[0].category).toBe('volume');
  });

  it('null prior: precondition fails (compose skips fire)', () => {
    const cur = period({ metrics: { spend: 15000 } });
    const c = compare(cur, null);
    const pre = describeSpendChange.precondition(c);
    expect(pre.ok).toBe(false);
    if (!pre.ok) expect(pre.reason).toBe('basis_missing');
  });

  it('zero-crossing: fires with "up from zero" when prior spend was 0', () => {
    const cur = period({ metrics: { spend: 1000 } });
    const pri = period({ id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30', metrics: { spend: 0 } });
    const c = compare(cur, pri);
    const out = describeSpendChange.fire(c);
    expect(out).toHaveLength(1);
    expect(out[0].text).toMatch(/up from zero/);
  });
});
