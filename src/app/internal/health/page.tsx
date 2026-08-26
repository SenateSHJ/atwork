/**
 * /internal/health — pipeline & sync health.
 *
 * Cloned composition from src/pages-bft/internal/health.tsx:
 *   - OverallBanner (green/yellow/red top strip)
 *   - Per-service rows with StatusIcon + StatusBadge + last-check meta
 * BFT wires this to a bespoke health-service registry (useHealth hook +
 * multi-service uptime bars). atWork's monitored surface is the 3 Weld
 * connections' freshness (rule 3), so the "services" list is derived
 * directly from getSyncFreshness. Known data gaps render alongside as
 * informational tiles per rule 3 — status, not errors.
 */
import { Activity, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';
import { SectionCard } from '@/components/skills/SectionCard';
import { StatusBadge } from '@/components/skills/StatusBadge';
import { getSyncFreshness, KNOWN_GAPS } from '@/lib/queries/internal';

export const revalidate = 60;

export default async function InternalHealth() {
  const services = await getSyncFreshness();
  const hasCritical = services.some(s => s.status === 'stale' || s.status === 'no_data');
  const hasWarning  = services.some(s => s.status === 'degraded');
  const bannerCls   = hasCritical ? 'bg-red-900/20 border-red-700/50'
                    : hasWarning  ? 'bg-yellow-900/20 border-yellow-700/50'
                    :                'bg-green-900/20 border-green-700/50';
  const bannerIcon  = hasCritical ? 'bg-red-600' : hasWarning ? 'bg-yellow-600' : 'bg-green-600';
  const bannerText  = hasCritical ? 'text-red-400' : hasWarning ? 'text-yellow-400' : 'text-green-400';
  const headline    = hasCritical ? 'Sync issue detected' : hasWarning ? 'Sync slightly delayed' : 'All systems operational';
  const sub         = hasCritical
    ? `${services.filter(s => s.status === 'stale' || s.status === 'no_data').map(s => s.connection.label).join(', ')} beyond expected cadence.`
    : hasWarning
    ? `${services.filter(s => s.status === 'degraded').map(s => s.connection.label).join(', ')} slightly beyond expected cadence.`
    : 'All monitored Weld connections have landed silver-tier rows within their expected cadence.';

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Health
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Pipeline freshness for the 3 Weld connections powering atWork&apos;s dashboards.
        </p>
      </div>

      <div className={`flex items-center gap-4 p-5 border rounded-lg mb-5 ${bannerCls}`}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${bannerIcon}`}>
          {hasCritical || hasWarning
            ? <AlertTriangle className="w-5 h-5 text-white" />
            : <CheckCircle   className="w-5 h-5 text-white" />
          }
        </div>
        <div>
          <p className={`font-semibold text-base ${bannerText}`}>{headline}</p>
          <p className="text-sm text-gray-400 mt-0.5">{sub}</p>
        </div>
      </div>

      <SectionCard title="Sync Freshness" icon={<Activity className="h-4 w-4" />}>
        <div className="space-y-2">
          {services.map(s => {
            const icon = s.status === 'operational' ? <CheckCircle   className="w-5 h-5 text-green-500" />
                       : s.status === 'degraded'    ? <AlertTriangle className="w-5 h-5 text-yellow-500" />
                       :                              <XCircle        className="w-5 h-5 text-red-500" />;
            const variant = s.status === 'operational' ? 'success'
                          : s.status === 'degraded'    ? 'warning'
                          : s.status === 'stale'       ? 'danger'
                          :                              'neutral';
            return (
              <div key={s.connection.connection_id} className="border border-gray-800 rounded p-3 bg-gray-950/40 flex items-start gap-3">
                <div className="mt-0.5">{icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
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

      <SectionCard title="Known Data Gaps" icon={<Info className="h-4 w-4" />}>
        <p className="text-xs text-gray-500 mb-3">Surfaced as status rather than errors — expected behaviour, not broken syncs.</p>
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
