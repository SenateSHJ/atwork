/* eslint-disable @typescript-eslint/no-explicit-any */
// Bronze ingest: SEMrush (HTTP → Supabase).
// Nightly snapshot of atworkaustralia.com.au on the AU database. Three endpoints:
//   domain_ranks       -> bronze.semrush_domain_snapshot
//   domain_organic     -> bronze.semrush_organic_keywords
//   backlinks_overview -> bronze.semrush_backlinks_overview
// Rows keyed on (snapshot_date, domain[, keyword]) so re-running same day
// is idempotent. Uses today's date in AU tz for the snapshot key.

import { makeSupabase } from './supabase'

const DOMAIN = 'atworkaustralia.com.au'
const DB = 'au'
const TOP_KEYWORDS_LIMIT = 500

// Semicolon-separated CSV with a header line. Split the header off, split
// each data line on ';'. Values with embedded ';' or '"' would need
// escaping; SEMrush uses double-quote wrapping when that happens.
function parseSemrushCsv(body: string): Array<Record<string, string>> {
  const trimmed = body.trim()
  if (!trimmed) return []
  // Error responses start with "ERROR"; treat as empty.
  if (trimmed.startsWith('ERROR')) return []
  const lines = trimmed.split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(';').map(h => h.trim())
  return lines.slice(1).map(line => {
    const cells = line.split(';')
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = cells[i] ?? '' })
    return row
  })
}

function n(v: string | undefined): number | null {
  if (v == null || v === '') return null
  const parsed = Number(v)
  return Number.isFinite(parsed) ? parsed : null
}
function i(v: string | undefined): number | null {
  if (v == null || v === '') return null
  const parsed = parseInt(v, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function todayAu(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const y = parts.find(p => p.type === 'year')?.value
  const m = parts.find(p => p.type === 'month')?.value
  const d = parts.find(p => p.type === 'day')?.value
  return `${y}-${m}-${d}`
}

async function fetchSemrush(url: string, label: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`SEMrush ${label}: HTTP ${res.status}`)
  return res.text()
}

export async function runSemrush(): Promise<{
  upserted: Record<string, number>
  emptyReads: string[]
}> {
  const KEY = process.env.SEMRUSH_API_KEY
  if (!KEY) throw new Error('SEMRUSH_API_KEY env var required')

  const { upsert } = makeSupabase('bronze')
  const upserted: Record<string, number> = {}
  const emptyReads: string[] = []
  const snapshotDate = todayAu()

  // ── Domain overview ──────────────────────────────────────────────────────
  console.log(`[semrush] fetching domain_ranks for ${DOMAIN}/${DB}...`)
  const ranksUrl = `https://api.semrush.com/?type=domain_ranks&key=${KEY}&domain=${DOMAIN}&database=${DB}&export_columns=Dn,Rk,Or,Ot,Oc,Ad,At,Ac`
  const ranksRows = parseSemrushCsv(await fetchSemrush(ranksUrl, 'domain_ranks'))
  if (ranksRows.length === 0) {
    emptyReads.push('semrush_domain_snapshot')
  } else {
    const r = ranksRows[0]
    upserted.semrush_domain_snapshot = await upsert('semrush_domain_snapshot', [{
      snapshot_date:    snapshotDate,
      domain:           DOMAIN,
      db:               DB,
      rank:             i(r['Rank']),
      organic_keywords: i(r['Organic Keywords']),
      organic_traffic:  i(r['Organic Traffic']),
      organic_cost:     n(r['Organic Cost']),
      adwords_keywords: i(r['Adwords Keywords']),
      adwords_traffic:  i(r['Adwords Traffic']),
      adwords_cost:     n(r['Adwords Cost']),
    }], 'snapshot_date,domain,db')
  }

  // ── Top organic keywords ─────────────────────────────────────────────────
  console.log(`[semrush] fetching domain_organic (top ${TOP_KEYWORDS_LIMIT})...`)
  const kwUrl = `https://api.semrush.com/?type=domain_organic&key=${KEY}&domain=${DOMAIN}&database=${DB}&display_limit=${TOP_KEYWORDS_LIMIT}&export_columns=Ph,Po,Pp,Nq,Cp,Ur,Tr`
  const kwRows = parseSemrushCsv(await fetchSemrush(kwUrl, 'domain_organic'))
  if (kwRows.length === 0) {
    emptyReads.push('semrush_organic_keywords')
  } else {
    upserted.semrush_organic_keywords = await upsert('semrush_organic_keywords',
      kwRows.map(r => ({
        snapshot_date:     snapshotDate,
        domain:            DOMAIN,
        db:                DB,
        keyword:           r['Keyword'],
        position:          i(r['Position']),
        previous_position: i(r['Previous Position']),
        search_volume:     i(r['Search Volume']),
        cpc:               n(r['CPC']),
        url:               r['Url'] || null,
        traffic_pct:       n(r['Traffic (%)']),
      })),
      'snapshot_date,domain,db,keyword',
    )
  }

  // ── Backlinks overview ───────────────────────────────────────────────────
  console.log(`[semrush] fetching backlinks_overview...`)
  const blUrl = `https://api.semrush.com/analytics/v1/?type=backlinks_overview&key=${KEY}&target=${DOMAIN}&target_type=root_domain`
  const blRows = parseSemrushCsv(await fetchSemrush(blUrl, 'backlinks_overview'))
  if (blRows.length === 0) {
    emptyReads.push('semrush_backlinks_overview')
  } else {
    const b = blRows[0]
    upserted.semrush_backlinks_overview = await upsert('semrush_backlinks_overview', [{
      snapshot_date:     snapshotDate,
      domain:            DOMAIN,
      total_backlinks:   i(b['total']),
      referring_domains: i(b['domains_num']),
      referring_ips:     i(b['ips_num']),
      follows_num:       i(b['follows_num']),
      nofollows_num:     i(b['nofollows_num']),
      score:             n(b['score']),
      trust_score:       n(b['trust_score']),
      urls_num:          i(b['urls_num']),
    }], 'snapshot_date,domain')
  }

  return { upserted, emptyReads }
}
