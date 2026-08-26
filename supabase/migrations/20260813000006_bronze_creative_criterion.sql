-- Bronze tables for two newly-enabled Weld resources:
--   • gads_ad_group_criterion — Google Ads dimension carrying keyword text + match type
--   • meta_creative           — Meta creative object carrying object_type / video_id / image_hash

create table if not exists bronze.gads_ad_group_criterion (
  id                     bigint generated always as identity primary key,
  criterion_id           text        not null,
  ad_group_id            text,
  campaign_id            text,
  keyword_text           text,
  keyword_match_type     text,
  ad_group_status        text,
  ad_group_type          text,
  quality_score          integer,
  bq_synced              timestamptz,
  ingested_at            timestamptz not null default now(),
  unique (criterion_id, ad_group_id)
);

create index if not exists idx_gads_agc_criterion on bronze.gads_ad_group_criterion (criterion_id);

create table if not exists bronze.meta_creative (
  id                     bigint generated always as identity primary key,
  creative_id            text        not null,
  account_id             text,
  name                   text,
  object_type            text,
  video_id               text,
  image_hash             text,
  image_url              text,
  thumbnail_url          text,
  title                  text,
  body                   text,
  call_to_action_type    text,
  link_url               text,
  effective_object_story_id text,
  bq_synced              timestamptz,
  ingested_at            timestamptz not null default now(),
  unique (creative_id)
);

create index if not exists idx_meta_creative_id on bronze.meta_creative (creative_id);

grant select on bronze.gads_ad_group_criterion, bronze.meta_creative
  to anon, authenticated, service_role;
