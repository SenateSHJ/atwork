/**
 * /internal — Overview / dashboard rollup.
 *
 * Cloned composition from src/pages-bft/internal/dashboard.tsx:
 *   - Header (title + one-line sub)
 *   - Grid of StatCard (top metrics)
 *   - Per-section SectionCard containers
 * BFT's dashboard is stocktake-focused (studios, agencies, stocktake reports).
 * atWork's rollup is pipeline-focused (sync freshness + row counts + gaps),
 * per rule 5: BFT-only concerns dropped, not stubbed.
 */
import Link from 'next/link';
import { Activity, Plug, Database, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { StatCard }    from '@/components/skills/StatCard';
import { SectionCard } from '@/components/skills/SectionCard';
import { StatusBadge } from '@/components/skills/StatusBadge';
import { getHealthRollup, KNOWN_GAPS } from '@/lib/queries/internal';

export const revalidate = 60;

export default async function InternalOverview() {
  const rollup = await getHealthRollup();

  const banner =
    rollup.overall === 'operational' ? { icon: <CheckCircle2 className="w-5 h-5 text-white" />,   bg: 'bg-green-900/20 border-green-700/50',   iconBg: 'bg-green-600',  text: 'text-green-400'  } :
    rollup.overall === 'degraded'    ? { icon: <AlertTriangle className="w-5 h-5 text-white" />,  bg: 'bg-yellow-900/20 border-yellow-700/50', iconBg: 'bg-yellow-600', text: 'text-yellow-400' } :
                                       { icon: <AlertTriangle className="w-5 h-5 text-white" />,  bg: 'bg-red-900/20 border-red-700/50',       iconBg: 'bg-red-600',    text: 'text-red-400'    };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Internal — Overview</h1>
        <p className="text-xs text-gray-500 mt-1">High-level snapshot of the atWork data pipeline.</p>
      </div>

      {/* Overall banner (mirrors BFT health OverallBanner pattern) */}
      <div className={`flex items-center gap-4 p-5 border rounded-none mb-5 ${banner.bg}`}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${banner.iconBg}`}>
          {banner.icon}
        </div>
        <div>
          <p className={`font-semibold text-base ${banner.text}`}>{rollup.headline}</p>
          <p className="text-sm text-gray-400 mt-0.5">{rollup.sub}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard icon={<Plug     className="h-4 w-4" />} label="Weld Connections" value={rollup.syncFreshness.length} size="lg" />
        <StatCard icon={<Database className="h-4 w-4" />} label="Monitored Tables"  value={rollup.tableCount}          size="lg" />
        <StatCard icon={<Activity className="h-4 w-4" />} label="Rows Landed"       value={rollup.totalRows.toLocaleString('en-AU')} size="lg" />
        <StatCard icon={<Info     className="h-4 w-4" />} label="Known Gaps"        value={rollup.gaps}                size="lg" subtext="informational, not errors" />
      </div>

      <SectionCard title="Connection Freshness" icon={<Plug className="h-4 w-4" />}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left  pb-2 font-medium">Connection</th>
              <th className="text-left  pb-2 font-medium">Weld ID</th>
              <th className="text-right pb-2 font-medium">Latest Date</th>
              <th className="text-right pb-2 font-medium">Rows</th>
              <th className="text-center pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {rollup.syncFreshness.map(f => (
              <tr key={f.connection.connection_id} className="text-gray-400">
                <td className="py-2 text-white font-medium">{f.connection.label}</td>
                <td className="py-2 font-mono text-xs text-gray-500">{f.connection.connection_id}</td>
                <td className="py-2 text-right font-mono">{f.latestDate ?? '—'}</td>
                <td className="py-2 text-right font-mono">{f.rowCount?.toLocaleString('en-AU') ?? '—'}</td>
                <td className="py-2 text-center">
                  <StatusBadge variant={
                    f.status === 'operational' ? 'success' :
                    f.status === 'degraded'    ? 'warning' :
                    f.status === 'stale'       ? 'danger'  :
                    'neutral'
                  }>
                    {f.status}
                  </StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="Known Data Gaps" icon={<Info className="h-4 w-4" />}>
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

      {/* Quick links (mirrors BFT dashboard's bottom nav-tile row) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'Health',           href: '/internal/health',           icon: Activity },
          { label: 'Weld Connections', href: '/internal/weld-connections', icon: Plug     },
          { label: 'Data Tables',      href: '/internal/data-tables',      icon: Database },
        ].map(link => (
          <Link
            key={link.href}
            href={link.href}
            className="flex flex-col items-center gap-1 h-16 bg-gray-800 border border-gray-700 rounded-none hover:border-gray-500 hover:bg-gray-700/50 transition-colors p-3 text-gray-400 hover:text-white"
          >
            <link.icon className="h-5 w-5" />
            <span className="text-xs">{link.label}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
