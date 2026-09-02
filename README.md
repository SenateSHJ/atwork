# atWork Dashboard

Monthly reporting dashboard for atWork Australia. Deterministic marketing
intelligence sourced from Meta Ads, Google Ads, LinkedIn Ads and GA4, composed
through the PRISM Executive Summaries engine.

## Stack

- **Next.js 15** (App Router) — Vercel deployment.
- **PRISM Executive Summaries** — pulled as a git dep from
  `github:ScottDudley1/prism-executive-summaries`. All rule logic + wording
  templates live in that repo. This repo owns the atWork-specific adapter
  shims that convert atWork's silver views into PRISM's `NormalisedPeriod`
  shape.
- **Supabase** — project `krbveactwladtwiqrmts`. `bronze.*` holds Weld syncs;
  `silver.*` holds the derived views the adapter shims read; `reporting.*`
  holds the PRISM ClientConfig + wording templates.
- **Weld → BigQuery → Supabase** — data pipeline. Weld syncs LinkedIn / Meta /
  Google Ads / GA4 into BigQuery; a scheduled mirror lands the tables into
  Supabase `bronze.*`.

## Adapter shims

Each channel has its own shim under `src/app/monthly-reports/adapters/`,
querying the silver views and building a PRISM `NormalisedPeriod`. See
`src/app/monthly-reports/adapters/README.md` for a divergence log documenting
what each shim reads versus what the equivalent PRISM silver adapter reads,
and which rules would newly fire if the shims were swapped for PRISM's
adapters.

## Local development

Install:

```
npm install
```

Environment (see `.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` — Bearer token that Vercel Cron sends on the daily bronze
  ingest hit at `/api/cron/ingest`. Set the same value in the Vercel
  project's env and in `.env.local` for local ingest-endpoint testing.
- `SEMRUSH_API_KEY` — SEMrush API v3 key. Used by the nightly SEMrush
  ingest to fetch domain overview, top organic keywords, and backlinks
  overview for `atwork.com.au`. Stored in Vercel env as Sensitive.
- `GCP_PROJECT_ID` and `GCP_SA_KEY_JSON` — BigQuery reader credentials
  for the Meta / Google Ads / GA4 / LinkedIn Weld-ingested datasets.

Run:

```
npm run dev
```

Render a single channel end-to-end (LinkedIn example):

```
node --env-file=.env.local --import tsx scripts/render-atwork-linkedin.ts --period=2026-08
```

## Deploy

Vercel deploys are **manual** — Scott is not currently a SenateSHJ GitHub org
admin so auto-deploy from git is not configured. The flow is:

```
vercel build --prod --scope senate-shj
vercel deploy --prebuilt --prod --scope senate-shj
```

The `.claude/hooks/prism-gate-hook.sh` PreToolUse hook runs PRISM's Part G
assurance gate against the diff and blocks the deploy on failure. Fix the
failures rather than bypassing.

## Session scope

`CLAUDE.md` at the repo root pins this session to atWork only. LinkedIn Ads
adapters (PRISM + atWork shim) are owned by this session; Meta / GA4 / Google
Ads adapters are owned by Coolum's parallel session. PRISM at
`~/prism-executive-summaries` is shared product code.

See `CHANGELOG.md` for release history.
