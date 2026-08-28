-- Meta account-level breakdowns by delivery device + publisher placement.
-- Weld pulls demographics_delivery_device + demographics_delivery_platform
-- into BQ as account-scoped rows (no campaign/adset/ad grain — that would be
-- a much bigger cardinality; account-level is what the atWork brief needs).
--
-- Bronze mirrors BQ 1:1. Silver just coalesces nulls and drops the account_*
-- passthrough fields (single-account project, redundant). Aggregation to a
-- single row per dimension over a date range happens in the server action
-- (fetchDevices) so the date column stays available for time-series if we
-- add one later.

-- ═══ bronze.meta_device ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bronze.meta_device (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date                  timestamptz NOT NULL,
  device_platform       text        NOT NULL,
  impressions           bigint,
  clicks                bigint,
  spend                 numeric,
  reach                 bigint,
  frequency             numeric,
  inline_link_clicks    bigint,
  cpc                   numeric,
  cpm                   numeric,
  ctr                   numeric,
  bq_synced             timestamptz,
  ingested_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, device_platform)
);
CREATE INDEX IF NOT EXISTS idx_meta_device_date ON bronze.meta_device (date);
GRANT SELECT, INSERT, UPDATE, DELETE ON bronze.meta_device TO service_role;
GRANT SELECT ON bronze.meta_device TO anon, authenticated;
ALTER TABLE bronze.meta_device ENABLE ROW LEVEL SECURITY;

-- ═══ bronze.meta_placement ════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bronze.meta_placement (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date                  timestamptz NOT NULL,
  publisher_platform    text        NOT NULL,
  impressions           bigint,
  clicks                bigint,
  spend                 numeric,
  reach                 bigint,
  frequency             numeric,
  inline_link_clicks    bigint,
  cpc                   numeric,
  cpm                   numeric,
  ctr                   numeric,
  bq_synced             timestamptz,
  ingested_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, publisher_platform)
);
CREATE INDEX IF NOT EXISTS idx_meta_placement_date ON bronze.meta_placement (date);
GRANT SELECT, INSERT, UPDATE, DELETE ON bronze.meta_placement TO service_role;
GRANT SELECT ON bronze.meta_placement TO anon, authenticated;
ALTER TABLE bronze.meta_placement ENABLE ROW LEVEL SECURITY;

-- ═══ silver views (thin passthrough + null coalescing) ═══════════════════
CREATE OR REPLACE VIEW silver.meta_devices AS
SELECT
  date::date              AS date,
  device_platform,
  COALESCE(impressions,        0)::bigint  AS impressions,
  COALESCE(clicks,             0)::bigint  AS clicks,
  COALESCE(spend,              0)::numeric AS spend,
  COALESCE(reach,              0)::bigint  AS reach,
  COALESCE(inline_link_clicks, 0)::bigint  AS inline_link_clicks
FROM bronze.meta_device;
ALTER VIEW silver.meta_devices SET (security_invoker = true);

CREATE OR REPLACE VIEW silver.meta_placements AS
SELECT
  date::date              AS date,
  publisher_platform,
  COALESCE(impressions,        0)::bigint  AS impressions,
  COALESCE(clicks,             0)::bigint  AS clicks,
  COALESCE(spend,              0)::numeric AS spend,
  COALESCE(reach,              0)::bigint  AS reach,
  COALESCE(inline_link_clicks, 0)::bigint  AS inline_link_clicks
FROM bronze.meta_placement;
ALTER VIEW silver.meta_placements SET (security_invoker = true);
