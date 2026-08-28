-- LinkedIn Ads bronze + silver.
--
-- Source: Weld dataset `atWork_linkedin_ads` in BQ project dashboard-1-sshj-internal.
-- Bronze mirrors BQ 1:1 for the columns the /linkedin page actually uses.
-- LinkedIn ad-serving grain is Campaign + Creative (no Ad Set), so we only
-- carry campaign + creative dims + their stats tables.
--
-- Silver views apply security_invoker=true per 20260819000001_security_lockdown.

-- ═══ bronze.linkedin_campaign_group ═════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bronze.linkedin_campaign_group (
  id           text        PRIMARY KEY,
  name         text,
  bq_synced    timestamptz,
  ingested_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON bronze.linkedin_campaign_group TO service_role;
GRANT SELECT ON bronze.linkedin_campaign_group TO anon, authenticated;
ALTER TABLE bronze.linkedin_campaign_group ENABLE ROW LEVEL SECURITY;

-- ═══ bronze.linkedin_campaign ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bronze.linkedin_campaign (
  id                    text        PRIMARY KEY,
  name                  text,
  status                text,
  objective_type        text,
  campaign_group_id     text,
  format                text,
  run_schedule_start    timestamptz,
  run_schedule_end      timestamptz,
  bq_synced             timestamptz,
  ingested_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_linkedin_campaign_group_id ON bronze.linkedin_campaign (campaign_group_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON bronze.linkedin_campaign TO service_role;
GRANT SELECT ON bronze.linkedin_campaign TO anon, authenticated;
ALTER TABLE bronze.linkedin_campaign ENABLE ROW LEVEL SECURITY;

-- ═══ bronze.linkedin_creative ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bronze.linkedin_creative (
  id           text        PRIMARY KEY,
  campaign_id  text,
  name         text,
  bq_synced    timestamptz,
  ingested_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_linkedin_creative_campaign_id ON bronze.linkedin_creative (campaign_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON bronze.linkedin_creative TO service_role;
GRANT SELECT ON bronze.linkedin_creative TO anon, authenticated;
ALTER TABLE bronze.linkedin_creative ENABLE ROW LEVEL SECURITY;

-- ═══ bronze.linkedin_campaign_stats ═════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bronze.linkedin_campaign_stats (
  id                              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date                            date        NOT NULL,
  campaign_id                     text        NOT NULL,
  impressions                     bigint,
  clicks                          bigint,
  cost                            numeric,
  one_click_leads                 bigint,
  landing_page_clicks             bigint,
  video_views                     bigint,
  video_completions               bigint,
  reactions                       bigint,
  comments                        bigint,
  shares                          bigint,
  follows                         bigint,
  total_engagements               bigint,
  approximate_unique_impressions  bigint,
  bq_synced                       timestamptz,
  ingested_at                     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_linkedin_campaign_stats_date ON bronze.linkedin_campaign_stats (date);
CREATE INDEX IF NOT EXISTS idx_linkedin_campaign_stats_campaign_id ON bronze.linkedin_campaign_stats (campaign_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON bronze.linkedin_campaign_stats TO service_role;
GRANT SELECT ON bronze.linkedin_campaign_stats TO anon, authenticated;
ALTER TABLE bronze.linkedin_campaign_stats ENABLE ROW LEVEL SECURITY;

-- ═══ bronze.linkedin_creative_stats ═════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bronze.linkedin_creative_stats (
  id                              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date                            date        NOT NULL,
  creative_id                     text        NOT NULL,
  impressions                     bigint,
  clicks                          bigint,
  cost                            numeric,
  one_click_leads                 bigint,
  landing_page_clicks             bigint,
  video_views                     bigint,
  video_completions               bigint,
  reactions                       bigint,
  comments                        bigint,
  shares                          bigint,
  follows                         bigint,
  total_engagements               bigint,
  approximate_unique_impressions  bigint,
  bq_synced                       timestamptz,
  ingested_at                     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, creative_id)
);
CREATE INDEX IF NOT EXISTS idx_linkedin_creative_stats_date ON bronze.linkedin_creative_stats (date);
CREATE INDEX IF NOT EXISTS idx_linkedin_creative_stats_creative_id ON bronze.linkedin_creative_stats (creative_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON bronze.linkedin_creative_stats TO service_role;
GRANT SELECT ON bronze.linkedin_creative_stats TO anon, authenticated;
ALTER TABLE bronze.linkedin_creative_stats ENABLE ROW LEVEL SECURITY;

-- ═══ silver.linkedin_campaigns ══════════════════════════════════════════════
-- Per-campaign totals over the full loaded window. The page adds a date-range
-- WHERE clause via the server action (queries the bronze stats table directly
-- for date-window aggregates, and joins here for campaign_name / objective).
CREATE OR REPLACE VIEW silver.linkedin_campaigns AS
SELECT
  s.campaign_id,
  c.name                                 AS campaign_name,
  c.objective_type                       AS objective,
  c.status                               AS status,
  COALESCE(SUM(s.cost),                0)::numeric AS spend,
  COALESCE(SUM(s.impressions),         0)::bigint  AS impressions,
  COALESCE(SUM(s.clicks),              0)::bigint  AS clicks,
  CASE WHEN SUM(s.impressions) > 0
       THEN (SUM(s.clicks)::numeric / SUM(s.impressions)) * 100
       ELSE NULL END                     AS ctr,
  CASE WHEN SUM(s.clicks) > 0
       THEN SUM(s.cost) / SUM(s.clicks)
       ELSE NULL END                     AS cpc,
  CASE WHEN SUM(s.impressions) > 0
       THEN (SUM(s.cost) / SUM(s.impressions)) * 1000
       ELSE NULL END                     AS cpm,
  COALESCE(SUM(s.one_click_leads),     0)::bigint  AS one_click_leads,
  COALESCE(SUM(s.landing_page_clicks), 0)::bigint  AS landing_page_clicks,
  COALESCE(SUM(s.video_views),         0)::bigint  AS video_views,
  COALESCE(SUM(s.total_engagements),   0)::bigint  AS total_engagements,
  CASE WHEN SUM(s.one_click_leads) > 0
       THEN SUM(s.cost) / SUM(s.one_click_leads)
       ELSE NULL END                     AS cost_per_lead
FROM bronze.linkedin_campaign_stats s
LEFT JOIN bronze.linkedin_campaign c ON c.id = s.campaign_id
GROUP BY s.campaign_id, c.name, c.objective_type, c.status;
ALTER VIEW silver.linkedin_campaigns SET (security_invoker = true);

-- ═══ silver.linkedin_ads ════════════════════════════════════════════════════
-- Per-creative totals. Creative dim doesn't carry a display `name`, so we
-- fall back to a truncated id if `linkedin_creative.name` is null (populated
-- from BQ `title`/`content_reference` when the LinkedIn schema exposes them).
CREATE OR REPLACE VIEW silver.linkedin_ads AS
SELECT
  s.creative_id,
  cr.name                                AS creative_name,
  cr.campaign_id                         AS campaign_id,
  c.name                                 AS campaign_name,
  c.objective_type                       AS objective,
  COALESCE(SUM(s.cost),                0)::numeric AS spend,
  COALESCE(SUM(s.impressions),         0)::bigint  AS impressions,
  COALESCE(SUM(s.clicks),              0)::bigint  AS clicks,
  CASE WHEN SUM(s.impressions) > 0
       THEN (SUM(s.clicks)::numeric / SUM(s.impressions)) * 100
       ELSE NULL END                     AS ctr,
  CASE WHEN SUM(s.clicks) > 0
       THEN SUM(s.cost) / SUM(s.clicks)
       ELSE NULL END                     AS cpc,
  CASE WHEN SUM(s.impressions) > 0
       THEN (SUM(s.cost) / SUM(s.impressions)) * 1000
       ELSE NULL END                     AS cpm,
  COALESCE(SUM(s.one_click_leads),     0)::bigint  AS one_click_leads,
  COALESCE(SUM(s.landing_page_clicks), 0)::bigint  AS landing_page_clicks,
  COALESCE(SUM(s.video_views),         0)::bigint  AS video_views,
  COALESCE(SUM(s.total_engagements),   0)::bigint  AS total_engagements,
  CASE WHEN SUM(s.one_click_leads) > 0
       THEN SUM(s.cost) / SUM(s.one_click_leads)
       ELSE NULL END                     AS cost_per_lead
FROM bronze.linkedin_creative_stats s
LEFT JOIN bronze.linkedin_creative cr ON cr.id           = s.creative_id
LEFT JOIN bronze.linkedin_campaign c  ON c.id            = cr.campaign_id
GROUP BY s.creative_id, cr.name, cr.campaign_id, c.name, c.objective_type;
ALTER VIEW silver.linkedin_ads SET (security_invoker = true);

-- ═══ silver.linkedin_trend ══════════════════════════════════════════════════
-- Per-day aggregation across all campaigns (account-level daily rollup).
CREATE OR REPLACE VIEW silver.linkedin_trend AS
SELECT
  date,
  COALESCE(SUM(cost),                0)::numeric AS spend,
  COALESCE(SUM(impressions),         0)::bigint  AS impressions,
  COALESCE(SUM(clicks),              0)::bigint  AS clicks,
  CASE WHEN SUM(impressions) > 0
       THEN (SUM(clicks)::numeric / SUM(impressions)) * 100
       ELSE NULL END                     AS ctr,
  CASE WHEN SUM(clicks) > 0
       THEN SUM(cost) / SUM(clicks)
       ELSE NULL END                     AS cpc,
  CASE WHEN SUM(impressions) > 0
       THEN (SUM(cost) / SUM(impressions)) * 1000
       ELSE NULL END                     AS cpm,
  COALESCE(SUM(one_click_leads),     0)::bigint  AS one_click_leads,
  COALESCE(SUM(video_views),         0)::bigint  AS video_views,
  COALESCE(SUM(total_engagements),   0)::bigint  AS total_engagements
FROM bronze.linkedin_campaign_stats
GROUP BY date;
ALTER VIEW silver.linkedin_trend SET (security_invoker = true);

-- ═══ silver.linkedin_summary ════════════════════════════════════════════════
-- One-row-per-date account totals. The server action applies its own date
-- filter, so keep the date column here rather than pre-aggregating to a
-- single scalar row.
CREATE OR REPLACE VIEW silver.linkedin_summary AS
SELECT
  date,
  COALESCE(SUM(cost),                           0)::numeric AS spend,
  COALESCE(SUM(impressions),                    0)::bigint  AS impressions,
  COALESCE(SUM(clicks),                         0)::bigint  AS clicks,
  COALESCE(SUM(approximate_unique_impressions), 0)::bigint  AS reach,
  CASE WHEN SUM(impressions) > 0
       THEN (SUM(clicks)::numeric / SUM(impressions)) * 100
       ELSE NULL END                     AS ctr,
  CASE WHEN SUM(clicks) > 0
       THEN SUM(cost) / SUM(clicks)
       ELSE NULL END                     AS cpc,
  CASE WHEN SUM(impressions) > 0
       THEN (SUM(cost) / SUM(impressions)) * 1000
       ELSE NULL END                     AS cpm,
  COALESCE(SUM(one_click_leads),                0)::bigint  AS leads,
  COALESCE(SUM(video_views),                    0)::bigint  AS video_views,
  COALESCE(SUM(total_engagements),              0)::bigint  AS engagements
FROM bronze.linkedin_campaign_stats
GROUP BY date;
ALTER VIEW silver.linkedin_summary SET (security_invoker = true);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260828000003', 'linkedin_bronze')
ON CONFLICT DO NOTHING;
