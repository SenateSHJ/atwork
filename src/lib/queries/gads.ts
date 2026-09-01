import { supabaseServer } from '@/lib/supabase/server'

export type DateRange = { from: string; to: string }

// ─── Summary (aggregated over the window) ──────────────────────────────────

export async function getGadsSummary(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('gads_campaigns')
    .select('spend,impressions,clicks,conversions')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return null
  const spend       = data.reduce((s, r) => s + Number(r.spend       || 0), 0)
  const impressions = data.reduce((s, r) => s + Number(r.impressions || 0), 0)
  const clicks      = data.reduce((s, r) => s + Number(r.clicks      || 0), 0)
  const conversions = data.reduce((s, r) => s + Number(r.conversions || 0), 0)
  return {
    spend,
    impressions,
    clicks,
    conversions,
    ctr:             impressions ? (clicks / impressions) * 100 : null,
    cpc:             clicks      ? spend / clicks               : null,
    cpm:             impressions ? (spend / impressions) * 1000 : null,
    cpa:             conversions ? spend / conversions          : null,
    conversion_rate: clicks      ? (conversions / clicks) * 100 : null,
  }
}

// ─── Entity queries — one row per entity, aggregated over range ────────────

interface CoreMetrics { spend: number; impressions: number; clicks: number; conversions: number }
const derive = (r: CoreMetrics) => ({
  ctr:             r.impressions ? (r.clicks / r.impressions) * 100 : null,
  cpc:             r.clicks      ? r.spend / r.clicks               : null,
  cpm:             r.impressions ? (r.spend / r.impressions) * 1000 : null,
  cpa:             r.conversions ? r.spend / r.conversions          : null,
  conversion_rate: r.clicks      ? (r.conversions / r.clicks) * 100 : null,
})

export async function getGadsCampaigns(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('gads_campaigns')
    .select('campaign_id,campaign_name,spend,impressions,clicks,conversions')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return []

  const map = new Map<string, { campaign_id: string; campaign_name: string } & CoreMetrics>()
  for (const r of data) {
    const k = r.campaign_id as string
    const e = map.get(k) ?? { campaign_id: k, campaign_name: r.campaign_name as string, spend: 0, impressions: 0, clicks: 0, conversions: 0 }
    e.spend       += Number(r.spend       || 0)
    e.impressions += Number(r.impressions || 0)
    e.clicks      += Number(r.clicks      || 0)
    e.conversions += Number(r.conversions || 0)
    map.set(k, e)
  }
  return [...map.values()].map(c => ({ ...c, ...derive(c) })).sort((a, b) => b.spend - a.spend)
}

export async function getGadsAdGroups(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('gads_ad_groups')
    .select('campaign_id,campaign_name,ad_group_id,ad_group_name,spend,impressions,clicks,conversions')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return []

  const map = new Map<string, { campaign_id: string; campaign_name: string; ad_group_id: string; ad_group_name: string } & CoreMetrics>()
  for (const r of data) {
    const k = r.ad_group_id as string
    const e = map.get(k) ?? {
      campaign_id: r.campaign_id as string, campaign_name: r.campaign_name as string,
      ad_group_id: k, ad_group_name: r.ad_group_name as string,
      spend: 0, impressions: 0, clicks: 0, conversions: 0,
    }
    e.spend       += Number(r.spend       || 0)
    e.impressions += Number(r.impressions || 0)
    e.clicks      += Number(r.clicks      || 0)
    e.conversions += Number(r.conversions || 0)
    map.set(k, e)
  }
  return [...map.values()].map(a => ({ ...a, ...derive(a) })).sort((a, b) => b.spend - a.spend)
}

export async function getGadsAds(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('gads_ads')
    .select('campaign_id,campaign_name,ad_group_id,ad_group_name,ad_id,ad_name,spend,impressions,clicks,conversions')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return []

  const map = new Map<string, {
    campaign_id: string; campaign_name: string;
    ad_group_id: string; ad_group_name: string;
    ad_id: string; ad_name: string;
  } & CoreMetrics>()
  for (const r of data) {
    const k = r.ad_id as string
    const e = map.get(k) ?? {
      campaign_id: r.campaign_id as string, campaign_name: r.campaign_name as string,
      ad_group_id: r.ad_group_id as string, ad_group_name: r.ad_group_name as string,
      ad_id: k, ad_name: (r.ad_name as string) ?? '(unnamed)',
      spend: 0, impressions: 0, clicks: 0, conversions: 0,
    }
    e.spend       += Number(r.spend       || 0)
    e.impressions += Number(r.impressions || 0)
    e.clicks      += Number(r.clicks      || 0)
    e.conversions += Number(r.conversions || 0)
    map.set(k, e)
  }
  return [...map.values()].map(a => ({ ...a, ...derive(a) })).sort((a, b) => b.spend - a.spend)
}

export async function getGadsKeywords(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('gads_keywords')
    .select('campaign_id,ad_group_id,ad_group_name,criterion_id,keyword_text,keyword_match_type,spend,impressions,clicks,conversions')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return []

  const map = new Map<string, {
    campaign_id: string; ad_group_id: string; ad_group_name: string; criterion_id: string;
    keyword_text: string | null; keyword_match_type: string | null;
  } & CoreMetrics>()
  for (const r of data) {
    const k = `${r.ad_group_id}::${r.criterion_id}`
    const e = map.get(k) ?? {
      campaign_id: r.campaign_id as string,
      ad_group_id: r.ad_group_id as string,
      ad_group_name: r.ad_group_name as string,
      criterion_id: r.criterion_id as string,
      keyword_text: (r.keyword_text as string) ?? null,
      keyword_match_type: (r.keyword_match_type as string) ?? null,
      spend: 0, impressions: 0, clicks: 0, conversions: 0,
    }
    e.spend       += Number(r.spend       || 0)
    e.impressions += Number(r.impressions || 0)
    e.clicks      += Number(r.clicks      || 0)
    e.conversions += Number(r.conversions || 0)
    map.set(k, e)
  }
  return [...map.values()].map(k => ({ ...k, ...derive(k) })).sort((a, b) => b.spend - a.spend)
}

export async function getGadsSearchTerms(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('gads_search_terms')
    .select('campaign_id,ad_group_id,search_term,search_term_match_type,spend,impressions,clicks,conversions')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return []

  const map = new Map<string, {
    campaign_id: string; ad_group_id: string;
    search_term: string; search_term_match_type: string | null;
  } & CoreMetrics>()
  for (const r of data) {
    const k = `${r.ad_group_id}::${r.search_term}::${r.search_term_match_type ?? ''}`
    const e = map.get(k) ?? {
      campaign_id: r.campaign_id as string,
      ad_group_id: r.ad_group_id as string,
      search_term: r.search_term as string,
      search_term_match_type: (r.search_term_match_type as string) ?? null,
      spend: 0, impressions: 0, clicks: 0, conversions: 0,
    }
    e.spend       += Number(r.spend       || 0)
    e.impressions += Number(r.impressions || 0)
    e.clicks      += Number(r.clicks      || 0)
    e.conversions += Number(r.conversions || 0)
    map.set(k, e)
  }
  return [...map.values()].map(t => ({ ...t, ...derive(t) })).sort((a, b) => b.spend - a.spend)
}

// ─── Daily trend for the Metric Trends charts + sparklines ─────────────────

export async function getGadsTrend(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('gads_campaigns')
    .select('date,spend,impressions,clicks,conversions')
    .gte('date', range.from).lte('date', range.to)
    .order('date')
  if (!data?.length) return []

  const map = new Map<string, { date: string } & CoreMetrics>()
  for (const r of data) {
    const k = r.date as string
    const e = map.get(k) ?? { date: k, spend: 0, impressions: 0, clicks: 0, conversions: 0 }
    e.spend       += Number(r.spend       || 0)
    e.impressions += Number(r.impressions || 0)
    e.clicks      += Number(r.clicks      || 0)
    e.conversions += Number(r.conversions || 0)
    map.set(k, e)
  }
  return [...map.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({ ...d, ...derive(d) }))
}

// ─── Campaign proximity (radius rings per campaign) ────────────────────────

export async function getGadsCampaignProximity() {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('gads_campaign_proximity')
    .select('campaign_id,campaign_name,campaign_status,criterion_id,address_city_name,address_province_name,address_country_code,address_postal_code,radius,radius_units,latitude,longitude')
  return (data ?? []).map(r => ({
    campaign_id:     String(r.campaign_id),
    campaign_name:   (r.campaign_name as string) ?? '(unknown)',
    campaign_status: (r.campaign_status as string) ?? null,
    criterion_id:    String(r.criterion_id),
    city:            (r.address_city_name     as string) ?? null,
    province:        (r.address_province_name as string) ?? null,
    country:         (r.address_country_code  as string) ?? null,
    postal_code:     (r.address_postal_code   as string) ?? null,
    radius:          Number(r.radius || 0),
    radius_units:    (r.radius_units as string) ?? null,
    latitude:        r.latitude  == null ? null : Number(r.latitude),
    longitude:       r.longitude == null ? null : Number(r.longitude),
  })).sort((a, b) => a.campaign_name.localeCompare(b.campaign_name) || b.radius - a.radius)
}

// ─── Conversion value (bronze-only — silver doesn't expose it) ─────────────
// Google Ads' conversions_value is only carried on bronze.gads_campaign_stats
// (campaign-grain). No per-ad-group / per-keyword / per-search-term value
// breakdown is synced. Returns { total, byDate, byCampaign } aggregates so
// the scorecard, sparkline, per-day column and per-campaign column can all
// reconcile off the same source.
export async function getGadsConversionValue(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('bronze').from('gads_campaign_stats')
    .select('date,campaign_id,conversions_value')
    .gte('date', range.from).lte('date', range.to)
  const rows = (data ?? []) as { date: string; campaign_id: string; conversions_value: number | null }[]
  let total = 0
  const byDate = new Map<string, number>()
  const byCampaign = new Map<string, number>()
  for (const r of rows) {
    const v = Number(r.conversions_value || 0)
    if (!v) continue
    total += v
    byDate.set(r.date, (byDate.get(r.date) ?? 0) + v)
    byCampaign.set(r.campaign_id, (byCampaign.get(r.campaign_id) ?? 0) + v)
  }
  return { total, byDate, byCampaign }
}
