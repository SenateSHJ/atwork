# Changelog

All notable changes to the atWork Dashboard. Chronological, newest first.

## 2026-08-31

### Added
- **LinkedIn section on the monthly-reports page.** Wired via new
  `fetchAtWorkLinkedinPeriod` shim in `src/app/monthly-reports/adapters/`
  and displayed as a fourth section between Google Ads and Website.
- **LinkedIn silver adapter contract** in PRISM
  (`src/adapters/silver/linkedin.ts` + `contracts/silver/linkedin_*.sql`)
  — reference implementation for future clients even though atWork consumes
  the shim path.
- **Traffic-model wording** in PRISM for describeAnchor / describeAnchorDeltas
  / describeOutcomeDefinition / describeOutcomeDecomposition, plus a
  golden target at `docs/golden/paid-traffic-atwork-linkedin-aug-2026.md`.
  Prior to this landing, paid-traffic channels dropped their section-opening
  paragraphs with WORDING_NOT_FOUND.
- **`controls` design token** in `src/tokens.ts` for form-control sizes
  (selectHeight, selectPaddingX) previously inline in `page.tsx`.

### Changed
- `flagSampleSizeInsufficient` now gates on the channel's outcome-model
  field (via `MODEL_OUTCOME_FIELD`) rather than always on conversions.
  Fixes a false-negative sample-size flag on traffic-mode channels that
  don't track conversions.
- `describeVerdict / b1_proportional_pullback` uses `{{primary_outcome_noun}}`
  in place of literal `"conversions"` so the verdict reads correctly under
  any outcome model.
- `describeOutcomeDecomposition` broadcast to `model='any'` in PRISM's seed
  generator; templates already use generic-noun placeholders and resolve
  cleanly under any outcome model.
- `describeGrowthComposition` broadcast to `model='any'` (2026-08-31; see
  PRISM commit `d64ebeb`).

### Fixed
- Session drift between atWork and Coolum sessions in the shared PRISM
  repo: per-session CLAUDE.md files now state scope, ownership, and
  PRISM push flow. PRISM push works over an SSH deploy key
  (`git@github-prism:ScottDudley1/prism-executive-summaries.git`)
  regardless of `gh auth` active account.
- `.claude/hooks/block-foreign-tenants.sh` narrowly exempts
  `gh auth {switch,status,token,logout}` from the foreign-identifier
  check. Compound commands with shell separators still refuse.

## 2026-08-30

Baseline entry — atWork Dashboard live on Vercel with Meta Ads, Google Ads
and Website sections rendered via the PRISM engine.
