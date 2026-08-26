// Rule: describeConversionValueChange
// Category: conversion
// Fires when conversion value moves by >= materialPct MoM or on a
// zero-crossing (value entered / exited the account).

import type { RuleSpec, Sentence } from '../../contract/types';
import { createFormatters, pctChange } from '../../config/formatters';
import { OK, missing, rank, requirePrior } from '../_rank';

const ID = 'describeConversionValueChange';

export const describeConversionValueChange: RuleSpec = {
  id:       ID,
  category: 'conversion',
  precondition: c => {
    const pre = requirePrior(c);
    if (!pre.ok) return pre;
    if (c.current.metrics.conversion_value == null || c.prior!.metrics.conversion_value == null) return missing('metric_null');
    return OK;
  },
  fire: c => {
    const { fmtDelta, fmtMoney } = createFormatters(c.config.locale, c.config.currency);
    const cur = c.current.metrics.conversion_value as number;
    const pri = c.prior!.metrics.conversion_value as number;
    const pct = pctChange(cur, pri);
    if (pct == null) return [];
    const material = !Number.isFinite(pct) || Math.abs(pct) >= c.config.thresholds.materialPct;
    if (!material) return [];
    const cap = c.config.thresholds.materialityCap;
    const sentence: Sentence = {
      text:        `Conversion value moved from ${fmtMoney(pri)} to ${fmtMoney(cur)} (${fmtDelta(pct)}).`,
      category:    'conversion',
      materiality: rank(pct, cap),
      entity_id:   null,
      basis:       'mom',
    };
    return [sentence];
  },
};
