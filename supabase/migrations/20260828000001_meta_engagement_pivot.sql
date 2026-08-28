-- Rewrite silver.meta_ad_conversion_insights to pivot from the long-format
-- bronze.meta_ad_insight_actions table.
--
-- The previous definition read from bronze.meta_ad_roas_insight_conversion_insights
-- (a Weld-wide-format table). That table stays empty for the atWork Meta
-- account because it references pixel-event columns (`contact_website`) that
-- the account doesn't emit — the ingest SQL crashed with "Unrecognized name:
-- contact_website" and skipped the table.
--
-- The long-format actions table has 46k+ rows of real engagement data
-- (post_engagement, video_view, link_click, landing_page_view, etc.) and is
-- schema-stable across accounts. Pivoting in Postgres avoids the column-drift
-- crash and unblocks the Engagement panel on /meta.

CREATE OR REPLACE VIEW silver.meta_ad_conversion_insights AS
SELECT
  ai.date::date               AS date,
  ai.campaign_id,
  ai.adset_id,
  a.ad_id,
  COALESCE(SUM(CASE WHEN a.action_type = 'lead'                              THEN a.value END), 0)::bigint AS lead,
  COALESCE(SUM(CASE WHEN a.action_type = 'offsite_conversion.fb_pixel_lead'  THEN a.value END), 0)::bigint AS offsite_conversion_fb_pixel_lead,
  COALESCE(SUM(CASE WHEN a.action_type = 'landing_page_view'                 THEN a.value END), 0)::bigint AS landing_page_view,
  COALESCE(SUM(CASE WHEN a.action_type = 'link_click'                        THEN a.value END), 0)::bigint AS link_click,
  COALESCE(SUM(CASE WHEN a.action_type = 'post_engagement'                   THEN a.value END), 0)::bigint AS post_engagement,
  COALESCE(SUM(CASE WHEN a.action_type = 'page_engagement'                   THEN a.value END), 0)::bigint AS page_engagement,
  COALESCE(SUM(CASE WHEN a.action_type = 'post_reaction'                     THEN a.value END), 0)::bigint AS post_reaction,
  COALESCE(SUM(CASE WHEN a.action_type = 'comment'                           THEN a.value END), 0)::bigint AS comment_count,
  COALESCE(SUM(CASE WHEN a.action_type = 'video_view'                        THEN a.value END), 0)::bigint AS video_view,
  COALESCE(SUM(CASE WHEN a.action_type = 'contact_website'                   THEN a.value END), 0)::bigint AS contact_website,
  COALESCE(SUM(CASE WHEN a.action_type = 'contact_total'                     THEN a.value END), 0)::bigint AS contact_total
FROM bronze.meta_ad_insight_actions a
JOIN bronze.meta_ad_insight ai
  ON ai.ad_id      = a.ad_id
 AND ai.date::date = a.date::date
GROUP BY ai.date::date, ai.campaign_id, ai.adset_id, a.ad_id;

-- Preserve the RLS-invoker semantics set by 20260819000001_security_lockdown.
ALTER VIEW silver.meta_ad_conversion_insights SET (security_invoker = true);
