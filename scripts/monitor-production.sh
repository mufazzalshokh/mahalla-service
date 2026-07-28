#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${1:-deploy/production.env}
test -f dist/config/validate-production.js
node dist/config/validate-production.js "$ENV_FILE" >/dev/null
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

READY_URL="http://127.0.0.1:${MCK_HEALTH_PORT}/ready"
if curl --fail --silent --show-error --max-time 10 "$READY_URL" | grep -q '"status":"ready"'; then
  exit 0
fi

TOKEN=$(tr -d '\r\n' < "$MCK_SECRET_DIR/staff_bot_token")
CHAT_ID=$(tr -d '\r\n' < "$MCK_SECRET_DIR/ops_alert_chat_id")
SAFE_HOST=$(hostname | tr -cd 'A-Za-z0-9._-')
MESSAGE="MCK ALERT: readiness failed on ${SAFE_HOST:-unknown}; release $MCK_RELEASE. Owner: $MCK_OPS_OWNER."

{
  printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$TOKEN"
  printf 'request = "POST"\n'
  printf 'data-urlencode = "chat_id=%s"\n' "$CHAT_ID"
  printf 'data-urlencode = "text=%s"\n' "$MESSAGE"
} | curl --fail --silent --show-error --config - >/dev/null

exit 1
