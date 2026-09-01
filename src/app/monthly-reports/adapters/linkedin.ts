// atWork LinkedIn adapter. Fetches one month of LinkedIn metrics + top
// campaign groups and normalises them into the reporting-library contract.
// Returns null if there is no meaningful activity in the period so the
// caller can flag the section rather than fabricate a comparison.
//
// atWork's LinkedIn account (verified 2026-08-31) runs no Lead Gen Forms
// (one_click_leads = 0 throughout) and has no Insight Tag conversions
// syncing. landing_page_clicks equals clicks exactly (a click, not a
// downstream event). Metrics.conversions = 0 by design; the operator-
// declared campaign goal in Campaign Manager is video completions, which
// rides in Metrics.custom.video_completions + video_completion_rate ready
// for the paid-traffic engagement-goal amendment to
// describe-outcome-definition / describe-anchor (item a on the LinkedIn
// integration backlog).
//
// SHIM SHAPE (mirrors the Meta shim intentionally). Emits entities at
// campaign_group grain only; sets breakdowns: {} and event_breakdown: [].
// The atWork adapter shim intentionally mirrors the Meta shim's minimal
// pattern rather than the fuller PRISM buildLinkedInPeriod adapter in
// @prism/executive-summaries. See ./README.md for the divergence log
// and the list of rules that would newly fire if the shim were swapped
// for PRISM's adapter.

import { getLinkedinSummary, getLinkedinCampaignGroups, getLinkedinTrend } from '@/lib/queries/linkedin';
import type { DailyPoint, NormalisedPeriod, Entity } from '@prism/executive-summaries';
import { atworkMonthLabel, monthBounds } from './config';
import { computePeriodStats } from './helpers';

// channel.id MUST match reporting.config_channel.channel_id ('linkedin').
const CHANNEL = { id: 'linkedin', display: 'LinkedIn' };
const CONVERSION_DEFINITION =
  'Campaign goal is video completions to the end of the ad. No downstream off-LinkedIn action is tracked; Insight Tag installation would be required for that.';

export async function fetchAtWorkLinkedinPeriod(month: string): Promise<NormalisedPeriod | null> {
  const range = monthBounds(month);
  const [summary, groups, trend] = await Promise.all([
    getLinkedinSummary(range),
    getLinkedinCampaignGroups(range),
    getLinkedinTrend(range),
  ]);
  if (!summary || summary.impressions === 0) return null;

  const daily: DailyPoint[] = trend.map(d => ({
    date: d.date,
    metrics: {
      spend:       d.spend,
      impressions: d.impressions,
      clicks:      d.clicks,
    },
  }));

  const entities: Entity[] = groups.map(g => ({
    id:              g.campaign_group_id,
    name:            g.campaign_group_name,
    grain:           'campaign_group',
    parent_id:       null,
    ancestry_ids:    [],
    demand_type:     'unknown',
    creative_source: 'authored',
    input_health:    null,
    metrics: {
      spend:                    g.spend,
      impressions:              g.impressions,
      clicks:                   g.clicks,
      conversions:              0,
      ctr:                      g.ctr,
      cpc:                      g.cpc,
      cpm:                      null,
      cpa:                      null,
      conversion_rate:          null,
      conversion_value:         null,
      refund_value:             null,
      new_customer_conversions: null,
      new_customer_value:       null,
      custom: {
        reach:                 g.reach,
        frequency:             g.frequency,
        video_starts:          g.video_starts,
        video_completions:     g.video_completions,
        video_completion_rate: g.video_completion_rate,
        total_engagements:     g.total_engagements,
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
      spend:                    summary.spend,
      impressions:              summary.impressions,
      clicks:                   summary.clicks,
      conversions:              0,
      ctr:                      summary.ctr,
      cpc:                      summary.cpc,
      cpm:                      summary.cpm,
      cpa:                      null,
      conversion_rate:          null,
      conversion_value:         null,
      refund_value:             null,
      new_customer_conversions: null,
      new_customer_value:       null,
      custom: {
        reach:                 summary.reach,
        frequency:             summary.frequency,
        video_starts:          summary.video_starts,
        video_completions:     summary.video_completions,
        video_completion_rate: summary.video_completion_rate,
        total_engagements:     summary.total_engagements,
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
