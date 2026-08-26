// Rule: describeSpendChange
// Category: volume
// Fires when MoM percentage change in spend is >= materialPct, or prior spend
// was zero and current is positive (zero-crossing). Anchor sentence for the
// paid section — carries a materiality boost so it leads its paragraph.

import type { RuleSpec, Sentence } from '../../contract/types';
import { createFormatters, pctChange } from '../../config/formatters';
import { OK, missing, rank, requirePrior } from '../_rank';

const ID = 'describeSpendChange';

export const describeSpendChange: RuleSpec = {
  id:       ID,
  category: 'volume',
  precondition: c => {
    const pre = requirePrior(c);
    if (!pre.ok) return pre;
    if (c.current.metrics.spend == null || c.prior!.metrics.spend == null) return missing('metric_null');
    return OK;
  },
  fire: c => {
    const { fmtDelta, fmtMoney } = createFormatters(c.config.locale, c.config.currency);
    const cur = c.current.metrics.spend as number;
    const pri = c.prior!.metrics.spend as number;
    const pct = pctChange(cur, pri);
    if (pct == null) return [];
    const material = !Number.isFinite(pct) || Math.abs(pct) >= c.config.thresholds.materialPct;
    if (!material) return [];
    const sentence: Sentence = {
      text:        `${c.current.channel.display} spend in ${c.current.period.label} was ${fmtMoney(cur)}, ${fmtDelta(pct)} from ${fmtMoney(pri)} in ${c.prior!.period.label}.`,
      category:    'volume',
      materiality: Math.min(c.config.thresholds.materialityCap, rank(pct, c.config.thresholds.materialityCap) + 20),
      entity_id:   null,
      basis:       'mom',
    };
    return [sentence];
  },
};
