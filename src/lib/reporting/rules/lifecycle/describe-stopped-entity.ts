// Rule: describeStoppedEntity
// Category: lifecycle
// Fires when one or more entities that had activity in the prior period had
// none in the current period. Collapses many-at-once into one sentence.

import type { RuleSpec, Sentence } from '../../contract/types';
import { OK, missing, requirePrior } from '../_rank';

const ID = 'describeStoppedEntity';

function hasActivity(m: { spend: number | null; conversions: number | null }): boolean {
  return (m.spend ?? 0) > 0 || (m.conversions ?? 0) > 0;
}

export const describeStoppedEntity: RuleSpec = {
  id:       ID,
  category: 'lifecycle',
  precondition: c => {
    const pre = requirePrior(c);
    if (!pre.ok) return pre;
    if (c.prior!.entities.length === 0) return missing('filtered_out');
    return OK;
  },
  fire: c => {
    const currentActiveNames = new Set(
      c.current.entities.filter(e => hasActivity(e.metrics)).map(e => e.name),
    );
    const stopped = c.prior!.entities.filter(e =>
      hasActivity(e.metrics) && !currentActiveNames.has(e.name),
    );
    if (stopped.length === 0) return [];

    const priorLabel = c.prior!.period.label;
    const currentLabel = c.current.period.label;
    const grain = stopped[0].grain;

    if (stopped.length === 1) {
      const only = stopped[0];
      const sentence: Sentence = {
        text:        `${only.name} stopped in ${currentLabel} after being active in ${priorLabel}.`,
        category:    'lifecycle',
        materiality: 85,
        entity_id:   only.id,
        basis:       'mom',
      };
      return [sentence];
    }
    const names = stopped.map(s => s.name).join(', ');
    const sentence: Sentence = {
      text:        `${stopped.length} ${c.current.channel.display} ${grain}s stopped in ${currentLabel} after being active in ${priorLabel} (${names}).`,
      category:    'lifecycle',
      materiality: 85,
      entity_id:   null,
      basis:       'mom',
    };
    return [sentence];
  },
};
