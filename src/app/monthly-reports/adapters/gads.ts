// atWork Google Ads adapter. Fetches one month of GAds metrics + campaigns
// and normalises into the reporting-library contract.

import { getGadsSummary, getGadsCampaigns, getGadsConversionValue } from '@/lib/queries/gads';
import { supabaseServer } from '@/lib/supabase/server';
import type { DailyPoint, NormalisedPeriod, Entity } from '@prism/executive-summaries';
import { atworkMonthLabel, monthBounds } from './config';
import { computePeriodStats } from './helpers';

const CHANNEL = { id: 'gads', display: 'Google Ads' };
const CONVERSION_DEFINITION =
  'Google Ads native conversions, aggregated across all configured conversion actions in the account.';

export async function fetchAtWorkGadsPeriod(month: string): Promise<NormalisedPeriod | null> {
  const range = monthBounds(month);
  const [summary, campaigns, convVal] = await Promise.all([
    getGadsSummary(range),
    getGadsCampaigns(range),
    getGadsConversionValue(range),
  ]);
  if (!summary || summary.impressions === 0) return null;

  const sb = supabaseServer();
  const { data: dailyRows } = await sb.schema('silver').from('gads_campaigns')
    .select('date,spend,impressions,clicks,conversions')
    .gte('date', range.from).lte('date', range.to);
  const dailyByDate = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number }>();
  for (const r of (dailyRows ?? []) as Array<{ date: string; spend: number | null; impressions: number | null; clicks: number | null; conversions: number | null }>) {
    const existing = dailyByDate.get(r.date) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
    existing.spend       += Number(r.spend ?? 0);
    existing.impressions += Number(r.impressions ?? 0);
    existing.clicks      += Number(r.clicks ?? 0);
    existing.conversions += Number(r.conversions ?? 0);
    dailyByDate.set(r.date, existing);
  }
  const daily: DailyPoint[] = Array.from(dailyByDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, m]) => ({ date, metrics: { spend: m.spend, impressions: m.impressions, clicks: m.clicks, conversions: m.conversions } }));

  const entities: Entity[] = campaigns.map(camp => ({
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
      conversions:              camp.conversions,
      ctr:                      camp.ctr,
      cpc:                      camp.cpc,
      cpm:                      null,
      cpa:                      camp.cpa,
      conversion_rate:          null,
      conversion_value:         null,
      refund_value:             null,
      new_customer_conversions: null,
      new_customer_value:       null,
      custom:                   {},
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
      conversions:              summary.conversions,
      ctr:                      summary.ctr,
      cpc:                      summary.cpc,
      cpm:                      summary.cpm,
      cpa:                      summary.cpa,
      conversion_rate:          summary.conversion_rate,
      conversion_value:         convVal.total,
      refund_value:             null,
      new_customer_conversions: null,
      new_customer_value:       null,
      custom:                   {},
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
