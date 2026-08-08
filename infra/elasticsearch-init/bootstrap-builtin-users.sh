#!/bin/sh
# Bootstrap Elasticsearch built-in users that ES 9 does not auto-configure
# when `xpack.security.enabled=true`. The `elastic` user gets its password
# from the ELASTIC_PASSWORD env var at boot, but `kibana_system` is left
# reserved — without an explicit password, Kibana's first connection fails
# with `security_exception: unable to authenticate user [kibana_system]`.
#
# This script:
#   1. Waits for Elasticsearch to accept requests as the bootstrap user.
#   2. Sets the kibana_system password to match ELASTICSEARCH_PASSWORD.
#   3. Idempotent — repeats are safe (reset-password replaces the value).
#
# Exits 0 once the password is set so docker-compose moves on.

set -eu

ES_URL="${ELASTICSEARCH_URL:-http://elasticsearch:9200}"
ES_USER="${ELASTICSEARCH_USERNAME:-elastic}"
ES_PASS="${ELASTICSEARCH_PASSWORD:-password}"
KIBANA_SYS_PASS="${KIBANA_SYSTEM_PASSWORD:-${ES_PASS}}"

# 1. Wait for the cluster to become reachable (max ~60s)
attempt=0
until curl -fsS -u "${ES_USER}:${ES_PASS}" "${ES_URL}/_cluster/health" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "Elasticsearch did not become ready in time." >&2
    exit 1
  fi
  sleep 1
done

echo "Elasticsearch is reachable. Setting password for kibana_system user..."

# 2. Reset kibana_system password via the /_security/user API. The
#    bootstrap `elastic` user has the cluster privilege to do this.
#    Use jq to safely serialize the password into JSON.
PAYLOAD=$(jq -n --arg pw "$KIBANA_SYS_PASS" '{"password": $pw}')

http_code=$(curl -sS -o /tmp/kibana_pw.json -w "%{http_code}" \
  -X POST "${ES_URL}/_security/user/kibana_system/_password" \
  -u "${ES_USER}:${ES_PASS}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

if [ "$http_code" -ne 200 ]; then
  echo "Failed to set kibana_system password (HTTP ${http_code}):" >&2
  cat /tmp/kibana_pw.json >&2
  exit 1
fi

echo "kibana_system password set successfully."
exit 0