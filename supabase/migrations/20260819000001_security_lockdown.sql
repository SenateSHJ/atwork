-- 20260819000001_security_lockdown.sql
--
-- Address Supabase database-linter security findings (66 errors total).
--
-- Two classes of fix, both non-destructive to data:
--
-- 1. security_definer_view (34 views)
--    Every silver.* and gold.* view was created with the Postgres default
--    (SECURITY DEFINER — enforces the OWNER's privileges + RLS at query time).
--    Switch each to security_invoker so the querying role's privileges + RLS
--    apply. Postgres 15+ syntax; no view recreate required.
--
-- 2. rls_disabled_in_public (32 tables)
--    Every bronze.* table and public._migration_history is exposed via
--    PostgREST without RLS. Enable RLS with NO policies — anon +
--    authenticated see zero rows; service_role bypasses RLS and continues to
--    read everything. The dashboard reads via SUPABASE_SERVICE_ROLE_KEY
--    (server-side only), so no app functionality changes.

-- ─── 1. Views → security_invoker ────────────────────────────────────────────

ALTER VIEW silver.meta_campaigns                       SET (security_invoker = true);
ALTER VIEW silver.meta_adsets                          SET (security_invoker = true);
ALTER VIEW silver.meta_creative                        SET (security_invoker = true);
ALTER VIEW silver.meta_ads                             SET (security_invoker = true);
ALTER VIEW silver.meta_ads_with_creative               SET (security_invoker = true);
ALTER VIEW silver.gads_campaigns                       SET (security_invoker = true);
ALTER VIEW silver.gads_ad_groups                       SET (security_invoker = true);
ALTER VIEW silver.gads_keywords                        SET (security_invoker = true);
ALTER VIEW silver.gads_ads                             SET (security_invoker = true);
ALTER VIEW silver.gads_search_terms                    SET (security_invoker = true);
ALTER VIEW silver.ga4_overview                         SET (security_invoker = true);
ALTER VIEW silver.ga4_channels                         SET (security_invoker = true);
ALTER VIEW silver.ga4_pages                            SET (security_invoker = true);
ALTER VIEW silver.ga4_events                           SET (security_invoker = true);
ALTER VIEW silver.ga4_device                           SET (security_invoker = true);
ALTER VIEW silver.meta_ad_conversion_insights          SET (security_invoker = true);
ALTER VIEW silver.meta_campaign_conversion_insights    SET (security_invoker = true);
ALTER VIEW silver.meta_campaign                        SET (security_invoker = true);
ALTER VIEW silver.meta_adset                           SET (security_invoker = true);
ALTER VIEW silver.meta_video_watch                     SET (security_invoker = true);

ALTER VIEW gold.ga4_device_summary                     SET (security_invoker = true);
ALTER VIEW gold.meta_adset_summary                     SET (security_invoker = true);
ALTER VIEW gold.meta_ad_summary                        SET (security_invoker = true);
ALTER VIEW gold.gads_campaign_summary                  SET (security_invoker = true);
ALTER VIEW gold.gads_wasted_spend                      SET (security_invoker = true);
ALTER VIEW gold.channel_spend                          SET (security_invoker = true);
ALTER VIEW gold.meta_media_type_summary                SET (security_invoker = true);
ALTER VIEW gold.investment_summary                     SET (security_invoker = true);
ALTER VIEW gold.gads_keyword_summary                   SET (security_invoker = true);
ALTER VIEW gold.ga4_period_summary                     SET (security_invoker = true);
ALTER VIEW gold.ga4_channel_summary                    SET (security_invoker = true);
ALTER VIEW gold.ga4_top_pages                          SET (security_invoker = true);
ALTER VIEW gold.ga4_lead_events                        SET (security_invoker = true);
ALTER VIEW gold.meta_campaign_summary                  SET (security_invoker = true);

-- ─── 2. Bronze + public tables → RLS enabled (no policies) ──────────────────

ALTER TABLE bronze.meta_campaign_insight                                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.gads_ad_stats                                               ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.ga4_page_path                                               ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.meta_ad                                                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.meta_adset_insight                                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.meta_ad_insight                                             ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.meta_ad_insight_actions                                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.gads_campaign_stats                                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.gads_ad_group_stats                                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.ga4_events_overview                                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.ga4_campaign_performance                                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.ga4_browser_os                                              ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.ga4_social_media                                            ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.ga4_channel_traffic                                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.gads_ad_group_criterion                                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.ga4_audience_overview                                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.meta_creative                                               ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.gads_keyword_stats                                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.gads_search_term_stats                                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.meta_ad_roas_insight_conversion_insights                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.meta_campaign_roas_insight_conversion_insights              ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.meta_campaign                                               ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.meta_adset                                                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.meta_action_video_view_type                                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.meta_action_video_view_type_video_30_sec_watched_actions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.meta_action_video_view_type_video_avg_time_watched_actions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.meta_action_video_view_type_video_p25_watched_actions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.meta_action_video_view_type_video_p50_watched_actions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.meta_action_video_view_type_video_p75_watched_actions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.meta_action_video_view_type_video_p100_watched_actions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.meta_action_video_view_type_video_thruplay_watched_actions  ENABLE ROW LEVEL SECURITY;

-- public._migration_history exists only in tenants that provisioned it manually
-- (Coolum did; atWork does not). Guard with IF EXISTS so this migration is
-- portable across tenants.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = '_migration_history') THEN
    EXECUTE 'ALTER TABLE public._migration_history ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
