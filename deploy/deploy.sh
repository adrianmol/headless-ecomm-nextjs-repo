#!/usr/bin/env bash
#
# Runs ON the Hetzner host, shipped there by the Jenkinsfile.
#
# Kept as a file rather than an inline heredoc in the pipeline so it can be
# read, shellcheck'd and run by hand during an incident.
#
# Usage: deploy.sh <image-ref> <container-name> <env-file> <host-port>
set -euo pipefail

IMAGE="${1:?image ref required}"
NAME="${2:?container name required}"
ENV_FILE="${3:?env file path required}"
PORT="${4:?host port required}"

HEALTH_URL="http://127.0.0.1:${PORT}/"
HEALTH_RETRIES=30
HEALTH_INTERVAL=2

log() { printf '==> %s\n' "$*"; }

if [ ! -r "$ENV_FILE" ]; then
  echo "FATAL: $ENV_FILE missing or unreadable" >&2
  exit 1
fi

# Remembered before we touch anything, so a failed release can go straight back.
PREVIOUS_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$NAME" 2>/dev/null || true)"

log "pulling $IMAGE"
docker pull --quiet "$IMAGE"

start_container() {
  local image="$1"
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  # Bound to loopback on purpose: TLS is terminated by the reverse proxy on
  # this host. The app must never be reachable directly from the internet —
  # the session cookie is Secure-only and the app trusts X-Forwarded-*.
  docker run --detach \
    --name "$NAME" \
    --restart unless-stopped \
    --env-file "$ENV_FILE" \
    --publish "127.0.0.1:${PORT}:3000" \
    --log-opt max-size=10m --log-opt max-file=3 \
    "$image" >/dev/null
}

wait_healthy() {
  local i
  for ((i = 1; i <= HEALTH_RETRIES; i++)); do
    if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
      log "healthy after ${i} attempt(s)"
      return 0
    fi
    # A container that exited will never become healthy; fail fast.
    if [ "$(docker inspect --format '{{.State.Running}}' "$NAME" 2>/dev/null || echo false)" != "true" ]; then
      log "container is not running"
      return 1
    fi
    sleep "$HEALTH_INTERVAL"
  done
  return 1
}

log "starting $NAME from $IMAGE"
start_container "$IMAGE"

if wait_healthy; then
  log "deploy ok"
  # Keep the previous image so the pipeline's rollback parameter has something
  # local to fall back to; only untagged layers are reclaimed.
  docker image prune --force >/dev/null 2>&1 || true
  exit 0
fi

log "HEALTH CHECK FAILED — last 50 log lines:"
docker logs --tail 50 "$NAME" 2>&1 || true

if [ -n "$PREVIOUS_IMAGE" ] && [ "$PREVIOUS_IMAGE" != "$IMAGE" ]; then
  log "rolling back to $PREVIOUS_IMAGE"
  start_container "$PREVIOUS_IMAGE"
  if wait_healthy; then
    log "rollback succeeded — the new image is bad, the site is up on the old one"
  else
    log "ROLLBACK ALSO FAILED — site is down"
  fi
else
  log "no previous image to roll back to"
fi

exit 1
