-- 20260820000001_ga4_browser_os_silver.sql
--
-- Adds silver.ga4_browser_os as an OS × Browser breakdown for the GA4 Website
-- page. bronze.ga4_browser_os has 17 distinct OS+browser combinations for
-- atWork's traffic (iOS/Safari, Android/Chrome, Windows/Chrome, Macintosh/…);
-- the existing silver.ga4_device is coarser (Mobile / Desktop-Other) and is
-- kept as-is for the Devices table. This view feeds the new Browser & OS
-- section alongside Devices.

CREATE OR REPLACE VIEW silver.ga4_browser_os
WITH (security_invoker = true) AS
SELECT
  date::date                                                          AS date,
  COALESCE(operating_system, '(not set)')                             AS operating_system,
  COALESCE(browser, '(not set)')                                      AS browser,
  COALESCE(SUM(total_users)::BIGINT, 0)                               AS total_users,
  COALESCE(SUM(new_users)::BIGINT, 0)                                 AS new_users,
  COALESCE(SUM(engaged_sessions)::BIGINT, 0)                          AS engaged_sessions,
  COALESCE(SUM(event_count)::BIGINT, 0)                               AS event_count,
  COALESCE(SUM(conversions)::NUMERIC, 0)                              AS conversions
FROM bronze.ga4_browser_os
GROUP BY 1, 2, 3;
