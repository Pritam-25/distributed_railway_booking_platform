# One-shot init container that sets built-in Elasticsearch user passwords
# that are not auto-configured when xpack.security.enabled=true.
#
# Mirrors the pattern used by infra/kafka-init for the same reason: ES 9
# leaves `kibana_system` in a reserved state, so any service that wants to
# authenticate as that user (Kibana, fleet, etc.) must have its password
# bootstrapped before it starts.
#
# The container exits 0 after the password is set, and `restart: "no"`
# ensures docker-compose does not retry indefinitely.

FROM alpine:3.20

RUN addgroup -S init \
 && adduser -S init -G init \
 && apk add --no-cache bash curl jq

COPY --chown=root:root --chmod=0555 bootstrap-builtin-users.sh /usr/local/bin/bootstrap-builtin-users.sh

# Drop privileges before the entrypoint runs.
USER init

# Ensure the temp file the script writes to is under a writable path.
WORKDIR /tmp

CMD ["/usr/local/bin/bootstrap-builtin-users.sh"]