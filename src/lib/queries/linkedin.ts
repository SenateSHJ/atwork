import { supabaseServer } from '@/lib/supabase/server'

export type DateRange = { from: string; to: string }

/**
 * Account totals for the period. Reads silver.linkedin_campaign_groups
 * (the derived top-grain fact table — LinkedIn's ad_analytics API does
 * not expose a campaign_group grain, so silver rolls up per-campaign
 * stats via the campaign dimension).
 */
export async function getLinkedinSummary(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('linkedin_campaign_groups')
    .select('spend,impressions,clicks,reach,video_starts,video_completions,total_engagements')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return null
  const spend             = data.reduce((s, r) => s + Number(r.spend             || 0), 0)
  const impressions       = data.reduce((s, r) => s + Number(r.impressions       || 0), 0)
  const clicks            = data.reduce((s, r) => s + Number(r.clicks            || 0), 0)
  const reach             = data.reduce((s, r) => s + Number(r.reach             || 0), 0)
  const video_starts      = data.reduce((s, r) => s + Number(r.video_starts      || 0), 0)
  const video_completions = data.reduce((s, r) => s + Number(r.video_completions || 0), 0)
  const total_engagements = data.reduce((s, r) => s + Number(r.total_engagements || 0), 0)
  const ctr                    = impressions ? (clicks / impressions) * 100 : 0
  const cpc                    = clicks      ? spend / clicks              : null
  const cpm                    = impressions ? (spend / impressions) * 1000 : null
  const frequency              = reach ? impressions / reach : 0
  const video_completion_rate  = video_starts ? video_completions / video_starts : null
  return {
    spend, impressions, clicks, reach,
    video_starts, video_completions, video_completion_rate,
    total_engagements,
    ctr, cpc, cpm, frequency,
  }
}

/**
 * Per-campaign-group entity rows aggregated across the period. Reads
 * silver.linkedin_campaign_groups then rolls day-rows up to
 * (campaign_group_id, campaign_group_name) grain.
 */
export async function getLinkedinCampaignGroups(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('linkedin_campaign_groups')
    .select('campaign_group_id,campaign_group_name,spend,impressions,clicks,reach,video_starts,video_completions,total_engagements')
    .gte('date', range.from).lte('date', range.to)
  if (!data?.length) return []

  const map = new Map<string, {
    campaign_group_id: string; campaign_group_name: string;
    spend: number; impressions: number; clicks: number; reach: number;
    video_starts: number; video_completions: number; total_engagements: number;
  }>()
  for (const r of data) {
    const k = r.campaign_group_id as string
    const e = map.get(k) ?? {
      campaign_group_id: k,
      campaign_group_name: (r.campaign_group_name as string) ?? k,
      spend: 0, impressions: 0, clicks: 0, reach: 0,
      video_starts: 0, video_completions: 0, total_engagements: 0,
    }
    e.spend             += Number(r.spend             || 0)
    e.impressions       += Number(r.impressions       || 0)
    e.clicks            += Number(r.clicks            || 0)
    e.reach             += Number(r.reach             || 0)
    e.video_starts      += Number(r.video_starts      || 0)
    e.video_completions += Number(r.video_completions || 0)
    e.total_engagements += Number(r.total_engagements || 0)
    map.set(k, e)
  }
  return [...map.values()].map(g => ({
    ...g,
    ctr:                   g.impressions ? (g.clicks / g.impressions) * 100 : 0,
    cpc:                   g.clicks      ? g.spend / g.clicks               : null,
    frequency:             g.reach       ? g.impressions / g.reach          : 0,
    video_completion_rate: g.video_starts ? g.video_completions / g.video_starts : null,
  })).sort((a, b) => b.spend - a.spend)
}

/**
 * Daily series across the period at the account grain. Feeds PRISM's
 * F-family trend + outlier rules via NormalisedPeriod.daily.
 */
export async function getLinkedinTrend(range: DateRange) {
  const sb = supabaseServer()
  const { data } = await sb.schema('silver').from('linkedin_campaign_groups')
    .select('date,spend,impressions,clicks,reach,video_starts,video_completions,total_engagements')
    .gte('date', range.from).lte('date', range.to)
    .order('date')
  if (!data?.length) return []

  const map = new Map<string, {
    date: string;
    spend: number; impressions: number; clicks: number; reach: number;
    video_starts: number; video_completions: number; total_engagements: number;
  }>()
  for (const r of data) {
    const k = r.date as string
    const e = map.get(k) ?? { date: k, spend: 0, impressions: 0, clicks: 0, reach: 0, video_starts: 0, video_completions: 0, total_engagements: 0 }
    e.spend             += Number(r.spend             || 0)
    e.impressions       += Number(r.impressions       || 0)
    e.clicks            += Number(r.clicks            || 0)
    e.reach             += Number(r.reach             || 0)
    e.video_starts      += Number(r.video_starts      || 0)
    e.video_completions += Number(r.video_completions || 0)
    e.total_engagements += Number(r.total_engagements || 0)
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
