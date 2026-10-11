#!/usr/bin/env bash
# Seeds a database with a project, real traces from the offline support agent,
# the support-v1 suite and a baseline review on main. Used by CI e2e and for
# local demos. Needs DATABASE_URL, POPCORN_ENDPOINT and POPCORN_API_KEY.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${POPCORN_API_KEY:?POPCORN_API_KEY is required}"
export POPCORN_ENDPOINT="${POPCORN_ENDPOINT:-http://localhost:4100}"
export SUPPORT_AGENT_OFFLINE=true

node packages/db/dist/bin/migrate.js
POPCORN_SEED_API_KEY="$POPCORN_API_KEY" node packages/db/dist/bin/seed.js support-bot

node apps/api/dist/main.js > api.log 2>&1 &
api_pid=$!
trap 'kill $api_pid 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do
  curl -fs "$POPCORN_ENDPOINT/readyz" > /dev/null && break
  sleep 1
done

cd examples/support-agent
pnpm tickets 20
pnpm suite
GITHUB_REF_NAME=main pnpm exec popcorn review --suite support-v1 --concurrency 8 --fail-on never
