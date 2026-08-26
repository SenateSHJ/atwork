/**
 * Internal-tier read-only monitoring queries.
 *
 * All queries hit Supabase directly (service role, server-side). No Weld API
 * calls, no writes. Data source is what silver-sync has already landed —
 * we monitor freshness, not the upstream connector.
 */
import { supabaseServer } from '@/lib/supabase/server';

// ─── Weld connections (atWork has 3) ─────────────────────────────────────────

export interface WeldConnection {
  connection_id: string;
  label:         string;
  source:        'meta' | 'ga4' | 'gads';
  // Table used to measure freshness for this connection.
  freshnessTable: string;
  // Expected cadence, in hours — beyond this without a fresh row = stale.
  expectedCadenceHours: number;
}

export const WELD_CONNECTIONS: WeldConnection[] = [
  { connection_id: 'm6Us-LmpX6nabV', label: 'Meta Ads',   source: 'meta', freshnessTable: 'silver.meta_campaigns', expectedCadenceHours: 24 },
  { connection_id: '7Tb1WwWgQinMpf', label: 'GA4',        source: 'ga4',  freshnessTable: 'silver.ga4_overview',   expectedCadenceHours: 24 },
  { connection_id: 'aH7xqWLE00Y9BK', label: 'Google Ads', source: 'gads', freshnessTable: 'silver.gads_campaigns', expectedCadenceHours: 24 },
];

// ─── Sync freshness — max(date) per silver table + row count ─────────────────

type SyncStatus = 'operational' | 'degraded' | 'stale' | 'no_data';

export interface SyncFreshness {
  connection:       WeldConnection;
  latestDate:       string | null;      // YYYY-MM-DD
  ageHours:         number | null;      // hours since latest date at 00:00
  rowCount:         number | null;
  status:           SyncStatus;
  statusReason:     string;
}

async function tableFreshness(schema: string, table: string, expectedH: number, label: string): Promise<Omit<SyncFreshness, 'connection'>> {
  const sb = supabaseServer();
  const [maxRes, countRes] = await Promise.all([
    sb.schema(schema as never).from(table).select('date').order('date', { ascending: false }).limit(1),
    sb.schema(schema as never).from(table).select('date', { count: 'exact', head: true }),
  ]);
  const latest = (maxRes.data?.[0] as { date?: string } | undefined)?.date ?? null;
  const rowCount = countRes.count ?? null;
  if (!latest) {
    return { latestDate: null, ageHours: null, rowCount, status: 'no_data', statusReason: `${label} has no rows` };
  }
  const ageMs = Date.now() - new Date(`${latest}T00:00:00Z`).getTime();
  const ageH  = ageMs / 3_600_000;
  let status: SyncStatus = 'operational';
  let reason = `Last synced ${latest} (${Math.floor(ageH)}h ago)`;
  if (ageH > expectedH * 2)      { status = 'stale';    reason = `${Math.floor(ageH)}h since last sync — expected every ${expectedH}h`; }
  else if (ageH > expectedH)     { status = 'degraded'; reason = `${Math.floor(ageH)}h since last sync — slightly beyond ${expectedH}h cadence`; }
  return { latestDate: latest, ageHours: ageH, rowCount, status, statusReason: reason };
}

export async function getSyncFreshness(): Promise<SyncFreshness[]> {
  return Promise.all(
    WELD_CONNECTIONS.map(async conn => {
      const [schema, table] = conn.freshnessTable.split('.');
      const stats = await tableFreshness(schema, table, conn.expectedCadenceHours, conn.label);
      return { connection: conn, ...stats };
    }),
  );
}

// ─── Row counts per bronze / silver / gold table ──────────────────────────────

export interface TableStats {
  schema:     'bronze' | 'silver' | 'gold';
  table:      string;
  rowCount:   number | null;
  latestDate: string | null;
  hasError:   boolean;
}

// atWork's data-layer surface — the tables the 5 client pages actually read from
// (traced from src/lib/queries/*.ts). If new tables are added there, mirror here.
export const MONITORED_TABLES: { schema: TableStats['schema']; table: string; hasDate: boolean }[] = [
  // Meta
  { schema: 'silver', table: 'meta_campaigns',        hasDate: true  },
  { schema: 'silver', table: 'meta_ads_with_creative',hasDate: true  },
  { schema: 'bronze', table: 'meta_campaign_insight', hasDate: true  },
  { schema: 'bronze', table: 'meta_adset_insight',    hasDate: true  },
  { schema: 'bronze', table: 'meta_ad_insight',       hasDate: true  },
  // Google Ads
  { schema: 'silver', table: 'gads_campaigns',        hasDate: true  },
  { schema: 'silver', table: 'gads_ad_groups',        hasDate: true  },
  { schema: 'silver', table: 'gads_keywords',         hasDate: true  },
  { schema: 'silver', table: 'gads_search_terms',     hasDate: true  },
  // GA4
  { schema: 'silver', table: 'ga4_overview',          hasDate: true  },
  { schema: 'silver', table: 'ga4_channels',          hasDate: true  },
  { schema: 'silver', table: 'ga4_pages',             hasDate: true  },
  { schema: 'silver', table: 'ga4_events',            hasDate: true  },
  { schema: 'silver', table: 'ga4_device',            hasDate: true  },
  { schema: 'bronze', table: 'ga4_social_media',      hasDate: true  },
  { schema: 'bronze', table: 'ga4_campaign_performance', hasDate: true },
];

export async function getTableStats(): Promise<TableStats[]> {
  const sb = supabaseServer();
  return Promise.all(
    MONITORED_TABLES.map(async ({ schema, table, hasDate }) => {
      try {
        const countQ = sb.schema(schema as never).from(table).select('*', { count: 'exact', head: true });
        const dateQ  = hasDate
          ? sb.schema(schema as never).from(table).select('date').order('date', { ascending: false }).limit(1)
          : Promise.resolve({ data: null, error: null } as const);
        const [countRes, dateRes] = await Promise.all([countQ, dateQ]);
        return {
          schema,
          table,
          rowCount:   countRes.count ?? null,
          latestDate: (dateRes.data?.[0] as { date?: string } | undefined)?.date ?? null,
          hasError:   Boolean(countRes.error),
        };
      } catch {
        return { schema, table, rowCount: null, latestDate: null, hasError: true };
      }
    }),
  );
}

// ─── Known data gaps (surfaced as status, not errors) ────────────────────────

export interface KnownGap {
  id:           string;
  title:        string;
  detail:       string;
  scope:        string;
  since:        string;   // YYYY-MM-DD when the gap started
  status:       'informational' | 'accepted';
}

export const KNOWN_GAPS: KnownGap[] = [
  {
    id:     'gads-keywords-frozen-2026-07-17',
    title:  'Google Ads keyword & search-term data frozen',
    detail: 'The underlying keyword_stats report last received new data on 2026-07-17. Keyword-level metrics after that date will be empty regardless of the selected range. This is upstream — not a atWork pipeline issue.',
    scope:  'silver.gads_keywords, silver.gads_search_terms',
    since:  '2026-07-17',
    status: 'accepted',
  },
  {
    id:     'gads-search-campaigns-paused',
    title:  'Google Ads Search campaigns paused',
    detail: 'Search campaigns paused since Jan 2025 by client decision. Empty search-tier data is expected, not a broken sync.',
    scope:  'silver.gads_search_terms',
    since:  '2025-01-01',
    status: 'accepted',
  },
];

// ─── Overall health rollup ───────────────────────────────────────────────────

export type OverallStatus = 'operational' | 'degraded' | 'issue';

export interface HealthRollup {
  overall:        OverallStatus;
  headline:       string;
  sub:            string;
  syncFreshness:  SyncFreshness[];
  tableCount:     number;
  totalRows:      number;
  gaps:           number;
}

export async function getHealthRollup(): Promise<HealthRollup> {
  const [freshness, tables] = await Promise.all([getSyncFreshness(), getTableStats()]);
  const anyStale    = freshness.some(f => f.status === 'stale' || f.status === 'no_data');
  const anyDegraded = freshness.some(f => f.status === 'degraded');
  let overall: OverallStatus = 'operational';
  let headline = 'All sync connections healthy';
  let sub      = 'All 3 Weld connections have landed silver-tier rows within their expected cadence.';
  if (anyStale) {
    overall = 'issue';
    const names = freshness.filter(f => f.status === 'stale' || f.status === 'no_data').map(f => f.connection.label);
    headline = 'Sync issue detected';
    sub = `${names.join(', ')} beyond expected cadence.`;
  } else if (anyDegraded) {
    overall = 'degraded';
    const names = freshness.filter(f => f.status === 'degraded').map(f => f.connection.label);
    headline = 'Sync slightly delayed';
    sub = `${names.join(', ')} slightly beyond expected cadence.`;
  }
  const totalRows = tables.reduce((s, t) => s + (t.rowCount ?? 0), 0);
  return { overall, headline, sub, syncFreshness: freshness, tableCount: tables.length, totalRows, gaps: KNOWN_GAPS.length };
}
