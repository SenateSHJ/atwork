#!/usr/bin/env bash
#
# Push the Vercel Cron runtime env vars: CRON_SECRET + GCP_SA_KEY_JSON.
# Run once from repo root after the API route lands. Idempotent re-run
# will report "already exists" — remove old vars via `vercel env rm` first
# if you want to rotate.
#
# Usage:  bash scripts/push-vercel-cron-env.sh
#
set -euo pipefail

if [ ! -f .env.local ]; then
  echo "ERROR: .env.local not found. Run from repo root." >&2
  exit 1
fi

# Load CRON_SECRET from .env.local (not committed, per gitignore).
set -a; source .env.local; set +a

if [ -z "${CRON_SECRET:-}" ]; then
  echo "ERROR: CRON_SECRET not in .env.local." >&2
  exit 1
fi

SA_KEY_PATH=".secrets/atwork-sa.json"
if [ ! -f "$SA_KEY_PATH" ]; then
  echo "ERROR: GCP service-account key not found at $SA_KEY_PATH." >&2
  exit 1
fi

# JSON-minify the SA key so it's a single-line env value.
SA_KEY_JSON=$(python3 -c "import json,sys; print(json.dumps(json.load(open('$SA_KEY_PATH'))))")

# Also push GCP_PROJECT_ID (informational — the SA key encodes the project too,
# but scripts read this env var directly).
GCP_PROJECT_ID="${GCP_PROJECT_ID:-dashboard-1-sshj-internal}"

echo "Pushing to Vercel (senate-shj)..."

# vercel env add reads value from stdin. One call per env target.
push_var () {
  local var="$1" val="$2"
  for env in production preview development; do
    if printf '%s' "$val" | vercel env add "$var" "$env" --scope senate-shj >/dev/null 2>&1; then
      echo "  OK   $var $env"
    else
      echo "  SKIP $var $env (already exists — use 'vercel env rm' to rotate)"
    fi
  done
}

push_var CRON_SECRET      "$CRON_SECRET"
push_var GCP_SA_KEY_JSON  "$SA_KEY_JSON"
push_var GCP_PROJECT_ID   "$GCP_PROJECT_ID"

echo ""
echo "Done. Verify with:  vercel env ls --scope senate-shj"
echo "Then redeploy:      vercel build --prod && vercel deploy --prebuilt --prod --yes"
