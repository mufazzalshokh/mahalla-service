#!/usr/bin/env bash
set -euo pipefail
umask 077

ENV_FILE=${1:-deploy/production.env}
test -f dist/config/validate-production.js
node dist/config/validate-production.js "$ENV_FILE"
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

command -v docker >/dev/null
command -v gpg >/dev/null
command -v sha256sum >/dev/null
mkdir -p -- "$MCK_BACKUP_DIR"

COMPOSE=(docker compose --env-file "$ENV_FILE" -f compose.production.yaml)
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
RELEASE_PREFIX=${MCK_RELEASE:0:12}
ARTIFACT="$MCK_BACKUP_DIR/mck_${STAMP}_${RELEASE_PREFIX}.dump.gpg"
PARTIAL="$ARTIFACT.partial"
PASSPHRASE_FILE="$MCK_SECRET_DIR/backup_passphrase"

cleanup() {
  rm -f -- "$PARTIAL"
}
trap cleanup EXIT

"${COMPOSE[@]}" exec -T postgres sh -c \
  'pg_dump --format=custom --no-owner --no-acl --username="$POSTGRES_USER" "$POSTGRES_DB"' |
  gpg --batch --yes --pinentry-mode loopback --symmetric --cipher-algo AES256 \
    --passphrase-file "$PASSPHRASE_FILE" --output "$PARTIAL"

test -s "$PARTIAL"
mv -- "$PARTIAL" "$ARTIFACT"
sha256sum "$ARTIFACT" > "$ARTIFACT.sha256"
trap - EXIT

echo "Encrypted backup created: $ARTIFACT"
echo "Required next action: copy artifact and checksum to $MCK_BACKUP_DESTINATION, then verify access."
