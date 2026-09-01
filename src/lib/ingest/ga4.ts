/* eslint-disable @typescript-eslint/no-explicit-any */
// Bronze ingest: GA4 (BigQuery → Supabase)
// Ported from scripts/bronze-ga4.mjs. SQL preserved verbatim.
// Sources are pre-aggregated Weld report tables (not raw GA4 events).

import { makeBq } from './bq'
import { makeSupabase } from './supabase'

const DATASET = 'atWork_Google_Analytics_4'

function n(v: any): number | null {
  return v == null ? null : parseFloat(v)
}

export async function runGa4(): Promise<{
  upserted: Record<string, number>
  emptyReads: string[]
}> {
  const PROJECT = process.env.GCP_PROJECT_ID
  if (!PROJECT) throw new Error('GCP_PROJECT_ID env var required')

  const { bq, emptyReads } = makeBq()
  const { upsert } = makeSupabase('bronze')
  const upserted: Record<string, number> = {}

  // ── Audience overview ────────────────────────────────────────────────────
  console.log('Fetching audience_overview...')
  const overview = await bq(`
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
  `, 'audience_overview')
  upserted.ga4_audience_overview = await upsert('ga4_audience_overview', overview.map((r: any) => ({
    property_id: r.property_id, date: r.date,
    date_range_start: r.date_range_start, date_range_end: r.date_range_end,
    total_users: n(r.total_users), new_users: n(r.new_users), sessions: n(r.sessions),
    sessions_per_user: n(r.sessions_per_user), screen_page_views: n(r.screen_page_views),
    user_engagement_duration: n(r.user_engagement_duration), bq_synced: r.bq_synced,
  })), 'property_id,date')
  console.log(`  ✓ ${upserted.ga4_audience_overview} audience_overview rows`)

  // ── Channel traffic ──────────────────────────────────────────────────────
  console.log('Fetching channel_traffic...')
  const channels = await bq(`
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
  `, 'channel_traffic')
  upserted.ga4_channel_traffic = await upsert('ga4_channel_traffic', channels.map((r: any) => ({
    property_id: r.property_id,
    session_default_channel_grouping: r.session_default_channel_grouping,
    date: r.date, date_range_start: r.date_range_start, date_range_end: r.date_range_end,
    total_users: n(r.total_users), sessions: n(r.sessions),
    engaged_sessions: n(r.engaged_sessions), events_per_session: n(r.events_per_session),
    engagement_rate: n(r.engagement_rate), event_count: n(r.event_count),
    conversions: n(r.conversions), total_revenue: n(r.total_revenue),
    user_engagement_duration: n(r.user_engagement_duration), bq_synced: r.bq_synced,
  })), 'property_id,date,session_default_channel_grouping')
  console.log(`  ✓ ${upserted.ga4_channel_traffic} channel_traffic rows`)

  // ── Page path ────────────────────────────────────────────────────────────
  console.log('Fetching page_path...')
  const pages = await bq(`
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
  `, 'page_path')
  upserted.ga4_page_path = await upsert('ga4_page_path', pages.map((r: any) => ({
    property_id: r.property_id, page_path: r.page_path,
    date: r.date, date_range_start: r.date_range_start, date_range_end: r.date_range_end,
    screen_page_views: n(r.screen_page_views), total_users: n(r.total_users),
    new_users: n(r.new_users), event_count: n(r.event_count), conversions: n(r.conversions),
    total_revenue: n(r.total_revenue),
    user_engagement_duration: n(r.user_engagement_duration), bq_synced: r.bq_synced,
  })), 'property_id,date,page_path')
  console.log(`  ✓ ${upserted.ga4_page_path} page_path rows`)

  // ── Events overview ──────────────────────────────────────────────────────
  console.log('Fetching events_overview...')
  const events = await bq(`
    SELECT property_id, event_name,
      CAST(date AS STRING) AS date, date_range_start, date_range_end,
      CAST(event_count AS FLOAT64) AS event_count,
      CAST(total_users AS FLOAT64) AS total_users,
      CAST(event_count_per_user AS FLOAT64) AS event_count_per_user,
      CAST(total_revenue AS FLOAT64) AS total_revenue,
      _weld_synced AS bq_synced
    FROM \`${PROJECT}.${DATASET}.events_overview\`
    WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
  `, 'events_overview')
  upserted.ga4_events_overview = await upsert('ga4_events_overview', events.map((r: any) => ({
    property_id: r.property_id, event_name: r.event_name,
    date: r.date, date_range_start: r.date_range_start, date_range_end: r.date_range_end,
    event_count: n(r.event_count), total_users: n(r.total_users),
    event_count_per_user: n(r.event_count_per_user), total_revenue: n(r.total_revenue),
    bq_synced: r.bq_synced,
  })), 'property_id,date,event_name')
  console.log(`  ✓ ${upserted.ga4_events_overview} events_overview rows`)

  // ── Campaign performance ─────────────────────────────────────────────────
  console.log('Fetching campaign_performance...')
  const camps = await bq(`
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
  `, 'campaign_performance')
  upserted.ga4_campaign_performance = await upsert('ga4_campaign_performance', camps.map((r: any) => ({
    property_id: r.property_id, session_campaign_name: r.session_campaign_name,
    date: r.date, date_range_start: r.date_range_start, date_range_end: r.date_range_end,
    total_users: n(r.total_users), sessions: n(r.sessions),
    engaged_sessions: n(r.engaged_sessions), events_per_session: n(r.events_per_session),
    engagement_rate: n(r.engagement_rate), event_count: n(r.event_count),
    conversions: n(r.conversions), total_revenue: n(r.total_revenue),
    user_engagement_duration: n(r.user_engagement_duration), bq_synced: r.bq_synced,
  })), 'property_id,date,session_campaign_name')
  console.log(`  ✓ ${upserted.ga4_campaign_performance} campaign_performance rows`)

  // ── Browser / OS ─────────────────────────────────────────────────────────
  console.log('Fetching browser_and_operating_system_overview...')
  const browsers = await bq(`
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
  `, 'browser_and_operating_system_overview')
  upserted.ga4_browser_os = await upsert('ga4_browser_os', browsers.map((r: any) => ({
    property_id: r.property_id, operating_system: r.operating_system, browser: r.browser,
    date: r.date, date_range_start: r.date_range_start, date_range_end: r.date_range_end,
    total_users: n(r.total_users), new_users: n(r.new_users),
    engaged_sessions: n(r.engaged_sessions), engagement_rate: n(r.engagement_rate),
    event_count: n(r.event_count), conversions: n(r.conversions),
    total_revenue: n(r.total_revenue), bq_synced: r.bq_synced,
  })), 'property_id,date,operating_system,browser')
  console.log(`  ✓ ${upserted.ga4_browser_os} browser_os rows`)

  // ── Social media acquisitions ────────────────────────────────────────────
  console.log('Fetching social_media_acquisitions...')
  const social = await bq(`
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
  `, 'social_media_acquisitions')
  upserted.ga4_social_media = await upsert('ga4_social_media', social.map((r: any) => ({
    property_id: r.property_id, session_source_platform: r.session_source_platform,
    date: r.date, date_range_start: r.date_range_start, date_range_end: r.date_range_end,
    total_users: n(r.total_users), sessions: n(r.sessions),
    engaged_sessions: n(r.engaged_sessions), events_per_session: n(r.events_per_session),
    engagement_rate: n(r.engagement_rate), event_count: n(r.event_count),
    conversions: n(r.conversions), total_revenue: n(r.total_revenue),
    user_engagement_duration: n(r.user_engagement_duration), bq_synced: r.bq_synced,
  })), 'property_id,date,session_source_platform')
  console.log(`  ✓ ${upserted.ga4_social_media} social_media rows`)

  console.log('\nGA4 bronze ingestion complete.')
  return { upserted, emptyReads }
}
