/**
 * /internal/weld-connections — Weld connection register (read-only).
 *
 * Cloned composition from src/pages-bft/internal/weld-connections.tsx:
 *   - dark header row + Plug icon + one-line lead
 *   - StatCard trio at top
 *   - list of ConnectionRow tiles
 * BFT wires this to `agency_weld_map` (multi-agency BFT construct with
 * schema_name / active flags) and a live Weld-API lookup. atWork has a
 * fixed static register of 3 connections (from .atwork-domain), so we
 * render that register + the freshness inferred from silver.* tables.
 * No Weld API calls (rule 4: read-only from Supabase only).
 */
import { Plug, CheckCircle2, XCircle } from 'lucide-react';
import { StatCard }    from '@/components/skills/StatCard';
import { StatusBadge } from '@/components/skills/StatusBadge';
import { getSyncFreshness } from '@/lib/queries/internal';

export const revalidate = 60;

export default async function WeldConnectionsPage() {
  const conns = await getSyncFreshness();
  const activeCount = conns.filter(c => c.status !== 'no_data').length;

  return (
    <>
      <header className="border-b border-gray-800 pb-4 mb-6">
        <div className="flex items-center gap-2">
          <Plug className="h-5 w-5 text-purple-400" />
          <h1 className="text-lg font-semibold text-white">Weld Connections</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Static register of the 3 Weld connections powering atWork&apos;s dashboards.
          Freshness is inferred from the silver-tier tables each connection lands into.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard label="Registered connections" value={conns.length}    size="lg" />
        <StatCard label="With data landed"       value={activeCount}     size="lg" valueClassName="text-green-400" />
        <StatCard label="Workspace"              value={<code className="text-sm text-gray-300 font-mono">senateshj</code>} size="md" />
      </div>

      <div className="space-y-2">
        {conns.map(c => {
          const isActive = c.status !== 'no_data';
          return (
            <div
              key={c.connection.connection_id}
              className={`border rounded-none p-3 ${isActive ? 'border-gray-700 bg-gray-900/40' : 'border-gray-800 bg-gray-950/40 opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-sm text-white bg-black/30 px-1.5 py-0.5 rounded">{c.connection.label}</code>
                    {isActive
                      ? <span className="inline-flex items-center gap-1 text-xs text-green-400 border border-green-800 bg-green-950/40 rounded px-1.5 py-0.5"><CheckCircle2 className="h-3 w-3" />active</span>
                      : <span className="inline-flex items-center gap-1 text-xs text-gray-500 border border-gray-700 bg-gray-900/40 rounded px-1.5 py-0.5"><XCircle       className="h-3 w-3" />no data</span>
                    }
                    <StatusBadge variant={
                      c.status === 'operational' ? 'success' :
                      c.status === 'degraded'    ? 'warning' :
                      c.status === 'stale'       ? 'danger'  :
                      'neutral'
                    }>{c.status}</StatusBadge>
                  </div>
                  <div className="text-xs text-gray-400 space-x-4">
                    <span>connection_id: <code className="text-gray-200">{c.connection.connection_id}</code></span>
                    <span>source: <code className="text-gray-200">{c.connection.source}</code></span>
                  </div>
                  <div className="text-xs text-gray-500 pt-0.5">
                    Freshness table: <code className="text-gray-300">{c.connection.freshnessTable}</code>
                    {' · '}Latest: <code className="text-gray-300">{c.latestDate ?? '—'}</code>
                    {c.rowCount != null && <> · {c.rowCount.toLocaleString('en-AU')} rows</>}
                  </div>
                  <div className="text-xs text-gray-600 pt-0.5">{c.statusReason}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
