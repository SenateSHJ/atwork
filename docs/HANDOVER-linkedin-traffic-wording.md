# Handover — LinkedIn traffic-model wording + code fixes

**Date:** 2026-08-31
**Trigger:** LinkedIn integration for atWork (branch `main` on both atWork and PRISM).
**Status at pause:** shim + render verified end-to-end; PRISM wording seed gap identified; one of five rules (describeGrowthComposition) confirmed placeholder-resolvable; remaining work scoped below.

## What shipped this session

**atWork (commit `43bcc43` on main, pushed):**
- `src/lib/queries/linkedin.ts` — helpers reading the new silver views
- `src/app/monthly-reports/adapters/linkedin.ts` — shim mirroring the Meta shim minimal shape
- `scripts/render-atwork-linkedin.ts` — end-to-end render script
- `src/app/monthly-reports/adapters/README.md` — shim-vs-PRISM divergence log

**PRISM (3 commits on local main, NOT pushed — blocked on `PRISM_PROMOTION=1`):**
- `a5c6d83` — fix(anchor): paid-traffic renders "clicks" not "sessions"
- `d493767` — feat(silver/linkedin): three-view contract for LinkedIn Ads
- `90b27b3` — feat(adapter/linkedin): silver → NormalisedPeriod for LinkedIn Ads

**Supabase (atWork project, applied):**
- `silver.linkedin_campaign_groups` / `linkedin_campaigns` / `linkedin_creatives` created
- Four legacy `silver.linkedin_*` views renamed to `_legacy` (non-destructive, definitions snapshotted)
- `reporting.config_channel` row added for LinkedIn: `outcome_model='traffic'`, `channel_family='paid'`, `display_order=4`
- **`reporting.config_wording` UPDATE** — 34 rows for `describeGrowthComposition` moved from `model='lead_generation'` to `model='any'` (verification path for the shortcut described below; safe because `'any'` matches `lead_generation` too so no regression for Meta/GA4)

**PRISM seed generator (local edit, uncommitted):**
- `scripts/generate-wording-seed.mjs` line 291: describeGrowthComposition PARAMS entry model changed from `'lead_generation'` to `'any'`. This regenerated `src/config/authored-wording.ts` to emit those rows with `model='any'`. **Uncommitted** — waiting on the next session to bundle with the wording authoring work.

## The gap in one line

PRISM has no `traffic`-model wording seed for the 5 rules that open a section: `describeAnchor`, `describeOutcomeDefinition`, `describeAnchorDeltas`, `describeGrowthComposition`, `describeOutcomeDecomposition`. Every paid-traffic channel (LinkedIn today, any future traffic-mode channel) renders a thin section with those paragraphs dropped as `WORDING_NOT_FOUND` after the four-step resolver fallback.

`describeAnchor.md`'s own history log at lines 96-98 records: *"the two provisional templates (awareness, traffic; both carry `config_wording.provisional=true` per ADR 0047)"* — **this gap is documented, not new.** Traffic templates were flagged as provisional at A1.1 sign-off (2026-08-23) and were never landed in the seed. Closing that.

## The five rules — placeholder-resolvable vs genuinely different prose

| Rule | Verdict | Notes |
|---|---|---|
| **describeGrowthComposition** | **Placeholder-resolvable** (confirmed) | Templates use `{{primary_outcome_noun}}`, `{{currency_unit_singular}}`, `{{fewer_or_less}}` — all resolve per model. Verified rendering under traffic for atWork Aug 2026: `"The shape of the month. Spend fell 15.7% and clicks fell 15.4%. Both moved together and efficiency did not shift materially. Decline came on less spend, not on getting less per dollar."` Read cleanly. **Action:** ship the `model='any'` PARAMS change already in generator, commit, and DB reload picks it up. |
| **describeAnchor** | **Needs traffic authoring** | Lead-gen template names *"cost per acquisition"* as literal prose (not a placeholder). Traffic needs *"cost per click"*. Rule module docstring confirms the shape difference: `traffic → spend, impressions, clicks, CTR, CPC` vs `lead_generation → spend, impressions, clicks, conversions, CTR, CPA`. |
| **describeOutcomeDefinition** | **Should be placeholder-resolvable but verify** | Existing template is likely `"{{conversion_definition}}"` (interpolates the channel_config text verbatim). If so, model='any' shortcut applies. If it wraps the definition in lead-gen-flavoured prose, needs traffic authoring. **Verify by reading `docs/rules/describeOutcomeDefinition.md`.** |
| **describeAnchorDeltas** | **Needs traffic authoring** | Lead-gen shape is *"conversions moved X to Y and CPA moved A to B"*. Traffic shape is *"clicks moved X to Y and CPC moved A to B"*. Different literals. |
| **describeOutcomeDecomposition** | **Needs traffic authoring (real work)** | Lead-gen chain is `spend × cpm_inv × ctr × cr` (4 factors) with template variants: `default`, `offsetting_dominates`, `bought_and_launched`, `earned_growth`. Traffic chain is `spend × cpm_inv × ctr` (3 factors — no `cr` step). Traffic needs a genuinely different sentence: "Spend fell X, CPM fell Y, CTR fell Z. Net effect: clicks fell N." plus its own branch pattern set. This is the one that requires real writing, not template broadcasting. |

Golden target for atWork Aug 2026 to author against (Scott to sign off):

- **Anchor:** *"The month. $1,258 spent, fell 15.7% on July, producing 1,533 clicks at a $0.82 cost per click."*
- **AnchorDeltas:** *"Impressions rose 13.2% while clicks fell 15.4% and CTR fell from 7.27% to 5.43%."*
- **OutcomeDefinition:** *"Campaign goal is video completions to the end of the ad. No downstream off-LinkedIn action is tracked; Insight Tag installation would be required for that."* (verbatim from `config_channel.conversion_definition`)
- **GrowthComposition (proportional_pullback):** already rendered correctly — see above.
- **OutcomeDecomposition:** to draft alongside the branch-classifier for traffic 3-factor chain. Lead-gen currently has `default | offsetting_dominates | bought_and_launched | earned_growth`; traffic needs its own pattern list.

## The generator change

`scripts/generate-wording-seed.mjs` pins **one model per rule doc** in the PARAMS table (lines 291-360). Every describeAnchor / describeOutcomeDefinition / etc entry today is `model: 'lead_generation'`. There is no per-model authoring path.

Two possible shapes for closing this:

**Option A — per-doc-file per model.** Add new doc files like `describeAnchor-traffic.md`, `describeOutcomeDecomposition-traffic.md` and add matching PARAMS entries with `model: 'traffic'`. Minimum-invasive to the generator. Bloats to N docs per rule.

**Option B — per-model markers inside the same doc.** Extend the extractor to recognise `**Signal template — traffic:**` variants alongside `**Signal template:**`, and emit rows per model. Colocates wording per rule. Requires parser work in `findSignalTemplateBlocks` regex (currently `\*\*Signal templates?[^*]*:\*\*` — would need to capture the trailing `— <model>` when present and thread through).

**Recommendation: Option B.** The extractor already handles suffix variants (Wave 3.5 tier suffixes on branch keys via `stripTierSuffix`). Extending the same pattern for model annotations keeps rule wording per doc, which is the pattern authors are used to. See the existing note in `authored-wording.ts` header: *"GENERATED from docs/rules/*.md AUTHORED blocks"* — the whole system is built around per-doc authoring.

## The two code fixes

### 1. Sample-size flag gate on outcome metric, not conversions

**Symptom:** LinkedIn Aug 2026 render says *"0 conversions against a 20 minimum for rate reads"* despite 1,533 clicks (well above any sensible gate). Under `outcome_model='traffic'` the numerator is clicks; the flag reads the conversions field and floors on zero.

**Fix location:** `flagSampleSizeInsufficient` — read `MODEL_OUTCOME_FIELD[model]` from `src/analytics/model-factors.ts` (already exports the correct field per model: `awareness → impressions`, `traffic → clicks`, `lead_generation → conversions`, `revenue → conversion_value`). Gate on the value in that field.

**Test:** add a fixture with `outcome_model='traffic'` + non-zero clicks + zero conversions; assert the flag does NOT fire. Add a lead_gen counterpart to prove no regression.

### 2. Verdict template using primary_outcome_noun (traffic branch)

**Symptom:** Verdict currently renders *"conversions and spend fell in step, no efficiency change"* for LinkedIn traffic — literally true (0 = 0) but misleading in a paid-traffic context. Falls through the provisional-wording path (`describeVerdict / b1_proportional_pullback / any`).

**Fix location:** `describeVerdict` template for the `b1_proportional_pullback` branch (plus any other verdict branches). Either:
- (a) Author a `model='traffic'` variant that reads *"clicks and spend fell in step, no efficiency change"* — parallel to the existing lead_gen row.
- (b) Change the existing template to use `{{primary_outcome_noun}}` instead of the literal `"conversions"`, and broadcast to `model='any'`. Same shortcut that worked for describeGrowthComposition.

Verify (b) doesn't break existing lead-gen golden output before choosing.

## The atWork DB state — verified against a fresh PRISM seed regen

`reporting.config_wording` in atWork's Supabase now matches what a fresh
`npm run seed:wording` in PRISM produces for describeGrowthComposition.
Verified 2026-08-31 by regenerating the seed and comparing row-by-row against
the DB:

- **33 rows at `model='any'`** — every branch × key_type except one.
- **1 row at `model='lead_generation'`** — `finding_signal /
  more_at_held_spend__lifecycle_driven`. This branch has an explicit per-branch
  model annotation in `docs/rules/describeGrowthComposition.md` (the
  LIFECYCLE_DRIVEN_VARIANTS addendum) that overrides the PARAMS default; the
  extractor honours it.

**The initial UPDATE in this session was too broad** — it set every
describeGrowthComposition row to `'any'`, including the one branch the seed
correctly holds as `'lead_generation'`. That drift has been restored: the DB
row for `more_at_held_spend__lifecycle_driven` is back to `'lead_generation'`.
The DB and the seed now agree.

If a future session re-runs `npm run seed:wording` in PRISM and reloads
atWork's config, the row set will be idempotent for describeGrowthComposition
— no drift.

## Coolum consequence

The PARAMS change to `model: 'any'` for describeGrowthComposition affects
**every PRISM client**, not just atWork. When Coolum's session next runs
`npm install` (picking up the seed regen once the PRISM commits are pushed)
and reloads its own `reporting.config_wording`, Coolum's describeGrowthComposition
rows will also move from `'lead_generation'` to `'any'` (except the one
`more_at_held_spend__lifecycle_driven` row that stays `'lead_generation'`).

**This is almost certainly correct.** The templates use `{{primary_outcome_noun}}`
+ `{{currency_unit_singular}}` + `{{fewer_or_less}}` — all placeholder-resolved
per model. Coolum's Meta channels are on `outcome_model='lead_generation'`,
which the resolver still matches under `'any'`. Verified this behaviour in the
atWork render: the composition paragraph rendered correctly with
`{{primary_outcome_noun}}` → "clicks" under traffic. Same substitution logic
will resolve `{{primary_outcome_noun}}` → "conversions" for Coolum's Meta
under lead_generation.

**Stated consequence rather than surprise:** Coolum inherits the model
broadcast. If Coolum's session wants to gate that broadcast per-project
(e.g. keep lead_generation-only for a specific client), it would need to
either revert the PARAMS entry or add a per-client override at the DB layer.
Neither is expected.

## Blocking items only Scott can clear

1. **`PRISM_PROMOTION=1`** in Scott's shell before pushing the three PRISM commits (`a5c6d83`, `d493767`, `90b27b3`). Coolum's parallel session needs the anchor fix too — this push unblocks that.
2. **Golden target sign-off.** Wording author should read the five rendered paragraphs above and either approve verbatim or adjust before templates land in PRISM.

## Coolum concurrency note

Coolum's parallel session is working in the same PRISM repo, currently on Meta and GA4 adapters (per the divergence-audit exchange in this session). **The changes proposed in this handover touch:**
- `docs/rules/describeAnchor.md`
- `docs/rules/describeAnchorDeltas.md`
- `docs/rules/describeOutcomeDefinition.md`
- `docs/rules/describeGrowthComposition.md` (already edited via seed generator PARAMS change)
- `docs/rules/describeOutcomeDecomposition.md`
- `scripts/generate-wording-seed.mjs` (extractor extension for `— <model>` markers)
- Rule module for `flagSampleSizeInsufficient`
- Wording template for `describeVerdict / b1_proportional_pullback`

Coolum's Meta/GA4 adapter work is likely in `src/adapters/silver/meta.ts`, `src/adapters/silver/ga4-web.ts`, and possibly config plumbing. **No file overlap** with this handover's expected touch list. Sequencing check when the traffic-wording session picks up: confirm `git log` shows Coolum's landings before starting, rebase if needed, run the full `npm test` + seed regenerator to catch any seed collisions.

## Two things recorded, not fixed

- **`describeSpendDecomposition` single-continuing-entity wart.** LinkedIn Aug 2026 renders *"Rocket Campaigns was the only continuing campaign to pull back"* — reads oddly when there is only one campaign group at all. Not LinkedIn-specific; belongs in a describeSpendDecomposition polish pass.
- **`describeTrendReturnedToPriorLevel` has no wording rows in any model.** Emits `WORDING_NOT_FOUND` regardless of channel. Separate wording gap, unrelated to traffic.

## Files that will need editing in the next session

- **PRISM:** `scripts/generate-wording-seed.mjs` (extractor extension), `docs/rules/describeAnchor.md` + 3 others (add `**Signal template — traffic:**` blocks), `docs/rules/describeOutcomeDecomposition.md` (traffic 3-factor chain authoring — largest single unit), `src/rules/quality-signals/flag-sample-size-insufficient.ts` (gate fix), possibly `docs/rules/describeVerdict.md` (traffic branch or placeholder swap).
- **PRISM tests:** fixture + assertion for the sample-size gate under traffic; wording renderer test for each new traffic template.
- **atWork:** nothing (the render script already works end-to-end; picks up the new PRISM version on `npm install`).

## To resume: verification recipe

```bash
# 1. In PRISM repo, verify the state:
cd ~/prism-executive-summaries
git log --oneline -5
# Should show a5c6d83 / d493767 / 90b27b3 as most-recent-first if unpushed.

# 2. Rebuild PRISM after any changes:
npm run build

# 3. Copy dist into atWork's node_modules (temporary local override):
rsync -a --delete ~/prism-executive-summaries/dist/ ~/SSHJ/atWork/node_modules/@prism/executive-summaries/dist/

# 4. Re-render LinkedIn:
cd ~/SSHJ/atWork
node --env-file=.env.local --import tsx scripts/render-atwork-linkedin.ts --period=2026-08

# 5. Check the ── RUN ERRORS ── section: WORDING_NOT_FOUND count for traffic model should drop as each rule is authored.
```

Expected end-state after wording + code fixes land: LinkedIn Aug 2026 renders an anchor, an outcome definition, anchor deltas, growth composition, outcome decomposition, verdict, plus the sample-size flag correctly quiet (1,533 clicks > gate), and the Metrics.custom.video_completions carried forward for the paid-traffic engagement-goal amendment.
