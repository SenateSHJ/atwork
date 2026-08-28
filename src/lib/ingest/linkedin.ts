/* eslint-disable @typescript-eslint/no-explicit-any */
// Bronze ingest: LinkedIn Ads (BigQuery → Supabase)
// Ports scripts/bronze-linkedin.mjs to use @google-cloud/bigquery for the
// Vercel Cron path. Same tables, same SQL, same tolerance.

import { makeBq } from './bq'
import { makeSupabase } from './supabase'

const DATASET = 'atWork_linkedin_ads'

function toDate(ts: any): string | null {
  return ts ? String(ts).slice(0, 10) : null
}
function n(v: any): number | null {
  return v == null ? null : parseFloat(v)
}
function i(v: any): number | null {
  return v == null ? null : parseInt(v)
}

export async function runLinkedin(): Promise<{
  upserted: Record<string, number>
  emptyReads: string[]
}> {
  const PROJECT = process.env.GCP_PROJECT_ID
  if (!PROJECT) throw new Error('GCP_PROJECT_ID env var required')

  const { bq, emptyReads } = makeBq()
  const { upsert } = makeSupabase('bronze')
  const upserted: Record<string, number> = {}

  // ── Campaign group dimension ──────────────────────────────────────────────
  console.log('Fetching campaign_group...')
  const groups = await bq(`
    SELECT id, name, _weld_synced AS bq_synced
    FROM \`${PROJECT}.${DATASET}.campaign_group\`
  `, 'campaign_group')
  console.log(`  ${groups.length} rows from BQ`)
  upserted.linkedin_campaign_group = await upsert('linkedin_campaign_group', groups.map((r: any) => ({
    id:        r.id,
    name:      r.name,
    bq_synced: r.bq_synced || null,
  })), 'id')
  console.log(`  ✓ ${upserted.linkedin_campaign_group} campaign_group rows upserted`)

  // ── Campaign dimension ────────────────────────────────────────────────────
  console.log('Fetching campaign...')
  const campaigns = await bq(`
    SELECT id, name, status, objective_type, campaign_group_id, format,
      CAST(run_schedule_start AS STRING) AS run_schedule_start,
      CAST(run_schedule_end   AS STRING) AS run_schedule_end,
      _weld_synced AS bq_synced
    FROM \`${PROJECT}.${DATASET}.campaign\`
  `, 'campaign')
  console.log(`  ${campaigns.length} rows from BQ`)
  upserted.linkedin_campaign = await upsert('linkedin_campaign', campaigns.map((r: any) => ({
    id:                 r.id,
    name:               r.name,
    status:             r.status,
    objective_type:     r.objective_type,
    campaign_group_id:  r.campaign_group_id,
    format:             r.format,
    run_schedule_start: r.run_schedule_start || null,
    run_schedule_end:   r.run_schedule_end   || null,
    bq_synced:          r.bq_synced || null,
  })), 'id')
  console.log(`  ✓ ${upserted.linkedin_campaign} campaign rows upserted`)

  // ── Creative dimension ────────────────────────────────────────────────────
  console.log('Fetching creative...')
  const creatives = await bq(`
    SELECT id, campaign_id, title AS name, _weld_synced AS bq_synced
    FROM \`${PROJECT}.${DATASET}.creative\`
  `, 'creative')
  console.log(`  ${creatives.length} rows from BQ`)
  upserted.linkedin_creative = await upsert('linkedin_creative', creatives.map((r: any) => ({
    id:          r.id,
    campaign_id: r.campaign_id,
    name:        r.name,
    bq_synced:   r.bq_synced || null,
  })), 'id')
  console.log(`  ✓ ${upserted.linkedin_creative} creative rows upserted`)

  // ── Campaign-level ad analytics ──────────────────────────────────────────
  console.log('Fetching ad_analytics_by_campaign...')
  const campStats = await bq(`
    SELECT
      CAST(date AS STRING) AS date,
      campaign_id,
      CAST(impressions                    AS INT64)   AS impressions,
      CAST(clicks                         AS INT64)   AS clicks,
      CAST(cost_in_local_currency         AS FLOAT64) AS cost,
      CAST(one_click_leads                AS INT64)   AS one_click_leads,
      CAST(landing_page_clicks            AS INT64)   AS landing_page_clicks,
      CAST(video_views                    AS INT64)   AS video_views,
      CAST(video_completions              AS INT64)   AS video_completions,
      CAST(reactions                      AS INT64)   AS reactions,
      CAST(comments                       AS INT64)   AS comments,
      CAST(shares                         AS INT64)   AS shares,
      CAST(follows                        AS INT64)   AS follows,
      CAST(total_engagements              AS INT64)   AS total_engagements,
      CAST(approximate_unique_impressions AS INT64)   AS approximate_unique_impressions,
      _weld_synced AS bq_synced
    FROM \`${PROJECT}.${DATASET}.ad_analytics_by_campaign\`
    WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
  `, 'ad_analytics_by_campaign')
  console.log(`  ${campStats.length} rows from BQ`)
  upserted.linkedin_campaign_stats = await upsert('linkedin_campaign_stats', campStats.map((r: any) => ({
    date:                           toDate(r.date),
    campaign_id:                    r.campaign_id,
    impressions:                    i(r.impressions),
    clicks:                         i(r.clicks),
    cost:                           n(r.cost),
    one_click_leads:                i(r.one_click_leads),
    landing_page_clicks:            i(r.landing_page_clicks),
    video_views:                    i(r.video_views),
    video_completions:              i(r.video_completions),
    reactions:                      i(r.reactions),
    comments:                       i(r.comments),
    shares:                         i(r.shares),
    follows:                        i(r.follows),
    total_engagements:              i(r.total_engagements),
    approximate_unique_impressions: i(r.approximate_unique_impressions),
    bq_synced:                      r.bq_synced || null,
  })), 'date,campaign_id')
  console.log(`  ✓ ${upserted.linkedin_campaign_stats} campaign_stats rows upserted`)

  // ── Creative-level ad analytics ──────────────────────────────────────────
  console.log('Fetching ad_analytics_by_creative...')
  const creStats = await bq(`
    SELECT
      CAST(date AS STRING) AS date,
      creative_id,
      CAST(impressions                    AS INT64)   AS impressions,
      CAST(clicks                         AS INT64)   AS clicks,
      CAST(cost_in_local_currency         AS FLOAT64) AS cost,
      CAST(one_click_leads                AS INT64)   AS one_click_leads,
      CAST(landing_page_clicks            AS INT64)   AS landing_page_clicks,
      CAST(video_views                    AS INT64)   AS video_views,
      CAST(video_completions              AS INT64)   AS video_completions,
      CAST(reactions                      AS INT64)   AS reactions,
      CAST(comments                       AS INT64)   AS comments,
      CAST(shares                         AS INT64)   AS shares,
      CAST(follows                        AS INT64)   AS follows,
      CAST(total_engagements              AS INT64)   AS total_engagements,
      CAST(approximate_unique_impressions AS INT64)   AS approximate_unique_impressions,
      _weld_synced AS bq_synced
    FROM \`${PROJECT}.${DATASET}.ad_analytics_by_creative\`
    WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
  `, 'ad_analytics_by_creative')
  console.log(`  ${creStats.length} rows from BQ`)
  upserted.linkedin_creative_stats = await upsert('linkedin_creative_stats', creStats.map((r: any) => ({
    date:                           toDate(r.date),
    creative_id:                    r.creative_id,
    impressions:                    i(r.impressions),
    clicks:                         i(r.clicks),
    cost:                           n(r.cost),
    one_click_leads:                i(r.one_click_leads),
    landing_page_clicks:            i(r.landing_page_clicks),
    video_views:                    i(r.video_views),
    video_completions:              i(r.video_completions),
    reactions:                      i(r.reactions),
    comments:                       i(r.comments),
    shares:                         i(r.shares),
    follows:                        i(r.follows),
    total_engagements:              i(r.total_engagements),
    approximate_unique_impressions: i(r.approximate_unique_impressions),
    bq_synced:                      r.bq_synced || null,
  })), 'date,creative_id')
  console.log(`  ✓ ${upserted.linkedin_creative_stats} creative_stats rows upserted`)

  if (emptyReads.length > 0) {
    console.warn('\n⚠ LinkedIn bronze ingest finished with empty upstream reads:')
    for (const t of emptyReads) console.warn(`  - ${t}`)
  } else {
    console.log('\nLinkedIn bronze ingestion complete.')
  }

  return { upserted, emptyReads }
}
