import { describe, it, expect } from 'vitest';
import { describeEngagementQualityChange } from '@/lib/reporting';
import { compare, period } from './_helpers';

describe('describeEngagementQualityChange', () => {
  it('happy: material bounce + engagement + avg time all fire', () => {
    const cur = period({
      channel: { id: 'website', display: 'Website' },
      metrics: { custom: { bounce_rate: 45, engagement_rate: 65, avg_engagement_time_secs: 90 } },
    });
    const pri = period({
      id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30',
      channel: { id: 'website', display: 'Website' },
      metrics: { custom: { bounce_rate: 55, engagement_rate: 50, avg_engagement_time_secs: 60 } },
    });
    const out = describeEngagementQualityChange.fire(compare(cur, pri));
    const texts = out.map(s => s.text).join(' ');
    expect(texts).toMatch(/Bounce rate moved from 55\.00% to 45\.00%/);
    expect(texts).toMatch(/Engagement rate moved from 50\.00% to 65\.00%/);
    expect(texts).toMatch(/Average engagement time moved from 1m to 1m 30s/);
  });

  it('null prior: precondition fails', () => {
    const cur = period({ metrics: { custom: { bounce_rate: 45 } } });
    expect(describeEngagementQualityChange.precondition(compare(cur, null)).ok).toBe(false);
  });

  it('zero-crossing on engagement rate: fires with "up from zero"', () => {
    const cur = period({
      channel: { id: 'website', display: 'Website' },
      metrics: { custom: { engagement_rate: 40 } },
    });
    const pri = period({
      id: '2026-06', label: 'June 2026', from: '2026-06-01', to: '2026-06-30',
      channel: { id: 'website', display: 'Website' },
      metrics: { custom: { engagement_rate: 0 } },
    });
    const out = describeEngagementQualityChange.fire(compare(cur, pri));
    expect(out[0].text).toMatch(/Engagement rate.*up from zero/);
  });
});
