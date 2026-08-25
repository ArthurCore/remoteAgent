#!/usr/bin/env bash
set -euo pipefail

endpoints=(
  "http://127.0.0.1:3001/health/live|ok"
  "http://127.0.0.1:3001/health/ready|ready"
  "http://127.0.0.1:3002/health/live|ok"
  "http://127.0.0.1:3002/health/ready|ready"
  "http://127.0.0.1:3000/api/health|ok"
)

for entry in "${endpoints[@]}"; do
  url="${entry%%|*}"
  expected="${entry##*|}"
  node scripts/wait-for-url.mjs "$url" 30000
  node -e 'const [url, expected] = process.argv.slice(1); const response = await fetch(url); const body = await response.json(); if (response.status !== 200 || Object.keys(body).length !== 1 || body.status !== expected) { throw new Error(`unexpected response from ${url}: ${response.status} ${JSON.stringify(body)}`); }' "$url" "$expected"
done

for service in postgres rustfs api worker web; do
  container_id="$(scripts/compose.sh ps -q "$service")"
  if [[ -z "$container_id" ]]; then
    echo "missing running container for $service" >&2
    exit 1
  fi
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
  if [[ "$health" != "healthy" ]]; then
    echo "$service is not healthy: $health" >&2
    exit 1
  fi
done

storage_id="$(scripts/compose.sh ps -a -q storage-init)"
if [[ -z "$storage_id" ]]; then
  echo "missing storage-init container" >&2
  exit 1
fi
storage_state="$(docker inspect --format '{{.State.Status}} {{.State.ExitCode}}' "$storage_id")"
if [[ "$storage_state" != "exited 0" ]]; then
  echo "storage-init did not complete successfully: $storage_state" >&2
  exit 1
fi

api_id="$(scripts/compose.sh ps -q api)"
docker exec "$api_id" sh -c '
  set -eu
  for path in \
    /app/.git \
    /app/docs \
    /app/.env \
    /app/apps/api/src \
    /app/apps/api/test \
    /app/packages/chat-core \
    /app/packages/test-config \
    /app/packages/ui; do
    test ! -e "$path"
  done
  for tool in npm npx corepack pnpm pnpx yarn yarnpkg; do
    ! command -v "$tool" >/dev/null 2>&1
  done
  for file in \
    /app/apps/api/dist/main.js \
    /app/apps/worker/dist/main.js \
    /app/web-standalone/apps/web/server.js; do
    test -f "$file"
    test ! -w "$file"
  done
'

runtime_security="$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}|{{json .HostConfig.CapDrop}}|{{json .HostConfig.SecurityOpt}}' "$api_id")"
case "$runtime_security" in
  true*'"ALL"'*'"no-new-privileges:true"'*) ;;
  *)
    echo "application container security settings are incomplete" >&2
    exit 1
    ;;
esac

echo "container smoke passed: endpoints, service health, storage initialization, and runtime exclusions"
