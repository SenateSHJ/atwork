#!/usr/bin/env node
// Bronze ingestion: GA4 (BigQuery → Supabase)
// Run: npm run ingest:ga4
// Reads: ${GCP_PROJECT_ID}.google_analytics_4.*
// Writes: bronze.ga4_* tables
// NOTE: These are pre-aggregated Weld report tables, not raw GA4 events.

import { execSync } from 'child_process'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

const PROJECT = process.env.GCP_PROJECT_ID
const DATASET = 'atWork_Google_Analytics_4'
if (!PROJECT) throw new Error('GCP_PROJECT_ID env var required (source .envrc)')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env vars')

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket } })
const bronze = sb.schema('bronze')

function bq(sql, label) {
  let result
  try {
    result = execSync(
      `bq query --nouse_legacy_sql --project_id=${PROJECT} --format=json --max_rows=50000 '${sql.replace(/'/g, "'\\''")}'`,
      { encoding: 'utf8', maxBuffer: 200 * 1024 * 1024, env: { ...process.env, CLOUDSDK_CONFIG: process.env.CLOUDSDK_CONFIG } }
    )
  } catch (e) {
    const stdout = String(e.stdout ?? '') + String(e.stderr ?? '')
    if (/Not found: Table/i.test(stdout)) {
      console.warn(`  ⚠ ${label ?? 'query'}: source table not in BQ (Weld stream not enabled?)`)
      return []
    }
    const colMatch = stdout.match(/Unrecognized name:\s+(\w+)/i)
    if (colMatch) {
      console.warn(`  ⚠ ${label ?? 'query'}: column "${colMatch[1]}" not in atWork BQ schema — skipping`)
      return []
    }
    throw e
  }
  return JSON.parse(result)
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

function n(v) { return v == null ? null : parseFloat(v) }

// ── Audience overview ──────────────────────────────────────────────────────

console.log('Fetching audience_overview...')
const overview = bq(`
  SELECT property_id, CAST(date AS STRING) AS date, date_range_start, date_range_end,
    CAST(total_users AS FLOAT64) AS total_users,
    CAST(new_users   AS FLOAT64) AS new_users,
    CAST(sessions    AS FLOAT64) AS sessions,
    CAST(sessions_per_user AS FLOAT64) AS sessions_per_user,
    CAST(screen_page_views AS FLOAT64) AS screen_page_views,
    CAST(user_engagement_duration AS FLOAT64) AS user_engagement_duration,
    _weld_synced AS bq_synced
  FROM \`${PROJECT}.${DATASET}.audience_overview\`
  WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
`)
const nOverview = await upsert('ga4_audience_overview', overview.map(r => ({
  property_id: r.property_id, date: r.date,
  date_range_start: r.date_range_start, date_range_end: r.date_range_end,
  total_users: n(r.total_users), new_users: n(r.new_users), sessions: n(r.sessions),
  sessions_per_user: n(r.sessions_per_user), screen_page_views: n(r.screen_page_views),
  user_engagement_duration: n(r.user_engagement_duration), bq_synced: r.bq_synced,
})), 'property_id,date')
console.log(`  ✓ ${nOverview} audience_overview rows`)

// ── Channel traffic ────────────────────────────────────────────────────────

console.log('Fetching channel_traffic...')
const channels = bq(`
  SELECT property_id, session_default_channel_grouping,
    CAST(date AS STRING) AS date, date_range_start, date_range_end,
    CAST(total_users AS FLOAT64) AS total_users,
    CAST(sessions    AS FLOAT64) AS sessions,
    CAST(engaged_sessions AS FLOAT64) AS engaged_sessions,
    CAST(events_per_session AS FLOAT64) AS events_per_session,
    CAST(engagement_rate AS FLOAT64) AS engagement_rate,
    CAST(event_count AS FLOAT64) AS event_count,
    CAST(conversions AS FLOAT64) AS conversions,
    CAST(total_revenue AS FLOAT64) AS total_revenue,
    CAST(user_engagement_duration AS FLOAT64) AS user_engagement_duration,
    _weld_synced AS bq_synced
  FROM \`${PROJECT}.${DATASET}.channel_traffic\`
  WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
`)
const nChannels = await upsert('ga4_channel_traffic', channels.map(r => ({
  property_id: r.property_id,
  session_default_channel_grouping: r.session_default_channel_grouping,
  date: r.date, date_range_start: r.date_range_start, date_range_end: r.date_range_end,
  total_users: n(r.total_users), sessions: n(r.sessions),
  engaged_sessions: n(r.engaged_sessions), events_per_session: n(r.events_per_session),
  engagement_rate: n(r.engagement_rate), event_count: n(r.event_count),
  conversions: n(r.conversions), total_revenue: n(r.total_revenue),
  user_engagement_duration: n(r.user_engagement_duration), bq_synced: r.bq_synced,
})), 'property_id,date,session_default_channel_grouping')
console.log(`  ✓ ${nChannels} channel_traffic rows`)

// ── Page path ──────────────────────────────────────────────────────────────

console.log('Fetching page_path...')
const pages = bq(`
  SELECT property_id, page_path,
    CAST(date AS STRING) AS date, date_range_start, date_range_end,
    CAST(screen_page_views AS FLOAT64) AS screen_page_views,
    CAST(total_users AS FLOAT64) AS total_users,
    CAST(new_users   AS FLOAT64) AS new_users,
    CAST(event_count AS FLOAT64) AS event_count,
    CAST(conversions AS FLOAT64) AS conversions,
    CAST(total_revenue AS FLOAT64) AS total_revenue,
    CAST(user_engagement_duration AS FLOAT64) AS user_engagement_duration,
    _weld_synced AS bq_synced
  FROM \`${PROJECT}.${DATASET}.page_path\`
  WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
`)
const nPages = await upsert('ga4_page_path', pages.map(r => ({
  property_id: r.property_id, page_path: r.page_path,
  date: r.date, date_range_start: r.date_range_start, date_range_end: r.date_range_end,
  screen_page_views: n(r.screen_page_views), total_users: n(r.total_users),
  new_users: n(r.new_users), event_count: n(r.event_count), conversions: n(r.conversions),
  total_revenue: n(r.total_revenue),
  user_engagement_duration: n(r.user_engagement_duration), bq_synced: r.bq_synced,
})), 'property_id,date,page_path')
console.log(`  ✓ ${nPages} page_path rows`)

// ── Events overview ────────────────────────────────────────────────────────

console.log('Fetching events_overview...')
const events = bq(`
  SELECT property_id, event_name,
    CAST(date AS STRING) AS date, date_range_start, date_range_end,
    CAST(event_count AS FLOAT64) AS event_count,
    CAST(total_users AS FLOAT64) AS total_users,
    CAST(event_count_per_user AS FLOAT64) AS event_count_per_user,
    CAST(total_revenue AS FLOAT64) AS total_revenue,
    _weld_synced AS bq_synced
  FROM \`${PROJECT}.${DATASET}.events_overview\`
  WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
`)
const nEvents = await upsert('ga4_events_overview', events.map(r => ({
  property_id: r.property_id, event_name: r.event_name,
  date: r.date, date_range_start: r.date_range_start, date_range_end: r.date_range_end,
  event_count: n(r.event_count), total_users: n(r.total_users),
  event_count_per_user: n(r.event_count_per_user), total_revenue: n(r.total_revenue),
  bq_synced: r.bq_synced,
})), 'property_id,date,event_name')
console.log(`  ✓ ${nEvents} events_overview rows`)

// ── Campaign performance ───────────────────────────────────────────────────

console.log('Fetching campaign_performance...')
const camps = bq(`
  SELECT property_id, session_campaign_name,
    CAST(date AS STRING) AS date, date_range_start, date_range_end,
    CAST(total_users AS FLOAT64) AS total_users,
    CAST(sessions AS FLOAT64) AS sessions,
    CAST(engaged_sessions AS FLOAT64) AS engaged_sessions,
    CAST(events_per_session AS FLOAT64) AS events_per_session,
    CAST(engagement_rate AS FLOAT64) AS engagement_rate,
    CAST(event_count AS FLOAT64) AS event_count,
    CAST(conversions AS FLOAT64) AS conversions,
    CAST(total_revenue AS FLOAT64) AS total_revenue,
    CAST(user_engagement_duration AS FLOAT64) AS user_engagement_duration,
    _weld_synced AS bq_synced
  FROM \`${PROJECT}.${DATASET}.campaign_performance\`
  WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
`)
const nCamps = await upsert('ga4_campaign_performance', camps.map(r => ({
  property_id: r.property_id, session_campaign_name: r.session_campaign_name,
  date: r.date, date_range_start: r.date_range_start, date_range_end: r.date_range_end,
  total_users: n(r.total_users), sessions: n(r.sessions),
  engaged_sessions: n(r.engaged_sessions), events_per_session: n(r.events_per_session),
  engagement_rate: n(r.engagement_rate), event_count: n(r.event_count),
  conversions: n(r.conversions), total_revenue: n(r.total_revenue),
  user_engagement_duration: n(r.user_engagement_duration), bq_synced: r.bq_synced,
})), 'property_id,date,session_campaign_name')
console.log(`  ✓ ${nCamps} campaign_performance rows`)

// ── Browser / OS ───────────────────────────────────────────────────────────

console.log('Fetching browser_and_operating_system_overview...')
const browsers = bq(`
  SELECT property_id, operating_system, browser,
    CAST(date AS STRING) AS date, date_range_start, date_range_end,
    CAST(total_users AS FLOAT64) AS total_users,
    CAST(new_users AS FLOAT64) AS new_users,
    CAST(engaged_sessions AS FLOAT64) AS engaged_sessions,
    CAST(engagement_rate AS FLOAT64) AS engagement_rate,
    CAST(event_count AS FLOAT64) AS event_count,
    CAST(conversions AS FLOAT64) AS conversions,
    CAST(total_revenue AS FLOAT64) AS total_revenue,
    _weld_synced AS bq_synced
  FROM \`${PROJECT}.${DATASET}.browser_and_operating_system_overview\`
  WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
`)
const nBrowsers = await upsert('ga4_browser_os', browsers.map(r => ({
  property_id: r.property_id, operating_system: r.operating_system, browser: r.browser,
  date: r.date, date_range_start: r.date_range_start, date_range_end: r.date_range_end,
  total_users: n(r.total_users), new_users: n(r.new_users),
  engaged_sessions: n(r.engaged_sessions), engagement_rate: n(r.engagement_rate),
  event_count: n(r.event_count), conversions: n(r.conversions),
  total_revenue: n(r.total_revenue), bq_synced: r.bq_synced,
})), 'property_id,date,operating_system,browser')
console.log(`  ✓ ${nBrowsers} browser_os rows`)

// ── Social media acquisitions ──────────────────────────────────────────────

console.log('Fetching social_media_acquisitions...')
const social = bq(`
  SELECT property_id, session_source_platform,
    CAST(date AS STRING) AS date, date_range_start, date_range_end,
    CAST(total_users AS FLOAT64) AS total_users,
    CAST(sessions AS FLOAT64) AS sessions,
    CAST(engaged_sessions AS FLOAT64) AS engaged_sessions,
    CAST(events_per_session AS FLOAT64) AS events_per_session,
    CAST(engagement_rate AS FLOAT64) AS engagement_rate,
    CAST(event_count AS FLOAT64) AS event_count,
    CAST(conversions AS FLOAT64) AS conversions,
    CAST(total_revenue AS FLOAT64) AS total_revenue,
    CAST(user_engagement_duration AS FLOAT64) AS user_engagement_duration,
    _weld_synced AS bq_synced
  FROM \`${PROJECT}.${DATASET}.social_media_acquisitions\`
  WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
`)
const nSocial = await upsert('ga4_social_media', social.map(r => ({
  property_id: r.property_id, session_source_platform: r.session_source_platform,
  date: r.date, date_range_start: r.date_range_start, date_range_end: r.date_range_end,
  total_users: n(r.total_users), sessions: n(r.sessions),
  engaged_sessions: n(r.engaged_sessions), events_per_session: n(r.events_per_session),
  engagement_rate: n(r.engagement_rate), event_count: n(r.event_count),
  conversions: n(r.conversions), total_revenue: n(r.total_revenue),
  user_engagement_duration: n(r.user_engagement_duration), bq_synced: r.bq_synced,
})), 'property_id,date,session_source_platform')
console.log(`  ✓ ${nSocial} social_media rows`)

console.log('\nGA4 bronze ingestion complete.')
