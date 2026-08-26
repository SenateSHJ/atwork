-- Bronze + silver models for the newly-landed Meta tables.
--
--   Conversion / engagement:
--     bronze.meta_ad_roas_insight_conversion_insights       (per ad × day)
--     bronze.meta_campaign_roas_insight_conversion_insights (per campaign × day)
--     silver.meta_ad_conversion_insights
--     silver.meta_campaign_conversion_insights
--
--   Entity dimensions:
--     bronze.meta_campaign  (objective, bid, budgets)
--     bronze.meta_adset     (targeting_* — audience data)
--     silver.meta_campaign
--     silver.meta_adset
--
--   Video watch funnel (action_video_view_type family — account × date grain;
--   no ad_id in source, see report):
--     bronze.meta_action_video_view_type
--     bronze.meta_action_video_view_type_video_{30_sec,avg_time,p25,p50,
--                                                p75,p100,thruplay}_watched_actions
--     silver.meta_video_watch
--
-- Naming: adset_* (no underscore split), matching populated meta_adset_insight.
-- The empty legacy meta_ad_set_* shadow set is reported separately.

-- ═══════════════════════════════════════════════════════════════════════════
-- BRONZE — Conversion / engagement insights
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists bronze.meta_ad_roas_insight_conversion_insights (
  id                                                       bigint generated always as identity primary key,
  date                                                     date        not null,
  campaign_id                                              text        not null,
  adset_id                                                 text        not null,
  ad_id                                                    text        not null,
  seven_d_click                                            text,
  one_d_view                                               text,
  page_engagement                                          bigint,
  post_engagement                                          bigint,
  video_view                                               bigint,
  post_reaction                                            bigint,
  post_interaction_gross                                   bigint,
  post_interaction_net                                     bigint,
  link_click                                               bigint,
  landing_page_view                                        bigint,
  omni_landing_page_view                                   bigint,
  "comment"                                                bigint,
  onsite_conversion_post_net_comment                       bigint,
  onsite_conversion_post_net_like                          bigint,
  onsite_conversion_post_save                              bigint,
  onsite_conversion_post_net_save                          bigint,
  "like"                                                   bigint,
  "post"                                                   bigint,
  contact_website                                          bigint,
  contact_total                                            bigint,
  offsite_conversion_fb_pixel_lead                         bigint,
  offsite_conversion_fb_pixel_custom                       bigint,
  onsite_web_lead                                          bigint,
  lead                                                     bigint,
  offsite_lead_add_20_s_calls                              bigint,
  onsite_conversion_messaging_first_reply                  bigint,
  onsite_conversion_messaging_conversation_started_7_d     bigint,
  onsite_conversion_messaging_conversation_replied_7_d     bigint,
  onsite_conversion_messaging_user_depth_2_message_send    bigint,
  onsite_conversion_messaging_user_depth_3_message_send    bigint,
  onsite_conversion_total_messaging_connection             bigint,
  omni_search                                              bigint,
  offsite_search_add_meta_leads                            bigint,
  offsite_conversion_fb_pixel_search                       bigint,
  search                                                   bigint,
  omni_add_to_wishlist                                     bigint,
  add_to_wishlist                                          bigint,
  offsite_conversion_fb_pixel_add_to_wishlist              bigint,
  app_site_visit                                           bigint,
  photo_view                                               bigint,
  schedule_total                                           bigint,
  schedule_website                                         bigint,
  onsite_conversion_post_unlike                            bigint,
  onsite_conversion_post_unsave                            bigint,
  post_uncomment                                           bigint,
  bq_synced                                                timestamptz,
  ingested_at                                              timestamptz not null default now(),
  unique (date, ad_id)
);
create index if not exists idx_meta_ad_conv_ins_campaign on bronze.meta_ad_roas_insight_conversion_insights (campaign_id);
create index if not exists idx_meta_ad_conv_ins_adset    on bronze.meta_ad_roas_insight_conversion_insights (adset_id);

create table if not exists bronze.meta_campaign_roas_insight_conversion_insights (
  id                                                       bigint generated always as identity primary key,
  date                                                     date        not null,
  campaign_id                                              text        not null,
  seven_d_click                                            text,
  one_d_view                                               text,
  page_engagement                                          bigint,
  post_engagement                                          bigint,
  video_view                                               bigint,
  post_reaction                                            bigint,
  post_interaction_gross                                   bigint,
  post_interaction_net                                     bigint,
  link_click                                               bigint,
  landing_page_view                                        bigint,
  omni_landing_page_view                                   bigint,
  "comment"                                                bigint,
  onsite_conversion_post_net_comment                       bigint,
  onsite_conversion_post_net_like                          bigint,
  onsite_conversion_post_save                              bigint,
  onsite_conversion_post_net_save                          bigint,
  "like"                                                   bigint,
  "post"                                                   bigint,
  contact_website                                          bigint,
  contact_total                                            bigint,
  offsite_conversion_fb_pixel_lead                         bigint,
  offsite_conversion_fb_pixel_custom                       bigint,
  onsite_web_lead                                          bigint,
  lead                                                     bigint,
  offsite_lead_add_20_s_calls                              bigint,
  onsite_conversion_messaging_first_reply                  bigint,
  onsite_conversion_messaging_conversation_started_7_d     bigint,
  onsite_conversion_messaging_conversation_replied_7_d     bigint,
  onsite_conversion_messaging_user_depth_2_message_send    bigint,
  onsite_conversion_messaging_user_depth_3_message_send    bigint,
  onsite_conversion_total_messaging_connection             bigint,
  omni_search                                              bigint,
  offsite_search_add_meta_leads                            bigint,
  offsite_conversion_fb_pixel_search                       bigint,
  search                                                   bigint,
  omni_add_to_wishlist                                     bigint,
  add_to_wishlist                                          bigint,
  offsite_conversion_fb_pixel_add_to_wishlist              bigint,
  app_site_visit                                           bigint,
  photo_view                                               bigint,
  schedule_total                                           bigint,
  schedule_website                                         bigint,
  onsite_conversion_post_unlike                            bigint,
  onsite_conversion_post_unsave                            bigint,
  post_uncomment                                           bigint,
  bq_synced                                                timestamptz,
  ingested_at                                              timestamptz not null default now(),
  unique (date, campaign_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- BRONZE — Entity dimensions
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists bronze.meta_campaign (
  id                        bigint generated always as identity primary key,
  campaign_id               text        not null,
  account_id                text,
  name                      text,
  objective                 text,
  status                    text,
  effective_status          text,
  configured_status         text,
  bid_strategy              text,
  buying_type               text,
  daily_budget              numeric,
  lifetime_budget           numeric,
  spend_cap                 numeric,
  budget_remaining          numeric,
  pacing_type               text,
  special_ad_category       text,
  smart_promotion_type      text,
  boosted_object_id         text,
  can_use_spend_cap         boolean,
  is_skadnetwork_attribution boolean,
  start_time                timestamptz,
  stop_time                 timestamptz,
  created_time              timestamptz,
  updated_time              timestamptz,
  bq_synced                 timestamptz,
  ingested_at               timestamptz not null default now(),
  unique (campaign_id)
);

create table if not exists bronze.meta_adset (
  id                                       bigint generated always as identity primary key,
  adset_id                                 text        not null,
  campaign_id                              text,
  account_id                               text,
  name                                     text,
  status                                   text,
  effective_status                         text,
  configured_status                        text,
  optimization_goal                        text,
  optimization_sub_event                   text,
  billing_event                            text,
  bid_strategy                             text,
  bid_amount                               numeric,
  daily_budget                             numeric,
  lifetime_budget                          numeric,
  daily_spend_cap                          numeric,
  lifetime_spend_cap                       numeric,
  daily_min_spend_target                   numeric,
  lifetime_min_spend_target                numeric,
  destination_type                         text,
  is_dynamic_creative                      boolean,
  start_time                               timestamptz,
  end_time                                 timestamptz,
  created_time                             timestamptz,
  updated_time                             timestamptz,
  -- Targeting (audience) — kept as text; complex specs land as JSON strings.
  targeting_age_min                        int,
  targeting_age_max                        int,
  targeting_geo_locations_countries        text,
  targeting_geo_locations_location_types   text,
  targeting_publisher_platforms            text,
  targeting_facebook_positions             text,
  targeting_instagram_positions            text,
  targeting_audience_network_positions     text,
  targeting_messenger_positions            text,
  targeting_effective_audience_network_positions text,
  targeting_device_platforms               text,
  targeting_custom_audiences               text,
  targeting_flexible_spec                  text,
  targeting_exclusions                     text,
  targeting_locales                        text,
  targeting_user_device                    text,
  targeting_user_os                        text,
  targeting_targeting_optimization         text,
  bq_synced                                timestamptz,
  ingested_at                              timestamptz not null default now(),
  unique (adset_id)
);
create index if not exists idx_meta_adset_campaign on bronze.meta_adset (campaign_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- BRONZE — Video view-type family (account × date grain)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists bronze.meta_action_video_view_type (
  id                bigint generated always as identity primary key,
  date              date        not null,
  account_id        text,
  account_name      text,
  account_currency  text,
  bq_synced         timestamptz,
  ingested_at       timestamptz not null default now(),
  unique (date, account_id)
);

-- Long-format metric tables — one row per (date, action_type, action_video_type).
-- Same shape for all seven. Consolidated DDL below with per-table `create table`
-- (kept individual so PG's `if not exists` re-run is a no-op per table).

create table if not exists bronze.meta_action_video_view_type_video_30_sec_watched_actions (
  id                 bigint generated always as identity primary key,
  date               date        not null,
  account_id         text,
  action_type        text        not null,
  action_video_type  text        not null,
  value              numeric,
  bq_synced          timestamptz,
  ingested_at        timestamptz not null default now(),
  unique (date, action_type, action_video_type)
);

create table if not exists bronze.meta_action_video_view_type_video_avg_time_watched_actions (
  id                 bigint generated always as identity primary key,
  date               date        not null,
  account_id         text,
  action_type        text        not null,
  action_video_type  text        not null,
  value              numeric,
  bq_synced          timestamptz,
  ingested_at        timestamptz not null default now(),
  unique (date, action_type, action_video_type)
);

create table if not exists bronze.meta_action_video_view_type_video_p25_watched_actions (
  id                 bigint generated always as identity primary key,
  date               date        not null,
  account_id         text,
  action_type        text        not null,
  action_video_type  text        not null,
  value              numeric,
  bq_synced          timestamptz,
  ingested_at        timestamptz not null default now(),
  unique (date, action_type, action_video_type)
);

create table if not exists bronze.meta_action_video_view_type_video_p50_watched_actions (
  id                 bigint generated always as identity primary key,
  date               date        not null,
  account_id         text,
  action_type        text        not null,
  action_video_type  text        not null,
  value              numeric,
  bq_synced          timestamptz,
  ingested_at        timestamptz not null default now(),
  unique (date, action_type, action_video_type)
);

create table if not exists bronze.meta_action_video_view_type_video_p75_watched_actions (
  id                 bigint generated always as identity primary key,
  date               date        not null,
  account_id         text,
  action_type        text        not null,
  action_video_type  text        not null,
  value              numeric,
  bq_synced          timestamptz,
  ingested_at        timestamptz not null default now(),
  unique (date, action_type, action_video_type)
);

create table if not exists bronze.meta_action_video_view_type_video_p100_watched_actions (
  id                 bigint generated always as identity primary key,
  date               date        not null,
  account_id         text,
  action_type        text        not null,
  action_video_type  text        not null,
  value              numeric,
  bq_synced          timestamptz,
  ingested_at        timestamptz not null default now(),
  unique (date, action_type, action_video_type)
);

create table if not exists bronze.meta_action_video_view_type_video_thruplay_watched_actions (
  id                 bigint generated always as identity primary key,
  date               date        not null,
  account_id         text,
  action_type        text        not null,
  action_video_type  text        not null,
  value              numeric,
  bq_synced          timestamptz,
  ingested_at        timestamptz not null default now(),
  unique (date, action_type, action_video_type)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- SILVER — Conversion / engagement (Scott's specified minimum + a few close cousins)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view silver.meta_ad_conversion_insights as
select
  date,
  campaign_id,
  adset_id,
  ad_id,
  coalesce(lead,                              0) as lead,
  coalesce(offsite_conversion_fb_pixel_lead,  0) as offsite_conversion_fb_pixel_lead,
  coalesce(landing_page_view,                 0) as landing_page_view,
  coalesce(link_click,                        0) as link_click,
  coalesce(post_engagement,                   0) as post_engagement,
  coalesce(page_engagement,                   0) as page_engagement,
  coalesce(post_reaction,                     0) as post_reaction,
  coalesce("comment",                         0) as comment_count,
  coalesce(video_view,                        0) as video_view,
  coalesce(contact_website,                   0) as contact_website,
  coalesce(contact_total,                     0) as contact_total
from bronze.meta_ad_roas_insight_conversion_insights;

create or replace view silver.meta_campaign_conversion_insights as
select
  date,
  campaign_id,
  coalesce(lead,                              0) as lead,
  coalesce(offsite_conversion_fb_pixel_lead,  0) as offsite_conversion_fb_pixel_lead,
  coalesce(landing_page_view,                 0) as landing_page_view,
  coalesce(link_click,                        0) as link_click,
  coalesce(post_engagement,                   0) as post_engagement,
  coalesce(page_engagement,                   0) as page_engagement,
  coalesce(post_reaction,                     0) as post_reaction,
  coalesce("comment",                         0) as comment_count,
  coalesce(video_view,                        0) as video_view,
  coalesce(contact_website,                   0) as contact_website,
  coalesce(contact_total,                     0) as contact_total
from bronze.meta_campaign_roas_insight_conversion_insights;

-- ═══════════════════════════════════════════════════════════════════════════
-- SILVER — Entity dimensions
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view silver.meta_campaign as
select
  campaign_id,
  account_id,
  name,
  objective,
  status,
  effective_status,
  bid_strategy,
  buying_type,
  daily_budget,
  lifetime_budget,
  spend_cap,
  pacing_type,
  special_ad_category,
  start_time,
  stop_time,
  created_time,
  updated_time
from bronze.meta_campaign;

create or replace view silver.meta_adset as
select
  adset_id,
  campaign_id,
  account_id,
  name,
  status,
  effective_status,
  optimization_goal,
  billing_event,
  bid_strategy,
  bid_amount,
  daily_budget,
  lifetime_budget,
  destination_type,
  is_dynamic_creative,
  start_time,
  end_time,
  created_time,
  updated_time,
  targeting_age_min,
  targeting_age_max,
  targeting_geo_locations_countries,
  targeting_geo_locations_location_types,
  targeting_publisher_platforms,
  targeting_facebook_positions,
  targeting_instagram_positions,
  targeting_audience_network_positions,
  targeting_messenger_positions,
  targeting_device_platforms,
  targeting_custom_audiences,
  targeting_flexible_spec,
  targeting_exclusions,
  targeting_locales
from bronze.meta_adset;

-- ═══════════════════════════════════════════════════════════════════════════
-- SILVER — Video watch funnel
--
-- Grain is (date × action_video_type). Source lacks ad_id (see report), so
-- this can't be per-ad. Widest metric table (p25 @ 2,062 rows) is the join
-- spine; the others left-join on (date, action_type, action_video_type)
-- and each metric SUMs across whatever action_type variants coexist on
-- that (date, action_video_type) pair.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view silver.meta_video_watch as
with
  p25  as (select date, action_video_type, sum(value) as v from bronze.meta_action_video_view_type_video_p25_watched_actions      group by 1, 2),
  p50  as (select date, action_video_type, sum(value) as v from bronze.meta_action_video_view_type_video_p50_watched_actions      group by 1, 2),
  p75  as (select date, action_video_type, sum(value) as v from bronze.meta_action_video_view_type_video_p75_watched_actions      group by 1, 2),
  p100 as (select date, action_video_type, sum(value) as v from bronze.meta_action_video_view_type_video_p100_watched_actions     group by 1, 2),
  tp   as (select date, action_video_type, sum(value) as v from bronze.meta_action_video_view_type_video_thruplay_watched_actions group by 1, 2),
  s30  as (select date, action_video_type, sum(value) as v from bronze.meta_action_video_view_type_video_30_sec_watched_actions   group by 1, 2),
  avgt as (select date, action_video_type, sum(value) as v from bronze.meta_action_video_view_type_video_avg_time_watched_actions group by 1, 2)
select
  p25.date,
  p25.action_video_type,
  -- video_views: no dedicated "views" metric in this family; p25 is the
  -- tightest lower-bound proxy (viewer watched at least 25% of the video).
  -- Left as `p25` in silver; consumers can pick any percentile as their
  -- "view" definition.
  p25.v            as p25_watched,
  p50.v            as p50_watched,
  p75.v            as p75_watched,
  p100.v           as p100_watched,
  tp.v             as thruplay,
  s30.v            as sec_30_watched,
  avgt.v           as avg_time_watched
from p25
left join p50  on p50.date  = p25.date and p50.action_video_type  = p25.action_video_type
left join p75  on p75.date  = p25.date and p75.action_video_type  = p25.action_video_type
left join p100 on p100.date = p25.date and p100.action_video_type = p25.action_video_type
left join tp   on tp.date   = p25.date and tp.action_video_type   = p25.action_video_type
left join s30  on s30.date  = p25.date and s30.action_video_type  = p25.action_video_type
left join avgt on avgt.date = p25.date and avgt.action_video_type = p25.action_video_type;

-- ═══════════════════════════════════════════════════════════════════════════
-- Grants
-- ═══════════════════════════════════════════════════════════════════════════

grant select on
  bronze.meta_ad_roas_insight_conversion_insights,
  bronze.meta_campaign_roas_insight_conversion_insights,
  bronze.meta_campaign,
  bronze.meta_adset,
  bronze.meta_action_video_view_type,
  bronze.meta_action_video_view_type_video_30_sec_watched_actions,
  bronze.meta_action_video_view_type_video_avg_time_watched_actions,
  bronze.meta_action_video_view_type_video_p25_watched_actions,
  bronze.meta_action_video_view_type_video_p50_watched_actions,
  bronze.meta_action_video_view_type_video_p75_watched_actions,
  bronze.meta_action_video_view_type_video_p100_watched_actions,
  bronze.meta_action_video_view_type_video_thruplay_watched_actions
  to anon, authenticated, service_role;

grant select on
  silver.meta_ad_conversion_insights,
  silver.meta_campaign_conversion_insights,
  silver.meta_campaign,
  silver.meta_adset,
  silver.meta_video_watch
  to anon, authenticated, service_role;
