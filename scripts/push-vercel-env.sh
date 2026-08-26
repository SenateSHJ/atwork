#!/usr/bin/env bash
#
# Push runtime env vars from .env.local to Vercel (all environments).
# One-shot bootstrap — run once after `vercel link`, or re-run to update.
#
# Required env vars in .env.local:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY  (secret)
#   WELD_API_KEY                (secret)
#
# Usage: bash scripts/push-vercel-env.sh
#
set -euo pipefail

if [ ! -f .env.local ]; then
  echo "ERROR: .env.local not found. Run from repo root." >&2
  exit 1
fi

set -a; source .env.local; set +a

VARS=(NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY WELD_API_KEY)
ENVS=(production preview development)

for var in "${VARS[@]}"; do
  value="${!var:-}"
  if [ -z "$value" ]; then
    echo "SKIP $var (empty in .env.local)"
    continue
  fi
  for env in "${ENVS[@]}"; do
    if printf '%s' "$value" | vercel env add "$var" "$env" --scope senate-shj >/dev/null 2>&1; then
      echo "OK   $var $env"
    else
      # Already exists — try `vercel env rm` + re-add, or just report
      echo "SKIP $var $env (may already exist — check 'vercel env ls')"
    fi
  done
done

echo ""
echo "Done. Verify with: vercel env ls --scope senate-shj"
