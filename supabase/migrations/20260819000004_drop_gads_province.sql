-- 20260819000004_drop_gads_province.sql
--
-- Remove the Geography (state) plumbing entirely. bronze.gads_ad_group_province_stats
-- lands only compromise-era Indonesian province data (single date 2026-07-17
-- from the same paused Search campaigns as the frozen keyword data), which
-- risks being read as atWork's own audience. The page section was removed;
-- these are the only consumers, so drop both.
--
-- bronze.gads_geo_target stays — it's a general dimension usable by any
-- future geo-resolution work, not province-specific.
--
-- Manual step for Scott: untick ad_group_province_stats in the Weld sync so
-- the source BQ table stops re-populating. Documented in the commit message.

DROP VIEW  IF EXISTS silver.gads_province_stats;
DROP TABLE IF EXISTS bronze.gads_ad_group_province_stats;
