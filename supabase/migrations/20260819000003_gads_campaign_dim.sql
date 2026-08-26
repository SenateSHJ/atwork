-- 20260819000003_gads_campaign_dim.sql
--
-- Add the Google Ads campaign dimension so historical/paused campaign names
-- resolve on the proximity + targeting silver views. bronze.gads_campaign_stats
-- only carries the last 90 days, so campaigns paused before that window
-- fell back to '(unknown)' on the proximity table.

CREATE TABLE IF NOT EXISTS bronze.gads_campaign (
  id          TEXT PRIMARY KEY,
  name        TEXT,
  status      TEXT,
  bq_synced   TIMESTAMPTZ
);
ALTER TABLE bronze.gads_campaign ENABLE ROW LEVEL SECURITY;

-- Rewire the two silver views to prefer bronze.gads_campaign (all-time
-- dimension) and fall back to bronze.gads_campaign_stats where the campaign
-- has recent activity. Views dropped first because CREATE OR REPLACE can't
-- change the column list when the shape changes.

DROP VIEW IF EXISTS silver.gads_campaign_proximity;
DROP VIEW IF EXISTS silver.gads_campaign_targeting;

CREATE OR REPLACE VIEW silver.gads_campaign_targeting
WITH (security_invoker = true) AS
SELECT
  c.campaign_id,
  COALESCE(dim.name, camp.campaign_name)                           AS campaign_name,
  c.id                                                             AS criterion_id,
  c.type                                                           AS criterion_type,
  c.status,
  c.negative,
  c.display_name,
  c.keyword_text,
  c.keyword_match_type,
  c.location_geo_target_constant,
  c.age_range_type,
  c.gender_type,
  c.device_type,
  c.bid_modifier
FROM bronze.gads_campaign_criterion c
LEFT JOIN bronze.gads_campaign dim ON dim.id = c.campaign_id
LEFT JOIN LATERAL (
  SELECT campaign_name FROM bronze.gads_campaign_stats s
  WHERE s.campaign_id = c.campaign_id AND s.campaign_name IS NOT NULL
  ORDER BY s.date DESC LIMIT 1
) camp ON TRUE;

CREATE OR REPLACE VIEW silver.gads_campaign_proximity
WITH (security_invoker = true) AS
SELECT
  p.campaign_id,
  COALESCE(dim.name, camp.campaign_name)                            AS campaign_name,
  dim.status                                                        AS campaign_status,
  p.criterion_id,
  p.address_city_name,
  p.address_province_name,
  p.address_country_code,
  p.address_postal_code,
  p.radius,
  p.radius_units,
  p.latitude_micro::NUMERIC  / 1e6 AS latitude,
  p.longitude_micro::NUMERIC / 1e6 AS longitude
FROM bronze.gads_campaign_criterion_proximity p
LEFT JOIN bronze.gads_campaign dim ON dim.id = p.campaign_id
LEFT JOIN LATERAL (
  SELECT campaign_name FROM bronze.gads_campaign_stats s
  WHERE s.campaign_id = p.campaign_id AND s.campaign_name IS NOT NULL
  ORDER BY s.date DESC LIMIT 1
) camp ON TRUE
WHERE p.radius IS NOT NULL;
