import { describe, it, expect } from 'vitest';
import { describeStabilityFloor } from '@/lib/reporting';
import { compare, period } from './_helpers';

describe('describeStabilityFloor', () => {
  it('happy: always fires with anchor numbers', () => {
    const cur = period({ metrics: { spend: 12345, impressions: 100000, clicks: 500, conversions: 15, ctr: 0.5 } });
    const pri = period({ id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30', metrics: { spend: 12000 } });
    const c = compare(cur, pri);
    expect(describeStabilityFloor.precondition(c).ok).toBe(true);
    const out = describeStabilityFloor.fire(c);
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe('headline');
    expect(out[0].text).toContain('Meta Ads in July 2026');
    expect(out[0].text).toContain('spend of $12,345');
  });

  it('null prior: still fires (headline doesn\'t depend on prior)', () => {
    const cur = period({ metrics: { spend: 100 } });
    const c = compare(cur, null);
    expect(describeStabilityFloor.precondition(c).ok).toBe(true);
    const out = describeStabilityFloor.fire(c);
    expect(out).toHaveLength(1);
  });

  it('zero-crossing: fires with "no recorded activity" when all metrics zero', () => {
    const cur = period({ metrics: { spend: 0, impressions: 0, clicks: 0, conversions: 0 } });
    const c = compare(cur, null);
    const out = describeStabilityFloor.fire(c);
    expect(out[0].text).toContain('no recorded activity');
  });
});
