/**
 * /internal/data-tables — bronze / silver / gold table registry.
 *
 * Composition cloned from src/pages-bft/internal/dashboard.tsx's
 * "Studios by Agency" table pattern: SectionCard wrapping a plain HTML
 * table with gray-500 header row, divide-y-gray-800 rows, and monospace
 * numerics. BFT groups by agency; we group by schema (bronze / silver /
 * gold) since atWork has no gold layer landed yet (rule 5 — drop what
 * doesn't exist, don't stub).
 */
import { Database, AlertCircle } from 'lucide-react';
import { SectionCard } from '@/components/skills/SectionCard';
import { StatusBadge } from '@/components/skills/StatusBadge';
import { getTableStats, MONITORED_TABLES, type TableStats } from '@/lib/queries/internal';

export const revalidate = 60;

function TableGroup({ schema, rows }: { schema: TableStats['schema']; rows: TableStats[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-xs text-gray-500 border border-gray-800 rounded p-3">
        No <code className="text-gray-300">{schema}</code>-tier tables in the monitored registry.
      </div>
    );
  }
  const totalRows = rows.reduce((s, r) => s + (r.rowCount ?? 0), 0);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-gray-500 border-b border-gray-800">
          <th className="text-left  pb-2 font-medium">Table</th>
          <th className="text-right pb-2 font-medium">Rows</th>
          <th className="text-right pb-2 font-medium">Latest Date</th>
          <th className="text-center pb-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-800">
        {rows.map(r => (
          <tr key={`${r.schema}.${r.table}`} className="text-gray-400">
            <td className="py-2 text-white font-mono text-xs">{r.schema}.{r.table}</td>
            <td className="py-2 text-right font-mono">{r.rowCount?.toLocaleString('en-AU') ?? '—'}</td>
            <td className="py-2 text-right font-mono">{r.latestDate ?? '—'}</td>
            <td className="py-2 text-center">
              {r.hasError
                ? <StatusBadge variant="danger">error</StatusBadge>
                : r.rowCount === 0
                  ? <StatusBadge variant="warning">empty</StatusBadge>
                  : <StatusBadge variant="success">ok</StatusBadge>}
            </td>
          </tr>
        ))}
        <tr className="text-gray-400 border-t-2 border-gray-700">
          <td className="py-2 text-white font-bold">Total</td>
          <td className="py-2 text-right font-mono font-bold text-white">{totalRows.toLocaleString('en-AU')}</td>
          <td /><td />
        </tr>
      </tbody>
    </table>
  );
}

export default async function DataTablesPage() {
  const stats = await getTableStats();
  const bySchema: Record<TableStats['schema'], TableStats[]> = { bronze: [], silver: [], gold: [] };
  for (const s of stats) bySchema[s.schema].push(s);
  const errCount = stats.filter(s => s.hasError).length;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Database className="h-5 w-5" />
          Data Tables
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Row counts and last-refreshed dates for the {MONITORED_TABLES.length} tables atWork&apos;s client dashboards read from.
        </p>
      </div>

      {errCount > 0 && (
        <div className="flex items-start gap-2 text-sm text-red-400 border border-red-900 bg-red-950/40 rounded p-3 mb-5">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <div>
            <div className="font-medium">{errCount} table{errCount === 1 ? '' : 's'} failed to query</div>
            <div className="text-xs text-red-500 mt-0.5">Marked below. Read-only page — no remediation from here.</div>
          </div>
        </div>
      )}

      <SectionCard title="Bronze" icon={<Database className="h-4 w-4" />}>
        <TableGroup schema="bronze" rows={bySchema.bronze} />
      </SectionCard>

      <SectionCard title="Silver" icon={<Database className="h-4 w-4" />}>
        <TableGroup schema="silver" rows={bySchema.silver} />
      </SectionCard>

      {bySchema.gold.length > 0 && (
        <SectionCard title="Gold" icon={<Database className="h-4 w-4" />}>
          <TableGroup schema="gold" rows={bySchema.gold} />
        </SectionCard>
      )}
    </>
  );
}
