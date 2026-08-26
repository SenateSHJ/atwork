// Rule: describeVolumeChange
// Category: volume
// Fires per volume metric (impressions, clicks) when MoM pct >= materialPct
// or on zero-crossing. Skips any metric that is null in either period so a
// channel that doesn't report a metric produces no line for it.

import type { RuleSpec, Sentence } from '../../contract/types';
import { createFormatters, pctChange } from '../../config/formatters';
import { rank, requirePrior } from '../_rank';

const ID = 'describeVolumeChange';

export const describeVolumeChange: RuleSpec = {
  id:           ID,
  category:     'volume',
  precondition: c => requirePrior(c),
  fire: c => {
    const { fmtDelta, fmtInt } = createFormatters(c.config.locale, c.config.currency);
    const cap = c.config.thresholds.materialityCap;
    const materialPct = c.config.thresholds.materialPct;
    const out: Sentence[] = [];
    const metrics: Array<[string, number | null, number | null]> = [
      ['Impressions', c.current.metrics.impressions, c.prior!.metrics.impressions],
      ['Clicks',      c.current.metrics.clicks,      c.prior!.metrics.clicks],
    ];
    for (const [label, cur, pri] of metrics) {
      if (cur == null || pri == null) continue;
      const pct = pctChange(cur, pri);
      if (pct == null) continue;
      const material = !Number.isFinite(pct) || Math.abs(pct) >= materialPct;
      if (!material) continue;
      out.push({
        text:        `${label} moved from ${fmtInt(pri)} to ${fmtInt(cur)} (${fmtDelta(pct)}).`,
        category:    'volume',
        materiality: rank(pct, cap),
        entity_id:   null,
        basis:       'mom',
      });
    }
    return out;
  },
};
