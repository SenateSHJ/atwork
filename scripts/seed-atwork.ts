/**
 * seed-atwork.ts — populate the atWork client's rows in reporting.*.
 * Mirrors PRISM's scripts/seed-example-client.ts one-for-one.
 *
 * Idempotent. Safe to re-run. Reads makeAtWorkConfig() from
 * src/config/atwork.ts and writes the equivalent rows into the
 * reporting.* schema so the settings page's readSettings and the
 * runner's loadConfig see the same values the in-code factory produces.
 *
 * Run with:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/seed-atwork.ts
 *
 * Uses the service-role key so RLS does not gate the write. Refuses to
 * run if reporting.rls_probe is empty from this session (a fresh clone
 * with the migrations un-applied or the wrong service-role key).
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- 'ws' has no types installed; runtime-only shim for Supabase's fetch path
import ws from 'ws';
(globalThis as unknown as { WebSocket: unknown }).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';
import { makeAtWorkConfig, ATWORK_META_CONVERSION_COLUMN } from '../src/config/atwork';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('seed-atwork: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const CFG = makeAtWorkConfig();
const CLIENT_SLUG    = CFG.client_slug;
const CLIENT_DISPLAY = 'atWork';
const EFFECTIVE_FROM = '2026-08-29';
const CREATED_BY     = 'seed-atwork';

async function ensureRlsProbe(): Promise<void> {
  const { data, error } = await sb
    .schema('reporting').from('rls_probe')
    .select('marker').eq('marker', 'ok').maybeSingle();
  if (error) throw new Error(`ensureRlsProbe canary failed: ${error.message}. Migration 20260822000003 not applied?`);
  if (!data) throw new Error('ensureRlsProbe: no ok row visible from this session. RLS blocking service_role. Fix your env before proceeding.');
}

async function upsertClient(): Promise<string> {
  const { data, error } = await sb
    .schema('reporting').from('client')
    .upsert({ slug: CLIENT_SLUG, display: CLIENT_DISPLAY }, { onConflict: 'slug' })
    .select('id').single();
  if (error) throw new Error(`upsertClient failed: ${error.message}`);
  return String((data as { id: string }).id);
}

async function ensureConfigVersion1(clientId: string): Promise<string> {
  const existing = await sb
    .schema('reporting').from('config')
    .select('id').eq('client_id', clientId).eq('version', 1).maybeSingle();
  if (existing.data) return String((existing.data as { id: string }).id);
  const { data, error } = await sb
    .schema('reporting').from('config')
    .insert({
      client_id:             clientId,
      version:               1,
      effective_from:        EFFECTIVE_FROM,
      created_by:            CREATED_BY,
      notes:                 'atWork config version 1, seeded via scripts/seed-atwork.ts. Mirrors makeAtWorkConfig().',
      default_outcome_model: CFG.default_outcome_model,
    })
    .select('id').single();
  if (error) throw new Error(`ensureConfigVersion1 failed: ${error.message}`);
  return String((data as { id: string }).id);
}

async function upsertThresholds(configId: string): Promise<void> {
  const t = CFG.thresholds;
  const { error } = await sb
    .schema('reporting').from('config_thresholds')
    .upsert({
      config_id:              configId,
      material_pct:           t.materialPct,
      materiality_cap:        t.materialityCap,
      baseline_periods:       t.baselinePeriods,
      min_sample_best_worst:  t.minSampleForBestWorst,
      concentration_pct:      t.concentrationPct,
      dispersion_cv_high:     t.dispersionCvHigh,
      significance_alpha:     t.significanceAlpha,
      hedge_alpha_low:        t.hedgeAlphaLow,
      hedge_alpha_high:       t.hedgeAlphaHigh,
      min_conversions_gate:   t.minConversionsGate,
      min_impressions_gate:   t.minImpressionsGate,
      min_sessions_gate:      t.minSessionsGate,
      outlier_day_share_pct:  t.outlierDaySharePct,
      data_cliff_dropoff_pct: t.dataCliffDropoffPct,
      data_cliff_days:        t.dataCliffDays,
    }, { onConflict: 'config_id' });
  if (error) throw new Error(`upsertThresholds failed: ${error.message}`);
}

async function upsertChannels(configId: string): Promise<void> {
  const rows = CFG.channels.map(c => ({
    config_id:                    configId,
    channel_id:                   c.channel_id,
    channel_display:              c.channel_display,
    currency:                     c.currency,
    locale:                       c.locale,
    conversion_definition:        c.conversion_definition,
    display_order:                c.display_order,
    enabled:                      c.enabled,
    channel_family:               c.channel_family ?? null,
    outcome_model:                c.outcome_model,
    reports_refunds:              c.reports_refunds,
    reports_benchmarks:           c.reports_benchmarks,
    reports_input_health:         c.reports_input_health,
    reports_new_customer_data:    c.reports_new_customer_data,
    new_customer_goal_configured: c.new_customer_goal_configured,
    default_demand_type:          c.default_demand_type,
    default_creative_source:      c.default_creative_source,
  }));
  const { error } = await sb
    .schema('reporting').from('config_channel')
    .upsert(rows, { onConflict: 'config_id,channel_id' });
  if (error) throw new Error(`upsertChannels failed: ${error.message}`);
}

// reporting.config_channel_event's FK is config_channel_id (uuid), not
// (config_id, channel_id). Resolve channel ids via a per-config lookup.
async function resolveConfigChannelIds(configId: string): Promise<Record<string, string>> {
  const { data, error } = await sb
    .schema('reporting').from('config_channel')
    .select('id,channel_id').eq('config_id', configId);
  if (error) throw new Error(`resolveConfigChannelIds failed: ${error.message}`);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as Array<{ id: string; channel_id: string }>) out[r.channel_id] = r.id;
  return out;
}

async function upsertChannelEvents(configId: string): Promise<void> {
  const channelIdMap = await resolveConfigChannelIds(configId);
  const rows = CFG.channels.flatMap(c =>
    c.declared_events.map(ev => ({
      config_channel_id: channelIdMap[c.channel_id],
      event_name:        ev.event_name,
      role:              ev.role,
      intent_tier:       ev.intent_tier,
      display_name:      ev.display_name,
      funnel_step:       ev.funnel_step,
    })),
  );
  if (rows.length === 0) return;
  const channelUuids = [...new Set(rows.map(r => r.config_channel_id))];
  const { error: delErr } = await sb
    .schema('reporting').from('config_channel_event')
    .delete().in('config_channel_id', channelUuids);
  if (delErr) throw new Error(`upsertChannelEvents delete failed: ${delErr.message}`);
  const { error } = await sb
    .schema('reporting').from('config_channel_event')
    .insert(rows);
  if (error) throw new Error(`upsertChannelEvents insert failed: ${error.message}`);
}

async function upsertChannelAttribution(configId: string): Promise<void> {
  const channelIdMap = await resolveConfigChannelIds(configId);
  const rows = CFG.channels.flatMap(c =>
    c.attribution_windows.map(w => ({
      config_channel_id: channelIdMap[c.channel_id],
      effective_from:    w.effective_from,
      click_window_days: w.click_window_days,
      view_window_days:  w.view_window_days,
      last_verified_at:  w.last_verified_at,
      last_verified_by:  w.last_verified_by,
      notes:             w.notes ?? null,
    })),
  );
  if (rows.length === 0) return;
  const channelUuids = [...new Set(rows.map(r => r.config_channel_id))];
  const { error: delErr } = await sb
    .schema('reporting').from('config_channel_attribution')
    .delete().in('config_channel_id', channelUuids);
  if (delErr) throw new Error(`upsertChannelAttribution delete failed: ${delErr.message}`);
  const { error } = await sb
    .schema('reporting').from('config_channel_attribution')
    .insert(rows);
  if (error) throw new Error(`upsertChannelAttribution insert failed: ${error.message}`);
}

async function upsertChannelContributions(configId: string): Promise<void> {
  const rows = (CFG.channel_contributions ?? []).map(cc => ({
    config_id:                 configId,
    contributor_channel_id:    cc.contributor_channel_id,
    receiver_channel_id:       cc.receiver_channel_id,
    receiver_bucket_dimension: cc.receiver_bucket.dimension,
    receiver_bucket_value:     cc.receiver_bucket.value,
    overlap_kind:              cc.overlap_kind,
    note:                      cc.note ?? null,
  }));
  if (rows.length === 0) return;
  const { error: delErr } = await sb
    .schema('reporting').from('config_channel_contribution')
    .delete().eq('config_id', configId);
  if (delErr) throw new Error(`upsertChannelContributions delete failed: ${delErr.message}`);
  const { error } = await sb
    .schema('reporting').from('config_channel_contribution')
    .insert(rows);
  if (error) throw new Error(`upsertChannelContributions insert failed: ${error.message}`);
}

async function upsertTone(configId: string): Promise<void> {
  const tone = CFG.tone ?? { tone: 'advisory' as const, show_implication: true, show_action_only: false };
  const { error } = await sb
    .schema('reporting').from('config_recommendation_tone')
    .upsert({
      config_id:        configId,
      tone:             tone.tone,
      show_implication: tone.show_implication,
      show_action_only: tone.show_action_only,
    }, { onConflict: 'config_id' });
  if (error) throw new Error(`upsertTone failed: ${error.message}`);
}

async function upsertLayout(configId: string): Promise<void> {
  const l = CFG.layout;
  const { error } = await sb
    .schema('reporting').from('config_layout')
    .upsert({
      config_id:                                configId,
      tier_order:                               l.tier_order,
      render_flags:                             l.render_flags,
      render_recommendations:                   l.render_recommendations,
      render_waterfall:                         l.render_waterfall,
      render_evidence:                          l.render_evidence,
      per_slot_cap:                             CFG.per_slot_cap ?? null,
      narrator_slot_order:                      l.narrator_slot_order ?? null,
      report_opening_paragraphs:                l.report_opening_paragraphs ?? null,
      report_opening_partition_enumeration_max: l.report_opening_partition_enumeration_max ?? null,
      readout_full_ranking_threshold:           l.readout_full_ranking_threshold ?? null,
      readout_top_n:                            l.readout_top_N ?? null,
      readout_bottom_n:                         l.readout_bottom_N ?? null,
      ranked_readout_always_include_findings:   l.ranked_readout_always_include_findings ?? null,
      ranked_readout_always_include_max_rows:   l.ranked_readout_always_include_max_rows ?? null,
    }, { onConflict: 'config_id' });
  if (error) throw new Error(`upsertLayout failed: ${error.message}`);
}

// Every AUTHORED_WORDING row goes into reporting.config_wording so
// loadConfig hydrates the resolver with real templates. Without this
// the runner reads config.wording=[], the resolver's pre-authoring
// passthrough at wording-resolver.ts:805-816 fires, and the raw
// PLACEHOLDER signals from each rule render into the client-facing
// document. Composite unique key is
// (config_id, key_type, rule_id, branch_key, locale, model).
async function upsertWording(configId: string): Promise<void> {
  const rows = CFG.wording.map(w => ({
    config_id:   configId,
    key_type:    w.key_type,
    rule_id:     w.rule_id,
    branch_key:  w.branch_key,
    locale:      w.locale,
    model:       w.model,
    template:    w.template,
    provisional: w.provisional ?? false,
  }));
  // Delete-then-insert scoped to this config_id. Additive upsert leaves
  // orphan rows when AUTHORED_WORDING shrinks or a row's model changes —
  // those old rows stay in DB and can shadow newer authoring at resolve
  // time. Delete-then-insert makes seed idempotent. Mirrors the pattern
  // used by upsertChannelEvents / upsertChannelAttribution /
  // upsertChannelContributions in this file, and the PRISM upstream fix
  // to seed-example-client.ts landed the same day.
  const { error: delErr } = await sb
    .schema('reporting').from('config_wording')
    .delete().eq('config_id', configId);
  if (delErr) throw new Error(`upsertWording delete failed: ${delErr.message}`);
  if (rows.length === 0) return;
  const { error } = await sb
    .schema('reporting').from('config_wording')
    .insert(rows);
  if (error) throw new Error(`upsertWording insert failed: ${error.message}`);
}

async function upsertRules(configId: string): Promise<void> {
  if (CFG.rules.length === 0) return;
  const rows = CFG.rules.map(r => ({
    config_id:         configId,
    rule_id:           r.rule_id,
    enabled:           r.enabled,
    materiality_boost: r.materiality_boost,
    min_materiality:   r.min_materiality,
  }));
  const { error } = await sb
    .schema('reporting').from('config_rule')
    .upsert(rows, { onConflict: 'config_id,rule_id' });
  if (error) throw new Error(`upsertRules failed: ${error.message}`);
}

async function run(): Promise<void> {
  await ensureRlsProbe();
  const clientId = await upsertClient();
  const configId = await ensureConfigVersion1(clientId);
  await upsertThresholds(configId);
  await upsertChannels(configId);
  await upsertChannelEvents(configId);
  await upsertChannelAttribution(configId);
  await upsertChannelContributions(configId);
  await upsertTone(configId);
  await upsertLayout(configId);
  await upsertWording(configId);
  await upsertRules(configId);
  console.log(`seed-atwork: OK. Client '${CLIENT_SLUG}' config version 1 written.`);
  console.log(`  wording rows in reporting.config_wording: ${CFG.wording.length}`);
  console.log(`  meta conversion column (runner reads from src/config/atwork): ${ATWORK_META_CONVERSION_COLUMN}`);
}

run().catch(err => {
  console.error('seed-atwork: failed:', err);
  process.exit(1);
});
