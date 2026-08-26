import { supabaseServer } from '@/lib/supabase/server'

export type DateRange = { from: string; to: string }

export async function getInvestmentSummary(range: DateRange) {
  const sb = supabaseServer()

  const [meta, gads, ga4] = await Promise.all([
    sb.schema('silver').from('meta_campaigns').select('spend').gte('date', range.from).lte('date', range.to),
    sb.schema('silver').from('gads_campaigns').select('spend').gte('date', range.from).lte('date', range.to),
    sb.schema('silver').from('ga4_overview').select('sessions,total_users').gte('date', range.from).lte('date', range.to),
  ])

  const meta_spend = (meta.data ?? []).reduce((s, r) => s + Number(r.spend || 0), 0)
  const gads_spend = (gads.data ?? []).reduce((s, r) => s + Number(r.spend || 0), 0)
  const total_spend = meta_spend + gads_spend

  const total_sessions = (ga4.data ?? []).reduce((s, r) => s + Number(r.sessions || 0), 0)
  const total_users    = (ga4.data ?? []).reduce((s, r) => s + Number(r.total_users || 0), 0)

  return {
    meta_spend,
    gads_spend,
    total_spend,
    total_sessions,
    total_users,
    cost_per_session: total_sessions ? total_spend / total_sessions : null,
    cost_per_user:    total_users    ? total_spend / total_users    : null,
    meta_share_pct:   total_spend ? (meta_spend / total_spend) * 100 : 0,
    gads_share_pct:   total_spend ? (gads_spend / total_spend) * 100 : 0,
  }
}

export async function getChannelSpend(range: DateRange) {
  const s = await getInvestmentSummary(range)
  return [
    { channel: 'Meta',       spend: s.meta_spend, share_pct: s.meta_share_pct },
    { channel: 'Google Ads', spend: s.gads_spend, share_pct: s.gads_share_pct },
  ]
}

export async function getSpendTrend(range: DateRange) {
  const sb = supabaseServer()
  const [meta, gads] = await Promise.all([
    sb.schema('silver').from('meta_campaigns').select('date,spend').gte('date', range.from).lte('date', range.to),
    sb.schema('silver').from('gads_campaigns').select('date,spend').gte('date', range.from).lte('date', range.to),
  ])

  const map = new Map<string, { date: string; meta: number; gads: number }>()
  for (const r of meta.data ?? []) {
    const k = r.date as string
    const e = map.get(k) ?? { date: k, meta: 0, gads: 0 }
    e.meta += Number(r.spend || 0)
    map.set(k, e)
  }
  for (const r of gads.data ?? []) {
    const k = r.date as string
    const e = map.get(k) ?? { date: k, meta: 0, gads: 0 }
    e.gads += Number(r.spend || 0)
    map.set(k, e)
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}
