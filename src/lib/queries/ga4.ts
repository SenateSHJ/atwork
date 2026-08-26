import { supabaseServer } from '@/lib/supabase/server'

export type DateRange = { from: string; to: string }

const LEAD_EVENTS = [
  'tel_click',
  'form_submit',
  'Contact_Form',
  'events_mail',
  'general_enquiries_mail',
] as const

export async function getGa4Summary(range: DateRange) {
  const sb = supabaseServer()
  const [ov, ch] = await Promise.all([
    sb.schema('silver').from('ga4_overview')
      .select('total_users,new_users,sessions,page_views,engagement_duration_secs')
      .gte('date', range.from).lte('date', range.to),
    sb.schema('silver').from('ga4_channels')
      .select('engaged_sessions')
      .gte('date', range.from).lte('date', range.to),
  ])
  const rows = ov.data ?? []
  if (!rows.length) return null
  const total_users      = rows.reduce((s, r) => s + Number(r.total_users || 0), 0)
  const new_users        = rows.reduce((s, r) => s + Number(r.new_users || 0), 0)
  const sessions         = rows.reduce((s, r) => s + Number(r.sessions || 0), 0)
  const page_views       = rows.reduce((s, r) => s + Number(r.page_views || 0), 0)
  const engagement       = rows.reduce((s, r) => s + Number(r.engagement_duration_secs || 0), 0)
  const engaged_sessions = (ch.data ?? []).reduce((s, r) => s + Number(r.engaged_sessions || 0), 0)
  const avg_engagement_time_secs = sessions ? engagement / sessions : 0
  return {
    total_users, new_users, sessions, page_views, engagement, engaged_sessions,
    avg_engagement_time_secs,
    engagement_rate: sessions    ? (engaged_sessions / sessions) * 100 : null,
    sessions_per_user: total_users ? sessions / total_users : null,
    views_per_session: sessions    ? page_views / sessions : null,
  }
}

export async function getGa4Conversions(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('ga4_channels')
    .select('sessions,conversions')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return { conversions: 0, sessions: 0, conversion_rate: 0 }
  const sessions    = data.reduce((s, r) => s + Number(r.sessions || 0), 0)
  const conversions = data.reduce((s, r) => s + Number(r.conversions || 0), 0)
  return {
    conversions,
    sessions,
    conversion_rate: sessions ? (conversions / sessions) * 100 : 0,
  }
}

export async function getGa4Channels(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('ga4_channels')
    .select('channel,total_users,sessions,engaged_sessions,conversions,bounce_rate_pct')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return []

  const map = new Map<string, {
    channel: string; total_users: number; sessions: number;
    engaged_sessions: number; conversions: number;
    bounce_weighted: number; bounce_sessions: number;
  }>()
  for (const r of data) {
    const k = (r.channel as string) ?? '(unset)'
    const e = map.get(k) ?? { channel: k, total_users: 0, sessions: 0, engaged_sessions: 0, conversions: 0, bounce_weighted: 0, bounce_sessions: 0 }
    e.total_users      += Number(r.total_users || 0)
    e.sessions         += Number(r.sessions || 0)
    e.engaged_sessions += Number(r.engaged_sessions || 0)
    e.conversions      += Number(r.conversions || 0)
    if (r.bounce_rate_pct != null) {
      const s = Number(r.sessions || 0)
      e.bounce_weighted += s * Number(r.bounce_rate_pct)
      e.bounce_sessions += s
    }
    map.set(k, e)
  }
  return [...map.values()].map(c => ({
    channel:             c.channel,
    total_users:         c.total_users,
    sessions:            c.sessions,
    engaged_sessions:    c.engaged_sessions,
    conversions:         c.conversions,
    engagement_rate_pct: c.sessions ? (c.engaged_sessions / c.sessions) * 100 : 0,
    conversion_rate_pct: c.sessions ? (c.conversions / c.sessions) * 100 : 0,
    bounce_rate_pct:     c.bounce_sessions > 0 ? c.bounce_weighted / c.bounce_sessions : null,
  })).sort((a, b) => b.sessions - a.sessions)
}

export async function getGa4TopPages(range: DateRange, limit = 15) {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('ga4_pages')
    .select('page_path,page_views,total_users,conversions')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return []

  const map = new Map<string, {
    page_path: string; page_views: number; total_users: number; conversions: number;
  }>()
  for (const r of data) {
    const k = r.page_path as string
    const e = map.get(k) ?? { page_path: k, page_views: 0, total_users: 0, conversions: 0 }
    e.page_views  += Number(r.page_views || 0)
    e.total_users += Number(r.total_users || 0)
    e.conversions += Number(r.conversions || 0)
    map.set(k, e)
  }
  return [...map.values()].sort((a, b) => b.page_views - a.page_views).slice(0, limit)
}

export async function getGa4LeadEvents(range: DateRange) {
  const sb = supabaseServer()
  // Case-insensitive whitelist match: fetch the day's events without a name
  // filter (~10 distinct names/day), then match locally so Contact_Form,
  // contact_form, CONTACT_FORM etc. all fold into the canonical whitelist name.
  const { data } = await sb.schema('silver').from('ga4_events')
    .select('event_name,event_count')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return []

  const canonicalByLower = new Map<string, string>()
  for (const w of LEAD_EVENTS) canonicalByLower.set(w.toLowerCase(), w)

  const map = new Map<string, number>()
  for (const r of data) {
    const canonical = canonicalByLower.get(String(r.event_name || '').toLowerCase())
    if (!canonical) continue
    map.set(canonical, (map.get(canonical) ?? 0) + Number(r.event_count || 0))
  }
  return [...map.entries()]
    .map(([event_name, total]) => ({ event_name, total }))
    .sort((a, b) => b.total - a.total)
}

export async function getGa4BrowserOs(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('ga4_browser_os')
    .select('operating_system,browser,total_users,engaged_sessions')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return []

  const map = new Map<string, { operating_system: string; browser: string; total_users: number; engaged_sessions: number }>()
  for (const r of data) {
    const k = `${r.operating_system}::${r.browser}`
    const e = map.get(k) ?? {
      operating_system: (r.operating_system as string) ?? '(not set)',
      browser:          (r.browser          as string) ?? '(not set)',
      total_users: 0, engaged_sessions: 0,
    }
    e.total_users      += Number(r.total_users      || 0)
    e.engaged_sessions += Number(r.engaged_sessions || 0)
    map.set(k, e)
  }
  return [...map.values()].map(r => ({
    ...r,
    engagement_rate_pct: r.total_users > 0 ? (r.engaged_sessions / r.total_users) * 100 : 0,
  })).sort((a, b) => b.total_users - a.total_users)
}

export async function getGa4Devices(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('ga4_device')
    .select('device_type,total_users,engaged_sessions')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return []

  const map = new Map<string, { device_type: string; total_users: number; engaged_sessions: number }>()
  for (const r of data) {
    const k = r.device_type as string
    const e = map.get(k) ?? { device_type: k, total_users: 0, engaged_sessions: 0 }
    e.total_users      += Number(r.total_users || 0)
    e.engaged_sessions += Number(r.engaged_sessions || 0)
    map.set(k, e)
  }
  const rows = [...map.values()]
  const totalUsers = rows.reduce((s, r) => s + r.total_users, 0)
  return rows.map(r => ({
    ...r,
    share_pct: totalUsers ? (r.total_users / totalUsers) * 100 : 0,
  })).sort((a, b) => b.total_users - a.total_users)
}

export async function getGa4Social(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('bronze').from('ga4_social_media')
    .select('session_source_platform,total_users,sessions,engaged_sessions,conversions')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return []

  const map = new Map<string, {
    platform: string; total_users: number; sessions: number; engaged_sessions: number; conversions: number;
  }>()
  for (const r of data) {
    const k = (r.session_source_platform as string) ?? '(unset)'
    const e = map.get(k) ?? { platform: k, total_users: 0, sessions: 0, engaged_sessions: 0, conversions: 0 }
    e.total_users      += Number(r.total_users || 0)
    e.sessions         += Number(r.sessions || 0)
    e.engaged_sessions += Number(r.engaged_sessions || 0)
    e.conversions      += Number(r.conversions || 0)
    map.set(k, e)
  }
  return [...map.values()].sort((a, b) => b.sessions - a.sessions)
}

export async function getGa4Campaigns(range: DateRange, limit = 20) {
  const sb = supabaseServer()
  const { data } = await sb.schema('bronze').from('ga4_campaign_performance')
    .select('session_campaign_name,total_users,sessions,engaged_sessions,conversions')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return []

  const map = new Map<string, {
    campaign: string; total_users: number; sessions: number; engaged_sessions: number; conversions: number;
  }>()
  for (const r of data) {
    const k = (r.session_campaign_name as string) ?? '(unset)'
    const e = map.get(k) ?? { campaign: k, total_users: 0, sessions: 0, engaged_sessions: 0, conversions: 0 }
    e.total_users      += Number(r.total_users || 0)
    e.sessions         += Number(r.sessions || 0)
    e.engaged_sessions += Number(r.engaged_sessions || 0)
    e.conversions      += Number(r.conversions || 0)
    map.set(k, e)
  }
  return [...map.values()].sort((a, b) => b.sessions - a.sessions).slice(0, limit)
}

export async function getGa4Trend(range: DateRange) {
  const sb = supabaseServer()
  const [ov, ch, ev] = await Promise.all([
    sb.schema('silver').from('ga4_overview')
      .select('date,sessions,total_users,new_users,page_views,engagement_duration_secs')
      .gte('date', range.from).lte('date', range.to),
    sb.schema('silver').from('ga4_channels')
      .select('date,sessions,engaged_sessions,conversions,bounce_rate_pct')
      .gte('date', range.from).lte('date', range.to),
    sb.schema('silver').from('ga4_events')
      .select('date,event_name,event_count')
      .in('event_name', LEAD_EVENTS as unknown as string[])
      .gte('date', range.from).lte('date', range.to),
  ])

  interface DailyRow {
    date: string;
    sessions: number; total_users: number; new_users: number; page_views: number;
    engagement_duration_secs: number;
    ch_sessions: number; ch_conversions: number;
    ch_engaged_sessions: number;
    bounce_weighted: number; bounce_sessions: number;
    lead_events: number;
  }
  const map = new Map<string, DailyRow>()
  const emptyRow = (date: string): DailyRow => ({
    date, sessions: 0, total_users: 0, new_users: 0, page_views: 0,
    engagement_duration_secs: 0,
    ch_sessions: 0, ch_conversions: 0, ch_engaged_sessions: 0,
    bounce_weighted: 0, bounce_sessions: 0,
    lead_events: 0,
  })

  for (const r of ov.data ?? []) {
    const k = r.date as string
    const e = map.get(k) ?? emptyRow(k)
    e.sessions                 += Number(r.sessions || 0)
    e.total_users              += Number(r.total_users || 0)
    e.new_users                += Number(r.new_users || 0)
    e.page_views               += Number(r.page_views || 0)
    e.engagement_duration_secs += Number(r.engagement_duration_secs || 0)
    map.set(k, e)
  }
  const canonLower = new Set(LEAD_EVENTS.map(l => l.toLowerCase()))
  for (const r of ch.data ?? []) {
    const k = r.date as string
    const e = map.get(k) ?? emptyRow(k)
    const s = Number(r.sessions || 0)
    e.ch_sessions         += s
    e.ch_conversions      += Number(r.conversions || 0)
    e.ch_engaged_sessions += Number(r.engaged_sessions || 0)
    if (r.bounce_rate_pct != null && s > 0) {
      e.bounce_weighted += s * Number(r.bounce_rate_pct)
      e.bounce_sessions += s
    }
    map.set(k, e)
  }
  for (const r of ev.data ?? []) {
    if (!canonLower.has(String(r.event_name || '').toLowerCase())) continue
    const k = r.date as string
    const e = map.get(k) ?? emptyRow(k)
    e.lead_events += Number(r.event_count || 0)
    map.set(k, e)
  }

  return [...map.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({
      date:                     d.date,
      sessions:                 d.sessions,
      total_users:              d.total_users,
      new_users:                d.new_users,
      page_views:               d.page_views,
      engagement_duration_secs: d.engagement_duration_secs,
      engaged_sessions:         d.ch_engaged_sessions,
      avg_engagement_secs:      d.sessions ? d.engagement_duration_secs / d.sessions : 0,
      bounce_rate_pct:          d.bounce_sessions > 0 ? d.bounce_weighted / d.bounce_sessions : null,
      conversions:              d.ch_conversions,
      conversion_rate:          d.ch_sessions ? (d.ch_conversions / d.ch_sessions) * 100 : null,
      lead_events:              d.lead_events,
    }))
}
