// Rule: describeStabilityFloor
// Category: headline
// Purpose: always-fires floor sentence so a quiet month still produces prose.
// The compose engine drops this paragraph automatically when any richer
// category has sentences, so it only appears in genuinely stable months.

import type { RuleSpec, Sentence } from '../../contract/types';
import { createFormatters } from '../../config/formatters';
import { OK } from '../_rank';

const ID = 'describeStabilityFloor';

export const describeStabilityFloor: RuleSpec = {
  id:           ID,
  category:     'headline',
  precondition: () => OK,
  fire: c => {
    const { fmtMoney, fmtInt, fmtPct } = createFormatters(c.config.locale, c.config.currency);
    const m = c.current.metrics;
    const pieces: string[] = [];
    if (m.spend       != null && m.spend       > 0) pieces.push(`spend of ${fmtMoney(m.spend)}`);
    if (m.impressions != null && m.impressions > 0) pieces.push(`${fmtInt(m.impressions)} impressions`);
    if (m.clicks      != null && m.clicks      > 0) pieces.push(`${fmtInt(m.clicks)} clicks`);
    if (m.conversions != null && m.conversions > 0) pieces.push(`${fmtInt(m.conversions)} conversions`);
    if (m.ctr         != null && m.ctr         > 0) pieces.push(`a CTR of ${fmtPct(m.ctr)}`);
    const body = pieces.length > 0 ? ` recorded ${pieces.join(', ')}` : ' had no recorded activity';
    const sentence: Sentence = {
      text:        `${c.current.channel.display} in ${c.current.period.label}${body}.`,
      category:    'headline',
      materiality: 5,
      entity_id:   null,
      basis:       'none',
    };
    return [sentence];
  },
};
