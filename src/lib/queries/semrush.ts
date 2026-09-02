import { supabaseServer } from '@/lib/supabase/server'

const DOMAIN = 'atwork.com.au'
const DB = 'au'

export type SemrushOverview = {
  snapshot_date:    string
  rank:             number
  organic_keywords: number
  organic_traffic:  number
  organic_cost:     number
  top3_keywords:    number
  top10_keywords:   number
  total_backlinks:  number
  referring_domains: number
  trust_score:      number
}

export type SemrushOverviewPair = {
  current: SemrushOverview | null
  prior:   SemrushOverview | null
}

export type SemrushKeyword = {
  keyword:           string
  position:          number | null
  previous_position: number | null
  search_volume:     number
  cpc:               number
  url:               string | null
  traffic_pct:       number
}

export type SemrushTrendPoint = {
  snapshot_date:    string
  organic_keywords: number
  organic_traffic:  number
  total_backlinks:  number
}

// Latest snapshot in the range, plus the snapshot from the equivalent
// prior period (same length, immediately before). Delta arrows on the
// scorecards read the pair.
export async function getSemrushOverview(range: { from: string; to: string }): Promise<SemrushOverviewPair> {
  const sb = supabaseServer()

  const [current, prior] = await Promise.all([
    fetchSnapshotOn(sb, range.to),
    fetchSnapshotOn(sb, priorEndDate(range)),
  ])
  return { current, prior }
}

async function fetchSnapshotOn(sb: ReturnType<typeof supabaseServer>, dateIso: string): Promise<SemrushOverview | null> {
  // Take the latest snapshot on or before dateIso.
  const { data: snap } = await sb.schema('silver').from('semrush_domain_snapshot')
    .select('snapshot_date,rank,organic_keywords,organic_traffic,organic_cost')
    .eq('domain', DOMAIN).eq('db', DB)
    .lte('snapshot_date', dateIso)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!snap) return null

  const { data: kw } = await sb.schema('silver').from('semrush_organic_keywords')
    .select('position')
    .eq('domain', DOMAIN).eq('db', DB)
    .eq('snapshot_date', snap.snapshot_date)
  const top3  = (kw ?? []).filter(k => (k.position ?? 999) <= 3).length
  const top10 = (kw ?? []).filter(k => (k.position ?? 999) <= 10).length

  const { data: bl } = await sb.schema('silver').from('semrush_backlinks_overview')
    .select('snapshot_date,total_backlinks,referring_domains,trust_score')
    .eq('domain', DOMAIN)
    .lte('snapshot_date', dateIso)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    snapshot_date:     snap.snapshot_date,
    rank:              Number(snap.rank             ?? 0),
    organic_keywords:  Number(snap.organic_keywords ?? 0),
    organic_traffic:   Number(snap.organic_traffic  ?? 0),
    organic_cost:      Number(snap.organic_cost     ?? 0),
    top3_keywords:     top3,
    top10_keywords:    top10,
    total_backlinks:   Number(bl?.total_backlinks   ?? 0),
    referring_domains: Number(bl?.referring_domains ?? 0),
    trust_score:       Number(bl?.trust_score       ?? 0),
  }
}

function priorEndDate(range: { from: string; to: string }): string {
  const from = new Date(range.from + 'T00:00:00Z').getTime()
  const to   = new Date(range.to   + 'T00:00:00Z').getTime()
  const lenMs = to - from
  const priorEndMs = from - 86_400_000
  const d = new Date(priorEndMs)
  return d.toISOString().slice(0, 10)
  // priorEndMs is used only for the "as of" lookup; the range length
  // matters for user-facing labelling, not for snapshot picking.
  void lenMs
}

// Top N organic keywords for the latest snapshot in the range, sorted by
// traffic share desc, then search volume desc.
export async function getSemrushTopKeywords(range: { from: string; to: string }, limit = 50): Promise<SemrushKeyword[]> {
  const sb = supabaseServer()
  const { data: latest } = await sb.schema('silver').from('semrush_domain_snapshot')
    .select('snapshot_date')
    .eq('domain', DOMAIN).eq('db', DB)
    .lte('snapshot_date', range.to)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!latest) return []

  const { data } = await sb.schema('silver').from('semrush_organic_keywords')
    .select('keyword,position,previous_position,search_volume,cpc,url,traffic_pct')
    .eq('domain', DOMAIN).eq('db', DB)
    .eq('snapshot_date', latest.snapshot_date)
    .order('traffic_pct', { ascending: false })
    .order('search_volume', { ascending: false })
    .limit(limit)
  return (data ?? []).map(r => ({
    keyword:           String(r.keyword),
    position:          r.position ?? null,
    previous_position: r.previous_position ?? null,
    search_volume:     Number(r.search_volume ?? 0),
    cpc:               Number(r.cpc ?? 0),
    url:               r.url ?? null,
    traffic_pct:       Number(r.traffic_pct ?? 0),
  }))
}

// One point per snapshot date in the range: keyword count, traffic, backlinks.
// Joins the two snapshot tables on snapshot_date; missing on either side
// coalesces to null so the chart handles absence gracefully.
export async function getSemrushTrend(range: { from: string; to: string }): Promise<SemrushTrendPoint[]> {
  const sb = supabaseServer()
  const [{ data: domain }, { data: bl }] = await Promise.all([
    sb.schema('silver').from('semrush_domain_snapshot')
      .select('snapshot_date,organic_keywords,organic_traffic')
      .eq('domain', DOMAIN).eq('db', DB)
      .gte('snapshot_date', range.from).lte('snapshot_date', range.to)
      .order('snapshot_date', { ascending: true }),
    sb.schema('silver').from('semrush_backlinks_overview')
      .select('snapshot_date,total_backlinks')
      .eq('domain', DOMAIN)
      .gte('snapshot_date', range.from).lte('snapshot_date', range.to)
      .order('snapshot_date', { ascending: true }),
  ])
  const byDate = new Map<string, SemrushTrendPoint>()
  for (const d of (domain ?? [])) {
    byDate.set(d.snapshot_date as string, {
      snapshot_date:    d.snapshot_date as string,
      organic_keywords: Number(d.organic_keywords ?? 0),
      organic_traffic:  Number(d.organic_traffic ?? 0),
      total_backlinks:  0,
    })
  }
  for (const b of (bl ?? [])) {
    const existing = byDate.get(b.snapshot_date as string) ?? {
      snapshot_date:    b.snapshot_date as string,
      organic_keywords: 0,
      organic_traffic:  0,
      total_backlinks:  0,
    }
    existing.total_backlinks = Number(b.total_backlinks ?? 0)
    byDate.set(b.snapshot_date as string, existing)
  }
  return Array.from(byDate.values()).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
}
