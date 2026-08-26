// Rule: describeConversionRateChange
// Category: conversion
// Fires when conversion rate moves by >= materialPct MoM.

import type { RuleSpec, Sentence } from '../../contract/types';
import { createFormatters, pctChange } from '../../config/formatters';
import { OK, missing, rank, requirePrior } from '../_rank';

const ID = 'describeConversionRateChange';

export const describeConversionRateChange: RuleSpec = {
  id:       ID,
  category: 'conversion',
  precondition: c => {
    const pre = requirePrior(c);
    if (!pre.ok) return pre;
    if (c.current.metrics.conversion_rate == null || c.prior!.metrics.conversion_rate == null) return missing('metric_null');
    return OK;
  },
  fire: c => {
    const { fmtDelta, fmtPct } = createFormatters(c.config.locale, c.config.currency);
    const cur = c.current.metrics.conversion_rate as number;
    const pri = c.prior!.metrics.conversion_rate as number;
    const pct = pctChange(cur, pri);
    if (pct == null) return [];
    const material = !Number.isFinite(pct) || Math.abs(pct) >= c.config.thresholds.materialPct;
    if (!material) return [];
    const cap = c.config.thresholds.materialityCap;
    const sentence: Sentence = {
      text:        `Conversion rate moved from ${fmtPct(pri)} to ${fmtPct(cur)} (${fmtDelta(pct)}).`,
      category:    'conversion',
      materiality: rank(pct, cap),
      entity_id:   null,
      basis:       'mom',
    };
    return [sentence];
  },
};
