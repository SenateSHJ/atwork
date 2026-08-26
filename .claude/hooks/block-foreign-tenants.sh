#!/usr/bin/env bash
# PreToolUse hook: block any tool call whose input contains a foreign-tenant identifier.
#
# Reads the tool invocation JSON from stdin (Claude Code hook contract).
# If any foreign identifier is found anywhere in the input, exits with code 2
# which cancels the tool call and returns the message to Claude.
#
# atWork/SSHJ is a strictly isolated tenant — no other client's identifiers
# may ever be invoked from this project.
set -u

INPUT="$(cat)"

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
