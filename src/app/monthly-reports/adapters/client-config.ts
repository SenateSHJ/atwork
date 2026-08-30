// Server-only. Holds ATWORK_CONFIG (imports @prism/executive-summaries which
// pulls node:crypto through the engine's data-hash module). Kept out of
// adapters/config.ts so the client-side page.tsx bundle doesn't pick up
// PRISM as a transitive import.
//
// Static fallback ClientConfig used until reporting.client / reporting.config
// are seeded for slug 'atwork'. Once seeded, swap for a loader call.

import 'server-only';
import type { ClientConfig, WordingOverride } from '@prism/executive-summaries';
import { DEFAULT_THRESHOLDS, AUTHORED_WORDING } from '@prism/executive-summaries';

export const ATWORK_CONFIG: ClientConfig = {
  client_slug:           'atwork',
  version:               1,
  config_id:             null,
  currency:              'AUD',
  locale:                'en-AU',
  default_outcome_model: 'lead_generation',
  thresholds:            DEFAULT_THRESHOLDS,
  channels:              [],
  rules:                 [],
  tone:                  { tone: 'advisory', show_implication: true, show_action_only: false },
  layout: {
    tier_order:             ['tl_dr', 'scorecard', 'trends', 'waterfall', 'narrative', 'recommendations', 'evidence'],
    render_flags:           true,
    render_recommendations: true,
    render_waterfall:       true,
    render_evidence:        true,
  },
  wording: AUTHORED_WORDING as WordingOverride[],
};
