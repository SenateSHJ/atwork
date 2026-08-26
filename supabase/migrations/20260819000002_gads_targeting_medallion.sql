-- 20260819000002_gads_targeting_medallion.sql
--
-- Google Ads targeting-side medallion — adds bronze tables + silver views for
-- three Weld connector tables that landed this session:
--
--   ad_group_province_stats     — per-day / per-ad-group / per-province
--   campaign_criterion          — dimension: every criterion on every campaign
--   campaign_criterion_proximity — proximity subset (radius + address fields)
--
-- Plus geo_target as a bronze dimension so province geoTargetConstants can
-- resolve to human-readable state names.
--
-- audience_stats was ticked but is landing with 0 rows in BQ (likely because
-- atWork's active PMax campaign uses auto-audience — no per-audience segments
-- to report). Not modelled here per spec ("do not model anything that has not
-- landed"). Page surfaces an empty Audience section with a note.
--
-- Naming mirrors the existing gads_* pattern (`gads_<source_table_name>`);
-- all views use security_invoker=true (matches the security lockdown migration).

-- ─── Bronze ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bronze.gads_geo_target (
  id                 TEXT PRIMARY KEY,
  name               TEXT,
  canonical_name     TEXT,
  country_code       TEXT,
  target_type        TEXT,
  parent_geo_target  TEXT,
  status             TEXT,
  bq_synced          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS bronze.gads_ad_group_province_stats (
  date                DATE NOT NULL,
  campaign_id         TEXT NOT NULL,
  campaign_name       TEXT,
  ad_group_id         TEXT NOT NULL,
  ad_group_name       TEXT,
  province            TEXT NOT NULL,
  country_criterion_id TEXT,
  location_type       TEXT,
  cost_micros         BIGINT,
  impressions         BIGINT,
  clicks              BIGINT,
  conversions         DOUBLE PRECISION,
  conversions_value   DOUBLE PRECISION,
  bq_synced           TIMESTAMPTZ,
  PRIMARY KEY (date, campaign_id, ad_group_id, province)
);

CREATE TABLE IF NOT EXISTS bronze.gads_campaign_criterion (
  campaign_id                       TEXT NOT NULL,
  id                                TEXT NOT NULL,
  type                              TEXT,
  status                            TEXT,
  negative                          BOOLEAN,
  display_name                      TEXT,
  keyword_text                      TEXT,
  keyword_match_type                TEXT,
  location_geo_target_constant      TEXT,
  age_range_type                    TEXT,
  gender_type                       TEXT,
  device_type                       TEXT,
  bid_modifier                      DOUBLE PRECISION,
  bq_synced                         TIMESTAMPTZ,
  PRIMARY KEY (campaign_id, id)
);

CREATE TABLE IF NOT EXISTS bronze.gads_campaign_criterion_proximity (
  campaign_id             TEXT NOT NULL,
  criterion_id            TEXT NOT NULL,
  address_city_name       TEXT,
  address_province_code   TEXT,
  address_province_name   TEXT,
  address_country_code    TEXT,
  address_postal_code     TEXT,
  address_street_address  TEXT,
  latitude_micro          BIGINT,
  longitude_micro         BIGINT,
  radius                  DOUBLE PRECISION,
  radius_units            TEXT,
  bq_synced               TIMESTAMPTZ,
  PRIMARY KEY (campaign_id, criterion_id)
);

-- ─── Silver ────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW silver.gads_province_stats
WITH (security_invoker = true) AS
SELECT
  s.date,
  s.campaign_id,
  s.campaign_name,
  s.ad_group_id,
  s.ad_group_name,
  s.province                                                       AS province_id,
  COALESCE(g.name, s.province)                                     AS province,
  g.canonical_name                                                 AS province_canonical,
  g.country_code                                                   AS country,
  COALESCE(s.cost_micros, 0)::NUMERIC / 1e6                        AS spend,
  COALESCE(s.impressions, 0)                                       AS impressions,
  COALESCE(s.clicks, 0)                                            AS clicks,
  COALESCE(s.conversions, 0)                                       AS conversions,
  COALESCE(s.conversions_value, 0)                                 AS conversions_value
FROM bronze.gads_ad_group_province_stats s
LEFT JOIN bronze.gads_geo_target g
  ON s.province = 'geoTargetConstants/' || g.id;

CREATE OR REPLACE VIEW silver.gads_campaign_targeting
WITH (security_invoker = true) AS
SELECT
  c.campaign_id,
  camp.campaign_name,
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
LEFT JOIN LATERAL (
  SELECT campaign_name FROM bronze.gads_campaign_stats s
  WHERE s.campaign_id = c.campaign_id AND s.campaign_name IS NOT NULL
  ORDER BY s.date DESC LIMIT 1
) camp ON TRUE;

CREATE OR REPLACE VIEW silver.gads_campaign_proximity
WITH (security_invoker = true) AS
SELECT
  p.campaign_id,
  camp.campaign_name,
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
LEFT JOIN LATERAL (
  SELECT campaign_name FROM bronze.gads_campaign_stats s
  WHERE s.campaign_id = p.campaign_id AND s.campaign_name IS NOT NULL
  ORDER BY s.date DESC LIMIT 1
) camp ON TRUE
WHERE p.radius IS NOT NULL;

-- ─── RLS on new bronze tables (matches security_lockdown pattern) ─────────

ALTER TABLE bronze.gads_geo_target                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.gads_ad_group_province_stats          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.gads_campaign_criterion               ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronze.gads_campaign_criterion_proximity     ENABLE ROW LEVEL SECURITY;
