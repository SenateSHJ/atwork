/**
 * atwork.ts — atWork's ClientConfig factory. Mirrors PRISM's
 * src/config/example-client.ts shape.
 *
 * atWork is a Disability Employment Services provider running paid
 * media on Google Ads + Meta, alongside a GA4-tracked website. Three
 * channels, one client, one Supabase project.
 *
 * Conversion definitions ship as literal prose because they render into
 * the report's anchor sentence. A wrong sentence here is worse than a
 * missing one, so the phrasing must be truthful about what the numbers
 * actually count in atWork's silver views. Change the strings here
 * before any adapter or Weld sync change upstream.
 *
 * Mechanism C: Meta contributes to the Website's paid_social bucket.
 * GA4 default channel grouping attributes Meta-driven visits to Paid
 * Social; declared here so the paid-social-correlation rule can fire on
 * real overlap rather than hedge on unknown overlap.
 *
 * British English elsewhere; the anchor and event display_name strings
 * are UI copy and stay literal.
 */

import type { ChannelConfig, ClientConfig, WordingOverride } from '@prism/executive-summaries';
import { makeDefaultClientConfig, AUTHORED_WORDING } from '@prism/executive-summaries';

const VERIFIED_AT = '2026-08-29T00:00:00Z';
const VERIFIED_BY = 'atwork-clone';

// ─── Google Ads ────────────────────────────────────────────────────────

const CHANNEL_GOOGLE_ADS: ChannelConfig = {
  channel_id:                   'google-ads',
  channel_display:              'Google Ads',
  currency:                     'AUD',
  locale:                       'en-AU',
  conversion_definition:        'native Google Ads conversion actions aggregated across the account',
  display_order:                1,
  enabled:                      true,
  channel_family:               'paid',
  outcome_model:                'lead_generation',
  default_demand_type:          'unknown',
  default_creative_source:      'authored',
  reports_refunds:              false,
  reports_benchmarks:           false,
  reports_input_health:         false,
  reports_new_customer_data:    false,
  new_customer_goal_configured: null,
  platform_absent_dimensions:   [],
  attribution_windows: [
    {
      effective_from:    '2020-01-01',
      click_window_days: 30,
      view_window_days:  0,
      last_verified_at:  VERIFIED_AT,
      last_verified_by:  VERIFIED_BY,
      notes:             'Google Ads default 30-day click, no view-through',
    },
  ],
  entity_demand_type_overrides:     [],
  entity_creative_source_overrides: [],
  declared_events:                  [],
};

// ─── Meta ──────────────────────────────────────────────────────────────

const CHANNEL_META: ChannelConfig = {
  channel_id:                   'meta',
  channel_display:              'Meta',
  currency:                     'AUD',
  locale:                       'en-AU',
  // silver.meta_ad_conversion_insights.lead counts Meta's pixel-attributed
  // lead events. Reported on the account's default 7-day click / 1-day
  // view attribution window; small monthly volumes (10 to 34 in recent
  // months) will legitimately trip the engine's rate-read sample-size
  // gate and that is correct behaviour, not a bug.
  conversion_definition:        "Meta pixel lead events on the account's default 7-day click / 1-day view window",
  display_order:                2,
  enabled:                      true,
  channel_family:               'paid',
  outcome_model:                'lead_generation',
  default_demand_type:          'unknown',
  default_creative_source:      'authored',
  reports_refunds:              false,
  reports_benchmarks:           false,
  reports_input_health:         false,
  reports_new_customer_data:    false,
  new_customer_goal_configured: null,
  platform_absent_dimensions:   [],
  attribution_windows: [
    {
      effective_from:    '2020-01-01',
      click_window_days: 7,
      view_window_days:  1,
      last_verified_at:  VERIFIED_AT,
      last_verified_by:  VERIFIED_BY,
      notes:             'Meta default 7d-click / 1d-view; verify against Ads Manager before first production use',
    },
  ],
  entity_demand_type_overrides:     [],
  entity_creative_source_overrides: [],
  declared_events:                  [],
};

// ─── Web (GA4) ─────────────────────────────────────────────────────────
//
// declared_events lists every GA4 event that counts as a lead. Sourced
// from silver.ga4_events for the last 30 days on 2026-08-29 — event
// names that are clearly lead intent (enquire_*, DES_*, register,
// GA4_phone_clicks) plus chat starts which this business treats as
// leads. Intent tier ranks conversion strength: 1 = form submit (hard
// lead), 2 = tap-to-call, 3 = chat start.
//
// See src/lib/queries/ga4.ts::LEAD_EVENTS — the whitelist there is the
// existing source of truth for the atWork dashboard's Custom Events
// tile. Keep the two lists in sync.

const CHANNEL_WEB: ChannelConfig = {
  channel_id:                   'web',
  channel_display:              'Website',
  currency:                     'AUD',
  locale:                       'en-AU',
  conversion_definition:        'GA4 conversions across all channel groups, counted once per session per GA4 channel attribution',
  display_order:                3,
  enabled:                      true,
  channel_family:               'web',
  outcome_model:                'lead_generation',
  default_demand_type:          'unknown',
  default_creative_source:      'authored',
  reports_refunds:              false,
  reports_benchmarks:           false,
  reports_input_health:         false,
  reports_new_customer_data:    false,
  new_customer_goal_configured: null,
  platform_absent_dimensions:   [],
  attribution_windows:          [],
  entity_demand_type_overrides:     [],
  entity_creative_source_overrides: [],
  declared_events: [
    { event_name: 'enquire_job_support',              role: 'lead', intent_tier: 1, display_name: 'Jobseeker support enquiry', funnel_step: null },
    { event_name: 'enquire_form_submit_jobseeker',    role: 'lead', intent_tier: 1, display_name: 'Jobseeker form submission', funnel_step: null },
    { event_name: 'enquire_form_submit_employer',     role: 'lead', intent_tier: 1, display_name: 'Employer form submission',  funnel_step: null },
    { event_name: 'enquire_form_submit_somethingelse',role: 'lead', intent_tier: 1, display_name: 'Other form submission',     funnel_step: null },
    { event_name: 'enquire_form_submit',              role: 'lead', intent_tier: 1, display_name: 'Enquiry form submission',   funnel_step: null },
    { event_name: 'enquire_something_else',           role: 'lead', intent_tier: 1, display_name: 'Other enquiry',              funnel_step: null },
    { event_name: 'enquire_staff_support',            role: 'lead', intent_tier: 1, display_name: 'Staff support enquiry',      funnel_step: null },
    { event_name: 'DES_client_register_form',         role: 'lead', intent_tier: 1, display_name: 'DES client registration',    funnel_step: null },
    { event_name: 'DES_email',                        role: 'lead', intent_tier: 1, display_name: 'DES email click',            funnel_step: null },
    { event_name: 'des_employer_enquiry',             role: 'lead', intent_tier: 1, display_name: 'DES employer enquiry',       funnel_step: null },
    { event_name: 'GA4_phone_clicks',                 role: 'lead', intent_tier: 2, display_name: 'Phone tap',                  funnel_step: null },
    { event_name: 'GA4_live_chat_start',              role: 'lead', intent_tier: 3, display_name: 'Live chat start',            funnel_step: null },
    { event_name: 'live_chat_clients_only',           role: 'lead', intent_tier: 3, display_name: 'Client chat start',          funnel_step: null },
    { event_name: 'live_chat_employers_only',         role: 'lead', intent_tier: 3, display_name: 'Employer chat start',        funnel_step: null },
    { event_name: 'landing_page_register',            role: 'lead', intent_tier: 1, display_name: 'Landing-page register',      funnel_step: null },
  ],
};

// ─── Layout dials (atWork editorial overrides) ─────────────────────────
//
// Per-slot cap and narrator slot order are per-client editorial
// choices. Adopt PRISM's reference values verbatim as a starting point;
// change once atWork has an opinion after the first real report.

export const ATWORK_PER_SLOT_CAP = {
  portfolio: 5, anomaly: 5, mix: 5, value: 5,
  recommendation: 5, flag: 5, quality: 5, attribution: 3,
} as const;

export const ATWORK_NARRATOR_SLOT_ORDER = [
  'anchor', 'composition', 'attribution',
  'anomaly', 'quality', 'mix', 'portfolio', 'value', 'trend',
] as const;

// ─── Full client config ────────────────────────────────────────────────

// ─── LinkedIn ──────────────────────────────────────────────────────────
//
// atWork's LinkedIn account is traffic-model: the campaign goal is
// video completions and clicks, and no downstream Insight Tag
// conversion tracking is wired. Metrics.conversions is always 0 by
// design; the outcome that measures the account is clicks (or video
// completions in Metrics.custom.video_completions).
//
// Marking channel_family='paid' and outcome_model='traffic' routes
// the sample-size gate to key on impressions (not conversions), the
// anchor to name clicks + CPC (not conversions + CPA), and every
// rate rule to skip the conversions gate.
//
// The rest of the atWork LinkedIn shim (adapter, entities,
// breakdowns=none) is unchanged; this only tells PRISM how to
// interpret the channel it already receives.

const CHANNEL_LINKEDIN: ChannelConfig = {
  channel_id:                   'linkedin',
  channel_display:              'LinkedIn',
  currency:                     'AUD',
  locale:                       'en-AU',
  conversion_definition:        'Campaign goal is video completions to the end of the ad. No downstream off-LinkedIn action is tracked; Insight Tag installation would be required for that.',
  display_order:                4,
  enabled:                      true,
  channel_family:               'paid',
  outcome_model:                'traffic',
  default_demand_type:          'unknown',
  default_creative_source:      'authored',
  reports_refunds:              false,
  reports_benchmarks:           false,
  reports_input_health:         false,
  reports_new_customer_data:    false,
  new_customer_goal_configured: null,
  platform_absent_dimensions:   [],
  attribution_windows:          [],
  entity_demand_type_overrides:     [],
  entity_creative_source_overrides: [],
  declared_events:                  [],
};

// ─── SEMrush (SEO) ─────────────────────────────────────────────────────
//
// SEO channel_family — the outcome is organic-search authority and
// keyword coverage, not spend-driven conversions. Metrics.spend +
// impressions + clicks + conversions are all null; the SEO signal
// lives on Metrics.custom.{rank, organic_keywords, organic_traffic,
// top3_positions, top10_positions, keyword_hhi, total_backlinks,
// referring_domains, trust_score}. Anchor + delta rules read those
// directly.
//
// channel_id is 'semrush' — the adapter appends `:<domain>` to
// channel.id on the emitted period so the anchor rule's precondition
// (channel_id starts with 'semrush') matches. The domain itself is
// supplied to assembleComparison via semrushDomain (see actions.ts).
const CHANNEL_SEMRUSH: ChannelConfig = {
  channel_id:                   'semrush',
  channel_display:              'SEO (SEMrush)',
  currency:                     'AUD',
  locale:                       'en-AU',
  conversion_definition:        'Organic keywords + estimated traffic are SEMrush figures based on crawled SERP data and modelled click-through curves. Treat traffic as directional, not analytics-grade.',
  display_order:                5,
  enabled:                      true,
  channel_family:               'seo',
  outcome_model:                'organic_visibility',
  default_demand_type:          'unknown',
  default_creative_source:      'unknown',
  reports_refunds:              false,
  reports_benchmarks:           false,
  reports_input_health:         false,
  reports_new_customer_data:    false,
  new_customer_goal_configured: null,
  platform_absent_dimensions:   [],
  attribution_windows:          [],
  entity_demand_type_overrides:     [],
  entity_creative_source_overrides: [],
  declared_events:                  [],
};

// atworkaustralia.com.au is the marketing site atWork's SEO effort
// actually targets. atwork.com.au (the earlier value) is a corporate
// apex hosting subdomain products (Preceda payroll, Pirkx rewards) —
// SEMrush's coverage of it was 22 keywords vs 11,960 for the marketing
// site. Swapped 2026-09-04 once the client confirmed the right domain
// and shared the priority-keyword list (see docs/handover).
export const ATWORK_SEMRUSH_DOMAIN = 'atworkaustralia.com.au';
export const ATWORK_SEMRUSH_DB     = 'au';
export const ATWORK_SEMRUSH_COMPETITORS: readonly string[] = [
  'wiseemployment.com.au',
  'apm.net.au',
  'workskil.com.au',
  'matchworks.com.au',
];

export function makeAtWorkConfig(): ClientConfig {
  const defaults = makeDefaultClientConfig('atwork');
  return {
    ...defaults,
    channels: [CHANNEL_GOOGLE_ADS, CHANNEL_META, CHANNEL_WEB, CHANNEL_LINKEDIN, CHANNEL_SEMRUSH],
    rules:    [],
    wording:  [...(AUTHORED_WORDING as WordingOverride[])],
    default_outcome_model: 'lead_generation',
    per_slot_cap: { ...ATWORK_PER_SLOT_CAP },
    layout: {
      ...defaults.layout,
      narrator_slot_order: [...ATWORK_NARRATOR_SLOT_ORDER] as NonNullable<ClientConfig['layout']['narrator_slot_order']>,
    },
    channel_contributions: [
      {
        contributor_channel_id: 'meta',
        receiver_channel_id:    'web',
        receiver_bucket:        { dimension: 'traffic_source', value: 'paid_social' },
        overlap_kind:           'contributes_to',
        note: 'Meta ads drive traffic tagged as Paid Social in GA4 default channel grouping. Reader mis-attribution risk is real for a lead-gen account like atWork.',
      },
    ],
  };
}

export const ATWORK_CHANNEL_IDS = {
  googleAds: 'google-ads',
  meta:      'meta',
  web:       'web',
} as const;

/**
 * Meta conversion-insights column atWork reads. silver.meta_ad_conversion_insights
 * exposes several event columns; `lead` is what atWork actually optimises
 * against and what should render in the anchor. `contact_website` was a
 * Coolum-carryover default that returned zero on atWork data. If atWork
 * ever swaps this to another event (e.g. 'contact_total'), change both
 * here and the conversion_definition above in the same commit so they
 * stay honest together.
 */
export const ATWORK_META_CONVERSION_COLUMN = 'lead' as const;
