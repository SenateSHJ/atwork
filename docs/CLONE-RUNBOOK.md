# atWork clone runbook

Required steps for anyone shipping a config change through atWork's
monthly-reports path (or for anyone cloning atWork's structure into
a new tenant).

## The invariant

Every field on `ClientConfig` has two representations that must stay
identical:

- **In code** — `src/config/atwork.ts::makeAtWorkConfig()`. The
  source of truth. Reviewed via pull request, versioned in git.
- **In the database** — rows under `reporting.*` on the atWork
  Supabase project. What `loadConfig` reads at runtime.

The `monthly-reports` page (and every future consumer that uses
`loadConfig`) reads from the database. A code change without a
matching re-seed leaves the DB carrying the stale value, and the
reader sees the old text. Git history reads as if the new text
shipped.

## Required steps for any config change

Whenever `src/config/atwork.ts` changes — including things that look
minor like a `conversion_definition` sentence, a threshold dial, a
channel display name, a wording template, or a channel_contribution
declaration — do all three:

1. **Commit the code change.**
2. **Re-seed the database:**
   ```
   npm run seed:config
   ```
   Writes the in-code config to `reporting.*`. Idempotent
   (delete-then-insert scoped per config_id); safe to re-run.
3. **Verify no drift:**
   ```
   npm run audit:config-drift
   ```
   Runs the drift audit against Supabase. Prints `✓ atwork: no
   drift` on success; enumerates every diverging field on failure.

If step 3 fails after step 2, the audit itself is the source of
truth: read the drift report, decide which side is right, and
either re-run the seed (code wins) or update the factory (DB wins).
**Never edit `reporting.*` by hand to make the audit pass.** That's
the class of drift the audit exists to catch.

## What CI enforces

`.github/workflows/ci.yml` runs the drift audit on every push and PR.
A failing audit blocks the merge. This exists because forgetting to
re-seed after a code change is the failure mode most likely to ship
silently: the code review passes, the build passes, the tests pass,
and the report renders the stale text.

## What CI needs

The audit calls `loadConfig` through the Supabase service role, so
the CI job requires two repository secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Both are read-only from the audit's perspective (`loadConfig` never
writes). Add them under Settings → Secrets and variables → Actions.

## What the audit doesn't catch

- Silver / bronze / gold data drift — that's a different class.
- Rows unrelated to `ClientConfig` (e.g. `reporting.run` history).
- Silver-schema changes that break the report contract without
  triggering a `ClientConfig` field diff. Those are caught by
  PRISM's own tests, not this audit.

## Full runbook reference

- `docs/CONFIG-DRIFT-AUDIT.md` in the PRISM repo — the full audit
  helper spec and CI wiring pattern (this file is atWork's copy of
  the pattern, keyed to atWork's factory + slug).
