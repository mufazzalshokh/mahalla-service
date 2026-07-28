#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${1:-deploy/production.env}
if test -n "$(git status --porcelain)"; then
  echo 'Refusing deployment from a dirty Git checkout.' >&2
  exit 1
fi

pnpm install --frozen-lockfile
pnpm check
pnpm build
node dist/config/validate-production.js "$ENV_FILE"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

CURRENT_RELEASE=$(git rev-parse HEAD)
if test "$CURRENT_RELEASE" != "$MCK_RELEASE"; then
  echo 'MCK_RELEASE must exactly match the checked-out Git commit.' >&2
  exit 1
fi

COMPOSE=(docker compose --env-file "$ENV_FILE" -f compose.production.yaml)
"${COMPOSE[@]}" config --quiet

if "${COMPOSE[@]}" ps --status running --services | grep -qx postgres; then
  ./scripts/backup-production.sh "$ENV_FILE"
fi

"${COMPOSE[@]}" up --build --detach --remove-orphans
node scripts/production-smoke.mjs \
  --base-url "http://127.0.0.1:${MCK_HEALTH_PORT}" \
  --expected-release "$MCK_RELEASE"

echo "Deployment completed: $MCK_RELEASE"
