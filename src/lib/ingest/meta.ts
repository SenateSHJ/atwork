/* eslint-disable @typescript-eslint/no-explicit-any */
// Bronze ingest: Meta Ads (BigQuery → Supabase)
// Ported from scripts/bronze-meta.mjs. SQL is preserved verbatim; the only
// behavioural change is the `bq` helper now uses the @google-cloud/bigquery
// SDK instead of shelling out to the `bq` CLI.

import { makeBq } from './bq'
import { makeSupabase } from './supabase'

const DATASET = 'facebook_ads'

function toDate(ts: any): string | null {
  return ts ? String(ts).slice(0, 10) : null
}
function n(v: any): number | null {
  return v == null ? null : parseFloat(v)
}
function i(v: any): number | null {
  return v == null ? null : parseInt(v)
}
const asBool = (v: any): boolean | null =>
  v == null ? null : String(v).toLowerCase() === 'true'
const asFlat = (v: any): any => (Array.isArray(v) ? v.join(',') : v)
const asJson = (v: any): any => (Array.isArray(v) ? JSON.stringify(v) : v)

export async function runMeta(): Promise<{
  upserted: Record<string, number>
  emptyReads: string[]
}> {
  const PROJECT = process.env.GCP_PROJECT_ID
  if (!PROJECT) throw new Error('GCP_PROJECT_ID env var required')

  const { bq, emptyReads } = makeBq()
  const { upsert } = makeSupabase('bronze')
  const upserted: Record<string, number> = {}

  // ── Campaign insights ────────────────────────────────────────────────────
  console.log('Fetching campaign_insight...')
  const campaigns = await bq(`
    SELECT campaign_id, campaign_name, account_id,
      CAST(date AS STRING) AS date,
      CAST(spend AS FLOAT64) AS spend,
      CAST(impressions AS INT64) AS impressions,
      CAST(clicks AS INT64) AS clicks,
      CAST(inline_link_clicks AS INT64) AS inline_link_clicks,
      CAST(reach AS INT64) AS reach,
      CAST(frequency AS FLOAT64) AS frequency,
      CAST(ctr AS FLOAT64) AS ctr,
      CAST(cpc AS FLOAT64) AS cpc,
      CAST(cpm AS FLOAT64) AS cpm,
      _weld_synced AS bq_synced
    FROM \`${PROJECT}.${DATASET}.campaign_insight\`
    WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
  `, 'campaign_insight')
  console.log(`  ${campaigns.length} rows from BQ`)
  upserted.meta_campaign_insight = await upsert('meta_campaign_insight', campaigns.map((r: any) => ({
    date:              toDate(r.date),
    campaign_id:       r.campaign_id,
    campaign_name:     r.campaign_name,
    account_id:        r.account_id,
    spend:             n(r.spend),
    impressions:       i(r.impressions),
    clicks:            i(r.clicks),
    inline_link_clicks: i(r.inline_link_clicks),
    reach:             i(r.reach),
    frequency:         n(r.frequency),
    ctr:               n(r.ctr),
    cpc:               n(r.cpc),
    cpm:               n(r.cpm),
    bq_synced:         r.bq_synced || null,
  })), 'date,campaign_id')
  console.log(`  ✓ ${upserted.meta_campaign_insight} campaign rows upserted`)

  // ── Ad set insights ──────────────────────────────────────────────────────
  console.log('Fetching ad_set_insight...')
  const adsets = await bq(`
    SELECT adset_id, adset_name, campaign_id, campaign_name, account_id,
      CAST(date AS STRING) AS date,
      CAST(spend AS FLOAT64) AS spend,
      CAST(impressions AS INT64) AS impressions,
      CAST(clicks AS INT64) AS clicks,
      CAST(inline_link_clicks AS INT64) AS inline_link_clicks,
      CAST(reach AS INT64) AS reach,
      CAST(frequency AS FLOAT64) AS frequency,
      CAST(ctr AS FLOAT64) AS ctr,
      CAST(cpc AS FLOAT64) AS cpc,
      CAST(cpm AS FLOAT64) AS cpm,
      _weld_synced AS bq_synced
    FROM \`${PROJECT}.${DATASET}.ad_set_insight\`
    WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
  `, 'ad_set_insight')
  console.log(`  ${adsets.length} rows from BQ`)
  upserted.meta_adset_insight = await upsert('meta_adset_insight', adsets.map((r: any) => ({
    date:              toDate(r.date),
    adset_id:          r.adset_id,
    adset_name:        r.adset_name,
    campaign_id:       r.campaign_id,
    campaign_name:     r.campaign_name,
    account_id:        r.account_id,
    spend:             n(r.spend),
    impressions:       i(r.impressions),
    clicks:            i(r.clicks),
    inline_link_clicks: i(r.inline_link_clicks),
    reach:             i(r.reach),
    frequency:         n(r.frequency),
    ctr:               n(r.ctr),
    cpc:               n(r.cpc),
    cpm:               n(r.cpm),
    bq_synced:         r.bq_synced || null,
  })), 'date,adset_id')
  console.log(`  ✓ ${upserted.meta_adset_insight} ad set rows upserted`)

  // ── Ad insights ──────────────────────────────────────────────────────────
  console.log('Fetching ad_insight...')
  const ads = await bq(`
    SELECT ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, account_id,
      CAST(date AS STRING) AS date,
      CAST(spend AS FLOAT64) AS spend,
      CAST(impressions AS INT64) AS impressions,
      CAST(clicks AS INT64) AS clicks,
      CAST(inline_link_clicks AS INT64) AS inline_link_clicks,
      CAST(reach AS INT64) AS reach,
      CAST(frequency AS FLOAT64) AS frequency,
      CAST(ctr AS FLOAT64) AS ctr,
      CAST(cpc AS FLOAT64) AS cpc,
      CAST(cpm AS FLOAT64) AS cpm,
      _weld_synced AS bq_synced
    FROM \`${PROJECT}.${DATASET}.ad_insight\`
    WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
  `, 'ad_insight')
  console.log(`  ${ads.length} rows from BQ`)
  upserted.meta_ad_insight = await upsert('meta_ad_insight', ads.map((r: any) => ({
    date:              toDate(r.date),
    ad_id:             r.ad_id,
    ad_name:           r.ad_name,
    adset_id:          r.adset_id,
    adset_name:        r.adset_name,
    campaign_id:       r.campaign_id,
    campaign_name:     r.campaign_name,
    account_id:        r.account_id,
    spend:             n(r.spend),
    impressions:       i(r.impressions),
    clicks:            i(r.clicks),
    inline_link_clicks: i(r.inline_link_clicks),
    reach:             i(r.reach),
    frequency:         n(r.frequency),
    ctr:               n(r.ctr),
    cpc:               n(r.cpc),
    cpm:               n(r.cpm),
    bq_synced:         r.bq_synced || null,
  })), 'date,ad_id')
  console.log(`  ✓ ${upserted.meta_ad_insight} ad rows upserted`)

  // ── Ad actions ───────────────────────────────────────────────────────────
  console.log('Fetching ad_insight_actions...')
  const actions = await bq(`
    SELECT a.ad_id, a.action_type,
      CAST(a.date AS STRING) AS date,
      CAST(a.value AS FLOAT64) AS value,
      a._weld_synced AS bq_synced
    FROM \`${PROJECT}.${DATASET}.ad_insight_actions\` a
    WHERE a.date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
  `, 'ad_insight_actions')
  console.log(`  ${actions.length} rows from BQ`)
  upserted.meta_ad_insight_actions = await upsert('meta_ad_insight_actions', actions.map((r: any) => ({
    date:        toDate(r.date),
    ad_id:       r.ad_id,
    action_type: r.action_type,
    value:       n(r.value),
    bq_synced:   r.bq_synced || null,
  })), 'date,ad_id,action_type')
  console.log(`  ✓ ${upserted.meta_ad_insight_actions} action rows upserted`)

  // ── Ad dimension (ad_id → creative_id link, no date grain) ──────────────
  console.log('Fetching ad...')
  const adDim = await bq(`
    SELECT id, account_id, adset_id, campaign_id, creative_id, name,
      status, effective_status, configured_status,
      CAST(created_time AS STRING) AS created_time,
      CAST(updated_time AS STRING) AS updated_time,
      _weld_synced AS bq_synced
    FROM \`${PROJECT}.${DATASET}.ad\`
  `, 'ad')
  console.log(`  ${adDim.length} rows from BQ`)
  upserted.meta_ad = await upsert('meta_ad', adDim.map((r: any) => ({
    ad_id:             r.id,
    account_id:        r.account_id,
    adset_id:          r.adset_id,
    campaign_id:       r.campaign_id,
    creative_id:       r.creative_id,
    name:              r.name,
    status:            r.status,
    effective_status:  r.effective_status,
    configured_status: r.configured_status,
    created_time:      r.created_time || null,
    updated_time:      r.updated_time || null,
    bq_synced:         r.bq_synced || null,
  })), 'ad_id')
  console.log(`  ✓ ${upserted.meta_ad} ad dimension rows upserted`)

  // ── Creative dimension ──────────────────────────────────────────────────
  console.log('Fetching creative...')
  const creatives = await bq(`
    SELECT id, account_id, name, object_type, video_id, image_hash, image_url,
      thumbnail_url, title, body, call_to_action_type, link_url,
      effective_object_story_id,
      _weld_synced AS bq_synced
    FROM \`${PROJECT}.${DATASET}.creative\`
  `, 'creative')
  console.log(`  ${creatives.length} rows from BQ`)
  upserted.meta_creative = await upsert('meta_creative', creatives.map((r: any) => ({
    creative_id:               r.id,
    account_id:                r.account_id,
    name:                      r.name,
    object_type:               r.object_type,
    video_id:                  r.video_id,
    image_hash:                r.image_hash,
    image_url:                 r.image_url,
    thumbnail_url:             r.thumbnail_url,
    title:                     r.title,
    body:                      r.body,
    call_to_action_type:       r.call_to_action_type,
    link_url:                  r.link_url,
    effective_object_story_id: r.effective_object_story_id,
    bq_synced:                 r.bq_synced || null,
  })), 'creative_id')
  console.log(`  ✓ ${upserted.meta_creative} creative rows upserted`)

  // ── Ad-scope conversion insights ────────────────────────────────────────
  console.log('Fetching ad_roas_insight_conversion_insights...')
  const adConvIns = await bq(`
    SELECT
      CAST(date AS STRING) AS date,
      campaign_id, adset_id, ad_id,
      CAST(seven_d_click AS STRING) AS seven_d_click,
      CAST(one_d_view AS STRING) AS one_d_view,
      page_engagement, post_engagement, video_view, post_reaction,
      post_interaction_gross, post_interaction_net,
      link_click, landing_page_view, omni_landing_page_view,
      \`comment\`, onsite_conversion_post_net_comment,
      onsite_conversion_post_net_like, onsite_conversion_post_save,
      onsite_conversion_post_net_save, \`like\`, \`post\`,
      contact_website, contact_total,
      offsite_conversion_fb_pixel_lead, offsite_conversion_fb_pixel_custom,
      onsite_web_lead, lead, offsite_lead_add_20_s_calls,
      onsite_conversion_messaging_first_reply,
      onsite_conversion_messaging_conversation_started_7_d,
      onsite_conversion_messaging_conversation_replied_7_d,
      onsite_conversion_messaging_user_depth_2_message_send,
      onsite_conversion_messaging_user_depth_3_message_send,
      onsite_conversion_total_messaging_connection,
      omni_search, offsite_search_add_meta_leads, offsite_conversion_fb_pixel_search, search,
      omni_add_to_wishlist, add_to_wishlist, offsite_conversion_fb_pixel_add_to_wishlist,
      app_site_visit, photo_view, schedule_total, schedule_website,
      onsite_conversion_post_unlike, onsite_conversion_post_unsave, post_uncomment,
      _weld_synced AS bq_synced
    FROM \`${PROJECT}.${DATASET}.ad_roas_insight_conversion_insights\`
    WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
  `, 'ad_roas_insight_conversion_insights')
  console.log(`  ${adConvIns.length} rows from BQ`)
  upserted.meta_ad_roas_insight_conversion_insights = await upsert('meta_ad_roas_insight_conversion_insights', adConvIns.map((r: any) => ({
    date:          toDate(r.date),
    campaign_id:   r.campaign_id,
    adset_id:      r.adset_id,
    ad_id:         r.ad_id,
    seven_d_click: r.seven_d_click,
    one_d_view:    r.one_d_view,
    page_engagement: i(r.page_engagement),
    post_engagement: i(r.post_engagement),
    video_view:      i(r.video_view),
    post_reaction:   i(r.post_reaction),
    post_interaction_gross: i(r.post_interaction_gross),
    post_interaction_net:   i(r.post_interaction_net),
    link_click:             i(r.link_click),
    landing_page_view:      i(r.landing_page_view),
    omni_landing_page_view: i(r.omni_landing_page_view),
    comment:                             i(r.comment),
    onsite_conversion_post_net_comment:  i(r.onsite_conversion_post_net_comment),
    onsite_conversion_post_net_like:     i(r.onsite_conversion_post_net_like),
    onsite_conversion_post_save:         i(r.onsite_conversion_post_save),
    onsite_conversion_post_net_save:     i(r.onsite_conversion_post_net_save),
    like:                                i(r.like),
    post:                                i(r.post),
    contact_website:                     i(r.contact_website),
    contact_total:                       i(r.contact_total),
    offsite_conversion_fb_pixel_lead:    i(r.offsite_conversion_fb_pixel_lead),
    offsite_conversion_fb_pixel_custom:  i(r.offsite_conversion_fb_pixel_custom),
    onsite_web_lead:                     i(r.onsite_web_lead),
    lead:                                i(r.lead),
    offsite_lead_add_20_s_calls:         i(r.offsite_lead_add_20_s_calls),
    onsite_conversion_messaging_first_reply: i(r.onsite_conversion_messaging_first_reply),
    onsite_conversion_messaging_conversation_started_7_d: i(r.onsite_conversion_messaging_conversation_started_7_d),
    onsite_conversion_messaging_conversation_replied_7_d: i(r.onsite_conversion_messaging_conversation_replied_7_d),
    onsite_conversion_messaging_user_depth_2_message_send: i(r.onsite_conversion_messaging_user_depth_2_message_send),
    onsite_conversion_messaging_user_depth_3_message_send: i(r.onsite_conversion_messaging_user_depth_3_message_send),
    onsite_conversion_total_messaging_connection: i(r.onsite_conversion_total_messaging_connection),
    omni_search:                                  i(r.omni_search),
    offsite_search_add_meta_leads:                i(r.offsite_search_add_meta_leads),
    offsite_conversion_fb_pixel_search:           i(r.offsite_conversion_fb_pixel_search),
    search:                                       i(r.search),
    omni_add_to_wishlist:                         i(r.omni_add_to_wishlist),
    add_to_wishlist:                              i(r.add_to_wishlist),
    offsite_conversion_fb_pixel_add_to_wishlist:  i(r.offsite_conversion_fb_pixel_add_to_wishlist),
    app_site_visit:                               i(r.app_site_visit),
    photo_view:                                   i(r.photo_view),
    schedule_total:                               i(r.schedule_total),
    schedule_website:                             i(r.schedule_website),
    onsite_conversion_post_unlike:                i(r.onsite_conversion_post_unlike),
    onsite_conversion_post_unsave:                i(r.onsite_conversion_post_unsave),
    post_uncomment:                               i(r.post_uncomment),
    bq_synced:                                    r.bq_synced || null,
  })), 'date,ad_id')
  console.log(`  ✓ ${upserted.meta_ad_roas_insight_conversion_insights} ad conversion_insights upserted`)

  // ── Campaign-scope conversion insights ──────────────────────────────────
  console.log('Fetching campaign_roas_insight_conversion_insights...')
  const campConvIns = await bq(`
    SELECT
      CAST(date AS STRING) AS date,
      campaign_id,
      CAST(seven_d_click AS STRING) AS seven_d_click,
      CAST(one_d_view AS STRING) AS one_d_view,
      page_engagement, post_engagement, video_view, post_reaction,
      post_interaction_gross, post_interaction_net,
      link_click, landing_page_view, omni_landing_page_view,
      \`comment\`, onsite_conversion_post_net_comment,
      onsite_conversion_post_net_like, onsite_conversion_post_save,
      onsite_conversion_post_net_save, \`like\`, \`post\`,
      contact_website, contact_total,
      offsite_conversion_fb_pixel_lead, offsite_conversion_fb_pixel_custom,
      onsite_web_lead, lead, offsite_lead_add_20_s_calls,
      onsite_conversion_messaging_first_reply,
      onsite_conversion_messaging_conversation_started_7_d,
      onsite_conversion_messaging_conversation_replied_7_d,
      onsite_conversion_messaging_user_depth_2_message_send,
      onsite_conversion_messaging_user_depth_3_message_send,
      onsite_conversion_total_messaging_connection,
      omni_search, offsite_search_add_meta_leads, offsite_conversion_fb_pixel_search, search,
      omni_add_to_wishlist, add_to_wishlist, offsite_conversion_fb_pixel_add_to_wishlist,
      app_site_visit, photo_view, schedule_total, schedule_website,
      onsite_conversion_post_unlike, onsite_conversion_post_unsave, post_uncomment,
      _weld_synced AS bq_synced
    FROM \`${PROJECT}.${DATASET}.campaign_roas_insight_conversion_insights\`
    WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
  `, 'campaign_roas_insight_conversion_insights')
  console.log(`  ${campConvIns.length} rows from BQ`)
  upserted.meta_campaign_roas_insight_conversion_insights = await upsert('meta_campaign_roas_insight_conversion_insights', campConvIns.map((r: any) => ({
    date:          toDate(r.date),
    campaign_id:   r.campaign_id,
    seven_d_click: r.seven_d_click,
    one_d_view:    r.one_d_view,
    page_engagement: i(r.page_engagement),
    post_engagement: i(r.post_engagement),
    video_view:      i(r.video_view),
    post_reaction:   i(r.post_reaction),
    post_interaction_gross: i(r.post_interaction_gross),
    post_interaction_net:   i(r.post_interaction_net),
    link_click:             i(r.link_click),
    landing_page_view:      i(r.landing_page_view),
    omni_landing_page_view: i(r.omni_landing_page_view),
    comment:                             i(r.comment),
    onsite_conversion_post_net_comment:  i(r.onsite_conversion_post_net_comment),
    onsite_conversion_post_net_like:     i(r.onsite_conversion_post_net_like),
    onsite_conversion_post_save:         i(r.onsite_conversion_post_save),
    onsite_conversion_post_net_save:     i(r.onsite_conversion_post_net_save),
    like:                                i(r.like),
    post:                                i(r.post),
    contact_website:                     i(r.contact_website),
    contact_total:                       i(r.contact_total),
    offsite_conversion_fb_pixel_lead:    i(r.offsite_conversion_fb_pixel_lead),
    offsite_conversion_fb_pixel_custom:  i(r.offsite_conversion_fb_pixel_custom),
    onsite_web_lead:                     i(r.onsite_web_lead),
    lead:                                i(r.lead),
    offsite_lead_add_20_s_calls:         i(r.offsite_lead_add_20_s_calls),
    onsite_conversion_messaging_first_reply: i(r.onsite_conversion_messaging_first_reply),
    onsite_conversion_messaging_conversation_started_7_d: i(r.onsite_conversion_messaging_conversation_started_7_d),
    onsite_conversion_messaging_conversation_replied_7_d: i(r.onsite_conversion_messaging_conversation_replied_7_d),
    onsite_conversion_messaging_user_depth_2_message_send: i(r.onsite_conversion_messaging_user_depth_2_message_send),
    onsite_conversion_messaging_user_depth_3_message_send: i(r.onsite_conversion_messaging_user_depth_3_message_send),
    onsite_conversion_total_messaging_connection: i(r.onsite_conversion_total_messaging_connection),
    omni_search:                                  i(r.omni_search),
    offsite_search_add_meta_leads:                i(r.offsite_search_add_meta_leads),
    offsite_conversion_fb_pixel_search:           i(r.offsite_conversion_fb_pixel_search),
    search:                                       i(r.search),
    omni_add_to_wishlist:                         i(r.omni_add_to_wishlist),
    add_to_wishlist:                              i(r.add_to_wishlist),
    offsite_conversion_fb_pixel_add_to_wishlist:  i(r.offsite_conversion_fb_pixel_add_to_wishlist),
    app_site_visit:                               i(r.app_site_visit),
    photo_view:                                   i(r.photo_view),
    schedule_total:                               i(r.schedule_total),
    schedule_website:                             i(r.schedule_website),
    onsite_conversion_post_unlike:                i(r.onsite_conversion_post_unlike),
    onsite_conversion_post_unsave:                i(r.onsite_conversion_post_unsave),
    post_uncomment:                               i(r.post_uncomment),
    bq_synced:                                    r.bq_synced || null,
  })), 'date,campaign_id')
  console.log(`  ✓ ${upserted.meta_campaign_roas_insight_conversion_insights} campaign conversion_insights upserted`)

  // ── Campaign entity dimension ───────────────────────────────────────────
  console.log('Fetching campaign (entity)...')
  const campDim = await bq(`
    SELECT id, account_id, name, objective, status, effective_status, configured_status,
      bid_strategy, buying_type,
      CAST(daily_budget AS FLOAT64)     AS daily_budget,
      CAST(lifetime_budget AS FLOAT64)  AS lifetime_budget,
      CAST(spend_cap AS FLOAT64)        AS spend_cap,
      CAST(budget_remaining AS FLOAT64) AS budget_remaining,
      pacing_type, special_ad_category, smart_promotion_type, boosted_object_id,
      can_use_spend_cap, is_skadnetwork_attribution,
      CAST(start_time AS STRING)   AS start_time,
      CAST(stop_time AS STRING)    AS stop_time,
      CAST(created_time AS STRING) AS created_time,
      CAST(updated_time AS STRING) AS updated_time,
      _weld_synced AS bq_synced
    FROM \`${PROJECT}.${DATASET}.campaign\`
  `, 'campaign')
  console.log(`  ${campDim.length} rows from BQ`)
  upserted.meta_campaign = await upsert('meta_campaign', campDim.map((r: any) => ({
    campaign_id:                r.id,
    account_id:                 r.account_id,
    name:                       r.name,
    objective:                  r.objective,
    status:                     r.status,
    effective_status:           r.effective_status,
    configured_status:          r.configured_status,
    bid_strategy:               r.bid_strategy,
    buying_type:                r.buying_type,
    daily_budget:               n(r.daily_budget),
    lifetime_budget:            n(r.lifetime_budget),
    spend_cap:                  n(r.spend_cap),
    budget_remaining:           n(r.budget_remaining),
    pacing_type:                asFlat(r.pacing_type),
    special_ad_category:        r.special_ad_category,
    smart_promotion_type:       r.smart_promotion_type,
    boosted_object_id:          r.boosted_object_id,
    can_use_spend_cap:          asBool(r.can_use_spend_cap),
    is_skadnetwork_attribution: asBool(r.is_skadnetwork_attribution),
    start_time:                 r.start_time   || null,
    stop_time:                  r.stop_time    || null,
    created_time:               r.created_time || null,
    updated_time:               r.updated_time || null,
    bq_synced:                  r.bq_synced    || null,
  })), 'campaign_id')
  console.log(`  ✓ ${upserted.meta_campaign} campaign dim rows upserted`)

  // ── Adset entity dimension (targeting_* audience fields) ────────────────
  console.log('Fetching ad_set (entity)...')
  const adsetDim = await bq(`
    SELECT id, campaign_id, account_id, name, status, effective_status, configured_status,
      optimization_goal, optimization_sub_event, billing_event, bid_strategy,
      CAST(bid_amount AS FLOAT64)                AS bid_amount,
      CAST(daily_budget AS FLOAT64)              AS daily_budget,
      CAST(lifetime_budget AS FLOAT64)           AS lifetime_budget,
      CAST(daily_spend_cap AS FLOAT64)           AS daily_spend_cap,
      CAST(lifetime_spend_cap AS FLOAT64)        AS lifetime_spend_cap,
      CAST(daily_min_spend_target AS FLOAT64)    AS daily_min_spend_target,
      CAST(lifetime_min_spend_target AS FLOAT64) AS lifetime_min_spend_target,
      destination_type, is_dynamic_creative,
      CAST(start_time AS STRING)   AS start_time,
      CAST(end_time AS STRING)     AS end_time,
      CAST(created_time AS STRING) AS created_time,
      CAST(updated_time AS STRING) AS updated_time,
      CAST(targeting_age_min AS INT64) AS targeting_age_min,
      CAST(targeting_age_max AS INT64) AS targeting_age_max,
      targeting_geo_locations_countries,
      targeting_geo_locations_location_types,
      targeting_publisher_platforms,
      targeting_facebook_positions,
      targeting_instagram_positions,
      targeting_audience_network_positions,
      targeting_messenger_positions,
      targeting_effective_audience_network_positions,
      targeting_device_platforms,
      targeting_custom_audiences,
      targeting_flexible_spec,
      targeting_exclusions,
      targeting_locales,
      targeting_user_device,
      targeting_user_os,
      targeting_targeting_optimization,
      _weld_synced AS bq_synced
    FROM \`${PROJECT}.${DATASET}.ad_set\`
  `, 'ad_set')
  console.log(`  ${adsetDim.length} rows from BQ`)
  upserted.meta_adset = await upsert('meta_adset', adsetDim.map((r: any) => ({
    adset_id:                   r.id,
    campaign_id:                r.campaign_id,
    account_id:                 r.account_id,
    name:                       r.name,
    status:                     r.status,
    effective_status:           r.effective_status,
    configured_status:          r.configured_status,
    optimization_goal:          r.optimization_goal,
    optimization_sub_event:     r.optimization_sub_event,
    billing_event:              r.billing_event,
    bid_strategy:               r.bid_strategy,
    bid_amount:                 n(r.bid_amount),
    daily_budget:               n(r.daily_budget),
    lifetime_budget:            n(r.lifetime_budget),
    daily_spend_cap:            n(r.daily_spend_cap),
    lifetime_spend_cap:         n(r.lifetime_spend_cap),
    daily_min_spend_target:     n(r.daily_min_spend_target),
    lifetime_min_spend_target:  n(r.lifetime_min_spend_target),
    destination_type:           r.destination_type,
    is_dynamic_creative:        asBool(r.is_dynamic_creative),
    start_time:                 r.start_time   || null,
    end_time:                   r.end_time     || null,
    created_time:               r.created_time || null,
    updated_time:               r.updated_time || null,
    targeting_age_min:                       i(r.targeting_age_min),
    targeting_age_max:                       i(r.targeting_age_max),
    targeting_geo_locations_countries:       asJson(r.targeting_geo_locations_countries),
    targeting_geo_locations_location_types:  asJson(r.targeting_geo_locations_location_types),
    targeting_publisher_platforms:           asJson(r.targeting_publisher_platforms),
    targeting_facebook_positions:            asJson(r.targeting_facebook_positions),
    targeting_instagram_positions:           asJson(r.targeting_instagram_positions),
    targeting_audience_network_positions:    asJson(r.targeting_audience_network_positions),
    targeting_messenger_positions:           asJson(r.targeting_messenger_positions),
    targeting_effective_audience_network_positions: asJson(r.targeting_effective_audience_network_positions),
    targeting_device_platforms:              asJson(r.targeting_device_platforms),
    targeting_custom_audiences:              asJson(r.targeting_custom_audiences),
    targeting_flexible_spec:                 asJson(r.targeting_flexible_spec),
    targeting_exclusions:                    asJson(r.targeting_exclusions),
    targeting_locales:                       asJson(r.targeting_locales),
    targeting_user_device:                   asJson(r.targeting_user_device),
    targeting_user_os:                       asJson(r.targeting_user_os),
    targeting_targeting_optimization:        r.targeting_targeting_optimization,
    bq_synced:                               r.bq_synced || null,
  })), 'adset_id')
  console.log(`  ✓ ${upserted.meta_adset} adset dim rows upserted`)

  // ── Video watch funnel (account × date grain — no ad_id in source) ─────
  console.log('Fetching action_video_view_type (base)...')
  const vvtBase = await bq(`
    SELECT CAST(date AS STRING) AS date, account_id, account_name, account_currency,
      _weld_synced AS bq_synced
    FROM \`${PROJECT}.${DATASET}.action_video_view_type\`
    WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
  `, 'action_video_view_type')
  console.log(`  ${vvtBase.length} rows from BQ`)
  upserted.meta_action_video_view_type = await upsert('meta_action_video_view_type', vvtBase.map((r: any) => ({
    date:             toDate(r.date),
    account_id:       r.account_id,
    account_name:     r.account_name,
    account_currency: r.account_currency,
    bq_synced:        r.bq_synced || null,
  })), 'date,account_id')
  console.log(`  ✓ ${upserted.meta_action_video_view_type} video_view_type base rows upserted`)

  // Same shape across all 7 metric subtables — loop.
  const VIDEO_METRIC_SUFFIXES = [
    '30_sec_watched_actions',
    'avg_time_watched_actions',
    'p25_watched_actions',
    'p50_watched_actions',
    'p75_watched_actions',
    'p100_watched_actions',
    'thruplay_watched_actions',
  ]
  for (const suffix of VIDEO_METRIC_SUFFIXES) {
    const bqTable     = `action_video_view_type_video_${suffix}`
    const bronzeTable = `meta_action_video_view_type_video_${suffix}`
    console.log(`Fetching ${bqTable}...`)
    const rows = await bq(`
      SELECT CAST(date AS STRING) AS date, account_id, action_type, action_video_type,
        CAST(value AS FLOAT64) AS value,
        _weld_synced AS bq_synced
      FROM \`${PROJECT}.${DATASET}.${bqTable}\`
      WHERE date >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
    `, bqTable)
    console.log(`  ${rows.length} rows from BQ`)
    const nRows = await upsert(bronzeTable, rows.map((r: any) => ({
      date:              toDate(r.date),
      account_id:        r.account_id,
      action_type:       r.action_type,
      action_video_type: r.action_video_type,
      value:             n(r.value),
      bq_synced:         r.bq_synced || null,
    })), 'date,action_type,action_video_type')
    upserted[bronzeTable] = nRows
    console.log(`  ✓ ${nRows} ${suffix} rows upserted`)
  }

  if (emptyReads.length > 0) {
    console.warn('\n⚠ Meta bronze ingest finished with empty upstream reads:')
    for (const t of emptyReads) console.warn(`  - ${t}`)
  } else {
    console.log('\nMeta bronze ingestion complete.')
  }

  return { upserted, emptyReads }
}
