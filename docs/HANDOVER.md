# atWork handover — 2026-08-30 pause

This document is the entry point for whoever picks atWork's integration
back up. Read this before touching code.

## Where things stopped

Pause at commit `8fb8316` on `main`. Tree clean, all pushes complete
in both `SenateSHJ/atwork` and `ScottDudley1/prism-executive-summaries`.

Coolum has the deadline and took priority; atWork's integration is
paused, not abandoned. Nothing is half-committed; the report page
renders coherently for July 2026 and August 2026 today.

## Current state against the clone runbook

See `docs/CLONE-RUNBOOK.md` for the invariant this section audits
against.

**Done:**

- Adapter layer for Meta, Google Ads, Website (GA4). All three
  channels wired end-to-end through `src/app/monthly-reports/`.
- ClientConfig in code (`src/config/atwork.ts::makeAtWorkConfig`).
  Source of truth for the DB seed.
- `reporting.*` seeded (`npm run seed:config`). 117 wording rows,
  channel_events, channel_attribution, channel_contributions all
  populated.
- Config-vs-DB drift audit script (`npm run audit:config-drift`).
  Runs green today: `✓ atwork: no drift`.
- CI workflow at `.github/workflows/ci.yml` runs typecheck + lint +
  build + drift audit on every push and PR.
- Monthly reports page (`src/app/monthly-reports/page.tsx`) reads
  all 11 `SectionReport` fields per PRISM's ADR 0043. State-driven
  shell (normal / partial / suppressed) selects between full render
  and minimal render. `?month=YYYY-MM` URL param supported.
- Coherence check + durability check + C3 lifecycle-floor fix +
  MORE_AT_HELD variant templates all landed upstream in PRISM and
  are active in atWork through the pinned dep.

**Not done (blocking pickup):**

- CI secrets not set on the repo. `NEXT_PUBLIC_SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` need to be added at
  https://github.com/SenateSHJ/atwork/settings/secrets/actions.
  Without them the CI job runs but the drift-audit step fails at
  `SUPABASE env vars required`. First CI green run is blocked on
  Scott (my `ScottDudley1` gh token has push/pull/triage on this
  repo, not admin).
- Google Ads section renders "No Google Ads data available for the
  selected month" on every month checked. Diagnosis complete (see
  Open items); waiting on Weld / account decision.

## PRISM pin

atWork is pinned to `ScottDudley1/prism-executive-summaries#34c875c`
via `package.json`'s `github:` git dep. Commit sha stored in
`package-lock.json`.

Bump pattern when PRISM ships new work:
```
npm install @prism/executive-summaries
cp node_modules/@prism/executive-summaries/dist/config/authored-wording.js src/lib/authored-wording.js
npm run seed:config
npm run audit:config-drift
```

The `authored-wording.js` copy is a legacy artefact; PRISM's public
barrel now exports `AUTHORED_WORDING` directly (added at PRISM commit
`290a0c6`), and the local copy is no longer necessary for the runtime
path but is still referenced by the seed script. Follow-up cleanup:
switch `src/config/atwork.ts` to import `AUTHORED_WORDING` from
`@prism/executive-summaries` and delete `src/lib/authored-wording.js`.

## Open items

### 1. C — LMDI named-subset rounding (agreed, deferred)

Symptom: atWork Meta August 2026 renders *"the 24 additional
conversions, contributing 4; ... gave back 4. A new campaign added
26"*. Displayed named clauses sum to 26; stated total 24. Off by 2.
Reader tallying spots the mismatch.

Cause: PRISM `b702e90` applied `largestRemainderRound` at
`decompose.ts`'s return boundary against the FULL contribution set.
That reconciles all-contributions sum to `round(total_delta)` but
the displayed subset (named contributions above the naming floor)
diverges from the total by whatever unnamed contributions collectively
round to. On Meta August, unnamed factors sum to −2.

Decision: fix at PRISM per ADR 0071 (in
`docs/decisions/0071-lmdi-named-subset-rounding.md`). Named-subset
round with target = `round(total_delta) − round(sum(unnamed_raw))`,
plus `total_delta_magnitude` placeholder switches to render the
reconciled named target. Alternatives (lower naming floor; drop
total-magnitude phrase) rejected with reasons recorded.

Not blocking; the sentence is honest at what it says, just off by 2
on the tally. Fix is small (move rounding from decompose to
selectDrivers, add `total_delta_magnitude` variant).

### 2. CI secrets not set

`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` at
https://github.com/SenateSHJ/atwork/settings/secrets/actions. First
CI run against `main` will fail without them.

Discussion recorded in commits `52ad1be` (CI landed) and prior
correspondence: Supabase service-role key is what atWork already
uses locally; the audit is read-only through `loadConfig`; the
scoped-role Postgres alternative was rejected as more moving parts
than the job needs. Set the two secrets and CI goes green on the
next push.

### 3. Google Ads blocked on Weld / account decision

Diagnosed at commit `8fb8316` earlier same day. atWork's Google Ads
Weld connection authorises against customer id `8737230143` and
pulls dimension tables cleanly (157 campaigns, 19,587 ad group
criteria, 100k geo targets, all `bq_synced` 2026-08-29). Fact
tables all zero:

- `bronze.gads_campaign_stats`: 0 rows
- `bronze.gads_ad_group_stats`: 0 rows
- `silver.gads_campaigns`: 0 rows for any date (2024-2026)

The one campaign with historical stats (`gs-b | RKT | Brand | Aus`,
id `14863210277`) has data only from April 2024. All 157 campaigns
in the current dim set are PAUSED (145) or REMOVED (12). Zero
ENABLED. Only one Google-Ads-shaped dataset exists in the GCP
project (`atWork_Google_Ads`).

**Not a Weld problem.** Either the connected account has nothing
running (client decision to wind down) or atWork's active spend is
under a different Google Ads customer id Weld isn't pointed at.
Awaiting confirmation from SSHJ / the atWork operator on which
customer id to point Weld at, if any.

Section correctly renders "No Google Ads data available" until
resolved. Nothing atWork's code can do.

### 4. describeLeadEventComposition — waiting on the validator work

The rule (D2 family in PRISM's roadmap) reads the `event_breakdown`
field on `NormalisedPeriod` to attribute conversions to specific
lead events over time. atWork's Website adapter currently emits
`event_breakdown: []` — the query pipeline exists (`getGa4LeadEvents`)
but the adapter doesn't populate the field.

Blocked on PRISM's validator work: the event-breakdown contract
shape settled recently in PRISM (see ADR 0055 / Wave 5 Batch 2) but
the D2 rule module and its wording template haven't landed. Once
they do, wire the atWork adapter to populate `event_breakdown` from
`getGa4LeadEvents` output.

Small change once unblocked.

### 5. LinkedIn Ads and SEMrush — future channels

Neither exists in `src/app/monthly-reports/adapters/`. Both are
tracked in atWork's data pipeline (bronze/silver tables exist for
LinkedIn; SEMrush ingest is separate). Each is a new adapter and a
new `ChannelConfig` entry in `makeAtWorkConfig()`, seeded via
`npm run seed:config`.

Follow the shape of `adapters/meta.ts` for a paid channel or
`adapters/website.ts` for an SEO-shaped channel. `channel.id` MUST
match `reporting.config_channel.channel_id` verbatim (see class 1
below).

## Three defect classes a future clone should expect

Each surfaced during atWork integration; each cost a debug cycle to
find. A future clone should catch these in its first end-to-end
render rather than in production.

### Class 1: channel-id mismatch between adapter and config

**Symptom:** section anchor doesn't render; run errors say
"channel config not found for X". Paid anchor rules fire on web
channels and get dropped by the wording resolver on missing
`{{spend_current}}`.

**Cause:** the adapter's `channel: { id: 'X' }` does not match
`reporting.config_channel.channel_id`. PRISM's wording resolver
looks up channel-scoped config by `current.channel.id`;
mismatch → null → most placeholders can't resolve →
findings drop silently.

**Prevention:** end-to-end render every channel in the clone's
first hour of integration. Cross-check
`adapter's channel.id === config's channel_id`. The atWork case
was `'website'` in the adapter vs `'web'` in the config; fixed at
commit `2f535c1`.

### Class 2: two data sources for one metric

**Symptom:** the anchor displays one number for X ("3.75%
conversion rate") while the classifier reasons on a different one
("efficiency delta −8.6%"). Two paragraphs both call it "conversion
rate" but they don't agree, and any rule downstream of the
classifier disagrees with the anchor by construction.

**Cause:** the adapter fetches the metric from two different silver
tables / queries with different definitions. atWork's Website
initially had THREE sources: whitelist `ga4_events` count,
`ga4_channels.conversions` counter, and `ga4_channels.conversions /
sessions` rate. All three flowed into the same section under the
label "lead events" / "conversion rate".

**Prevention:** one definition per section. Whatever PRISM's
classifier reasons on is what the anchor displays. Derive rates from
the same numerator over the same denominator that populate
`metrics.conversions` and `metrics.custom.sessions`. If a data source
returns a "conversion rate" field, don't feed it — derive the rate
from the two fields the classifier reads.

atWork's Website unified on `ga4_channels.conversions` at commit
`793bca2` after two false-start attempts on different sources.

### Class 3: stale seeded config after a code change

**Symptom:** a text field renders the old string even after the
code change ships. Git log shows the commit; the report shows the
prior text. Reader is served the stale value indefinitely.

**Cause:** `reporting.config_channel.conversion_definition` (and
similar `ChannelConfig` fields) are seeded from the in-code
`makeAtWorkConfig()` factory. A code change without a re-seed leaves
the DB carrying the old value. `loadConfig` reads from DB at
runtime, so the stale value ships to the reader while git history
reads as if the new text shipped.

**Prevention:** the drift audit (`npm run audit:config-drift`)
catches this class exactly. CI runs it on every push. Any code
change to `src/config/atwork.ts` MUST be followed by `npm run
seed:config` and the audit must pass before merge.

Runbook at `docs/CLONE-RUNBOOK.md`; audit source at
`node_modules/@prism/executive-summaries/dist/config/audit-drift.js`
(exported as `auditConfigDrift` from the PRISM barrel).

## First moves on resume

1. Set the two CI secrets. Confirm first `main` push runs green
   through to the drift-audit step.
2. Land ADR 0071 in PRISM (named-subset rounding). ~20 minutes of
   code. Bump atWork's PRISM pin, re-seed, verify Meta August's
   attribution paragraph reconciles.
3. Ask about Google Ads customer id. If atWork's real spend lives
   under a different account, point Weld at it and re-run
   `npm run ingest:gads`.
4. When PRISM ships D2 / describeLeadEventComposition, wire
   `event_breakdown` in `adapters/website.ts` from `getGa4LeadEvents`.
5. LinkedIn / SEMrush adapters when needed.

## Related files

- `docs/CLONE-RUNBOOK.md` — required steps for any config change.
- `docs/CONFIG-DRIFT-AUDIT.md` (in PRISM) — the audit helper spec.
- `.github/workflows/ci.yml` — the CI job that enforces the drift audit.
- `scripts/seed-atwork.ts` — the seed script.
- `scripts/audit-config-drift.ts` — the drift audit invocation.
- `src/config/atwork.ts` — the source-of-truth factory.
