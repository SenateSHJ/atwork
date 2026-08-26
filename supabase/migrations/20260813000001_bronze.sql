-- Bronze layer: raw ingested rows from BigQuery via Weld
-- One table per BQ source table, column types preserved as-is
-- Rows are upserted daily; bq_synced tracks the Weld _weld_synced timestamp

create schema if not exists bronze;

-- ─── Meta ──────────────────────────────────────────────────────────────────

create table if not exists bronze.meta_campaign_insight (
  id                  bigint generated always as identity primary key,
  date_start          date        not null,
  date_stop           date        not null,
  campaign_id         text        not null,
  campaign_name       text,
  account_id          text,
  spend               numeric,
  impressions         bigint,
  clicks              bigint,
  reach               bigint,
  frequency           numeric,
  ctr                 numeric,
  cpc                 numeric,
  cpm                 numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (date_start, campaign_id)
);

create table if not exists bronze.meta_adset_insight (
  id                  bigint generated always as identity primary key,
  date_start          date        not null,
  date_stop           date        not null,
  campaign_id         text        not null,
  campaign_name       text,
  adset_id            text        not null,
  adset_name          text,
  account_id          text,
  spend               numeric,
  impressions         bigint,
  clicks              bigint,
  reach               bigint,
  frequency           numeric,
  ctr                 numeric,
  cpc                 numeric,
  cpm                 numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (date_start, adset_id)
);

create table if not exists bronze.meta_ad_insight (
  id                  bigint generated always as identity primary key,
  date_start          date        not null,
  date_stop           date        not null,
  campaign_id         text        not null,
  campaign_name       text,
  adset_id            text,
  adset_name          text,
  ad_id               text        not null,
  ad_name             text,
  account_id          text,
  spend               numeric,
  impressions         bigint,
  clicks              bigint,
  reach               bigint,
  frequency           numeric,
  ctr                 numeric,
  cpc                 numeric,
  cpm                 numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (date_start, ad_id)
);

create table if not exists bronze.meta_ad_insight_actions (
  id                  bigint generated always as identity primary key,
  date_start          date        not null,
  ad_id               text        not null,
  action_type         text        not null,
  value               numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (date_start, ad_id, action_type)
);

-- ─── Google Ads ────────────────────────────────────────────────────────────

create table if not exists bronze.gads_campaign_stats (
  id                  bigint generated always as identity primary key,
  date                date        not null,
  campaign_id         text        not null,
  campaign_name       text,
  campaign_status     text,
  advertising_channel_type text,
  cost_micros         bigint,
  impressions         bigint,
  clicks              bigint,
  conversions         numeric,
  conversions_value   numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (date, campaign_id)
);

create table if not exists bronze.gads_ad_group_stats (
  id                  bigint generated always as identity primary key,
  date                date        not null,
  campaign_id         text,
  campaign_name       text,
  ad_group_id         text        not null,
  ad_group_name       text,
  cost_micros         bigint,
  impressions         bigint,
  clicks              bigint,
  conversions         numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (date, ad_group_id)
);

create table if not exists bronze.gads_ad_stats (
  id                  bigint generated always as identity primary key,
  date                date        not null,
  campaign_id         text,
  campaign_name       text,
  ad_group_id         text,
  ad_group_name       text,
  ad_id               text        not null,
  ad_name             text,
  cost_micros         bigint,
  impressions         bigint,
  clicks              bigint,
  conversions         numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (date, ad_id)
);

create table if not exists bronze.gads_keyword_stats (
  id                  bigint generated always as identity primary key,
  date                date        not null,
  campaign_id         text,
  campaign_name       text,
  ad_group_id         text,
  ad_group_name       text,
  keyword_id          text,
  keyword_text        text        not null,
  match_type          text,
  cost_micros         bigint,
  impressions         bigint,
  clicks              bigint,
  conversions         numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (date, ad_group_id, keyword_text, match_type)
);

create table if not exists bronze.gads_search_term_stats (
  id                  bigint generated always as identity primary key,
  date                date        not null,
  campaign_id         text,
  campaign_name       text,
  ad_group_id         text,
  search_term         text        not null,
  cost_micros         bigint,
  impressions         bigint,
  clicks              bigint,
  conversions         numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (date, ad_group_id, search_term)
);

-- ─── GA4 ──────────────────────────────────────────────────────────────────

create table if not exists bronze.ga4_audience_overview (
  id                  bigint generated always as identity primary key,
  property_id         text        not null,
  date                date        not null,
  date_range_start    text,
  date_range_end      text,
  total_users         numeric,
  new_users           numeric,
  sessions            numeric,
  sessions_per_user   numeric,
  screen_page_views   numeric,
  user_engagement_duration numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (property_id, date)
);

create table if not exists bronze.ga4_channel_traffic (
  id                  bigint generated always as identity primary key,
  property_id         text        not null,
  date                date        not null,
  session_default_channel_grouping text,
  date_range_start    text,
  date_range_end      text,
  total_users         numeric,
  sessions            numeric,
  engaged_sessions    numeric,
  events_per_session  numeric,
  engagement_rate     numeric,
  event_count         numeric,
  conversions         numeric,
  total_revenue       numeric,
  user_engagement_duration numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (property_id, date, session_default_channel_grouping)
);

create table if not exists bronze.ga4_page_path (
  id                  bigint generated always as identity primary key,
  property_id         text        not null,
  date                date        not null,
  page_path           text        not null,
  date_range_start    text,
  date_range_end      text,
  screen_page_views   numeric,
  total_users         numeric,
  new_users           numeric,
  event_count         numeric,
  conversions         numeric,
  total_revenue       numeric,
  user_engagement_duration numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (property_id, date, page_path)
);

create table if not exists bronze.ga4_events_overview (
  id                  bigint generated always as identity primary key,
  property_id         text        not null,
  date                date        not null,
  event_name          text        not null,
  date_range_start    text,
  date_range_end      text,
  event_count         numeric,
  total_users         numeric,
  event_count_per_user numeric,
  total_revenue       numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (property_id, date, event_name)
);

create table if not exists bronze.ga4_campaign_performance (
  id                  bigint generated always as identity primary key,
  property_id         text        not null,
  date                date        not null,
  session_campaign_name text,
  date_range_start    text,
  date_range_end      text,
  total_users         numeric,
  sessions            numeric,
  engaged_sessions    numeric,
  events_per_session  numeric,
  engagement_rate     numeric,
  event_count         numeric,
  conversions         numeric,
  total_revenue       numeric,
  user_engagement_duration numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (property_id, date, session_campaign_name)
);

create table if not exists bronze.ga4_browser_os (
  id                  bigint generated always as identity primary key,
  property_id         text        not null,
  date                date        not null,
  operating_system    text,
  browser             text,
  date_range_start    text,
  date_range_end      text,
  total_users         numeric,
  new_users           numeric,
  engaged_sessions    numeric,
  engagement_rate     numeric,
  event_count         numeric,
  conversions         numeric,
  total_revenue       numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (property_id, date, operating_system, browser)
);

create table if not exists bronze.ga4_social_media (
  id                  bigint generated always as identity primary key,
  property_id         text        not null,
  date                date        not null,
  session_source_platform text,
  date_range_start    text,
  date_range_end      text,
  total_users         numeric,
  sessions            numeric,
  engaged_sessions    numeric,
  events_per_session  numeric,
  engagement_rate     numeric,
  event_count         numeric,
  conversions         numeric,
  total_revenue       numeric,
  user_engagement_duration numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (property_id, date, session_source_platform)
);

-- Indexes for date-range queries
create index if not exists idx_meta_ci_date    on bronze.meta_campaign_insight  (date_start);
create index if not exists idx_meta_ai_date    on bronze.meta_adset_insight     (date_start);
create index if not exists idx_meta_adi_date   on bronze.meta_ad_insight        (date_start);
create index if not exists idx_gads_cs_date    on bronze.gads_campaign_stats    (date);
create index if not exists idx_gads_ag_date    on bronze.gads_ad_group_stats    (date);
create index if not exists idx_gads_kw_date    on bronze.gads_keyword_stats     (date);
create index if not exists idx_gads_st_date    on bronze.gads_search_term_stats (date);
create index if not exists idx_ga4_ao_date     on bronze.ga4_audience_overview  (date);
create index if not exists idx_ga4_ct_date     on bronze.ga4_channel_traffic    (date);
create index if not exists idx_ga4_pp_date     on bronze.ga4_page_path          (date);
create index if not exists idx_ga4_ev_date     on bronze.ga4_events_overview    (date);
