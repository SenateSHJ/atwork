-- Corrective migration: rebuild silver/gold views to match actual bronze column names.
-- Key corrections:
--   Meta: date_start/date_stop → date; added inline_link_clicks
--   GAds: removed advertising_channel_type (not in BQ export); keywords use criterion_id
--   GAds: search_term_stats has search_term_match_type
-- All views are replaced so no cascade needed.

-- ══════════════════════════════════════════════════════════════════════════
-- SILVER — Meta
-- ══════════════════════════════════════════════════════════════════════════

create or replace view silver.meta_campaigns as
select
  date,
  campaign_id,
  campaign_name,
  coalesce(spend, 0)             as spend,
  coalesce(impressions, 0)       as impressions,
  coalesce(clicks, 0)            as clicks,
  coalesce(inline_link_clicks,0) as inline_link_clicks,
  coalesce(reach, 0)             as reach,
  coalesce(frequency, 0)         as frequency,
  case when coalesce(impressions,0) > 0
       then clicks::numeric / impressions * 100
       else 0 end                 as ctr,
  case when coalesce(clicks,0) > 0
       then spend / clicks
       else null end              as cpc,
  case when coalesce(impressions,0) > 0
       then spend / impressions * 1000
       else null end              as cpm
from bronze.meta_campaign_insight;

create or replace view silver.meta_adsets as
select
  date,
  campaign_id,
  campaign_name,
  adset_id,
  adset_name,
  coalesce(spend, 0)             as spend,
  coalesce(impressions, 0)       as impressions,
  coalesce(clicks, 0)            as clicks,
  coalesce(inline_link_clicks,0) as inline_link_clicks,
  coalesce(reach, 0)             as reach,
  case when coalesce(impressions,0) > 0
       then clicks::numeric / impressions * 100
       else 0 end                 as ctr,
  case when coalesce(clicks,0) > 0
       then spend / clicks
       else null end              as cpc
from bronze.meta_adset_insight;

create or replace view silver.meta_ads as
select
  date,
  campaign_id,
  campaign_name,
  adset_id,
  adset_name,
  ad_id,
  ad_name,
  coalesce(spend, 0)             as spend,
  coalesce(impressions, 0)       as impressions,
  coalesce(clicks, 0)            as clicks,
  coalesce(inline_link_clicks,0) as inline_link_clicks,
  case when coalesce(impressions,0) > 0
       then clicks::numeric / impressions * 100
       else 0 end                 as ctr,
  case when coalesce(clicks,0) > 0
       then spend / clicks
       else null end              as cpc
from bronze.meta_ad_insight;

-- ══════════════════════════════════════════════════════════════════════════
-- SILVER — Google Ads
-- ══════════════════════════════════════════════════════════════════════════

create or replace view silver.gads_campaigns as
select
  date,
  campaign_id,
  campaign_name,
  coalesce(cost_micros, 0) / 1000000.0      as spend,
  coalesce(impressions, 0)                   as impressions,
  coalesce(clicks, 0)                        as clicks,
  coalesce(conversions, 0)                   as conversions,
  case when coalesce(impressions,0) > 0
       then clicks::numeric / impressions * 100
       else 0 end                             as ctr,
  case when coalesce(clicks,0) > 0
       then (cost_micros / 1000000.0) / clicks
       else null end                          as cpc,
  case when coalesce(conversions,0) > 0
       then (cost_micros / 1000000.0) / conversions
       else null end                          as cpa
from bronze.gads_campaign_stats;

create or replace view silver.gads_ad_groups as
select
  date,
  campaign_id,
  campaign_name,
  ad_group_id,
  ad_group_name,
  coalesce(cost_micros, 0) / 1000000.0  as spend,
  coalesce(impressions, 0)               as impressions,
  coalesce(clicks, 0)                    as clicks,
  coalesce(conversions, 0)               as conversions,
  case when coalesce(impressions,0) > 0
       then clicks::numeric / impressions * 100
       else 0 end                         as ctr,
  case when coalesce(clicks,0) > 0
       then (cost_micros / 1000000.0) / clicks
       else null end                      as cpc
from bronze.gads_ad_group_stats;

create or replace view silver.gads_ads as
select
  date,
  campaign_id,
  campaign_name,
  ad_group_id,
  ad_group_name,
  ad_id,
  ad_name,
  coalesce(cost_micros, 0) / 1000000.0  as spend,
  coalesce(impressions, 0)               as impressions,
  coalesce(clicks, 0)                    as clicks,
  coalesce(conversions, 0)               as conversions,
  case when coalesce(impressions,0) > 0
       then clicks::numeric / impressions * 100
       else 0 end                         as ctr,
  case when coalesce(clicks,0) > 0
       then (cost_micros / 1000000.0) / clicks
       else null end                      as cpc
from bronze.gads_ad_stats;

-- keyword_stats: no keyword_text in this BQ export — use criterion_id as grain
create or replace view silver.gads_keywords as
select
  date,
  campaign_id,
  ad_group_id,
  ad_group_name,
  criterion_id,
  coalesce(cost_micros, 0) / 1000000.0  as spend,
  coalesce(impressions, 0)               as impressions,
  coalesce(clicks, 0)                    as clicks,
  coalesce(conversions, 0)               as conversions,
  case when coalesce(impressions,0) > 0
       then clicks::numeric / impressions * 100
       else 0 end                         as ctr,
  case when coalesce(clicks,0) > 0
       then (cost_micros / 1000000.0) / clicks
       else null end                      as cpc
from bronze.gads_keyword_stats;

create or replace view silver.gads_search_terms as
select
  date,
  campaign_id,
  ad_group_id,
  search_term,
  search_term_match_type,
  coalesce(cost_micros, 0) / 1000000.0  as spend,
  coalesce(impressions, 0)               as impressions,
  coalesce(clicks, 0)                    as clicks,
  coalesce(conversions, 0)               as conversions
from bronze.gads_search_term_stats;

-- ══════════════════════════════════════════════════════════════════════════
-- GOLD — campaign-level period summaries
-- ══════════════════════════════════════════════════════════════════════════

create or replace view gold.meta_campaign_summary as
select
  campaign_id,
  campaign_name,
  min(date)   as period_start,
  max(date)   as period_end,
  sum(spend)              as spend,
  sum(impressions)        as impressions,
  sum(clicks)             as clicks,
  sum(inline_link_clicks) as inline_link_clicks,
  sum(reach)              as reach,
  case when sum(impressions) > 0
       then sum(clicks)::numeric / sum(impressions) * 100
       else 0 end         as ctr,
  case when sum(clicks) > 0
       then sum(spend) / sum(clicks)
       else null end      as cpc
from silver.meta_campaigns
group by campaign_id, campaign_name;

create or replace view gold.meta_adset_summary as
select
  campaign_id,
  campaign_name,
  adset_id,
  adset_name,
  sum(spend)              as spend,
  sum(impressions)        as impressions,
  sum(clicks)             as clicks,
  sum(inline_link_clicks) as inline_link_clicks,
  sum(reach)              as reach,
  case when sum(impressions) > 0
       then sum(clicks)::numeric / sum(impressions) * 100
       else 0 end         as ctr,
  case when sum(clicks) > 0
       then sum(spend) / sum(clicks)
       else null end      as cpc
from silver.meta_adsets
group by campaign_id, campaign_name, adset_id, adset_name;

create or replace view gold.meta_ad_summary as
select
  campaign_id,
  campaign_name,
  adset_id,
  adset_name,
  ad_id,
  ad_name,
  sum(spend)              as spend,
  sum(impressions)        as impressions,
  sum(clicks)             as clicks,
  sum(inline_link_clicks) as inline_link_clicks,
  case when sum(impressions) > 0
       then sum(clicks)::numeric / sum(impressions) * 100
       else 0 end         as ctr,
  case when sum(clicks) > 0
       then sum(spend) / sum(clicks)
       else null end      as cpc
from silver.meta_ads
group by campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name;

create or replace view gold.gads_campaign_summary as
select
  campaign_id,
  campaign_name,
  sum(spend)          as spend,
  sum(impressions)    as impressions,
  sum(clicks)         as clicks,
  sum(conversions)    as conversions,
  case when sum(impressions) > 0
       then sum(clicks)::numeric / sum(impressions) * 100
       else 0 end     as ctr,
  case when sum(clicks) > 0
       then sum(spend) / sum(clicks)
       else null end  as cpc,
  case when sum(conversions) > 0
       then sum(spend) / sum(conversions)
       else null end  as cpa
from silver.gads_campaigns
group by campaign_id, campaign_name;

create or replace view gold.gads_keyword_summary as
select
  campaign_id,
  ad_group_id,
  ad_group_name,
  criterion_id,
  sum(spend)          as spend,
  sum(impressions)    as impressions,
  sum(clicks)         as clicks,
  sum(conversions)    as conversions,
  case when sum(clicks) > 0 then sum(spend)/sum(clicks) else null end as cpc
from silver.gads_keywords
group by campaign_id, ad_group_id, ad_group_name, criterion_id
order by clicks desc;

create or replace view gold.gads_wasted_spend as
select
  campaign_id,
  ad_group_id,
  search_term,
  search_term_match_type,
  sum(spend)          as spend,
  sum(impressions)    as impressions,
  sum(clicks)         as clicks
from silver.gads_search_terms
where conversions = 0
  and spend > 0
group by campaign_id, ad_group_id, search_term, search_term_match_type
order by spend desc;

create or replace view gold.channel_spend as
select 'Meta' as channel, sum(spend) as spend, sum(clicks) as clicks, sum(impressions) as impressions
from silver.meta_campaigns
union all
select 'Google Ads', sum(spend), sum(clicks), sum(impressions)
from silver.gads_campaigns;

create or replace view gold.ga4_period_summary as
select
  sum(total_users)              as total_users,
  sum(new_users)                as new_users,
  sum(sessions)                 as sessions,
  sum(page_views)               as page_views,
  sum(engagement_duration_secs) as total_engagement_secs,
  case when sum(sessions) > 0
       then sum(engagement_duration_secs) / sum(sessions)
       else 0 end               as avg_engagement_time_secs
from silver.ga4_overview;

create or replace view gold.ga4_channel_summary as
select
  channel,
  sum(total_users)      as total_users,
  sum(sessions)         as sessions,
  sum(engaged_sessions) as engaged_sessions,
  case when sum(sessions) > 0
       then sum(engaged_sessions)::numeric / sum(sessions) * 100
       else 0 end       as engagement_rate_pct,
  case when sum(sessions) > 0
       then (1 - sum(engaged_sessions)::numeric / sum(sessions)) * 100
       else 0 end       as bounce_rate_pct,
  sum(conversions)      as conversions
from silver.ga4_channels
group by channel
order by sessions desc;

create or replace view gold.ga4_top_pages as
select
  page_path,
  sum(page_views)   as page_views,
  sum(total_users)  as total_users,
  sum(conversions)  as conversions
from silver.ga4_pages
group by page_path
order by page_views desc
limit 25;

create or replace view gold.ga4_lead_events as
select
  event_name,
  sum(event_count) as total
from silver.ga4_events
where event_name in ('tel_click','form_submit','Contact_Form','events_mail','general_enquiries_mail')
group by event_name
order by total desc;

create or replace view gold.ga4_device_summary as
select
  device_type,
  sum(total_users)      as total_users,
  sum(engaged_sessions) as engaged_sessions
from silver.ga4_device
group by device_type
order by total_users desc;

create or replace view gold.investment_summary as
select
  (select sum(spend) from silver.meta_campaigns)    as meta_spend,
  (select sum(spend) from silver.gads_campaigns)    as gads_spend,
  (select sum(spend) from silver.meta_campaigns)
    + (select sum(spend) from silver.gads_campaigns) as total_spend,
  (select sum(sessions) from silver.ga4_overview)   as total_sessions,
  case when (select sum(sessions) from silver.ga4_overview) > 0
       then ((select sum(spend) from silver.meta_campaigns)
             + (select sum(spend) from silver.gads_campaigns))
            / (select sum(sessions) from silver.ga4_overview)
       else null end                                 as cost_per_session;
