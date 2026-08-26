-- Add bronze.meta_ad dimension (bridges ad_insight to creative via creative_id).
-- Rebuild silver.gads_keywords to include keyword text + match type.
-- Add silver.meta_creative and silver.meta_ads_with_creative for the
-- image-vs-video split on the Meta page.

create table if not exists bronze.meta_ad (
  id                     bigint generated always as identity primary key,
  ad_id                  text        not null,
  account_id             text,
  adset_id               text,
  campaign_id            text,
  creative_id            text,
  name                   text,
  status                 text,
  effective_status       text,
  configured_status      text,
  created_time           timestamptz,
  updated_time           timestamptz,
  bq_synced              timestamptz,
  ingested_at            timestamptz not null default now(),
  unique (ad_id)
);

create index if not exists idx_meta_ad_creative on bronze.meta_ad (creative_id);

grant select on bronze.meta_ad to anon, authenticated, service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- SILVER — Google Ads keywords (now with keyword text + match type)
-- ══════════════════════════════════════════════════════════════════════════

-- Column set changes (adds keyword_text / keyword_match_type at new positions),
-- so CREATE OR REPLACE won't work — Postgres requires DROP + CREATE.
drop view if exists silver.gads_keywords cascade;
create view silver.gads_keywords as
select
  k.date,
  k.campaign_id,
  k.ad_group_id,
  k.ad_group_name,
  k.criterion_id,
  c.keyword_text,
  c.keyword_match_type,
  coalesce(k.cost_micros, 0) / 1000000.0  as spend,
  coalesce(k.impressions, 0)               as impressions,
  coalesce(k.clicks, 0)                    as clicks,
  coalesce(k.conversions, 0)               as conversions,
  case when coalesce(k.impressions,0) > 0
       then k.clicks::numeric / k.impressions * 100
       else 0 end                         as ctr,
  case when coalesce(k.clicks,0) > 0
       then (k.cost_micros / 1000000.0) / k.clicks
       else null end                      as cpc
from bronze.gads_keyword_stats k
left join bronze.gads_ad_group_criterion c
  on c.criterion_id = k.criterion_id
 and c.ad_group_id  = k.ad_group_id;

-- ══════════════════════════════════════════════════════════════════════════
-- SILVER — Meta creative + creative-typed ad performance
-- ══════════════════════════════════════════════════════════════════════════

create or replace view silver.meta_creative as
select
  creative_id,
  name,
  object_type,
  video_id,
  image_hash,
  image_url,
  thumbnail_url,
  title,
  body,
  call_to_action_type,
  case
    when object_type = 'VIDEO' or video_id is not null            then 'Video'
    when image_hash is not null or image_url is not null          then 'Image'
    when object_type = 'STATUS'                                   then 'Text'
    else 'Other'
  end                             as media_type
from bronze.meta_creative;

-- ad_insight × ad (for creative_id) × creative (for object_type / media_type).
-- Left joins so an insight with no matched ad dimension still returns a row.
create or replace view silver.meta_ads_with_creative as
select
  i.date,
  i.ad_id,
  i.ad_name,
  i.adset_id,
  i.campaign_id,
  a.creative_id,
  c.object_type,
  c.media_type,
  coalesce(i.spend, 0)             as spend,
  coalesce(i.impressions, 0)       as impressions,
  coalesce(i.clicks, 0)            as clicks,
  coalesce(i.inline_link_clicks,0) as inline_link_clicks,
  coalesce(i.reach, 0)             as reach
from bronze.meta_ad_insight i
left join bronze.meta_ad a       on a.ad_id       = i.ad_id
left join silver.meta_creative c on c.creative_id = a.creative_id;

-- Gold rollup: image vs video vs text vs other, aggregated over the period.
create or replace view gold.meta_media_type_summary as
select
  coalesce(media_type, 'Unknown')  as media_type,
  sum(spend)         as spend,
  sum(impressions)   as impressions,
  sum(clicks)        as clicks,
  sum(reach)         as reach,
  count(distinct ad_id) as ads,
  case when sum(impressions) > 0
       then sum(clicks)::numeric / sum(impressions) * 100
       else 0 end   as ctr,
  case when sum(clicks) > 0 then sum(spend)/sum(clicks) else null end as cpc,
  case when sum(impressions) > 0 then sum(spend)/sum(impressions)*1000 else null end as cpm
from silver.meta_ads_with_creative
group by 1
order by spend desc nulls last;
