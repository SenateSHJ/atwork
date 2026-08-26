-- CREATE OR REPLACE VIEW rejects mid-list column insertions, so the previous
-- migration's silver.gads_keywords redefinition silently no-op'd. Explicit drop.
-- gold.gads_keyword_summary depends on it, so recreate that too.

drop view if exists gold.gads_keyword_summary cascade;
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

create view gold.gads_keyword_summary as
select
  campaign_id,
  ad_group_id,
  ad_group_name,
  keyword_text,
  keyword_match_type,
  criterion_id,
  sum(spend)          as spend,
  sum(impressions)    as impressions,
  sum(clicks)         as clicks,
  sum(conversions)    as conversions,
  case when sum(clicks) > 0 then sum(spend)/sum(clicks) else null end as cpc
from silver.gads_keywords
group by campaign_id, ad_group_id, ad_group_name, keyword_text, keyword_match_type, criterion_id
order by clicks desc;

grant select on silver.gads_keywords, gold.gads_keyword_summary
  to anon, authenticated, service_role;
