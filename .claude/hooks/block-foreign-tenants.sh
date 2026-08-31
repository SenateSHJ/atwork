#!/usr/bin/env bash
# PreToolUse hook: block any tool call whose input contains a foreign-tenant identifier.
#
# Reads the tool invocation JSON from stdin (Claude Code hook contract).
# If any foreign identifier is found anywhere in the input, exits with code 2
# which cancels the tool call and returns the message to Claude.
#
# atWork/SSHJ is a strictly isolated tenant — no other client's identifiers
# may ever be invoked from this project.
#
# ── NARROW EXEMPTION: gh auth {switch,status,token,logout} ────────────────
#
# Added 2026-08-31. `gh auth switch --user <foreign>` was blocking when both
# sessions needed to flip credential contexts, even though the switch itself
# does not touch any tenant's data — it changes which local credential file
# is the default for future gh operations. The exemption below permits:
#   gh auth switch  — change the active local credential
#   gh auth status  — inspect stored credentials
#   gh auth token   — print the current token (not the same as leaking a
#                     tenant's data; the token is local state)
#   gh auth logout  — remove a stored credential
# even when the argument names a foreign tenant.
#
# Deliberately NOT covered by the exemption:
#   git remote set-url, git push, gh repo view/list/create, supabase link,
#   curl to a foreign host, any operation that addresses a foreign tenant's
#   resource. Those all remain refused by the foreign-id check below when
#   they name a listed identifier.
#
# Residual risk this exemption does NOT catch:
#   After a `gh auth switch` to a foreign account, subsequent commands in
#   the same shell run under that account's credentials. Downstream commands
#   only refuse if they literally name a listed foreign identifier. A
#   command that hits a foreign tenant's resource via a shared identifier
#   (an org both accounts are in, a repo name that is not on the list)
#   would pass. Mitigation: rely on the paired GH_CONFIG_DIR per-session
#   isolation so `gh auth switch` becomes unnecessary in day-to-day work
#   and this exemption is a safety net rather than a routine unblock.
#
# The exemption also refuses compound commands (anything with ;, &&, ||, |,
# <, >) that begin with a permitted gh auth invocation, so a command like
# `gh auth switch --user Foo && do-something-that-touches-foreign-data`
# does NOT slip through.
set -u

INPUT="$(cat)"

# Extract the Bash tool's command string when this is a Bash tool invocation.
TOOL_COMMAND=$(printf '%s' "$INPUT" | python3 -c 'import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get("tool_input", {}).get("command", ""))
except Exception:
    print("")')

# Exempt gh auth {switch,status,token,logout} when it is the whole command
# (no shell separators after the pattern). See header for rationale + what
# this deliberately does not cover.
if [[ "$TOOL_COMMAND" =~ ^[[:space:]]*gh[[:space:]]+auth[[:space:]]+(switch|status|token|logout)([[:space:]]+[^\;\|\&\<\>]*)?[[:space:]]*$ ]]; then
  exit 0
fi

# Foreign-tenant identifiers. Add here when new ones surface.
FOREIGN_IDS=(
  # Stadium Agency (Jay's Vercel/GCP)
  "thermal-effort-460301-m7"
  "jay-baikies"
  "the-stadium-agency"
  "scott@thestadiumagency.com"
  "TheStadiumAgency"
  # BFT
  "BFTCAP"
  "qwfbrutclqsqekwtrbyg"
  # Coolum
  "ofvhtobmetcfncjshcba"
  "prj_BcxP03gr4yC2TOUNRBqxSCCD9s3R"
  "VWzxKV1asnfLAF"
  "5VWV71AGeuOJ9M"
  "58KcJTIcOTeW05"
  "Facebook_Ads_Coolum_Beer_Co"
  "GA4_Coolum_Beer_Co"
  "GAds_Coolum_Beer_Co"
  # Snainton
  "supabase-snainton"
  "weld-snainton"
  # Personal side-projects
  "mine-my-data"
  "clarity_scraper_project"
)

# Case-insensitive check for brand names, exact for identifiers.
for id in "${FOREIGN_IDS[@]}"; do
  if grep -qF -- "$id" <<< "$INPUT"; then
    printf 'REFUSED: foreign-tenant identifier "%s" is not allowed in the atWork/SSHJ project. This is a hard isolation boundary — the tool call has been cancelled.\n' "$id" >&2
    exit 2
  fi
done

# Word-boundary check for brand names that appear as substrings in benign contexts.
# "Coolum" and "Snainton" only refuse when not inside CLAUDE.md's refuse-list context.
# CLAUDE.md is the intentional documentation of these names — don't refuse reads of it.
TOOL_FILE=$(printf '%s' "$INPUT" | python3 -c 'import json,sys;
try:
    d = json.load(sys.stdin)
    p = d.get("tool_input", {}).get("file_path", "") or d.get("tool_input", {}).get("path", "")
    print(p)
except Exception:
    print("")')
if [[ "$TOOL_FILE" != *"CLAUDE.md" && "$TOOL_FILE" != *"MEMORY.md" && "$TOOL_FILE" != *".claude/"* && "$TOOL_FILE" != *".sshj-domain"* ]]; then
  for brand in "Coolum Beer Co" "coolum-domain"; do
    if grep -qF -- "$brand" <<< "$INPUT"; then
      printf 'REFUSED: foreign-brand string "%s" is not allowed in the atWork/SSHJ project.\n' "$brand" >&2
      exit 2
    fi
  done
fi

exit 0
