/**
 * render-atwork-gads.ts. Renders the Google Ads section of the atWork
 * monthly report via the full production code path: silver reads through
 * the atWork Google Ads shim, DB-loaded config, ALL_RULES arbitration.
 * Prints the raw SectionReport verbatim.
 *
 * Used to verify the Google Ads integration end-to-end for the first time
 * (2026-08-31 session). Follows the render-atwork-meta.ts pattern.
 *
 * Run with:
 *   node --env-file=.env.local --import tsx scripts/render-atwork-gads.ts [--period=YYYY-MM]
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- 'ws' has no types installed; runtime-only shim for Supabase's fetch path
import ws from 'ws';
(globalThis as unknown as { WebSocket: unknown }).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';
import { compose, loadConfig, DERIVED_RULES,
  describeAnchor, describeOutcomeDefinition, describeCampaignGoalCompletions, describeGrowthComposition,
  describeGrowthCompositionWeb, describeOutcomeDecomposition,
  describeOutcomeDecompositionWeb, describeSustainedTrend, describeTrendBreak,
  describeStatisticallySignificantRateChange, flagSampleSizeInsufficient,
  flagDataCliff, describeAnchorDeltas, describeAnchorDirectionalCoherence,
  describeAnchorWeb, describeAnchorDeltasWeb,
  describePagesPerSession, describeSpendDecomposition, describeSeasonalNormalcy,
  describeSeasonalDeviation, describeAcceleration, describeDeceleration,
  describeLatestStepSurge, describeTrendReturnedToPriorLevel, describeOutlierDay,
  describeSpendPulse, flagAttributionWindowChangedBetweenPeriods,
  flagAttributionWindowSuspectedDrift,
} from '@prism/executive-summaries';

import { fetchAtWorkGadsPeriod } from '../src/app/monthly-reports/adapters/gads';
import { buildHistory, computeComparisonStats } from '../src/app/monthly-reports/adapters/helpers';
import { priorMonth } from '../src/app/monthly-reports/adapters/config';

const ALL_RULES = [
  describeAnchor, describeOutcomeDefinition, describeCampaignGoalCompletions, describeGrowthComposition,
  describeGrowthCompositionWeb, describeOutcomeDecomposition,
  describeOutcomeDecompositionWeb, describeSustainedTrend, describeTrendBreak,
  describeStatisticallySignificantRateChange, flagSampleSizeInsufficient,
  flagDataCliff, describeAnchorDeltas, describeAnchorDirectionalCoherence,
  describeAnchorWeb, describeAnchorDeltasWeb,
  describePagesPerSession, describeSpendDecomposition, describeSeasonalNormalcy,
  describeSeasonalDeviation, describeAcceleration, describeDeceleration,
  describeLatestStepSurge, describeTrendReturnedToPriorLevel, describeOutlierDay,
  describeSpendPulse, flagAttributionWindowChangedBetweenPeriods,
  flagAttributionWindowSuspectedDrift,
];

function getPeriod(): string {
  const arg = process.argv.find(a => a.startsWith('--period='));
  if (arg) return arg.slice('--period='.length);
  // Default: last complete month.
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function main(): Promise<void> {
  const period = getPeriod();
  const prior  = priorMonth(period);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('render-atwork-gads: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.');
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  console.log(`\n=============================================================`);
  console.log(`PRISM engine  → running section: Google Ads`);
  console.log(`Client        → atwork`);
  console.log(`Period        → ${period} (vs ${prior})`);
  console.log(`Config source → database (loadConfig)`);
  console.log(`=============================================================\n`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = await loadConfig({ supabase: sb as unknown as any, clientSlug: 'atwork' });
  const [current, prev, history] = await Promise.all([
    fetchAtWorkGadsPeriod(period),
    fetchAtWorkGadsPeriod(prior),
    buildHistory(fetchAtWorkGadsPeriod, period),
  ]);

  if (!current) {
    console.log('No Google Ads data for this period. Try --period=YYYY-MM further back.');
    return;
  }

  const stats = computeComparisonStats(current.entities, current.metrics.spend, current.metrics.conversions);
  const output = compose({
    comparison: { current, prior: prev, yoy: null, baseline: null, history, stats, config, change_events: [] },
    rules:      ALL_RULES,
    derived:    DERIVED_RULES,
    section:    'Google Ads',
  });

  const sr = output.section_report;

  console.log('── VERDICT ────────────────────────────────────────────────');
  console.log(sr.verdict ?? '(no verdict)');
  console.log('\n── CHIPS ──────────────────────────────────────────────────');
  for (const c of sr.chips) console.log(`  • ${JSON.stringify(c)}`);
  console.log('\n── SCORECARD ──────────────────────────────────────────────');
  for (const t of sr.scorecard) console.log(`  • ${JSON.stringify(t)}`);
  console.log('\n── DECOMPOSITION ──────────────────────────────────────────');
  for (const d of sr.decomposition) console.log(`  • ${JSON.stringify(d)}`);
  console.log('\n── PARAGRAPHS ─────────────────────────────────────────────');
  for (const p of sr.paragraphs) console.log(`  [${p.category}/${p.slot}]  ${p.text}\n`);
  console.log('── RECOMMENDATIONS ────────────────────────────────────────');
  for (const r of sr.recommendations) console.log(`  • ${JSON.stringify(r)}`);
  console.log('\n── FLAGS ──────────────────────────────────────────────────');
  for (const f of sr.flags) console.log(`  • ${JSON.stringify(f)}`);
  console.log('\n── EVIDENCE (compact) ─────────────────────────────────────');
  console.log(`  ${Object.keys(sr.evidence).length} keys`);
  console.log('\n── STATE ──────────────────────────────────────────────────');
  console.log(`  ${JSON.stringify(sr.state)}`);
  console.log('\n── BASIS ──────────────────────────────────────────────────');
  console.log(`  ${sr.basis_subtitle}`);
  console.log('\n── RUN ERRORS ─────────────────────────────────────────────');
  for (const e of output.errors) console.log(`  [${e.severity}] ${e.code}: ${e.message}`);
  console.log(`\n${output.findings.length} findings, ${output.errors.length} errors\n`);
}

main().catch(err => {
  console.error('render-atwork-gads: failed:', err);
  process.exit(1);
});
