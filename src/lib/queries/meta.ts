import { supabaseServer } from '@/lib/supabase/server'

export type DateRange = { from: string; to: string }

export async function getMetaSummary(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('meta_campaigns')
    .select('spend,impressions,clicks,inline_link_clicks,reach,frequency')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return null
  const spend       = data.reduce((s, r) => s + Number(r.spend || 0), 0)
  const impressions = data.reduce((s, r) => s + Number(r.impressions || 0), 0)
  const clicks      = data.reduce((s, r) => s + Number(r.clicks || 0), 0)
  const reach       = data.reduce((s, r) => s + Number(r.reach || 0), 0)
  const ctr         = impressions ? (clicks / impressions) * 100 : 0
  const cpc         = clicks ? spend / clicks : null
  const cpm         = impressions ? (spend / impressions) * 1000 : null
  const frequency   = data.reduce((s, r) => s + Number(r.frequency || 0), 0) / data.length
  return { spend, impressions, clicks, reach, ctr, cpc, cpm, frequency }
}

export async function getMetaCampaigns(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('bronze').from('meta_campaign_insight')
    .select('campaign_id,campaign_name,spend,impressions,clicks,inline_link_clicks,reach,frequency,ctr,cpc')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return []

  const map = new Map<string, {
    campaign_id: string; campaign_name: string;
    spend: number; impressions: number; clicks: number; inline_link_clicks: number; reach: number;
  }>()
  for (const r of data) {
    const k = r.campaign_id as string
    const e = map.get(k) ?? { campaign_id: k, campaign_name: r.campaign_name as string, spend: 0, impressions: 0, clicks: 0, inline_link_clicks: 0, reach: 0 }
    e.spend           += Number(r.spend || 0)
    e.impressions     += Number(r.impressions || 0)
    e.clicks          += Number(r.clicks || 0)
    e.inline_link_clicks += Number(r.inline_link_clicks || 0)
    e.reach           += Number(r.reach || 0)
    map.set(k, e)
  }
  return [...map.values()].map(c => ({
    ...c,
    ctr: c.impressions ? (c.clicks / c.impressions) * 100 : 0,
    cpc: c.clicks ? c.spend / c.clicks : null,
  })).sort((a, b) => b.spend - a.spend)
}

export async function getMetaAdsets(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('bronze').from('meta_adset_insight')
    .select('campaign_id,campaign_name,adset_id,adset_name,spend,impressions,clicks,inline_link_clicks,reach')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return []

  const map = new Map<string, {
    campaign_id: string; campaign_name: string; adset_id: string; adset_name: string;
    spend: number; impressions: number; clicks: number; inline_link_clicks: number; reach: number;
  }>()
  for (const r of data) {
    const k = r.adset_id as string
    const e = map.get(k) ?? {
      campaign_id: r.campaign_id as string, campaign_name: r.campaign_name as string,
      adset_id: k, adset_name: r.adset_name as string,
      spend: 0, impressions: 0, clicks: 0, inline_link_clicks: 0, reach: 0,
    }
    e.spend           += Number(r.spend || 0)
    e.impressions     += Number(r.impressions || 0)
    e.clicks          += Number(r.clicks || 0)
    e.inline_link_clicks += Number(r.inline_link_clicks || 0)
    e.reach           += Number(r.reach || 0)
    map.set(k, e)
  }
  return [...map.values()].map(a => ({
    ...a,
    ctr: a.impressions ? (a.clicks / a.impressions) * 100 : 0,
    cpc: a.clicks ? a.spend / a.clicks : null,
  })).sort((a, b) => b.spend - a.spend)
}

export async function getMetaAds(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('bronze').from('meta_ad_insight')
    .select('campaign_id,adset_id,ad_id,ad_name,spend,impressions,clicks,inline_link_clicks')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return []

  const map = new Map<string, {
    campaign_id: string; adset_id: string; ad_id: string; ad_name: string;
    spend: number; impressions: number; clicks: number; inline_link_clicks: number;
  }>()
  for (const r of data) {
    const k = r.ad_id as string
    const e = map.get(k) ?? {
      campaign_id: r.campaign_id as string, adset_id: r.adset_id as string,
      ad_id: k, ad_name: r.ad_name as string,
      spend: 0, impressions: 0, clicks: 0, inline_link_clicks: 0,
    }
    e.spend           += Number(r.spend || 0)
    e.impressions     += Number(r.impressions || 0)
    e.clicks          += Number(r.clicks || 0)
    e.inline_link_clicks += Number(r.inline_link_clicks || 0)
    map.set(k, e)
  }
  return [...map.values()].map(a => ({
    ...a,
    ctr: a.impressions ? (a.clicks / a.impressions) * 100 : 0,
    cpc: a.clicks ? a.spend / a.clicks : null,
  }))
}

export type MediaType = 'Video' | 'Image' | 'Text' | 'Other' | 'Unknown'

export async function getMetaMediaTypeSplit(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('meta_ads_with_creative')
    .select('media_type,ad_id,spend,impressions,clicks')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return []

  const map = new Map<string, {
    media_type: MediaType;
    spend: number; impressions: number; clicks: number;
    ads: Set<string>;
  }>()
  for (const r of data) {
    const k = ((r.media_type as string) ?? 'Unknown') as MediaType
    const e = map.get(k) ?? { media_type: k, spend: 0, impressions: 0, clicks: 0, ads: new Set<string>() }
    e.spend       += Number(r.spend || 0)
    e.impressions += Number(r.impressions || 0)
    e.clicks      += Number(r.clicks || 0)
    if (r.ad_id) e.ads.add(r.ad_id as string)
    map.set(k, e)
  }
  const totalSpend = [...map.values()].reduce((s, e) => s + e.spend, 0)
  return [...map.values()]
    .map(e => ({
      media_type:  e.media_type,
      ads:         e.ads.size,
      spend:       e.spend,
      impressions: e.impressions,
      clicks:      e.clicks,
      ctr:         e.impressions ? (e.clicks / e.impressions) * 100 : 0,
      cpc:         e.clicks ? e.spend / e.clicks : null,
      cpm:         e.impressions ? (e.spend / e.impressions) * 1000 : null,
      share_pct:   totalSpend ? (e.spend / totalSpend) * 100 : 0,
    }))
    .sort((a, b) => b.spend - a.spend)
}

export async function getMetaTrend(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('bronze').from('meta_campaign_insight')
    .select('date,spend,impressions,clicks,reach')
    .gte('date', range.from).lte('date', range.to)
    .order('date')
  if (!data?.length) return []

  const map = new Map<string, {
    date: string; spend: number; impressions: number; clicks: number; reach: number;
  }>()
  for (const r of data) {
    const k = r.date as string
    const e = map.get(k) ?? { date: k, spend: 0, impressions: 0, clicks: 0, reach: 0 }
    e.spend       += Number(r.spend       || 0)
    e.impressions += Number(r.impressions || 0)
    e.clicks      += Number(r.clicks      || 0)
    e.reach       += Number(r.reach       || 0)
    map.set(k, e)
  }
  return [...map.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({
      ...d,
      ctr: d.impressions ? (d.clicks / d.impressions) * 100 : null,
      cpc: d.clicks      ? d.spend / d.clicks               : null,
      cpm: d.impressions ? (d.spend / d.impressions) * 1000 : null,
    }))
}

// Distinct creative media types (Video/Image/Text/Other) in the date range,
// sourced from silver.meta_ads_with_creative.
export async function getMetaCreativeOptions(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('meta_ads_with_creative')
    .select('media_type')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return [] as string[]
  return [...new Set(data.map(r => r.media_type).filter(Boolean) as string[])].sort()
}

// Per-ad aggregation from silver.meta_ads_with_creative, used when the Meta
// page filter includes a creative type. Same shape as getMetaAds plus media_type.
export async function getMetaAdsCreative(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('meta_ads_with_creative')
    .select('ad_id,ad_name,adset_id,campaign_id,creative_id,media_type,image_url,thumbnail_url,video_thumbnail_array,effective_object_story_id,effective_instagram_media_id,creative_title,creative_body,call_to_action_type,spend,impressions,clicks,reach')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return []

  const map = new Map<string, {
    ad_id: string; ad_name: string | null; adset_id: string; campaign_id: string;
    creative_id: string | null;
    media_type: string | null;
    image_url: string | null;
    thumbnail_url: string | null;
    video_thumbnail_array: string | null;
    effective_object_story_id: string | null;
    effective_instagram_media_id: string | null;
    creative_title: string | null;
    creative_body: string | null;
    call_to_action_type: string | null;
    spend: number; impressions: number; clicks: number; reach: number;
  }>()
  for (const r of data) {
    const k = `${r.ad_id ?? ''}::${r.media_type ?? ''}`
    const e = map.get(k) ?? {
      ad_id: r.ad_id as string,
      ad_name: (r.ad_name as string) ?? null,
      adset_id: r.adset_id as string,
      campaign_id: r.campaign_id as string,
      creative_id: (r.creative_id as string) ?? null,
      media_type: (r.media_type as string) ?? null,
      image_url: (r.image_url as string) ?? null,
      thumbnail_url: (r.thumbnail_url as string) ?? null,
      video_thumbnail_array: (r.video_thumbnail_array as string) ?? null,
      effective_object_story_id: (r.effective_object_story_id as string) ?? null,
      effective_instagram_media_id: (r.effective_instagram_media_id as string) ?? null,
      creative_title: (r.creative_title as string) ?? null,
      creative_body: (r.creative_body as string) ?? null,
      call_to_action_type: (r.call_to_action_type as string) ?? null,
      spend: 0, impressions: 0, clicks: 0, reach: 0,
    }
    e.spend       += Number(r.spend       || 0)
    e.impressions += Number(r.impressions || 0)
    e.clicks      += Number(r.clicks      || 0)
    e.reach       += Number(r.reach       || 0)
    map.set(k, e)
  }
  return [...map.values()]
}
