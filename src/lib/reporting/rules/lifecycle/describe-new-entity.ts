// Rule: describeNewEntity
// Category: lifecycle
// Fires when one or more entities that had no activity in the prior period
// had activity in the current period. Collapses many-at-once into a single
// sentence so an activity burst doesn't dominate the section.

import type { RuleSpec, Sentence } from '../../contract/types';
import { OK, missing, requirePrior } from '../_rank';

const ID = 'describeNewEntity';

function hasActivity(m: { spend: number | null; conversions: number | null }): boolean {
  return (m.spend ?? 0) > 0 || (m.conversions ?? 0) > 0;
}

export const describeNewEntity: RuleSpec = {
  id:       ID,
  category: 'lifecycle',
  precondition: c => {
    const pre = requirePrior(c);
    if (!pre.ok) return pre;
    if (c.current.entities.length === 0) return missing('filtered_out');
    return OK;
  },
  fire: c => {
    const priorActiveNames = new Set(
      c.prior!.entities.filter(e => hasActivity(e.metrics)).map(e => e.name),
    );
    const started = c.current.entities.filter(e =>
      hasActivity(e.metrics) && !priorActiveNames.has(e.name),
    );
    if (started.length === 0) return [];

    const priorLabel = c.prior!.period.label;
    const currentLabel = c.current.period.label;
    const grain = started[0].grain;

    if (started.length === 1) {
      const only = started[0];
      const sentence: Sentence = {
        text:        `${only.name} started in ${currentLabel} with no prior activity in ${priorLabel}.`,
        category:    'lifecycle',
        materiality: 85,
        entity_id:   only.id,
        basis:       'mom',
      };
      return [sentence];
    }
    const names = started.map(s => s.name).join(', ');
    const sentence: Sentence = {
      text:        `${started.length} ${c.current.channel.display} ${grain}s started in ${currentLabel} that were inactive in ${priorLabel} (${names}).`,
      category:    'lifecycle',
      materiality: 85,
      entity_id:   null,
      basis:       'mom',
    };
    return [sentence];
  },
};
