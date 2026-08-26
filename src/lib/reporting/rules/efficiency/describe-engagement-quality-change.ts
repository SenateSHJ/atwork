// Rule: describeEngagementQualityChange
// Category: efficiency
// Reads website-style engagement metrics from metrics.custom under three
// declared keys: bounce_rate, engagement_rate, avg_engagement_time_secs.
// A channel that has none of these keys (e.g. paid) produces no lines.

import type { RuleSpec, Sentence } from '../../contract/types';
import { createFormatters, pctChange } from '../../config/formatters';
import { OK, missing, rank, requirePrior } from '../_rank';

const ID = 'describeEngagementQualityChange';

// Keys this rule reads from metrics.custom. Documented so adapters know
// what to emit; missing keys simply produce no line.
const KEYS = {
  bounce:     'bounce_rate',
  engagement: 'engagement_rate',
  avgTime:    'avg_engagement_time_secs',
} as const;

export const describeEngagementQualityChange: RuleSpec = {
  id:       ID,
  category: 'efficiency',
  precondition: c => {
    const pre = requirePrior(c);
    if (!pre.ok) return pre;
    const cCustom = c.current.metrics.custom;
    const pCustom = c.prior!.metrics.custom;
    const hasAny =
      (cCustom[KEYS.bounce]     != null && pCustom[KEYS.bounce]     != null) ||
      (cCustom[KEYS.engagement] != null && pCustom[KEYS.engagement] != null) ||
      (cCustom[KEYS.avgTime]    != null && pCustom[KEYS.avgTime]    != null);
    return hasAny ? OK : missing('metric_null');
  },
  fire: c => {
    const fmt = createFormatters(c.config.locale, c.config.currency);
    const cap = c.config.thresholds.materialityCap;
    const materialPct = c.config.thresholds.materialPct;
    const out: Sentence[] = [];
    const cCustom = c.current.metrics.custom;
    const pCustom = c.prior!.metrics.custom;

    const cBounce = cCustom[KEYS.bounce];
    const pBounce = pCustom[KEYS.bounce];
    if (cBounce != null && pBounce != null) {
      const pct = pctChange(cBounce, pBounce);
      if (pct != null && (!Number.isFinite(pct) || Math.abs(pct) >= materialPct)) {
        out.push({
          text:        `Bounce rate moved from ${fmt.fmtPct(pBounce)} to ${fmt.fmtPct(cBounce)} (${fmt.fmtDelta(pct)}).`,
          category:    'efficiency',
          materiality: rank(pct, cap) + 5,
          entity_id:   null,
          basis:       'mom',
        });
      }
    }

    const cEng = cCustom[KEYS.engagement];
    const pEng = pCustom[KEYS.engagement];
    if (cEng != null && pEng != null) {
      const pct = pctChange(cEng, pEng);
      if (pct != null && (!Number.isFinite(pct) || Math.abs(pct) >= materialPct)) {
        out.push({
          text:        `Engagement rate moved from ${fmt.fmtPct(pEng)} to ${fmt.fmtPct(cEng)} (${fmt.fmtDelta(pct)}).`,
          category:    'efficiency',
          materiality: rank(pct, cap),
          entity_id:   null,
          basis:       'mom',
        });
      }
    }

    const cAvg = cCustom[KEYS.avgTime];
    const pAvg = pCustom[KEYS.avgTime];
    if (cAvg != null && pAvg != null) {
      const pct = pctChange(cAvg, pAvg);
      if (pct != null && (!Number.isFinite(pct) || Math.abs(pct) >= materialPct)) {
        out.push({
          text:        `Average engagement time moved from ${fmt.fmtDuration(pAvg)} to ${fmt.fmtDuration(cAvg)} (${fmt.fmtDelta(pct)}).`,
          category:    'efficiency',
          materiality: rank(pct, cap),
          entity_id:   null,
          basis:       'mom',
        });
      }
    }

    return out;
  },
};
