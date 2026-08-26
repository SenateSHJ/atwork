#!/usr/bin/env node
// Bronze ingestion: Google Ads (BigQuery → Supabase)
// Run: npm run ingest:gads
// Note: BQ tables have a device dimension — queries aggregate to (date, id) grain.

import { execSync } from 'child_process'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

const PROJECT = 'thermal-effort-460301-m7'
const DATASET = 'atWork_Google_Ads'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env vars')

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket },
})
const bronze = sb.schema('bronze')

function bq(sql) {
  // maxBuffer default is 1MB — the ad_group_criterion export alone is ~5MB
  const result = execSync(
    `bq query --nouse_legacy_sql --project_id=${PROJECT} --format=json --max_rows=100000 '${sql.replace(/'/g, "'\\''")}'`,
    { encoding: 'utf8', maxBuffer: 200 * 1024 * 1024, env: { ...process.env, CLOUDSDK_CONFIG: process.env.CLOUDSDK_CONFIG } }
  )
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

function toDate(ts) { return ts ? String(ts).slice(0, 10) : null }
function n(v) { return v == null ? null : parseFloat(v) }

// ── Campaign stats (aggregated across devices) ─────────────────────────────

console.log('Fetching campaign_stats...')
const camps = bq(`
  SELECT
    CAST(date AS STRING) AS date,
    CAST(campaign_id AS STRING) AS campaign_id,
    ANY_VALUE(campaign_name) AS campaign_name,
    SUM(CAST(cost_micros AS INT64)) AS cost_micros,
    SUM(CAST(impressions AS INT64)) AS impressions,
    SUM(CAST(clicks AS INT64)) AS clicks,
    SUM(CAST(conversions AS FLOAT64)) AS conversions,
    SUM(CAST(conversions_value AS FLOAT64)) AS conversions_value,
    MAX(_weld_synced) AS bq_synced
  FROM \`${PROJECT}.${DATASET}.campaign_stats\`
  WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
    AND _weld_deleted_at IS NULL
  GROUP BY 1, 2
`)
console.log(`  ${camps.length} rows from BQ`)
const nCamps = await upsert('gads_campaign_stats', camps.map(r => ({
  date:            toDate(r.date),
  campaign_id:     r.campaign_id,
  campaign_name:   r.campaign_name,
  cost_micros:     parseInt(r.cost_micros) || 0,
  impressions:     parseInt(r.impressions) || 0,
  clicks:          parseInt(r.clicks) || 0,
  conversions:     n(r.conversions),
  conversions_value: n(r.conversions_value),
  bq_synced:       r.bq_synced || null,
})), 'date,campaign_id')
console.log(`  ✓ ${nCamps} campaign rows upserted`)

// ── Ad group stats (aggregated across devices) ────────────────────────────

console.log('Fetching ad_group_stats...')
const groups = bq(`
  SELECT
    CAST(date AS STRING) AS date,
    CAST(campaign_id AS STRING) AS campaign_id,
    ANY_VALUE(campaign_name) AS campaign_name,
    CAST(ad_group_id AS STRING) AS ad_group_id,
    ANY_VALUE(ad_group_name) AS ad_group_name,
    SUM(CAST(cost_micros AS INT64)) AS cost_micros,
    SUM(CAST(impressions AS INT64)) AS impressions,
    SUM(CAST(clicks AS INT64)) AS clicks,
    SUM(CAST(conversions AS FLOAT64)) AS conversions,
    MAX(_weld_synced) AS bq_synced
  FROM \`${PROJECT}.${DATASET}.ad_group_stats\`
  WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
    AND _weld_deleted_at IS NULL
  GROUP BY 1, 2, 4
`)
console.log(`  ${groups.length} rows from BQ`)
const nGroups = await upsert('gads_ad_group_stats', groups.map(r => ({
  date:          toDate(r.date),
  campaign_id:   r.campaign_id,
  campaign_name: r.campaign_name,
  ad_group_id:   r.ad_group_id,
  ad_group_name: r.ad_group_name,
  cost_micros:   parseInt(r.cost_micros) || 0,
  impressions:   parseInt(r.impressions) || 0,
  clicks:        parseInt(r.clicks) || 0,
  conversions:   n(r.conversions),
  bq_synced:     r.bq_synced || null,
})), 'date,ad_group_id')
console.log(`  ✓ ${nGroups} ad group rows upserted`)

// ── Ad stats (aggregated across devices) ──────────────────────────────────

console.log('Fetching ad_stats...')
const ads = bq(`
  SELECT
    CAST(date AS STRING) AS date,
    CAST(ad_id AS STRING) AS ad_id,
    ANY_VALUE(ad_name) AS ad_name,
    CAST(campaign_id AS STRING) AS campaign_id,
    ANY_VALUE(campaign_name) AS campaign_name,
    CAST(ad_group_id AS STRING) AS ad_group_id,
    ANY_VALUE(ad_group_name) AS ad_group_name,
    SUM(CAST(cost_micros AS INT64)) AS cost_micros,
    SUM(CAST(impressions AS INT64)) AS impressions,
    SUM(CAST(clicks AS INT64)) AS clicks,
    SUM(CAST(conversions AS FLOAT64)) AS conversions,
    MAX(_weld_synced) AS bq_synced
  FROM \`${PROJECT}.${DATASET}.ad_stats\`
  WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
    AND _weld_deleted_at IS NULL
  GROUP BY 1, 2, 4, 6
`)
console.log(`  ${ads.length} rows from BQ`)
const nAds = await upsert('gads_ad_stats', ads.map(r => ({
  date:          toDate(r.date),
  ad_id:         r.ad_id,
  ad_name:       r.ad_name,
  campaign_id:   r.campaign_id,
  campaign_name: r.campaign_name,
  ad_group_id:   r.ad_group_id,
  ad_group_name: r.ad_group_name,
  cost_micros:   parseInt(r.cost_micros) || 0,
  impressions:   parseInt(r.impressions) || 0,
  clicks:        parseInt(r.clicks) || 0,
  conversions:   n(r.conversions),
  bq_synced:     r.bq_synced || null,
})), 'date,ad_id')
console.log(`  ✓ ${nAds} ad rows upserted`)

// ── Keyword stats (aggregated across devices and networks) ─────────────────
// No keyword_text in this BQ export — criterion_id is the grain identifier.

console.log('Fetching keyword_stats...')
const keywords = bq(`
  SELECT
    CAST(date AS STRING) AS date,
    CAST(campaign_id AS STRING) AS campaign_id,
    CAST(ad_group_id AS STRING) AS ad_group_id,
    ad_group_criterion_criterion_id AS criterion_id,
    SUM(CAST(cost_micros AS INT64)) AS cost_micros,
    SUM(CAST(impressions AS INT64)) AS impressions,
    SUM(CAST(clicks AS INT64)) AS clicks,
    SUM(CAST(conversions AS FLOAT64)) AS conversions,
    MAX(_weld_synced) AS bq_synced
  FROM \`${PROJECT}.${DATASET}.keyword_stats\`
  WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
    AND _weld_deleted_at IS NULL
  GROUP BY 1, 2, 3, 4
`)
console.log(`  ${keywords.length} rows from BQ`)
const nKeywords = await upsert('gads_keyword_stats', keywords.map(r => ({
  date:           toDate(r.date),
  campaign_id:    r.campaign_id,
  ad_group_id:    r.ad_group_id,
  criterion_id:   r.criterion_id,
  ad_network_type: 'SEARCH',
  cost_micros:    parseInt(r.cost_micros) || 0,
  impressions:    parseInt(r.impressions) || 0,
  clicks:         parseInt(r.clicks) || 0,
  conversions:    n(r.conversions),
  bq_synced:      r.bq_synced || null,
})), 'date,ad_group_id,criterion_id,ad_network_type')
console.log(`  ✓ ${nKeywords} keyword rows upserted`)

// ── Search term stats ──────────────────────────────────────────────────────

console.log('Fetching search_term_stats...')
const terms = bq(`
  SELECT
    CAST(date AS STRING) AS date,
    CAST(campaign_id AS STRING) AS campaign_id,
    CAST(ad_group_id AS STRING) AS ad_group_id,
    search_term,
    ANY_VALUE(search_term_match_type) AS search_term_match_type,
    SUM(CAST(cost_micros AS FLOAT64)) AS cost_micros,
    SUM(CAST(impressions AS FLOAT64)) AS impressions,
    SUM(CAST(clicks AS FLOAT64)) AS clicks,
    SUM(CAST(conversions AS FLOAT64)) AS conversions,
    MAX(_weld_synced) AS bq_synced
  FROM \`${PROJECT}.${DATASET}.search_term_stats\`
  WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
    AND _weld_deleted_at IS NULL
  GROUP BY 1, 2, 3, 4
`)
console.log(`  ${terms.length} rows from BQ`)
const nTerms = await upsert('gads_search_term_stats', terms.map(r => ({
  date:                  toDate(r.date),
  campaign_id:           r.campaign_id,
  ad_group_id:           r.ad_group_id,
  search_term:           r.search_term,
  search_term_match_type: r.search_term_match_type,
  cost_micros:           n(r.cost_micros),
  impressions:           n(r.impressions),
  clicks:                n(r.clicks),
  conversions:           n(r.conversions),
  ctr:                   r.clicks > 0 && r.impressions > 0 ? n(r.clicks) / n(r.impressions) * 100 : 0,
  bq_synced:             r.bq_synced || null,
})), 'date,ad_group_id,search_term')
console.log(`  ✓ ${nTerms} search term rows upserted`)

// ── ad_group_criterion (dimension — keyword text & match type) ────────────
// Grain: (criterion_id, ad_group_id). Not date-partitioned; latest snapshot only.

console.log('Fetching ad_group_criterion...')
const criteria = bq(`
  SELECT
    CAST(ad_group_criterion_criterion_id AS STRING) AS criterion_id,
    CAST(ad_group_id AS STRING) AS ad_group_id,
    CAST(campaign_id AS STRING) AS campaign_id,
    ad_group_criterion_keyword_text AS keyword_text,
    ad_group_criterion_keyword_match_type AS keyword_match_type,
    ad_group_status,
    ad_group_type,
    quality_info_score AS quality_score,
    _weld_synced AS bq_synced
  FROM \`${PROJECT}.${DATASET}.ad_group_criterion\`
  WHERE ad_group_criterion_criterion_id IS NOT NULL
`)
console.log(`  ${criteria.length} rows from BQ`)
const nCrit = await upsert('gads_ad_group_criterion', criteria.map(r => ({
  criterion_id:       r.criterion_id,
  ad_group_id:        r.ad_group_id,
  campaign_id:        r.campaign_id,
  keyword_text:       r.keyword_text,
  keyword_match_type: r.keyword_match_type,
  ad_group_status:    r.ad_group_status,
  ad_group_type:      r.ad_group_type,
  quality_score:      r.quality_score == null ? null : parseInt(r.quality_score),
  bq_synced:          r.bq_synced || null,
})), 'criterion_id,ad_group_id')
console.log(`  ✓ ${nCrit} ad_group_criterion rows upserted`)

// ── campaign (dimension — id / name / status; resolves paused/historical
//    campaigns whose stats fall outside the 90d window used above) ─────────

console.log('Fetching campaign (dimension)...')
const campDim = bq(`
  SELECT CAST(id AS STRING) AS id, name, status,
    CAST(_weld_synced AS STRING) AS bq_synced
  FROM \`${PROJECT}.${DATASET}.campaign\`
`)
console.log(`  ${campDim.length} rows from BQ`)
const nCampDim = await upsert('gads_campaign', campDim.map(r => ({
  id: r.id, name: r.name, status: r.status, bq_synced: r.bq_synced || null,
})), 'id')
console.log(`  ✓ ${nCampDim} campaign dim rows upserted`)

// ── geo_target (dimension — resolves geoTargetConstants/* to state names) ─

console.log('Fetching geo_target...')
const geo = bq(`
  SELECT CAST(id AS STRING) AS id, name, canonical_name, country_code,
    target_type, parent_geo_target, status,
    CAST(_weld_synced AS STRING) AS bq_synced
  FROM \`${PROJECT}.${DATASET}.geo_target\`
`)
console.log(`  ${geo.length} rows from BQ`)
const nGeo = await upsert('gads_geo_target', geo.map(r => ({
  id: r.id, name: r.name, canonical_name: r.canonical_name,
  country_code: r.country_code, target_type: r.target_type,
  parent_geo_target: r.parent_geo_target, status: r.status,
  bq_synced: r.bq_synced || null,
})), 'id')
console.log(`  ✓ ${nGeo} geo_target rows upserted`)

// (ad_group_province_stats intentionally removed — atWork's rows were
//  compromise-era Indonesian province targeting from paused Search
//  campaigns, not atWork's own audience. Section dropped 2026-08-19;
//  see migration 20260819000004_drop_gads_province.sql. Untick this
//  table in the Weld sync to stop the source populating.)

// ── campaign_criterion (dimension — every criterion on every campaign) ────

console.log('Fetching campaign_criterion...')
const campCrit = bq(`
  SELECT CAST(campaign_id AS STRING) AS campaign_id, CAST(id AS STRING) AS id,
    type, status, negative, display_name,
    keyword_text, keyword_match_type, location_geo_target_constant,
    age_range_type, gender_type, device_type,
    CAST(bid_modifier AS FLOAT64) AS bid_modifier,
    CAST(_weld_synced AS STRING) AS bq_synced
  FROM \`${PROJECT}.${DATASET}.campaign_criterion\`
`)
console.log(`  ${campCrit.length} rows from BQ`)
const nCampCrit = await upsert('gads_campaign_criterion', campCrit.map(r => ({
  campaign_id: r.campaign_id, id: r.id,
  type: r.type, status: r.status,
  negative: r.negative == null ? null : (r.negative === 'true' || r.negative === true),
  display_name: r.display_name,
  keyword_text: r.keyword_text, keyword_match_type: r.keyword_match_type,
  location_geo_target_constant: r.location_geo_target_constant,
  age_range_type: r.age_range_type, gender_type: r.gender_type, device_type: r.device_type,
  bid_modifier: n(r.bid_modifier),
  bq_synced: r.bq_synced || null,
})), 'campaign_id,id')
console.log(`  ✓ ${nCampCrit} campaign_criterion rows upserted`)

// ── campaign_criterion_proximity (radius targeting per campaign) ──────────

console.log('Fetching campaign_criterion_proximity...')
const prox = bq(`
  SELECT CAST(campaign_id AS STRING) AS campaign_id,
    CAST(criterion_id AS STRING) AS criterion_id,
    address_city_name, address_province_code, address_province_name,
    address_country_code, address_postal_code, address_street_address,
    CAST(geo_point_latitude_in_micro_degrees AS INT64) AS latitude_micro,
    CAST(geo_point_longitude_in_micro_degrees AS INT64) AS longitude_micro,
    CAST(radius AS FLOAT64) AS radius, radius_units,
    CAST(_weld_synced AS STRING) AS bq_synced
  FROM \`${PROJECT}.${DATASET}.campaign_criterion_proximity\`
  WHERE radius IS NOT NULL
`)
console.log(`  ${prox.length} rows from BQ`)
const nProx = await upsert('gads_campaign_criterion_proximity', prox.map(r => ({
  campaign_id: r.campaign_id, criterion_id: r.criterion_id,
  address_city_name: r.address_city_name,
  address_province_code: r.address_province_code,
  address_province_name: r.address_province_name,
  address_country_code: r.address_country_code,
  address_postal_code: r.address_postal_code,
  address_street_address: r.address_street_address,
  latitude_micro: r.latitude_micro == null ? null : parseInt(r.latitude_micro),
  longitude_micro: r.longitude_micro == null ? null : parseInt(r.longitude_micro),
  radius: n(r.radius), radius_units: r.radius_units,
  bq_synced: r.bq_synced || null,
})), 'campaign_id,criterion_id')
console.log(`  ✓ ${nProx} proximity rows upserted`)

console.log('\nGoogle Ads bronze ingestion complete.')
