// Rule: describeConversionsChange
// Category: conversion
// Fires when conversions change by >= materialPct, and always fires on
// zero-crossing (prior=0, current>0) or (prior>0, current=0). Zero-crossing
// carries the materiality cap so it leads the paragraph.

import type { RuleSpec, Sentence } from '../../contract/types';
import { createFormatters, pctChange } from '../../config/formatters';
import { OK, missing, rank, requirePrior } from '../_rank';

const ID = 'describeConversionsChange';

export const describeConversionsChange: RuleSpec = {
  id:       ID,
  category: 'conversion',
  precondition: c => {
    const pre = requirePrior(c);
    if (!pre.ok) return pre;
    if (c.current.metrics.conversions == null || c.prior!.metrics.conversions == null) return missing('metric_null');
    return OK;
  },
  fire: c => {
    const { fmtDelta, fmtInt } = createFormatters(c.config.locale, c.config.currency);
    const cur = c.current.metrics.conversions as number;
    const pri = c.prior!.metrics.conversions as number;
    const cap = c.config.thresholds.materialityCap;

    if (pri === 0 && cur > 0) {
      const sentence: Sentence = {
        text:        `${c.current.channel.display} conversions began registering in ${c.current.period.label} with ${fmtInt(cur)} events, having recorded none in ${c.prior!.period.label}.`,
        category:    'conversion',
        materiality: cap,
        entity_id:   null,
        basis:       'mom',
      };
      return [sentence];
    }
    if (pri > 0 && cur === 0) {
      const sentence: Sentence = {
        text:        `${c.current.channel.display} conversions dropped to zero in ${c.current.period.label} from ${fmtInt(pri)} in ${c.prior!.period.label}.`,
        category:    'conversion',
        materiality: cap,
        entity_id:   null,
        basis:       'mom',
      };
      return [sentence];
    }

    const pct = pctChange(cur, pri);
    if (pct == null) return [];
    const material = !Number.isFinite(pct) || Math.abs(pct) >= c.config.thresholds.materialPct;
    if (!material) return [];
    const sentence: Sentence = {
      text:        `Conversions moved from ${fmtInt(pri)} to ${fmtInt(cur)} (${fmtDelta(pct)}).`,
      category:    'conversion',
      materiality: Math.min(cap, rank(pct, cap) + 15),
      entity_id:   null,
      basis:       'mom',
    };
    return [sentence];
  },
};
