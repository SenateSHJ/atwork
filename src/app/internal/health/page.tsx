/**
 * /internal/health — pipeline & endpoint health.
 *
 * atWork-adapted variant of the Snainton Golf health page pattern. Rather
 * than reading a probe-history table (Snainton runs a pg_cron probe every
 * 5 min into `gold.service_probe_history`), atWork has no probe subsystem,
 * so this page is a **live-check** — at render time it calls every backend
 * server action in parallel and reports OK / SLOW / FAIL + latency.
 *
 * Composition (top-to-bottom):
 *   1. Overall banner — worst-of {endpoints, bronze freshness}.
 *   2. Bronze freshness card — max(ingested_at) per source (Meta, GA4, Ads).
 *   3. Endpoints card — grouped by page, one row per action.
 *   4. Weld sync freshness — preserved from the previous version.
 *
 * Set to force-dynamic + revalidate 30 so the page always runs the checks
 * fresh but browsers only refetch every 30s.
 */
import {
  Activity, CheckCircle, AlertTriangle, XCircle, Info, Clock, Zap, Database,
} from 'lucide-react';
import { SectionCard } from '@/components/skills/SectionCard';
import { StatusBadge, type StatusBadgeVariant } from '@/components/skills/StatusBadge';
import { getSyncFreshness, KNOWN_GAPS } from '@/lib/queries/internal';
import { supabaseServer } from '@/lib/supabase/server';
import { format, subDays } from 'date-fns';

// Meta actions
import {
  fetchAboveFold      as metaFetchAboveFold,
  fetchBelowFold      as metaFetchBelowFold,
  fetchEntityTables   as metaFetchEntityTables,
  fetchEngagement     as metaFetchEngagement,
  fetchVideoWatch     as metaFetchVideoWatch,
  fetchTargeting      as metaFetchTargeting,
  getFilterOptions    as metaGetFilterOptions,
} from '@/app/meta/actions';

// GA4 actions
import {
  fetchAboveFold      as ga4FetchAboveFold,
  fetchBelowFold      as ga4FetchBelowFold,
  getFilterOptions    as ga4GetFilterOptions,
} from '@/app/ga4/actions';

// Google Ads actions
import {
  fetchAboveFold        as gadsFetchAboveFold,
  fetchBelowFold        as gadsFetchBelowFold,
  fetchEntityTables     as gadsFetchEntityTables,
  fetchTargetingSections as gadsFetchTargetingSections,
  getFilterOptions      as gadsGetFilterOptions,
} from '@/app/google-ads/actions';

// Internal queries
import {
  getSyncFreshness   as internalGetSyncFreshness,
  getTableStats      as internalGetTableStats,
  getHealthRollup    as internalGetHealthRollup,
} from '@/lib/queries/internal';

export const revalidate = 30;
export const dynamic = 'force-dynamic';

// ─── Endpoint registry ───────────────────────────────────────────────────────
//
// Each row calls a server action with a 7-day window + empty filter set.
// Ordering: category first, then name. Categories mirror the tabbed pages
// on the client-facing dashboard: Meta / GA4 / Google Ads / Internal.

type CheckResult = {
  key:      string;
  label:    string;
  category: string;
  status:   'ok' | 'slow' | 'fail';
  ms:       number;
  error?:   string;
};

const SLOW_MS = 2000;
const FAIL_MS = 5000;

const today   = format(new Date(),           'yyyy-MM-dd');
const daysAgo = (n: number) => format(subDays(new Date(), n), 'yyyy-MM-dd');
const start7  = daysAgo(7);

const metaFilters = { campaigns: [], adsets: [], ads: [], creativeTypes: [], objectives: [] };
const ga4Filters  = { channels: [], devices: [], landingPages: [] };
const gadsFilters = { campaigns: [], adGroups: [], networks: [] };

// Each entry returns a promise that resolves to a CheckResult. Timing is
// captured around the action call. Anything that throws OR takes over
// FAIL_MS is treated as failed; over SLOW_MS is slow; otherwise ok.
type EndpointDef = {
  key:      string;
  label:    string;
  category: string;
  run:      () => Promise<unknown>;
};

const ENDPOINTS: EndpointDef[] = [
  // ── Meta ──
  { key: 'meta.fetchAboveFold',    label: 'Above Fold',      category: 'Meta',        run: () => metaFetchAboveFold(start7, today, metaFilters) },
  { key: 'meta.fetchBelowFold',    label: 'Below Fold',      category: 'Meta',        run: () => metaFetchBelowFold(start7, today, metaFilters) },
  { key: 'meta.fetchEntityTables', label: 'Entity Tables',   category: 'Meta',        run: () => metaFetchEntityTables(start7, today, metaFilters) },
  { key: 'meta.fetchEngagement',   label: 'Engagement',      category: 'Meta',        run: () => metaFetchEngagement(start7, today, metaFilters) },
  { key: 'meta.fetchVideoWatch',   label: 'Video Watch',     category: 'Meta',        run: () => metaFetchVideoWatch(start7, today) },
  { key: 'meta.fetchTargeting',    label: 'Targeting',       category: 'Meta',        run: () => metaFetchTargeting(start7, today, metaFilters) },
  { key: 'meta.getFilterOptions',  label: 'Filter Options',  category: 'Meta',        run: () => metaGetFilterOptions(start7, today) },

  // ── GA4 ──
  { key: 'ga4.fetchAboveFold',     label: 'Above Fold',      category: 'GA4',         run: () => ga4FetchAboveFold(start7, today, ga4Filters) },
  { key: 'ga4.fetchBelowFold',     label: 'Below Fold',      category: 'GA4',         run: () => ga4FetchBelowFold(start7, today, ga4Filters) },
  { key: 'ga4.getFilterOptions',   label: 'Filter Options',  category: 'GA4',         run: () => ga4GetFilterOptions(start7, today) },

  // ── Google Ads ──
  { key: 'gads.fetchAboveFold',        label: 'Above Fold',           category: 'Google Ads', run: () => gadsFetchAboveFold(start7, today, gadsFilters) },
  { key: 'gads.fetchBelowFold',        label: 'Below Fold',           category: 'Google Ads', run: () => gadsFetchBelowFold(start7, today, gadsFilters) },
  { key: 'gads.fetchEntityTables',     label: 'Entity Tables',        category: 'Google Ads', run: () => gadsFetchEntityTables(start7, today, gadsFilters) },
  { key: 'gads.fetchTargetingSections',label: 'Targeting Sections',   category: 'Google Ads', run: () => gadsFetchTargetingSections(start7, today) },
  { key: 'gads.getFilterOptions',      label: 'Filter Options',       category: 'Google Ads', run: () => gadsGetFilterOptions(start7, today) },

  // ── Internal ──
  { key: 'internal.getSyncFreshness',  label: 'Sync Freshness',       category: 'Internal',   run: () => internalGetSyncFreshness() },
  { key: 'internal.getTableStats',     label: 'Table Stats',          category: 'Internal',   run: () => internalGetTableStats() },
  { key: 'internal.getHealthRollup',   label: 'Health Rollup',        category: 'Internal',   run: () => internalGetHealthRollup() },
];

async function runCheck(def: EndpointDef): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    // Race against a soft timeout so a hung endpoint doesn't hold the whole
    // page. FAIL_MS is the ceiling — anything past that is a fail.
    const result = await Promise.race([
      def.run().then(() => 'ok' as const),
      new Promise<'timeout'>(res => setTimeout(() => res('timeout'), FAIL_MS + 500)),
    ]);
    const ms = Date.now() - t0;
    if (result === 'timeout') {
      return { key: def.key, label: def.label, category: def.category, status: 'fail', ms, error: `timeout after ${ms}ms` };
    }
    if (ms > FAIL_MS) return { key: def.key, label: def.label, category: def.category, status: 'fail', ms, error: `latency > ${FAIL_MS}ms` };
    if (ms > SLOW_MS) return { key: def.key, label: def.label, category: def.category, status: 'slow', ms };
    return { key: def.key, label: def.label, category: def.category, status: 'ok', ms };
  } catch (e) {
    const ms = Date.now() - t0;
    const msg = e instanceof Error ? e.message : String(e);
    return { key: def.key, label: def.label, category: def.category, status: 'fail', ms, error: msg };
  }
}

// ─── Bronze freshness card data ──────────────────────────────────────────────
//
// One row per source: max(ingested_at) from the primary bronze table, and
// hours-since. LinkedIn is intentionally omitted — atWork's LinkedIn ingest
// isn't wired up yet, so there's no bronze.linkedin_* table to query.

type BronzeSource = {
  key:    string;
  label:  string;
  table:  string;     // dot-qualified: bronze.xxx
};

const BRONZE_SOURCES: BronzeSource[] = [
  { key: 'meta', label: 'Meta',        table: 'bronze.meta_campaign_insight' },
  { key: 'ga4',  label: 'GA4',         table: 'bronze.ga4_channel_traffic'   },
  { key: 'gads', label: 'Google Ads',  table: 'bronze.gads_campaign_stats'   },
  // LinkedIn not ingested yet — see docs/README carryover for status.
];

type BronzeFreshness = {
  key:        string;
  label:      string;
  table:      string;
  latestAt:   string | null;
  hoursSince: number | null;
  status:     'ok' | 'slow' | 'fail' | 'no_data';
  error?:     string;
};

async function bronzeFreshness(src: BronzeSource): Promise<BronzeFreshness> {
  const [schema, table] = src.table.split('.');
  try {
    const sb = supabaseServer();
    const { data, error } = await sb.schema(schema as never).from(table)
      .select('ingested_at').order('ingested_at', { ascending: false }).limit(1);
    if (error) throw error;
    const latestAt = (data?.[0] as { ingested_at?: string } | undefined)?.ingested_at ?? null;
    if (!latestAt) {
      return { key: src.key, label: src.label, table: src.table, latestAt: null, hoursSince: null, status: 'no_data' };
    }
    const hoursSince = (Date.now() - new Date(latestAt).getTime()) / 3_600_000;
    let status: BronzeFreshness['status'] = 'ok';
    if (hoursSince > 48)      status = 'fail';
    else if (hoursSince > 30) status = 'slow';
    return { key: src.key, label: src.label, table: src.table, latestAt, hoursSince, status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { key: src.key, label: src.label, table: src.table, latestAt: null, hoursSince: null, status: 'fail', error: msg };
  }
}

// ─── Small rendering helpers ─────────────────────────────────────────────────

function statusIcon(status: CheckResult['status'] | BronzeFreshness['status']) {
  if (status === 'ok')      return <CheckCircle   className="w-5 h-5 text-green-500" />;
  if (status === 'slow')    return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
  if (status === 'no_data') return <AlertTriangle className="w-5 h-5 text-gray-500" />;
  return <XCircle className="w-5 h-5 text-red-500" />;
}

function statusVariant(status: CheckResult['status'] | BronzeFreshness['status']): StatusBadgeVariant {
  if (status === 'ok')      return 'success';
  if (status === 'slow')    return 'warning';
  if (status === 'no_data') return 'neutral';
  return 'danger';
}

function fmtInstant(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: '2-digit', minute: '2-digit',
    day: '2-digit', month: 'short',
  });
}

function fmtHoursSince(hoursSince: number | null): string {
  if (hoursSince == null) return '—';
  if (hoursSince < 1)  return `${Math.round(hoursSince * 60)}m ago`;
  if (hoursSince < 48) return `${hoursSince.toFixed(1)}h ago`;
  return `${(hoursSince / 24).toFixed(1)}d ago`;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function InternalHealth() {
  // Kick off every live check + bronze freshness lookup + weld freshness
  // read in parallel — this is the whole point of the page. Rendering
  // waits for the slowest one (bounded by FAIL_MS + 500).
  const [endpointResults, bronzeResults, weldServices] = await Promise.all([
    Promise.all(ENDPOINTS.map(runCheck)),
    Promise.all(BRONZE_SOURCES.map(bronzeFreshness)),
    getSyncFreshness(),
  ]);

  // ── Overall banner status ──
  // Red if ANY endpoint failed OR any bronze source > 48h stale.
  // Yellow if any endpoint slow OR bronze between 30-48h.
  // Green otherwise.
  const anyEndpointFail = endpointResults.some(r => r.status === 'fail');
  const anyEndpointSlow = endpointResults.some(r => r.status === 'slow');
  const anyBronzeFail   = bronzeResults.some(b => b.status === 'fail' || b.status === 'no_data');
  const anyBronzeSlow   = bronzeResults.some(b => b.status === 'slow');

  const level: 'ok' | 'warn' | 'crit' =
    (anyEndpointFail || anyBronzeFail) ? 'crit'
    : (anyEndpointSlow || anyBronzeSlow) ? 'warn'
    : 'ok';

  const bannerCls =
    level === 'crit' ? 'bg-red-900/20 border-red-700/50'
    : level === 'warn' ? 'bg-yellow-900/20 border-yellow-700/50'
    : 'bg-green-900/20 border-green-700/50';
  const bannerIconBg =
    level === 'crit' ? 'bg-red-600'
    : level === 'warn' ? 'bg-yellow-600'
    : 'bg-green-600';
  const bannerText =
    level === 'crit' ? 'text-red-400'
    : level === 'warn' ? 'text-yellow-400'
    : 'text-green-400';

  const failedCount = endpointResults.filter(r => r.status === 'fail').length;
  const slowCount   = endpointResults.filter(r => r.status === 'slow').length;
  const okCount     = endpointResults.filter(r => r.status === 'ok').length;

  const headline =
    level === 'crit' ? (anyEndpointFail
      ? `${failedCount} endpoint${failedCount === 1 ? '' : 's'} failing`
      : 'Bronze source beyond 48h stale threshold')
    : level === 'warn' ? (anyEndpointSlow
      ? `${slowCount} endpoint${slowCount === 1 ? '' : 's'} slow (>${SLOW_MS}ms)`
      : 'Bronze source between 30h–48h stale')
    : 'All systems operational';

  const sub =
    level === 'crit'
      ? [
          anyEndpointFail && `${failedCount} failed`,
          anyBronzeFail   && bronzeResults.filter(b => b.status === 'fail' || b.status === 'no_data').map(b => b.label).join(', ') + ' bronze stale',
        ].filter(Boolean).join(' · ')
      : level === 'warn'
      ? `${okCount} ok · ${slowCount} slow · ${failedCount} failed. All bronze data landed within 30h.`
      : `${endpointResults.length} endpoints live-checked, all under ${SLOW_MS}ms. All bronze data fresh.`;

  // Sort endpoints for stable rendering — by category, then by label.
  const sortedEndpoints = [...endpointResults].sort((a, b) =>
    a.category.localeCompare(b.category) || a.label.localeCompare(b.label));

  // Group by category for the endpoints card.
  const grouped = new Map<string, CheckResult[]>();
  for (const r of sortedEndpoints) {
    if (!grouped.has(r.category)) grouped.set(r.category, []);
    grouped.get(r.category)!.push(r);
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Health
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Live probes across {ENDPOINTS.length} backend endpoints + bronze-tier ingest freshness.
          Auto-refreshes every 30s.
        </p>
      </div>

      {/* ── Overall banner ── */}
      <div className={`flex items-center gap-4 p-5 border rounded-none mb-5 ${bannerCls}`}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${bannerIconBg}`}>
          {level === 'ok'
            ? <CheckCircle   className="w-5 h-5 text-white" />
            : <AlertTriangle className="w-5 h-5 text-white" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-base ${bannerText}`}>{headline}</p>
          <p className="text-sm text-gray-400 mt-0.5">{sub}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-xs text-gray-400">
          <Clock className="w-3.5 h-3.5" />
          Checked {fmtInstant(new Date().toISOString())}
        </div>
      </div>

      {/* ── Bronze freshness card ── */}
      <SectionCard title="Bronze Freshness" icon={<Database className="h-4 w-4" />}>
        <p className="text-xs text-gray-500 mb-3">
          Latest <code className="text-gray-400">ingested_at</code> per primary bronze table.
          Thresholds: <span className="text-green-400">&lt;30h ok</span>,
          {' '}<span className="text-yellow-400">30–48h slow</span>,
          {' '}<span className="text-red-400">&gt;48h stale</span>.
        </p>
        <div className="space-y-2">
          {bronzeResults.map(b => (
            <div key={b.key} className="border border-gray-800 rounded p-3 bg-gray-950/40 flex items-start gap-3">
              <div className="mt-0.5">{statusIcon(b.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-white font-medium">{b.label}</span>
                  <code className="text-xs text-gray-500 bg-black/30 px-1.5 py-0.5 rounded">{b.table}</code>
                  <StatusBadge variant={statusVariant(b.status)}>{b.status}</StatusBadge>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {b.status === 'no_data'
                    ? 'No rows ingested yet.'
                    : b.error
                    ? <span className="text-red-400">{b.error}</span>
                    : <>Latest ingest {fmtInstant(b.latestAt)} · {fmtHoursSince(b.hoursSince)}</>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Endpoints card ── */}
      <SectionCard title="Endpoints (Live Check)" icon={<Zap className="h-4 w-4" />}>
        <p className="text-xs text-gray-500 mb-3">
          Every backend server action called with a 7-day window ({start7} → {today}) and empty filters.
          Latency thresholds: <span className="text-green-400">&lt;{SLOW_MS}ms ok</span>,
          {' '}<span className="text-yellow-400">{SLOW_MS}–{FAIL_MS}ms slow</span>,
          {' '}<span className="text-red-400">&gt;{FAIL_MS}ms or throw = fail</span>.
        </p>
        <div className="space-y-5">
          {[...grouped.entries()].map(([category, rows]) => (
            <div key={category}>
              <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {category} <span className="text-gray-600">({rows.length})</span>
              </h3>
              <div className="space-y-2">
                {rows.map(r => (
                  <div key={r.key} className="border border-gray-800 rounded p-3 bg-gray-950/40 flex items-start gap-3">
                    <div className="mt-0.5">{statusIcon(r.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-white font-medium">{r.label}</span>
                        <code className="text-xs text-gray-500 bg-black/30 px-1.5 py-0.5 rounded">{r.key}</code>
                        <StatusBadge variant={statusVariant(r.status)}>{r.status}</StatusBadge>
                        <span className={`text-xs tabular-nums ml-auto ${
                          r.status === 'fail' ? 'text-red-400'
                          : r.status === 'slow' ? 'text-yellow-400'
                          : 'text-gray-400'
                        }`}>
                          {r.ms.toLocaleString('en-AU')}ms
                        </span>
                      </div>
                      {r.error && (
                        <div className="text-xs text-red-400 mt-1 break-words">
                          {r.error}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Weld sync freshness (preserved from previous version) ── */}
      <SectionCard title="Weld Sync Freshness" icon={<Activity className="h-4 w-4" />}>
        <p className="text-xs text-gray-500 mb-3">
          Freshness of the 3 Weld connections measured against the silver-tier
          landing table (rule 3).
        </p>
        <div className="space-y-2">
          {weldServices.map(s => {
            const variant: StatusBadgeVariant =
              s.status === 'operational' ? 'success'
              : s.status === 'degraded'  ? 'warning'
              : s.status === 'stale'     ? 'danger'
              : 'neutral';
            const icon =
              s.status === 'operational' ? <CheckCircle   className="w-5 h-5 text-green-500" />
              : s.status === 'degraded'  ? <AlertTriangle className="w-5 h-5 text-yellow-500" />
              : <XCircle className="w-5 h-5 text-red-500" />;
            return (
              <div key={s.connection.connection_id} className="border border-gray-800 rounded p-3 bg-gray-950/40 flex items-start gap-3">
                <div className="mt-0.5">{icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-white font-medium">{s.connection.label}</span>
                    <code className="text-xs text-gray-500 bg-black/30 px-1.5 py-0.5 rounded">{s.connection.connection_id}</code>
                    <StatusBadge variant={variant}>{s.status}</StatusBadge>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{s.statusReason}</div>
                  <div className="text-xs text-gray-600 mt-1">
                    Table: <code className="text-gray-400">{s.connection.freshnessTable}</code>
                    {s.rowCount != null && <> · {s.rowCount.toLocaleString('en-AU')} rows</>}
                    {' · '}Expected cadence: {s.connection.expectedCadenceHours}h
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* ── Known gaps (preserved from previous version) ── */}
      <SectionCard title="Known Data Gaps" icon={<Info className="h-4 w-4" />}>
        <p className="text-xs text-gray-500 mb-3">
          Surfaced as status rather than errors — expected behaviour, not broken syncs.
        </p>
        <div className="space-y-3">
          {KNOWN_GAPS.map(g => (
            <div key={g.id} className="border border-gray-800 rounded p-3 bg-gray-950/40">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-white font-medium">{g.title}</div>
                <StatusBadge variant="info">{g.status}</StatusBadge>
              </div>
              <div className="text-xs text-gray-400 mt-1">{g.detail}</div>
              <div className="text-xs text-gray-600 mt-2 flex gap-3">
                <span>scope: <code className="text-gray-300">{g.scope}</code></span>
                <span>since {g.since}</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}
