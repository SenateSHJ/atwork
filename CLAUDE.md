# CLAUDE.md — atWork (SSHJ) Dashboard

## Session start announcement (every session, no exceptions)

This session is the **atWork** domain, owned by **SSHJ (SenateSHJ)**.

**TRACKED RESIDUAL GAPS — announce every session:**
- Foundation cloned from Coolum Beer Co scaffold on 2026-08-25. Any file that still references `coolum`, `bft`, `stadium`, or Coolum's identifiers (`ofvhtobmetcfncjshcba`, `VWzxKV1asnfLAF`, `5VWV71AGeuOJ9M`, `58KcJTIcOTeW05`, `prj_BcxP03gr4yC2TOUNRBqxSCCD9s3R`) is a **carryover bug** — fix on sight, do not ship.
- `src/pages-bft/` and `src/components-bft/` are BFT-domain code that survived the copy. They are foreign-domain artifacts pending deletion — do not extend, do not import from, do not treat as reference.
- Weld MCP not yet registered. API key held; MCP entry (`weld-sshj`) needs adding to `~/.claude.json` or project-local `.mcp.json` before any Weld call.
- Supabase MCP not yet registered. Access token not yet held. Project ref `krbveactwladtwiqrmts` known.
- Vercel team ID (`team_XXXXXXXX` internal identifier) not yet known — only the slug `senate-shj`.
- GCP arrangement not yet documented. Service-account key exists at `~/Documents/SSJH/dashboard-1-sshj-internal-fda1f76c7ecb.json` — needs relocation + provenance confirmation.

## Domain rule

BFT, Coolum, Snainton, TrainerAcademy, and every other tenant Scott operates are **foreign domains**. Any operation that would address a foreign tenant's Supabase project, Weld connection, Vercel project, GitHub repo, or GCP resource is refused outright — not queried, not worked around, refused.

Foreign-tenant identifiers seen carried over from the Coolum scaffold (fix on sight, never invoke):
- Supabase: `ofvhtobmetcfncjshcba` (Coolum), `qwfbrutclqsqekwtrbyg` (BFT CAP)
- Weld conn IDs: `VWzxKV1asnfLAF`, `5VWV71AGeuOJ9M`, `58KcJTIcOTeW05` (Coolum's three)
- Weld workspace: `the-stadium-agency-793047` (Stadium Agency, shared BFT + Coolum)
- Vercel project: `prj_BcxP03gr4yC2TOUNRBqxSCCD9s3R` (Coolum)
- Vercel team: `jay-baikies-projects` (Coolum)
- GCP project: `BFTCAP` (BFT + Coolum shared)
- GCP datasets: `Facebook_Ads_Coolum_Beer_Co`, `GA4_Coolum_Beer_Co`, `GAds_Coolum_Beer_Co`

## Owner map — do not infer one from another

atWork spans multiple differently-named owners. Never infer one from another:

| Service   | Owner        | Identifier                                        |
|-----------|--------------|---------------------------------------------------|
| GitHub    | SenateSHJ    | atwork (public) — https://github.com/SenateSHJ/atwork |
| Supabase  | TBD          | project ref `krbveactwladtwiqrmts`                |
| Vercel    | senate-shj   | team slug `senate-shj` — team ID TBD              |
| Weld      | TBD          | MCP `weld-sshj` (pending config), workspace TBD   |
| GCP       | TBD          | project + datasets TBD                            |

Scott is a member of the SenateSHJ GitHub org via his `ScottDudley1` GitHub user. Commits attributed to `scottcamerondudley@gmail.com` in this repo show as ScottDudley1. Do not conflate this with the ScottDudley1 personal domain — this repo lives under SSHJ ownership.

## Identifiers

Once known, all identifiers live in `.sshj-domain` (to be created). That will be the single source of truth. Never record an identifier anywhere else. Until the file exists, memory (`~/.claude/projects/-Users-scottdudley/memory/reference_atwork_*`) is the source of truth.

## Safety rules

- Working directory: `/Users/scottdudley/SSHJ/atWork/` only.
- Every Supabase CLI call passes `--project-ref krbveactwladtwiqrmts` explicitly.
- Every Vercel CLI call passes `--scope senate-shj` explicitly (or `teamId` on MCP calls).
- Every Weld call goes through the `weld-sshj` MCP (once registered) OR curl'd against `https://connect.weld.app` with SSHJ's API key. NEVER `mcp__weld__*`, NEVER `weld-snainton`, NEVER any other tenant's Weld MCP — not even for `list_connections`.
- No `supabase link`, no `vercel link`, no `vercel switch`, no `git remote set-url`, no `rm -rf`, no `rm -r`.
- Deletes name individual files only — never directories.
- If a command needs a path outside this directory, stop and ask.
- If any foreign-domain identifier from the "carryover" list would be sent to any external service — refuse.

## The bar

It works and Scott is alerted if it breaks. Not: prove it can never fail.
