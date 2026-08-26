// Rule: describeEfficiencyRatioChange
// Category: efficiency
// Fires per paid efficiency ratio (CTR, CPC, CPM) when MoM pct >= materialPct.
// Skips any ratio that is null in either period, so a channel without one of
// these ratios (e.g. Website) produces no line for it.

import type { RuleSpec, Sentence } from '../../contract/types';
import { createFormatters, pctChange } from '../../config/formatters';
import { rank, requirePrior } from '../_rank';

const ID = 'describeEfficiencyRatioChange';

interface RatioSpec {
  label:  'CTR' | 'CPC' | 'CPM';
  format: 'money' | 'pct';
}

export const describeEfficiencyRatioChange: RuleSpec = {
  id:           ID,
  category:     'efficiency',
  precondition: c => requirePrior(c),
  fire: c => {
    const fmt = createFormatters(c.config.locale, c.config.currency);
    const cap = c.config.thresholds.materialityCap;
    const materialPct = c.config.thresholds.materialPct;
    const out: Sentence[] = [];
    const specs: Array<[RatioSpec, number | null, number | null]> = [
      [{ label: 'CTR', format: 'pct'   }, c.current.metrics.ctr, c.prior!.metrics.ctr],
      [{ label: 'CPC', format: 'money' }, c.current.metrics.cpc, c.prior!.metrics.cpc],
      [{ label: 'CPM', format: 'money' }, c.current.metrics.cpm, c.prior!.metrics.cpm],
    ];
    for (const [spec, cur, pri] of specs) {
      if (cur == null || pri == null) continue;
      const pct = pctChange(cur, pri);
      if (pct == null) continue;
      const material = !Number.isFinite(pct) || Math.abs(pct) >= materialPct;
      if (!material) continue;
      const fmtValue = spec.format === 'money' ? fmt.fmtMoney : fmt.fmtPct;
      out.push({
        text:        `${spec.label} moved from ${fmtValue(pri)} to ${fmtValue(cur)} (${fmt.fmtDelta(pct)}).`,
        category:    'efficiency',
        materiality: rank(pct, cap),
        entity_id:   null,
        basis:       'mom',
      });
    }
    return out;
  },
};
