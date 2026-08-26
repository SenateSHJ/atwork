-- Corrective migration: align bronze tables with actual Weld/BQ column names.
-- All tables are empty (ingestion hasn't succeeded yet) so drop-recreate is safe.

drop table if exists bronze.meta_campaign_insight cascade;
drop table if exists bronze.meta_adset_insight cascade;
drop table if exists bronze.meta_ad_insight cascade;
drop table if exists bronze.meta_ad_insight_actions cascade;
drop table if exists bronze.gads_campaign_stats cascade;
drop table if exists bronze.gads_ad_group_stats cascade;
drop table if exists bronze.gads_ad_stats cascade;
drop table if exists bronze.gads_keyword_stats cascade;
drop table if exists bronze.gads_search_term_stats cascade;

-- ─── Meta (date is TIMESTAMP in BQ, stored as DATE here) ─────────────────

create table bronze.meta_campaign_insight (
  id                  bigint generated always as identity primary key,
  date                date        not null,
  campaign_id         text        not null,
  campaign_name       text,
  account_id          text,
  spend               numeric,
  impressions         bigint,
  clicks              bigint,
  inline_link_clicks  bigint,
  reach               bigint,
  frequency           numeric,
  ctr                 numeric,
  cpc                 numeric,
  cpm                 numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (date, campaign_id)
);

create table bronze.meta_adset_insight (
  id                  bigint generated always as identity primary key,
  date                date        not null,
  adset_id            text        not null,
  adset_name          text,
  campaign_id         text,
  campaign_name       text,
  account_id          text,
  spend               numeric,
  impressions         bigint,
  clicks              bigint,
  inline_link_clicks  bigint,
  reach               bigint,
  frequency           numeric,
  ctr                 numeric,
  cpc                 numeric,
  cpm                 numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (date, adset_id)
);

create table bronze.meta_ad_insight (
  id                  bigint generated always as identity primary key,
  date                date        not null,
  ad_id               text        not null,
  ad_name             text,
  adset_id            text,
  adset_name          text,
  campaign_id         text,
  campaign_name       text,
  account_id          text,
  spend               numeric,
  impressions         bigint,
  clicks              bigint,
  inline_link_clicks  bigint,
  reach               bigint,
  frequency           numeric,
  ctr                 numeric,
  cpc                 numeric,
  cpm                 numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (date, ad_id)
);

create table bronze.meta_ad_insight_actions (
  id                  bigint generated always as identity primary key,
  date                date        not null,
  ad_id               text        not null,
  action_type         text        not null,
  value               numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (date, ad_id, action_type)
);

-- ─── Google Ads (date is TIMESTAMP in BQ, IDs are INTEGER → stored as TEXT)

create table bronze.gads_campaign_stats (
  id                  bigint generated always as identity primary key,
  date                date        not null,
  campaign_id         text        not null,
  campaign_name       text,
  cost_micros         bigint,
  impressions         bigint,
  clicks              bigint,
  conversions         numeric,
  conversions_value   numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (date, campaign_id)
);

create table bronze.gads_ad_group_stats (
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

create table bronze.gads_ad_stats (
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

-- keyword_stats has no keyword_text in this BQ export; criterion_id is the grain
create table bronze.gads_keyword_stats (
  id                  bigint generated always as identity primary key,
  date                date        not null,
  campaign_id         text,
  ad_group_id         text        not null,
  ad_group_name       text,
  criterion_id        text        not null,
  ad_network_type     text,
  cost_micros         bigint,
  impressions         bigint,
  clicks              bigint,
  conversions         numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (date, ad_group_id, criterion_id, ad_network_type)
);

create table bronze.gads_search_term_stats (
  id                  bigint generated always as identity primary key,
  date                date        not null,
  campaign_id         text,
  ad_group_id         text        not null,
  search_term         text        not null,
  search_term_match_type text,
  cost_micros         numeric,
  impressions         numeric,
  clicks              numeric,
  conversions         numeric,
  ctr                 numeric,
  bq_synced           timestamptz,
  ingested_at         timestamptz not null default now(),
  unique (date, ad_group_id, search_term)
);

-- Indexes
create index if not exists idx_meta_ci_date    on bronze.meta_campaign_insight  (date);
create index if not exists idx_meta_ai_date    on bronze.meta_adset_insight     (date);
create index if not exists idx_meta_adi_date   on bronze.meta_ad_insight        (date);
create index if not exists idx_gads_cs_date    on bronze.gads_campaign_stats    (date);
create index if not exists idx_gads_ag_date    on bronze.gads_ad_group_stats    (date);
create index if not exists idx_gads_kw_date    on bronze.gads_keyword_stats     (date);
create index if not exists idx_gads_st_date    on bronze.gads_search_term_stats (date);
