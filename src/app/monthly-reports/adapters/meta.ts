// atWork Meta Ads adapter. Fetches one month's worth of Meta metrics + top
// campaigns and normalises them into the reporting-library contract.
// Returns null if there is no meaningful activity in the period so the
// caller can flag the section rather than fabricate a comparison.

import { getMetaSummary, getMetaCampaigns } from '@/lib/queries/meta';
import { supabaseServer } from '@/lib/supabase/server';
import type { DailyPoint, NormalisedPeriod, Entity } from '@prism/executive-summaries';
import { atworkMonthLabel, monthBounds } from './config';
import { computePeriodStats } from './helpers';

const CHANNEL = { id: 'meta', display: 'Meta Ads' };
const CONVERSION_DEFINITION =
  'Meta-attributed contact_website events (form fill or contact click on the website).';

export async function fetchAtWorkMetaPeriod(month: string): Promise<NormalisedPeriod | null> {
  const range = monthBounds(month);
  const [summary, campaigns] = await Promise.all([
    getMetaSummary(range),
    getMetaCampaigns(range),
  ]);
  if (!summary || summary.impressions === 0) return null;

  const sb = supabaseServer();
  const { data: convRows } = await sb.schema('silver').from('meta_ad_conversion_insights')
    .select('campaign_id,contact_website,video_view')
    .gte('date', range.from).lte('date', range.to);

  let totalConversions = 0;
  let totalVideoViews = 0;
  const convByCamp  = new Map<string, number>();
  const videoByCamp = new Map<string, number>();
  for (const r of (convRows ?? []) as Array<{ campaign_id: string; contact_website: number | null; video_view: number | null }>) {
    const cw = Number(r.contact_website || 0);
    const vv = Number(r.video_view      || 0);
    totalConversions += cw;
    totalVideoViews  += vv;
    if (cw) convByCamp.set (r.campaign_id, (convByCamp.get (r.campaign_id) ?? 0) + cw);
    if (vv) videoByCamp.set(r.campaign_id, (videoByCamp.get(r.campaign_id) ?? 0) + vv);
  }
  const cpa = totalConversions > 0 ? summary.spend / totalConversions : null;

  // Daily series for outlier + anomaly detection.
  const { data: dailyRows } = await sb.schema('silver').from('meta_campaigns')
    .select('date,spend,impressions,clicks')
    .gte('date', range.from).lte('date', range.to);
  const dailyByDate = new Map<string, { spend: number; impressions: number; clicks: number }>();
  for (const r of (dailyRows ?? []) as Array<{ date: string; spend: number | null; impressions: number | null; clicks: number | null }>) {
    const existing = dailyByDate.get(r.date) ?? { spend: 0, impressions: 0, clicks: 0 };
    existing.spend       += Number(r.spend ?? 0);
    existing.impressions += Number(r.impressions ?? 0);
    existing.clicks      += Number(r.clicks ?? 0);
    dailyByDate.set(r.date, existing);
  }
  const daily: DailyPoint[] = Array.from(dailyByDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, m]) => ({ date, metrics: { spend: m.spend, impressions: m.impressions, clicks: m.clicks } }));

  const entities: Entity[] = campaigns.map(camp => {
    const conv = convByCamp.get(camp.campaign_id) ?? 0;
    return {
      id:              camp.campaign_id,
      name:            camp.campaign_name,
      grain:           'campaign',
      parent_id:       null,
      ancestry_ids:    [],
      demand_type:     'unknown',
      creative_source: 'unknown',
      input_health:    null,
      metrics: {
        spend:                    camp.spend,
        impressions:              camp.impressions,
        clicks:                   camp.clicks,
        conversions:              conv,
        ctr:                      camp.ctr,
        cpc:                      camp.cpc,
        cpm:                      null,
        cpa:                      conv > 0 ? camp.spend / conv : null,
        conversion_rate:          null,
        conversion_value:         null,
        refund_value:             null,
        new_customer_conversions: null,
        new_customer_value:       null,
        custom: {
          video_views: videoByCamp.get(camp.campaign_id) ?? 0,
        },
      },
    };
  });

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
      conversions:              totalConversions,
      ctr:                      summary.ctr,
      cpc:                      summary.cpc,
      cpm:                      summary.cpm,
      cpa,
      conversion_rate:          null,
      conversion_value:         null,
      refund_value:             null,
      new_customer_conversions: null,
      new_customer_value:       null,
      custom: {
        reach:       summary.reach,
        video_views: totalVideoViews,
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
