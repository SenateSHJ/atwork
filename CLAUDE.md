# CLAUDE.md — atWork

**This session is atWork Australia. LinkedIn Ads only.**

## Scope

- GitHub org: **SenateSHJ**.
- Supabase project: atWork's (`krbveactwladtwiqrmts`).
- Working directory: `/Users/scottdudley/SSHJ/atWork/` only.

## Never touch

- Coolum, Stadium Agency (Jay's Vercel/GCP account), or any other tenant's
  resources. Foreign-tenant identifiers are refused by the
  `.claude/hooks/block-foreign-tenants.sh` guard.
- **Coolum's session owns the Meta, GA4 and Google Ads adapters.** Do not edit
  them in either PRISM (`src/adapters/silver/meta.ts`,
  `src/adapters/silver/ga4-web.ts`, `src/adapters/silver/gads.ts`) or in atWork's
  shim layer (`src/app/monthly-reports/adapters/{meta,website,gads}.ts`).

## atWork owns

- LinkedIn adapter in PRISM (`src/adapters/silver/linkedin.ts`) + LinkedIn silver
  contracts (`contracts/silver/linkedin_*.sql`).
- LinkedIn shim in atWork (`src/app/monthly-reports/adapters/linkedin.ts`),
  LinkedIn queries (`src/lib/queries/linkedin.ts`), and the LinkedIn render script.
- Any traffic-model wording work (see
  `docs/HANDOVER-linkedin-traffic-wording.md`).

## PRISM (shared product code)

`~/prism-executive-summaries` is shared across every client, not just atWork.
Changes there affect every future client. Push over the SSH deploy key already
configured — origin is `git@github-prism:ScottDudley1/prism-executive-summaries.git`.
No gh account switching is needed.

**Commits from Coolum's session will appear in PRISM's delta on every fetch. That
is expected, not a warning sign, and does not need flagging every time.**

## Owner map — do not infer one from another

| Service   | Owner        | Identifier                                        |
|-----------|--------------|---------------------------------------------------|
| GitHub    | SenateSHJ    | `SenateSHJ/atwork` — https://github.com/SenateSHJ/atwork |
| Supabase  | SenateSHJ    | project ref `krbveactwladtwiqrmts`                |
| Vercel    | senate-shj   | team slug `senate-shj`                            |
| Weld      | SenateSHJ    | MCP `weld-sshj`, connection `Fn8bXV4zqCRD6l` (LinkedIn) |

## Safety rules

- Every Supabase CLI call passes `--project-ref krbveactwladtwiqrmts` explicitly.
- Every Vercel CLI call passes `--scope senate-shj` explicitly (or `teamId` on
  MCP calls).
- Every Weld call goes through the `weld-sshj` MCP or curls against
  `https://connect.weld.app` with SSHJ's API key. Never any other tenant's Weld MCP.
- No `supabase link`, no `vercel link`, no `vercel switch`. No `git remote set-url`
  outside PRISM (where the SSH remote is already set). No `rm -rf`, no `rm -r`.
- Deletes name individual files only.
- If a command needs a path outside `~/SSHJ/atWork/` or `~/prism-executive-summaries/`,
  stop and ask.

## The bar

It works and Scott is alerted if it breaks. Not: prove it can never fail.
