import { describe, it, expect } from 'vitest';
import { describeVolumeChange } from '@/lib/reporting';
import { compare, period } from './_helpers';

describe('describeVolumeChange', () => {
  it('happy: impressions + clicks both material fire two sentences', () => {
    const cur = period({ metrics: { impressions: 200000, clicks: 4000 } });
    const pri = period({ id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30', metrics: { impressions: 100000, clicks: 2000 } });
    const out = describeVolumeChange.fire(compare(cur, pri));
    expect(out).toHaveLength(2);
    expect(out[0].text).toMatch(/Impressions moved from 100,000 to 200,000/);
    expect(out[1].text).toMatch(/Clicks moved from 2,000 to 4,000/);
  });

  it('null prior: precondition fails, no fire', () => {
    const cur = period({ metrics: { impressions: 100 } });
    expect(describeVolumeChange.precondition(compare(cur, null)).ok).toBe(false);
  });

  it('zero-crossing on clicks: fires with "up from zero"', () => {
    const cur = period({ metrics: { impressions: 100, clicks: 50 } });
    const pri = period({ id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30', metrics: { impressions: 100, clicks: 0 } });
    const out = describeVolumeChange.fire(compare(cur, pri));
    // Impressions unchanged so no line; clicks zero-crossing fires.
    expect(out).toHaveLength(1);
    expect(out[0].text).toMatch(/Clicks.*up from zero/);
  });
});
