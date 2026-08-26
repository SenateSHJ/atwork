// Rule: describeTopEntityConcentration
// Category: concentration
// Fires when the top entity by spend (or by conversions, when the channel
// has no spend on its entities) holds >= 50% of the total. Reports the share
// and the absolute figure so the reader can judge whether the concentration
// is a strength or a fragility.

import type { RuleSpec, Sentence } from '../../contract/types';
import { createFormatters } from '../../config/formatters';
import { OK, missing } from '../_rank';

const ID = 'describeTopEntityConcentration';
const CONCENTRATION_THRESHOLD = 50;

export const describeTopEntityConcentration: RuleSpec = {
  id:       ID,
  category: 'concentration',
  precondition: c => {
    if (c.current.entities.length < 2) return missing('insufficient_sample');
    return OK;
  },
  fire: c => {
    const { fmtMoney, fmtInt } = createFormatters(c.config.locale, c.config.currency);
    const cap = c.config.thresholds.materialityCap;

    const spendTotal = c.current.entities.reduce((s, e) => s + (e.metrics.spend ?? 0), 0);
    if (spendTotal > 0) {
      const sorted = [...c.current.entities].sort((a, b) => (b.metrics.spend ?? 0) - (a.metrics.spend ?? 0));
      const top = sorted[0];
      const topSpend = top.metrics.spend ?? 0;
      const share = (topSpend / spendTotal) * 100;
      if (share >= CONCENTRATION_THRESHOLD) {
        const sentence: Sentence = {
          text:        `${top.name} accounted for ${share.toFixed(0)}% of ${c.current.channel.display} spend in ${c.current.period.label} (${fmtMoney(topSpend)} of ${fmtMoney(spendTotal)}).`,
          category:    'concentration',
          materiality: Math.min(cap, 50 + (share - CONCENTRATION_THRESHOLD)),
          entity_id:   top.id,
          basis:       'none',
        };
        return [sentence];
      }
      return [];
    }

    const convTotal = c.current.entities.reduce((s, e) => s + (e.metrics.conversions ?? 0), 0);
    if (convTotal > 0) {
      const sorted = [...c.current.entities].sort((a, b) => (b.metrics.conversions ?? 0) - (a.metrics.conversions ?? 0));
      const top = sorted[0];
      const topConv = top.metrics.conversions ?? 0;
      const share = (topConv / convTotal) * 100;
      if (share >= CONCENTRATION_THRESHOLD) {
        const sentence: Sentence = {
          text:        `${top.name} accounted for ${share.toFixed(0)}% of ${c.current.channel.display} conversions in ${c.current.period.label} (${fmtInt(topConv)} of ${fmtInt(convTotal)}).`,
          category:    'concentration',
          materiality: Math.min(cap, 50 + (share - CONCENTRATION_THRESHOLD)),
          entity_id:   top.id,
          basis:       'none',
        };
        return [sentence];
      }
    }

    return [];
  },
};
