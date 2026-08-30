// atWork Website (GA4) adapter. Fetches one month of GA4 metrics and top
// channels, and normalises into the reporting-library contract.
//
// Website has no paid concepts — spend, CPC etc. are left null. The
// section unifies on ga4_channels.conversions (GA4's native conversion
// counter) across account totals, per-channel entity totals, and the
// derived conversion rate. Per Scott 2026-08-30, one definition of
// "conversion" per section is worth more than a broader whitelist
// number that cannot be attributed per-channel without a silver rebuild
// AND that made "events / sessions" render as a "conversion rate" —
// literally counting events, not sessions with a conversion.
//
// The previous adapter carried three sources for what was labelled
// "conversion" or "conversion rate":
//   1. getGa4LeadEvents (LEAD_EVENTS whitelist over ga4_events.event_count)
//      → account metrics.conversions = 15,764 on July 2026
//   2. getGa4Conversions (ga4_channels.conversions / ga4_channels.sessions)
//      → account custom.conversion_rate_pct = 3.42%
//   3. getGa4Channels.conversions per channel
//      → entity metrics.conversions summing to 1,595 total
// The three disagreed by roughly 10x on totals and gave different
// deltas (whitelist −837 vs channels-conversion −117), so C2's
// attribution paragraph decomposed a different quantity than the
// anchor displayed and the reader could not verify one against the
// other. Both getGa4Conversions and getGa4LeadEvents are now off the
// report path. Both remain used by the /ga4 standalone dashboard page
// which reads them directly; that path is unaffected.

import {
  getGa4Summary, getGa4Trend, getGa4Channels,
} from '@/lib/queries/ga4';
import type { DailyPoint, NormalisedPeriod, Entity } from '@prism/executive-summaries';
import { atworkMonthLabel, monthBounds } from './config';
import { computePeriodStats } from './helpers';

// channel.id MUST match reporting.config_channel.channel_id ('web' in
// atWork's seed) so PRISM's wording resolver can look up channel-scoped
// config (outcome_model, locale, currency) and so describeAnchorWeb's
// isWebChannel() gate (accepts 'web', 'web-*', 'ga4*') fires. Prior
// value 'website' broke both: the resolver reported "channel config not
// found for website" and the anchor slot never rendered — the web
// section opened at composition instead. Display name stays "Website".
const CHANNEL = { id: 'web', display: 'Website' };
const CONVERSION_DEFINITION =
  "GA4 conversions across all channel groups, counted once per session per GA4 channel attribution.";

export async function fetchAtWorkWebsitePeriod(month: string): Promise<NormalisedPeriod | null> {
  const range = monthBounds(month);
  const [summary, trend, channels] = await Promise.all([
    getGa4Summary(range),
    getGa4Trend(range),
    getGa4Channels(range),
  ]);
  if (!summary || summary.sessions === 0) return null;

  // Session-weighted bounce rate across the daily trend.
  let bounceWeighted = 0;
  let bounceSessions = 0;
  for (const d of trend) {
    if (d.bounce_rate_pct != null && d.sessions > 0) {
      bounceWeighted += d.sessions * d.bounce_rate_pct;
      bounceSessions += d.sessions;
    }
  }
  const bounceRate = bounceSessions > 0 ? bounceWeighted / bounceSessions : null;

  // Account total conversions = sum of per-channel conversions. Same
  // arithmetic and same source (ga4_channels.conversions) as the entity
  // list below, so the C2 attribution paragraph decomposes the exact
  // number the anchor displays. Sessions denominator is
  // ga4_overview.sessions rather than sum-of-ga4_channels.sessions
  // because that is what feeds custom.sessions (which PRISM's
  // describeAnchorWeb reads); the two are close but not identical, and
  // matching custom.sessions keeps the CR the classifier reasons on
  // equal to the CR the anchor renders.
  const totalConversions  = channels.reduce((s, ch) => s + ch.conversions, 0);
  const conversionRatePct = summary.sessions > 0 ? (totalConversions / summary.sessions) * 100 : null;

  // Daily series uses ch_conversions (source-C conversions) so the
  // history feeding PRISM's F-family trend rules is on the same axis
  // as the account totals above.
  const daily: DailyPoint[] = trend.map(d => ({
    date:    d.date,
    metrics: {
      conversions: d.conversions ?? 0,
      custom: {
        sessions:    d.sessions,
        total_users: d.total_users,
      },
    } as Partial<import('@prism/executive-summaries').Metrics>,
  }));

  const entities: Entity[] = channels.map(ch => ({
    id:              ch.channel,
    name:            ch.channel,
    grain:           'channel',
    parent_id:       null,
    ancestry_ids:    [],
    demand_type:     'unknown',
    creative_source: 'unknown',
    input_health:    null,
    metrics: {
      spend:                    null,
      impressions:              null,
      clicks:                   null,
      conversions:              ch.conversions,
      ctr:                      null,
      cpc:                      null,
      cpm:                      null,
      cpa:                      null,
      conversion_rate:          ch.conversion_rate_pct,
      conversion_value:         null,
      refund_value:             null,
      new_customer_conversions: null,
      new_customer_value:       null,
      custom: {
        sessions:        ch.sessions,
        total_users:     ch.total_users,
        engagement_rate: ch.engagement_rate_pct,
        bounce_rate:     ch.bounce_rate_pct,
      },
    },
  }));

  return {
    period: {
      id:    month,
      label: atworkMonthLabel(month),
      from:  range.from,
      to:    range.to,
    },
    channel: CHANNEL,
    metrics: {
      spend:                    null,
      impressions:              null,
      clicks:                   null,
      conversions:              totalConversions,
      ctr:                      null,
      cpc:                      null,
      cpm:                      null,
      cpa:                      null,
      conversion_rate:          conversionRatePct,
      conversion_value:         null,
      refund_value:             null,
      new_customer_conversions: null,
      new_customer_value:       null,
      // PRISM's web-anchor rules (describeAnchorWeb, describeAnchorDeltasWeb,
      // describePagesPerSession, describeGrowthCompositionWeb) read from
      // metrics.custom using the field names 'sessions', 'users',
      // 'lead_events', 'conversion_rate_pct', 'page_views'. atWork's adapter
      // also carries 'total_users' / 'engagement_rate' / etc for its own
      // dashboard pages. Both sets ship so PRISM's precondition passes and
      // atWork's downstream renderers stay unchanged. The 'lead_events'
      // alias now carries totalConversions (source C) matching account
      // metrics.conversions above; the underlying number is GA4-native
      // conversions, PRISM's outcome-noun rendering ("lead events") is a
      // wording convention rather than a claim about the count's source.
      custom: {
        sessions:                 summary.sessions,
        users:                    summary.total_users,          // PRISM alias
        total_users:              summary.total_users,
        new_users:                summary.new_users,
        page_views:               summary.page_views,
        lead_events:              totalConversions,             // PRISM alias — same source as account metrics.conversions
        conversion_rate_pct:      conversionRatePct,            // PRISM alias — same numerator/denominator as metrics.conversion_rate
        engaged_sessions:         summary.engaged_sessions,
        engagement_rate:          summary.engagement_rate,
        bounce_rate:              bounceRate,
        avg_engagement_time_secs: summary.avg_engagement_time_secs,
      },
    },
    entities,
    daily,
    stats: computePeriodStats(entities, daily),
    conversion_definition: CONVERSION_DEFINITION,
    breakdowns:      {},
    event_breakdown: [],
    benchmarks:      {},
    input_health:    null,
  };
}
