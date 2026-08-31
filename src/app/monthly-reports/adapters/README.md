# atWork monthly-reports adapters — shim divergence log

Each file in this folder (`meta.ts`, `website.ts`, `gads.ts`, `linkedin.ts`) is an
**atWork-specific shim** that queries silver views directly and hand-builds a
`NormalisedPeriod` for the PRISM engine to consume. The shims sit alongside — and
duplicate — the per-channel silver adapters that PRISM ships in
`@prism/executive-summaries/src/adapters/silver/*`.

The shims are thinner than PRISM's adapters. This is a real gap: **rules that
depend on the dimensions the shims omit silent-skip on atWork today, and would
fire once the shims are swapped for PRISM's adapters.** This document is the
audit finding from the 2026-08-31 LinkedIn integration session. The refactor is
NOT yet scheduled — this doc exists so the finding survives.

## What the shims read vs what PRISM's adapters read

### Meta

- **PRISM `buildMetaPeriod` reads 6 silver views:** `meta_campaigns`,
  `meta_adsets`, `meta_ads`, `meta_ads_with_creative`,
  `meta_campaign_conversion_insights`, `meta_ad_conversion_insights`.
- **atWork Meta shim reads 2 silver + 1 bronze:** `silver.meta_campaigns`
  (account totals + daily trend), `silver.meta_ad_conversion_insights` (lead
  and video_view), plus `bronze.meta_campaign_insight` via
  `@/lib/queries/meta::getMetaCampaigns` (bypasses silver for entity list).
- Shim sets `breakdowns: {}` and does not compute
  `Metrics.custom.largest_spend_creative_rank_by_cpa`.

### Website (GA4)

- **PRISM `buildWebPeriod` reads 5 silver + 1 bronze:** `ga4_overview`,
  `ga4_channels`, `ga4_events`, `ga4_pages`, `ga4_device`,
  `bronze.ga4_browser_os`.
- **atWork website shim reads 2 silver:** `silver.ga4_overview` (account totals),
  `silver.ga4_channels` (channel entities + daily trend). Other GA4 silver
  views are queried by dashboard pages under `@/lib/queries/ga4.ts` but not by
  the report adapter path.
- Shim sets `breakdowns: {}` and `event_breakdown: []`.

### LinkedIn

- **PRISM `buildLinkedInPeriod` reads 3 silver views:** `linkedin_campaign_groups`,
  `linkedin_campaigns`, `linkedin_creatives`. Emits `breakdowns.creative`
  grouped by creative_name, and `Metrics.custom.largest_spend_creative_rank_by_cpc`.
- **atWork LinkedIn shim reads 1 silver view:** `silver.linkedin_campaign_groups`
  (via `getLinkedinSummary` + `getLinkedinCampaignGroups` + `getLinkedinTrend`).
- Shim sets `breakdowns: {}` and `event_breakdown: []`.

## Rules that silent-skip on atWork today but would fire after the swap

**Meta swap (`meta.ts` → PRISM `buildMetaPeriod`):**

- `describe-creative-fatigue` — reads `breakdowns['creative']` current + prior
- `flag-attribution-confounded` — reads `breakdowns['creative']` for spend concentration
- `t2-recommendations` creative branch — reads `breakdowns['creative']`
- `describeLookFirst` creative-pool clause — reads `breakdowns['creative'].length`
  and `Metrics.custom.largest_spend_creative_rank_by_cpa` for the "largest spend
  sits on the worst creative" call-out

**Website swap (`website.ts` → PRISM `buildWebPeriod`):**

- `describe-lead-event-composition` — the whole "What people did" paragraph,
  reads `event_breakdown` filtered by `ChannelConfig.declared_events` (role='lead')
- `describe-browser-anomaly` — reads `breakdowns['browser']`
- `describe-landing-page-distribution` — reads page-level dims
- Device-parity rules — read `breakdowns['device']`

**LinkedIn swap (`linkedin.ts` → PRISM `buildLinkedInPeriod`):**

- `describe-creative-fatigue` (via `breakdowns['creative']`)
- `flag-attribution-confounded` (via `breakdowns['creative']`)
- `t2-recommendations` creative branch (via `breakdowns['creative']`)
- `describeLookFirst` creative-pool clause (via
  `largest_spend_creative_rank_by_cpc` — traffic-model variant)

## Silver contract status

All 15 silver views the PRISM adapters expect exist in atWork's Supabase with
matching column names (verified 2026-08-31): 6 meta views, 6 ga4 views, 3
linkedin views. **The refactor is code-only. No migration work.**

## What makes this a real gap (not just a naming preference)

Coolum's PRISM adoption surfaced the same pattern: shim adapters read fewer
silver views than PRISM's own, and dimensional rules that silent-skipped were
mistaken for "not applicable" when they were actually "not fed". Discovering
this per-shim is expensive. Four shims means four places to diverge; a fifth
means five. Consolidating on PRISM's adapters means the rule surface tracks
what silver actually populates, not what each shim happened to include.

## When to do the refactor

Not this session. Coolum's parallel session is currently modifying PRISM's Meta
and GA4 adapters. Two sessions rewriting the same adapters would collide.
Refactor when:

1. Coolum's Meta and GA4 adapter work has landed in PRISM main.
2. There is a dedicated atWork session to do the swap end-to-end with rendering
   comparisons before and after.

## Files

- `meta.ts` — atWork Meta shim (unchanged pending refactor)
- `website.ts` — atWork GA4 shim (unchanged pending refactor)
- `gads.ts` — atWork Google Ads shim
- `linkedin.ts` — atWork LinkedIn shim (added 2026-08-31)
- `client-config.ts` — atWork's ClientConfig loader wiring
- `config.ts` — date helpers, client-safe
- `helpers.ts` — `computePeriodStats` + `computeComparisonStats` + `buildHistory`
