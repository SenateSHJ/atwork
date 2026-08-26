// Boundary validation. Called once at entry to the compose engine. Throws on
// any missing/malformed contract field so the failure surfaces immediately
// with a clear message, not silently as an empty summary later.

import type { NormalisedPeriod, Comparison } from '../contract/types';

export function validateNormalisedPeriod(p: NormalisedPeriod, source: string): void {
  if (!p)                                   throw new Error(`Reporting: NormalisedPeriod is null (source=${source})`);
  if (!p.period)                            throw new Error(`Reporting: period missing (source=${source})`);
  if (!p.period.id || !p.period.label)      throw new Error(`Reporting: period.id/label missing (source=${source})`);
  if (!p.period.from || !p.period.to)       throw new Error(`Reporting: period.from/to missing (source=${source})`);
  if (!p.channel || !p.channel.id)          throw new Error(`Reporting: channel missing (source=${source})`);
  if (!p.channel.display)                   throw new Error(`Reporting: channel.display missing (source=${source})`);
  if (!p.metrics)                           throw new Error(`Reporting: metrics missing (source=${source})`);
  if (!('spend' in p.metrics))              throw new Error(`Reporting: metrics.spend absent (source=${source})`);
  if (typeof p.metrics.custom !== 'object' || p.metrics.custom === null) {
    throw new Error(`Reporting: metrics.custom must be an object (source=${source})`);
  }
  if (!Array.isArray(p.entities))           throw new Error(`Reporting: entities must be an array (source=${source})`);
  if (typeof p.conversion_definition !== 'string') {
    throw new Error(`Reporting: conversion_definition must be a string (source=${source})`);
  }
}

export function validateComparison(c: Comparison): void {
  if (!c)                                                 throw new Error(`Reporting: Comparison is null`);
  validateNormalisedPeriod(c.current, `${c.current?.channel?.id ?? '?'}:current`);
  if (c.prior)    validateNormalisedPeriod(c.prior,    `${c.current.channel.id}:prior`);
  if (c.yoy)      validateNormalisedPeriod(c.yoy,      `${c.current.channel.id}:yoy`);
  if (c.baseline) c.baseline.forEach((p, i) => validateNormalisedPeriod(p, `${c.current.channel.id}:baseline[${i}]`));
  if (!c.config)             throw new Error(`Reporting: config missing on comparison`);
  if (!c.config.thresholds)  throw new Error(`Reporting: config.thresholds missing on comparison`);
  if (!c.config.currency)    throw new Error(`Reporting: config.currency missing on comparison`);
  if (!c.config.locale)      throw new Error(`Reporting: config.locale missing on comparison`);
}
