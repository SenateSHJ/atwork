-- Rewrite silver.meta_campaign_conversion_insights to pivot from the
-- long-format bronze.meta_ad_insight_actions, aggregated to the
-- (date, campaign_id) grain PRISM's Meta silver adapter expects.
--
-- The previous definition (20260818000001_meta_medallion_expansion) read
-- from bronze.meta_campaign_roas_insight_conversion_insights — a Weld-
-- wide-format table that stays empty for atWork's Meta account for the
-- same reason silver.meta_ad_conversion_insights did:
-- Weld's ingest hits an unrecognized-column crash on `contact_website`
-- and skips the whole table. Verified: silver.meta_campaign_conversion_insights
-- returned 0 rows for July 2026 while silver.meta_ad_conversion_insights
-- had 533 rows on the same period.
--
-- Same fix applied at ad-grain in 20260828000001_meta_engagement_pivot.
-- This migration mirrors that pattern at campaign-grain:
--   * Same source: bronze.meta_ad_insight_actions (46k+ rows, schema-stable).
--   * Same event columns (lead, offsite_conversion.fb_pixel_lead,
--     landing_page_view, link_click, post_engagement, page_engagement,
--     post_reaction, comment, video_view, contact_website, contact_total).
--   * Aggregation grain: (date, campaign_id) — no adset_id, no ad_id.
--     PRISM's Meta silver adapter reads
--     silver.meta_campaign_conversion_insights.<metaConversionColumn>
--     per (date, campaign_id) for the campaign-level conversion series.
--
-- Preserves security_invoker semantics per 20260819000001.

CREATE OR REPLACE VIEW silver.meta_campaign_conversion_insights AS
SELECT
  ai.date::date               AS date,
  ai.campaign_id,
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
GROUP BY ai.date::date, ai.campaign_id;

ALTER VIEW silver.meta_campaign_conversion_insights SET (security_invoker = true);
