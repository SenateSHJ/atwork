// Rule: describeCpaChange
// Category: conversion
// Fires when cost per conversion moves by >= materialPct MoM. Skips silently
// if CPA is null in either period (i.e. that channel had zero conversions).

import type { RuleSpec, Sentence } from '../../contract/types';
import { createFormatters, pctChange } from '../../config/formatters';
import { OK, missing, rank, requirePrior } from '../_rank';

const ID = 'describeCpaChange';

export const describeCpaChange: RuleSpec = {
  id:       ID,
  category: 'conversion',
  precondition: c => {
    const pre = requirePrior(c);
    if (!pre.ok) return pre;
    if (c.current.metrics.cpa == null || c.prior!.metrics.cpa == null) return missing('metric_null');
    return OK;
  },
  fire: c => {
    const { fmtDelta, fmtMoney } = createFormatters(c.config.locale, c.config.currency);
    const cur = c.current.metrics.cpa as number;
    const pri = c.prior!.metrics.cpa as number;
    const pct = pctChange(cur, pri);
    if (pct == null) return [];
    const material = !Number.isFinite(pct) || Math.abs(pct) >= c.config.thresholds.materialPct;
    if (!material) return [];
    const cap = c.config.thresholds.materialityCap;
    const sentence: Sentence = {
      text:        `Cost per conversion moved from ${fmtMoney(pri)} to ${fmtMoney(cur)} (${fmtDelta(pct)}).`,
      category:    'conversion',
      materiality: Math.min(cap, rank(pct, cap) + 10),
      entity_id:   null,
      basis:       'mom',
    };
    return [sentence];
  },
};
