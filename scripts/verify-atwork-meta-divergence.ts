/**
 * verify-atwork-meta-divergence.ts. One-off diagnostic for whether
 * atWork Meta July 2026 satisfies the directional-coherence rule's
 * two firing conditions before the rule is built. Not a fixture.
 *
 * Reports:
 *   - account spend delta (July - June)
 *   - continuing-entity aggregate spend delta (sum over lifecycle=continuing)
 *   - |continuing_agg_delta| / |account_prior_spend|
 *   - sign disagreement check
 *   - materiality gate check (>= 10% by default)
 *
 * Run:
 *   node --env-file=.env.local --import tsx scripts/verify-atwork-meta-divergence.ts
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- 'ws' has no types installed; runtime shim for Supabase's fetch path
import ws from 'ws';
(globalThis as unknown as { WebSocket: unknown }).WebSocket = ws;

import { fetchAtWorkMetaPeriod } from '../src/app/monthly-reports/adapters/meta';
import { priorMonth } from '../src/app/monthly-reports/adapters/config';
// selectC3Roles isn't exported from the PRISM barrel; inline the shape
// and selection logic mirroring dist/rules/attribution/describe-spend-decomposition.js
// so the diagnostic can report what the rule would see without depending
// on an unpublished internal export.
type Lifecycle = 'continuing' | 'new' | 'stopped';
interface EntitySnapshot {
  name:                 string;
  lifecycle:            Lifecycle;
  spend_current:        number;
  spend_prior:          number | null;
  conversions_current:  number;
  conversions_prior:    number | null;
  cpa_current:          number | null;
  cpa_prior:            number | null;
}

const PERIOD = '2026-07';
const MATERIAL_PCT = 10;   // PRISM default; same dial as B1 classifier

async function main(): Promise<void> {
  const prior = priorMonth(PERIOD);
  const [cur, pri] = await Promise.all([
    fetchAtWorkMetaPeriod(PERIOD),
    fetchAtWorkMetaPeriod(prior),
  ]);
  if (!cur || !pri) {
    console.error('Missing current or prior; cannot verify.');
    process.exit(1);
  }

  const accountCur = cur.metrics.spend ?? 0;
  const accountPri = pri.metrics.spend ?? 0;
  const accountDelta = accountCur - accountPri;

  const priorByName = new Map(pri.entities.map(e => [e.name, e]));
  const currentByName = new Map(cur.entities.map(e => [e.name, e]));

  let continuingAggDelta = 0;
  const continuingBreakdown: Array<{ name: string; prior: number; current: number; delta: number }> = [];
  for (const [name, currentEntity] of currentByName) {
    const priorEntity = priorByName.get(name);
    if (!priorEntity) continue;   // 'new' — skip
    const cs = currentEntity.metrics.spend ?? 0;
    const ps = priorEntity.metrics.spend  ?? 0;
    const delta = cs - ps;
    continuingAggDelta += delta;
    continuingBreakdown.push({ name, prior: ps, current: cs, delta });
  }
  const newCount = [...currentByName.keys()].filter(n => !priorByName.has(n)).length;
  const stoppedCount = [...priorByName.keys()].filter(n => !currentByName.has(n)).length;
  const continuingCount = continuingBreakdown.length;

  const threshold = (MATERIAL_PCT / 100) * Math.abs(accountPri);
  const magnitudeClears = Math.abs(continuingAggDelta) >= threshold;
  const signDisagrees = Math.sign(accountDelta) !== 0 && Math.sign(continuingAggDelta) !== 0 && Math.sign(accountDelta) !== Math.sign(continuingAggDelta);

  console.log(`\n── atWork Meta ${PERIOD} vs ${prior} — divergence check ──\n`);
  console.log(`Account spend (prior):     $${accountPri.toFixed(2)}`);
  console.log(`Account spend (current):   $${accountCur.toFixed(2)}`);
  console.log(`Account spend delta:       $${accountDelta.toFixed(2)}  (${accountDelta >= 0 ? 'up' : 'down'})`);
  console.log();
  console.log(`Continuing entities:       ${continuingCount}`);
  console.log(`New entities:              ${newCount}`);
  console.log(`Stopped entities:          ${stoppedCount}`);
  console.log();
  console.log(`Continuing-entity aggregate spend delta:  $${continuingAggDelta.toFixed(2)}  (${continuingAggDelta >= 0 ? 'up' : 'down'})`);
  console.log(`|Continuing agg delta| / |account prior|: ${(Math.abs(continuingAggDelta) / Math.max(Math.abs(accountPri), 1) * 100).toFixed(2)}%`);
  console.log(`Threshold (materialPct=${MATERIAL_PCT}% of $${accountPri.toFixed(2)}): $${threshold.toFixed(2)}`);
  console.log();
  console.log(`─ Continuing-entity breakdown (sorted by |delta| desc) ─`);
  continuingBreakdown.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  for (const row of continuingBreakdown) {
    const sign = row.delta >= 0 ? '+' : '−';
    console.log(`  ${row.name.padEnd(60)} $${row.prior.toFixed(0).padStart(8)} → $${row.current.toFixed(0).padStart(8)}  (${sign}$${Math.abs(row.delta).toFixed(0).padStart(6)})`);
  }
  console.log();
  console.log(`─ Firing conditions ─`);
  console.log(`  Sign disagreement:      ${signDisagrees ? 'YES' : 'no'}`);
  console.log(`  Magnitude clears gate:  ${magnitudeClears ? 'YES' : 'no'}   (|agg| ${magnitudeClears ? '≥' : '<'} $${threshold.toFixed(2)})`);
  console.log(`  Rule would fire:        ${signDisagrees && magnitudeClears ? 'YES' : 'no'}`);
  console.log();

  // Now check what C3's selectC3Roles actually returns on this same data.
  const allNames = new Set<string>([...priorByName.keys(), ...currentByName.keys()]);
  const snapshots: EntitySnapshot[] = [];
  for (const name of allNames) {
    const cur = currentByName.get(name);
    const pri = priorByName.get(name);
    const lifecycle: 'continuing' | 'new' | 'stopped' =
      cur && pri ? 'continuing' : cur ? 'new' : 'stopped';
    const currentSpend = cur?.metrics.spend ?? 0;
    const currentConv  = cur?.metrics.conversions ?? 0;
    const priorSpend   = pri?.metrics.spend ?? null;
    const priorConv    = pri?.metrics.conversions ?? null;
    snapshots.push({
      name,
      lifecycle,
      spend_current:       currentSpend,
      spend_prior:         priorSpend,
      conversions_current: currentConv,
      conversions_prior:   priorConv,
      cpa_current:         cur && currentConv > 0 ? currentSpend / currentConv : null,
      cpa_prior:           pri && priorConv && priorConv > 0 ? priorSpend! / priorConv : null,
    });
  }
  const roles = inlineSelectC3Roles(snapshots, cur.metrics.cpa ?? 0, accountPri);
  console.log(`─ C3 selectC3Roles output (inline reimpl mirroring dist) ─`);
  console.log(`  best_performer:         ${roles.best_performer?.name ?? '(none)'}`);
  console.log(`  took_most_of_increase:  ${roles.took_most_of_increase?.name ?? '(none)'}`);
  console.log(`  took_most_of_decrease:  ${roles.took_most_of_decrease?.name ?? '(none)'}`);
  console.log(`  new_entrant:            ${roles.new_entrant?.name ?? '(none)'}`);
  console.log(`  stopped:                ${roles.stopped?.name ?? '(none)'}`);
  console.log();

  // Also print snapshot data C3 would see, so we can see whether any
  // filter would drop Phase1.
  console.log(`─ Snapshots C3 would receive ─`);
  for (const s of snapshots) {
    const delta = s.spend_current - (s.spend_prior ?? 0);
    console.log(`  ${s.lifecycle.padEnd(10)} ${s.name.padEnd(60)} $${(s.spend_prior ?? 0).toFixed(0).padStart(7)} → $${s.spend_current.toFixed(0).padStart(7)}  (Δ ${delta.toFixed(0).padStart(7)})  cpa_cur=${s.cpa_current?.toFixed(0) ?? 'null'}`);
  }
}

function inlineSelectC3Roles(
  entities: EntitySnapshot[],
  accountAvgCpaCurrent: number,
  priorAccountSpend: number,
) {
  const BEST_PERFORMER_CPA_SHARE_OF_AVG = 0.75;
  const TOOK_MOST_SHARE = 0.40;
  const LIFECYCLE_SHARE_OF_POSITIVE_SPEND = 0.05;
  const LIFECYCLE_SHARE_OF_PRIOR_ACCOUNT_SPEND = 0.01;

  const continuing = entities.filter(e => e.lifecycle === 'continuing');
  const newOnes    = entities.filter(e => e.lifecycle === 'new');
  const stopped    = entities.filter(e => e.lifecycle === 'stopped');

  const eligibleForBest = continuing.filter(e => e.cpa_current !== null);
  const bestByCpa = eligibleForBest.slice().sort((a, b) => a.cpa_current! - b.cpa_current!)[0];
  const best_performer = bestByCpa && bestByCpa.cpa_current !== null
    && bestByCpa.cpa_current <= BEST_PERFORMER_CPA_SHARE_OF_AVG * accountAvgCpaCurrent
    ? bestByCpa : null;

  const continuingDeltas = continuing.map(e => ({ entity: e, delta: e.spend_current - (e.spend_prior ?? 0) }));
  const positiveTotal = continuingDeltas.filter(d => d.delta > 0).reduce((s, d) => s + d.delta, 0);
  const largestPositive = continuingDeltas.filter(d => d.delta > 0).sort((a, b) => b.delta - a.delta)[0];
  const took_most_of_increase = largestPositive && positiveTotal > 0
    && largestPositive.delta / positiveTotal >= TOOK_MOST_SHARE ? largestPositive.entity : null;

  const negativeTotal = continuingDeltas.filter(d => d.delta < 0).reduce((s, d) => s + d.delta, 0);
  const largestNegative = continuingDeltas.filter(d => d.delta < 0).sort((a, b) => a.delta - b.delta)[0];
  const took_most_of_decrease = largestNegative && negativeTotal < 0
    && Math.abs(largestNegative.delta) / Math.abs(negativeTotal) >= TOOK_MOST_SHARE ? largestNegative.entity : null;

  const lifecycleFloor = Math.max(
    LIFECYCLE_SHARE_OF_POSITIVE_SPEND * positiveTotal,
    LIFECYCLE_SHARE_OF_PRIOR_ACCOUNT_SPEND * priorAccountSpend,
  );
  const largestNew = newOnes.slice().sort((a, b) => b.spend_current - a.spend_current)[0];
  const new_entrant = largestNew && largestNew.spend_current >= lifecycleFloor ? largestNew : null;
  const largestStopped = stopped.slice().sort((a, b) => (b.spend_prior ?? 0) - (a.spend_prior ?? 0))[0];
  const stoppedRole = largestStopped && (largestStopped.spend_prior ?? 0) >= lifecycleFloor ? largestStopped : null;

  return { best_performer, took_most_of_increase, took_most_of_decrease, new_entrant, stopped: stoppedRole };
}

main().catch(err => {
  console.error('verify-atwork-meta-divergence: failed:', err);
  process.exit(1);
});
