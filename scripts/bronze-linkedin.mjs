#!/usr/bin/env node
// Bronze ingestion: LinkedIn Ads (BigQuery → Supabase)
// Run: npm run ingest:linkedin
//
// Ports the LinkedIn ad-serving grain (Campaign + Creative — LinkedIn has no
// Ad Set level natively) into 5 bronze tables. Mirrors scripts/bronze-meta.mjs
// tolerance behaviour: missing table / unrecognized column both log a ⚠ and
// return [] so the ingest continues.

import { execSync } from 'child_process'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

const PROJECT = process.env.GCP_PROJECT_ID
const DATASET = 'atWork_linkedin_ads'
if (!PROJECT) throw new Error('GCP_PROJECT_ID env var required (source .envrc)')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env vars')

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket },
})
const bronze = sb.schema('bronze')

const emptyReads = []

function bq(sql, label) {
  let result
  try {
    result = execSync(
      `bq query --nouse_legacy_sql --project_id=${PROJECT} --format=json --max_rows=100000 '${sql.replace(/'/g, "'\\''")}'`,
      { encoding: 'utf8', maxBuffer: 200 * 1024 * 1024, env: { ...process.env, CLOUDSDK_CONFIG: process.env.CLOUDSDK_CONFIG } }
    )
  } catch (e) {
    const stdout = String(e.stdout ?? '') + String(e.stderr ?? '')
    if (/Not found: Table/i.test(stdout)) {
      console.warn(`  ⚠ ${label ?? 'query'}: source table not in BQ (Weld stream not enabled?)`)
      if (label) emptyReads.push(label)
      return []
    }
    const colMatch = stdout.match(/Unrecognized name:\s+(\w+)/i)
    if (colMatch) {
      console.warn(`  ⚠ ${label ?? 'query'}: column "${colMatch[1]}" not in atWork BQ schema (Weld field not populated) — skipping`)
      if (label) emptyReads.push(label)
      return []
    }
    throw e
  }
  const rows = JSON.parse(result)
  if (label && rows.length === 0) {
    console.warn(`  ⚠ ${label}: 0 rows from BQ (Weld sync gap?)`)
    emptyReads.push(label)
  }
  return rows
}

async function upsert(table, rows, conflict) {
  if (!rows.length) return 0
  const BATCH = 500
  let total = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await bronze.from(table).upsert(rows.slice(i, i + BATCH), { onConflict: conflict })
    if (error) throw new Error(`Upsert bronze.${table}: ${error.message}`)
    total += rows.slice(i, i + BATCH).length
  }
  return total
}

function toDate(ts) { return ts ? String(ts).slice(0, 10) : null }
function n(v) { return v == null ? null : parseFloat(v) }
function i(v) { return v == null ? null : parseInt(v) }

// ── Campaign group dimension ───────────────────────────────────────────────

console.log('Fetching campaign_group...')
const groups = bq(`
  SELECT id, name, _weld_synced AS bq_synced
  FROM \`${PROJECT}.${DATASET}.campaign_group\`
`, 'campaign_group')
console.log(`  ${groups.length} rows from BQ`)
const nGroups = await upsert('linkedin_campaign_group', groups.map(r => ({
  id:        r.id,
  name:      r.name,
  bq_synced: r.bq_synced || null,
})), 'id')
console.log(`  ✓ ${nGroups} campaign_group rows upserted`)

// ── Campaign dimension ─────────────────────────────────────────────────────

console.log('Fetching campaign...')
const campaigns = bq(`
  SELECT id, name, status, objective_type, campaign_group_id, format,
    CAST(run_schedule_start AS STRING) AS run_schedule_start,
    CAST(run_schedule_end   AS STRING) AS run_schedule_end,
    _weld_synced AS bq_synced
  FROM \`${PROJECT}.${DATASET}.campaign\`
`, 'campaign')
console.log(`  ${campaigns.length} rows from BQ`)
const nCampaigns = await upsert('linkedin_campaign', campaigns.map(r => ({
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
console.log(`  ✓ ${nCampaigns} campaign rows upserted`)

// ── Creative dimension ─────────────────────────────────────────────────────
// LinkedIn `creative` has no `name` column — the display label lives inside
// content_reference / title (which may itself be sparse). We fall back to
// title if present, else null (silver.linkedin_ads shows creative_id as label).

console.log('Fetching creative + joined post + first media title...')
const creatives = bq(`
  WITH first_media AS (
    SELECT post_id, ANY_VALUE(title) AS media_title
    FROM \`${PROJECT}.${DATASET}.media_content\`
    WHERE title IS NOT NULL
    GROUP BY post_id
  )
  SELECT
    c.id                                              AS id,
    c.campaign_id                                     AS campaign_id,
    c.title                                           AS name,
    p.commentary                                      AS post_text,
    p.contentLandingPage                              AS landing_url,
    m.media_title                                     AS media_title,
    c._weld_synced                                    AS bq_synced
  FROM \`${PROJECT}.${DATASET}.creative\` c
  LEFT JOIN \`${PROJECT}.${DATASET}.post\` p
    ON p.id = REGEXP_EXTRACT(c.content_reference, r'([0-9]+)$')
  LEFT JOIN first_media m
    ON m.post_id = p.id
`, 'creative')
console.log(`  ${creatives.length} rows from BQ`)
const nCreatives = await upsert('linkedin_creative', creatives.map(r => ({
  id:          r.id,
  campaign_id: r.campaign_id,
  name:        r.name,
  post_text:   r.post_text,
  landing_url: r.landing_url,
  media_title: r.media_title,
  bq_synced:   r.bq_synced || null,
})), 'id')
console.log(`  ✓ ${nCreatives} creative rows upserted`)

// ── Campaign-level ad analytics ────────────────────────────────────────────

console.log('Fetching ad_analytics_by_campaign...')
const campStats = bq(`
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
    CAST(video_starts                          AS INT64)   AS video_starts,
    CAST(video_first_quartile_completions      AS INT64)   AS video_q1,
    CAST(video_midpoint_completions            AS INT64)   AS video_mid,
    CAST(video_third_quartile_completions      AS INT64)   AS video_q3,
    CAST(full_screen_plays                     AS INT64)   AS fullscreen_plays,
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
const nCampStats = await upsert('linkedin_campaign_stats', campStats.map(r => ({
  date:                           toDate(r.date),
  campaign_id:                    r.campaign_id,
  impressions:                    i(r.impressions),
  clicks:                         i(r.clicks),
  cost:                           n(r.cost),
  one_click_leads:                i(r.one_click_leads),
  landing_page_clicks:            i(r.landing_page_clicks),
  video_views:                    i(r.video_views),
  video_completions:              i(r.video_completions),
  video_starts:                   i(r.video_starts),
  video_q1:                       i(r.video_q1),
  video_mid:                      i(r.video_mid),
  video_q3:                       i(r.video_q3),
  fullscreen_plays:               i(r.fullscreen_plays),
  reactions:                      i(r.reactions),
  comments:                       i(r.comments),
  shares:                         i(r.shares),
  follows:                        i(r.follows),
  total_engagements:              i(r.total_engagements),
  approximate_unique_impressions: i(r.approximate_unique_impressions),
  bq_synced:                      r.bq_synced || null,
})), 'date,campaign_id')
console.log(`  ✓ ${nCampStats} campaign_stats rows upserted`)

// ── Creative-level ad analytics ────────────────────────────────────────────

console.log('Fetching ad_analytics_by_creative...')
const creStats = bq(`
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
    CAST(video_starts                          AS INT64)   AS video_starts,
    CAST(video_first_quartile_completions      AS INT64)   AS video_q1,
    CAST(video_midpoint_completions            AS INT64)   AS video_mid,
    CAST(video_third_quartile_completions      AS INT64)   AS video_q3,
    CAST(full_screen_plays                     AS INT64)   AS fullscreen_plays,
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
const nCreStats = await upsert('linkedin_creative_stats', creStats.map(r => ({
  date:                           toDate(r.date),
  creative_id:                    r.creative_id,
  impressions:                    i(r.impressions),
  clicks:                         i(r.clicks),
  cost:                           n(r.cost),
  one_click_leads:                i(r.one_click_leads),
  landing_page_clicks:            i(r.landing_page_clicks),
  video_views:                    i(r.video_views),
  video_completions:              i(r.video_completions),
  video_starts:                   i(r.video_starts),
  video_q1:                       i(r.video_q1),
  video_mid:                      i(r.video_mid),
  video_q3:                       i(r.video_q3),
  fullscreen_plays:               i(r.fullscreen_plays),
  reactions:                      i(r.reactions),
  comments:                       i(r.comments),
  shares:                         i(r.shares),
  follows:                        i(r.follows),
  total_engagements:              i(r.total_engagements),
  approximate_unique_impressions: i(r.approximate_unique_impressions),
  bq_synced:                      r.bq_synced || null,
})), 'date,creative_id')
console.log(`  ✓ ${nCreStats} creative_stats rows upserted`)

if (emptyReads.length > 0) {
  console.error('\n⚠ LinkedIn bronze ingest finished with empty upstream reads:')
  for (const t of emptyReads) console.error(`  - ${t}`)
  process.exitCode = 1
} else {
  console.log('\nLinkedIn bronze ingestion complete.')
}
