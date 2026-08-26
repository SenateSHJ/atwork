// Small shared helpers for rules. Not a rule itself.

import type { Comparison, PreconditionResult } from '../contract/types';

// Turn a percentage change into a materiality score capped at
// config.thresholds.materialityCap. Non-finite (zero-crossing) = cap.
export function rank(pct: number | null, cap: number): number {
  if (pct == null) return 0;
  if (!Number.isFinite(pct)) return cap;
  return Math.min(cap, Math.abs(pct));
}

export const OK: PreconditionResult = { ok: true };

export function missing(
  reason: 'insufficient_sample' | 'basis_missing' | 'metric_null' | 'filtered_out',
): PreconditionResult {
  return { ok: false, reason };
}

// Standard precondition: MoM basis (prior period) must exist.
export function requirePrior(c: Comparison): PreconditionResult {
  return c.prior ? OK : missing('basis_missing');
}
