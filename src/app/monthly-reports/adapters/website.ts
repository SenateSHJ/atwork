// atWork Website (GA4) adapter. Fetches one month of GA4 metrics and top
// channels, and normalises into the reporting-library contract.
//
// Website has no paid concepts — spend, CPC etc. are left null. GA4 lead
// events (form_submit, tel_click, etc.) are mapped onto the shared
// `conversions` slot so the conversion-family rules fire on them. Bounce +
// engagement rates are exposed under metrics.custom for the engagement-
// quality rule.

import {
  getGa4Summary, getGa4Conversions, getGa4LeadEvents, getGa4Trend,
  getGa4Channels,
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
  'GA4 lead events aggregated across the whitelist: tel_click, form_submit, Contact_Form, events_mail, general_enquiries_mail.';

export async function fetchAtWorkWebsitePeriod(month: string): Promise<NormalisedPeriod | null> {
  const range = monthBounds(month);
  const [summary, conv, leads, trend, channels] = await Promise.all([
    getGa4Summary(range),
    getGa4Conversions(range),
    getGa4LeadEvents(range),
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
  const totalLeads = leads.reduce((s, l) => s + l.total, 0);

  // Daily series from the existing getGa4Trend query.
  const daily: DailyPoint[] = trend.map(d => ({
    date:    d.date,
    metrics: {
      conversions: d.lead_events ?? 0,
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
      conversions:              totalLeads,
      ctr:                      null,
      cpc:                      null,
      cpm:                      null,
      cpa:                      null,
      conversion_rate:          conv.conversion_rate,
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
      // atWork's downstream renderers stay unchanged.
      custom: {
        sessions:                 summary.sessions,
        users:                    summary.total_users,          // PRISM alias
        total_users:              summary.total_users,
        new_users:                summary.new_users,
        page_views:               summary.page_views,
        lead_events:              totalLeads,                   // PRISM alias
        conversion_rate_pct:      conv.conversion_rate,         // PRISM alias
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
