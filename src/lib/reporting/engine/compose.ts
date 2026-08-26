// Deterministic prose engine. Runs each rule's precondition; skips rules that
// can't fire; invokes rules whose preconditions pass; groups sentences by
// category; drops the headline paragraph when any richer category is present;
// dedups so any one entity leads only one sentence per paragraph; sorts by
// materiality within each paragraph. Errors from any rule are rethrown with
// the rule id — no silent swallow.

import type { Category, Comparison, RuleSpec, Sentence } from '../contract/types';
import { validateComparison } from './validation';

const CATEGORY_ORDER: Category[] = [
  'headline',
  'volume',
  'efficiency',
  'conversion',
  'concentration',
  'lifecycle',
];

export interface ComposeResult {
  paragraphs:    string[];
  basisSubtitle: string;
}

export function compose(comparison: Comparison, rules: RuleSpec[], sectionLabel: string): ComposeResult {
  validateComparison(comparison);

  const collected: Sentence[] = [];
  for (const rule of rules) {
    const pre = rule.precondition(comparison);
    if (!pre.ok) continue;

    let sentences: Sentence[];
    try {
      sentences = rule.fire(comparison);
    } catch (err) {
      throw new Error(`Reporting: rule "${rule.id}" threw: ${(err as Error).message}`);
    }

    for (const s of sentences) {
      if (!s.text || typeof s.text !== 'string') {
        throw new Error(`Reporting: rule "${rule.id}" emitted a sentence with empty text`);
      }
      collected.push(s);
    }
  }

  const subtitle = basisSubtitle(comparison);

  if (collected.length === 0) {
    return {
      paragraphs:    [`No material month-on-month changes to report for ${sectionLabel}.`],
      basisSubtitle: subtitle,
    };
  }

  // Group by category.
  const byCategory = new Map<Category, Sentence[]>();
  for (const s of collected) {
    if (!byCategory.has(s.category)) byCategory.set(s.category, []);
    byCategory.get(s.category)!.push(s);
  }

  // Drop the headline fallback when a richer category is present. Headline is
  // a stability floor — only useful when nothing else has anything to say.
  const richerCategoryCount = Array.from(byCategory.keys()).filter(cat => cat !== 'headline').length;
  if (richerCategoryCount > 0) byCategory.delete('headline');

  const paragraphs = CATEGORY_ORDER
    .map(cat => byCategory.get(cat))
    .filter((arr): arr is Sentence[] => !!arr && arr.length > 0)
    .map(arr => {
      // Dedup: one entity per paragraph. Keep the highest-materiality sentence
      // for each entity_id; drop the rest. Sentences with entity_id === null
      // are section-wide and never deduped.
      const seenEntities = new Set<string>();
      const kept: Sentence[] = [];
      const sorted = [...arr].sort((a, b) => b.materiality - a.materiality);
      for (const s of sorted) {
        if (s.entity_id) {
          if (seenEntities.has(s.entity_id)) continue;
          seenEntities.add(s.entity_id);
        }
        kept.push(s);
      }
      return kept.map(s => s.text).join(' ');
    });

  return { paragraphs, basisSubtitle: subtitle };
}

function basisSubtitle(c: Comparison): string {
  const parts: string[] = [`Reporting on ${c.current.period.label}`];
  if (c.prior)                              parts.push(`compared to ${c.prior.period.label}`);
  if (c.yoy)                                parts.push(`with a year-on-year comparison against ${c.yoy.period.label}`);
  if (c.baseline && c.baseline.length > 0)  parts.push(`and a rolling baseline of the prior ${c.baseline.length} months`);
  return parts.join(' ') + '.';
}
