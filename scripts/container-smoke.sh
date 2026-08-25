#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

expected_services="api db-migrate postgres rustfs storage-init web worker"
if ! scripts/compose.sh config --quiet >/dev/null 2>&1; then
  fail "compose configuration validation failed"
fi
actual_services="$(scripts/compose.sh config --services 2>/dev/null | LC_ALL=C sort | paste -sd ' ' -)"
if [[ "$actual_services" != "$expected_services" ]]; then
  fail "compose service topology is not the required exact seven"
fi

require_container_id() {
  local service="$1"
  local container_id
  container_id="$(scripts/compose.sh ps -a -q "$service" 2>/dev/null)"
  if [[ -z "$container_id" || "$container_id" == *$'\n'* ]]; then
    fail "missing unique container for $service"
  fi
  printf '%s' "$container_id"
}

postgres_id="$(require_container_id postgres)"
rustfs_id="$(require_container_id rustfs)"
storage_id="$(require_container_id storage-init)"
migrate_id="$(require_container_id db-migrate)"
api_id="$(require_container_id api)"
worker_id="$(require_container_id worker)"
web_id="$(require_container_id web)"

for service in postgres rustfs api worker web; do
  container_id="$(require_container_id "$service")"
  state="$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$container_id" 2>/dev/null)"
  if [[ "$state" != "running|healthy" ]]; then
    fail "$service is not running and healthy"
  fi
done

for service in storage-init db-migrate; do
  container_id="$(require_container_id "$service")"
  state="$(docker inspect --format '{{.State.Status}}|{{.State.ExitCode}}|{{.RestartCount}}|{{.HostConfig.RestartPolicy.Name}}' "$container_id" 2>/dev/null)"
  if [[ "$state" != "exited|0|0|no" ]]; then
    fail "$service is not a successful one-shot container"
  fi
done

published_port() {
  local service="$1"
  local container_port="$2"
  local address
  local port
  if ! address="$(scripts/compose.sh port "$service" "$container_port" 2>/dev/null)"; then
    fail "published port lookup failed for $service"
  fi
  port="${address##*:}"
  case "$port" in
    "" | *[!0-9]*) fail "published port lookup returned an invalid result for $service" ;;
  esac
  printf '%s' "$port"
}

assert_endpoint() {
  local service="$1"
  local container_port="$2"
  local path="$3"
  local expected="$4"
  local port
  port="$(published_port "$service" "$container_port")"
  if ! node -e '
const [port, path, expected] = process.argv.slice(1);
const deadline = Date.now() + 30_000;
(async () => {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        signal: AbortSignal.timeout(2_000),
      });
      const body = await response.json();
      if (
        response.status === 200 &&
        Object.keys(body).length === 1 &&
        body.status === expected
      ) {
        process.exit(0);
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  process.exit(1);
})().catch(() => process.exit(1));
' "$port" "$path" "$expected" >/dev/null 2>&1; then
    fail "$service endpoint contract failed"
  fi
}

assert_endpoint api 3001 /health/live ok
assert_endpoint api 3001 /health/ready ready
assert_endpoint worker 3002 /health/live ok
assert_endpoint worker 3002 /health/ready ready
assert_endpoint web 3000 /api/health ok

validate_environment() {
  local service="$1"
  local container_id="$2"
  local policy="$3"

  if ! {
    docker inspect --format '{{json .Config.Env}}' "$container_id" 2>/dev/null
    docker inspect --format '{{json .Config.Env}}' "$postgres_id" 2>/dev/null
  } | ENV_POLICY="$policy" node -e '
const fs = require("node:fs");

function stop() {
  process.exit(1);
}

try {
  const documents = fs.readFileSync(0, "utf8").trimEnd().split("\n");
  if (documents.length !== 2) stop();
  const parseEnvironment = (serialized) => {
    const entries = JSON.parse(serialized);
    const parsed = new Map();
    for (const entry of entries) {
      const separator = entry.indexOf("=");
      if (separator <= 0) stop();
      const key = entry.slice(0, separator);
      if (parsed.has(key)) stop();
      parsed.set(key, entry.slice(separator + 1));
    }
    return parsed;
  };
  const values = parseEnvironment(documents[0]);
  const postgresValues = parseEnvironment(documents[1]);

  const controlled = new Set([
    "APP_ENV",
    "APP_VERSION",
    "API_PORT",
    "WORKER_HEALTH_PORT",
    "WEB_PORT",
    "PUBLIC_BASE_URL",
    "DATABASE_URL",
    "MIGRATION_DATABASE_URL",
    "MIGRATION_TARGET_CLASS",
    "HOSTNAME",
    "PORT",
    "POSTGRES_DB",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "MIGRATOR_ROLE",
    "MIGRATOR_PASSWORD",
    "RUNTIME_ROLE",
    "RUNTIME_PASSWORD",
  ]);
  const applicationKeys = [...values.keys()]
    .filter(
      (key) =>
        controlled.has(key) ||
        key.startsWith("S3_") ||
        key.startsWith("RUSTFS_"),
    )
    .sort();
  const baseKeys = [
    "APP_ENV",
    "APP_VERSION",
    "API_PORT",
    "WORKER_HEALTH_PORT",
    "WEB_PORT",
    "PUBLIC_BASE_URL",
  ];
  const storageKeys = [
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "S3_FORCE_PATH_STYLE",
    "S3_QUARANTINE_BUCKET",
    "S3_CLEAN_BUCKET",
  ];
  const runtimeKeys = [...baseKeys, ...storageKeys, "DATABASE_URL"].sort();
  const expectedByPolicy = {
    migrate: ["MIGRATION_DATABASE_URL", "MIGRATION_TARGET_CLASS"].sort(),
    runtime: runtimeKeys,
    storage: runtimeKeys,
    web: ["APP_ENV", "APP_VERSION", "PUBLIC_BASE_URL", "HOSTNAME", "PORT"].sort(),
  };
  const expectedKeys = expectedByPolicy[process.env.ENV_POLICY];
  if (
    expectedKeys === undefined ||
    applicationKeys.length !== expectedKeys.length ||
    applicationKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    stop();
  }

  const database = postgresValues.get("POSTGRES_DB");
  const ownerRole = postgresValues.get("POSTGRES_USER");
  const ownerPassword = postgresValues.get("POSTGRES_PASSWORD");
  const migratorRole = postgresValues.get("MIGRATOR_ROLE");
  const migratorPassword = postgresValues.get("MIGRATOR_PASSWORD");
  const runtimeRole = postgresValues.get("RUNTIME_ROLE");
  const runtimePassword = postgresValues.get("RUNTIME_PASSWORD");

  const identifiers = [database, ownerRole, migratorRole, runtimeRole];
  const credentials = [ownerPassword, migratorPassword, runtimePassword];
  if (
    identifiers.some((value) => typeof value !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(value)) ||
    credentials.some((value) => typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) ||
    new Set([ownerRole, migratorRole, runtimeRole]).size !== 3
  ) {
    stop();
  }

  const matchesDatabaseUrl = (value, role, password) => {
    const url = new URL(value);
    return (
      url.protocol === "postgresql:" &&
      url.hostname === "postgres" &&
      url.port === "5432" &&
      url.pathname === `/${database}` &&
      url.username === role &&
      url.password === password &&
      url.search === "" &&
      url.hash === ""
    );
  };
  const containsAny = (needles) =>
    [...values.values()].some((value) =>
      needles.some((needle) => needle.length > 0 && value.includes(needle)),
    );

  switch (process.env.ENV_POLICY) {
    case "migrate":
      if (
        values.get("MIGRATION_TARGET_CLASS") !== "local-compose" ||
        !matchesDatabaseUrl(
          values.get("MIGRATION_DATABASE_URL"),
          migratorRole,
          migratorPassword,
        ) ||
        containsAny([ownerRole, ownerPassword, runtimeRole, runtimePassword])
      ) {
        stop();
      }
      break;
    case "runtime":
      if (
        !matchesDatabaseUrl(values.get("DATABASE_URL"), runtimeRole, runtimePassword) ||
        containsAny([ownerRole, ownerPassword, migratorRole, migratorPassword])
      ) {
        stop();
      }
      break;
    case "storage":
      if (
        values.get("DATABASE_URL") !== "postgresql://unused.invalid/unused" ||
        containsAny([
          ownerRole,
          ownerPassword,
          migratorRole,
          migratorPassword,
          runtimeRole,
          runtimePassword,
        ])
      ) {
        stop();
      }
      break;
    case "web":
      break;
    default:
      stop();
  }
} catch {
  stop();
}
' >/dev/null 2>&1; then
    fail "$service environment segregation failed"
  fi
}

validate_environment db-migrate "$migrate_id" migrate
validate_environment api "$api_id" runtime
validate_environment worker "$worker_id" runtime
validate_environment storage-init "$storage_id" storage
validate_environment web "$web_id" web

assert_app_security() {
  local service="$1"
  local container_id="$2"
  local settings
  local user
  local readonly_root
  local cap_drop
  local security_options
  local tmpfs
  local privileged

  settings="$(docker inspect --format '{{.Config.User}}|{{.HostConfig.ReadonlyRootfs}}|{{json .HostConfig.CapDrop}}|{{json .HostConfig.SecurityOpt}}|{{json .HostConfig.Tmpfs}}|{{.HostConfig.Privileged}}' "$container_id" 2>/dev/null)"
  IFS='|' read -r user readonly_root cap_drop security_options tmpfs privileged <<<"$settings"
  if [[ "$user" != "10001:10001" || "$readonly_root" != "true" || "$privileged" != "false" ]]; then
    fail "$service runtime identity or root-filesystem security failed"
  fi
  case "$cap_drop" in
    *'"ALL"'*) ;;
    *) fail "$service capability drop is incomplete" ;;
  esac
  case "$security_options" in
    *'"no-new-privileges:true"'*) ;;
    *) fail "$service privilege-escalation protection is incomplete" ;;
  esac
  case "$tmpfs" in
    *'"/tmp"'*noexec*nosuid*nodev*) ;;
    *) fail "$service temporary filesystem security is incomplete" ;;
  esac
}

for service in storage-init db-migrate api worker web; do
  assert_app_security "$service" "$(require_container_id "$service")"
done

assert_stateful_security() {
  local service="$1"
  local container_id="$2"
  local expected_user="$3"
  local settings
  local user
  local cap_drop
  local security_options
  local privileged

  settings="$(docker inspect --format '{{.Config.User}}|{{json .HostConfig.CapDrop}}|{{json .HostConfig.SecurityOpt}}|{{.HostConfig.Privileged}}' "$container_id" 2>/dev/null)"
  IFS='|' read -r user cap_drop security_options privileged <<<"$settings"
  if [[ "$user" != "$expected_user" || "$privileged" != "false" ]]; then
    fail "$service stateful identity or privileged-mode security failed"
  fi
  case "$cap_drop" in
    *'"ALL"'*) ;;
    *) fail "$service stateful capability drop is incomplete" ;;
  esac
  case "$security_options" in
    *'"no-new-privileges:true"'*) ;;
    *) fail "$service stateful privilege-escalation protection is incomplete" ;;
  esac
}

assert_stateful_security postgres "$postgres_id" postgres
assert_stateful_security rustfs "$rustfs_id" rustfs

api_image="$(docker inspect --format '{{.Image}}' "$api_id" 2>/dev/null)"
for container_id in "$storage_id" "$migrate_id" "$worker_id" "$web_id"; do
  if [[ "$(docker inspect --format '{{.Image}}' "$container_id" 2>/dev/null)" != "$api_image" ]]; then
    fail "application roles are not using one immutable image"
  fi
done

if ! docker exec "$api_id" sh -ceu '
  for path in \
    /app/.git \
    /app/.github \
    /app/docs \
    /app/.env \
    /app/apps/api/src \
    /app/apps/api/test \
    /app/apps/worker/src \
    /app/apps/worker/test \
    /app/packages/db/src \
    /app/packages/db/test \
    /app/packages/db/drizzle.config.ts \
    /app/packages/chat-core \
    /app/packages/test-config \
    /app/packages/ui; do
    test ! -e "$path"
  done

  for tool in npm npx corepack pnpm pnpx yarn yarnpkg tsc tsx drizzle-kit vitest eslint turbo; do
    ! command -v "$tool" >/dev/null 2>&1
  done
  for toolchain in typescript tsx drizzle-kit vitest eslint turbo; do
    test -z "$(find /app/node_modules/.pnpm -maxdepth 1 -type d -name "${toolchain}@*" -print -quit)"
  done
  test ! -e /usr/local/lib/node_modules/npm
  test ! -e /usr/local/lib/node_modules/corepack
  test ! -e /opt/yarn-v1.22.22

  for file in \
    /app/apps/api/dist/main.js \
    /app/apps/worker/dist/main.js \
    /app/packages/db/dist/migrate.js \
    /app/packages/db/dist/migration-config.js \
    /app/packages/db/dist/migration-integrity.js \
    /app/packages/db/drizzle/0000_aw008_foundation.sql \
    /app/packages/db/drizzle/meta/_journal.json \
    /app/packages/db/drizzle/meta/0000_snapshot.json \
    /app/web-standalone/apps/web/server.js; do
    test -f "$file"
    test ! -w "$file"
    test "$(stat -c "%u:%g" "$file")" = "0:0"
  done
  test "$(find /app/packages/db/drizzle -type f -print | wc -l)" -eq 3
' >/dev/null 2>&1; then
  fail "runtime artifact, ownership, or exclusion verification failed"
fi

postgres_psql() {
  local access_role="$1"
  docker exec -i "$postgres_id" bash -ceu '
    case "$1" in
      owner)
        role="$POSTGRES_USER"
        password="$POSTGRES_PASSWORD"
        ;;
      migrator)
        role="$MIGRATOR_ROLE"
        password="$MIGRATOR_PASSWORD"
        ;;
      runtime)
        role="$RUNTIME_ROLE"
        password="$RUNTIME_PASSWORD"
        ;;
      *)
        exit 2
        ;;
    esac
    export PGPASSWORD="$password"
    exec psql \
      --host=127.0.0.1 \
      --no-psqlrc \
      --quiet \
      --set=ON_ERROR_STOP=1 \
      --username="$role" \
      --dbname="$POSTGRES_DB"
  ' bash "$access_role"
}

if ! postgres_psql owner >/dev/null 2>&1 <<'SQL'
\set QUIET on
\set VERBOSITY terse
\getenv owner_role POSTGRES_USER
\getenv migrator_role MIGRATOR_ROLE
\getenv runtime_role RUNTIME_ROLE

SELECT (
  (SELECT count(*) = 1
          AND min(hash) = '645229b04fc4eddd44d47301d47f1efbd394daa6c97852c3ea4a3cbb26df23c2'
          AND max(hash) = '645229b04fc4eddd44d47301d47f1efbd394daa6c97852c3ea4a3cbb26df23c2'
     FROM drizzle.__drizzle_migrations)
  AND
  (SELECT array_agg(tablename::text ORDER BY tablename) = ARRAY[
            'channel_membership_epochs',
            'channels',
            'principals',
            'tenants',
            'workspace_memberships',
            'workspaces'
          ]::text[]
     FROM pg_catalog.pg_tables
    WHERE schemaname = 'public')
  AND
  (SELECT count(*) = 2
          AND bool_and(
            rolcanlogin
            AND NOT rolsuper
            AND NOT rolcreatedb
            AND NOT rolcreaterole
            AND NOT rolinherit
            AND NOT rolreplication
            AND NOT rolbypassrls
          )
     FROM pg_catalog.pg_roles
    WHERE rolname IN (:'migrator_role', :'runtime_role'))
  AND NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_auth_members AS membership
      JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
     WHERE member_role.rolname IN (:'migrator_role', :'runtime_role')
  )
  AND
  (SELECT pg_catalog.pg_get_userbyid(datdba) = :'owner_role'
     FROM pg_catalog.pg_database
    WHERE datname = current_database())
  AND
  (SELECT pg_catalog.pg_get_userbyid(nspowner) = :'migrator_role'
     FROM pg_catalog.pg_namespace
    WHERE nspname = 'public')
  AND
  (SELECT count(*) = 6 AND bool_and(tableowner = :'migrator_role')
     FROM pg_catalog.pg_tables
    WHERE schemaname = 'public')
  AND
  (SELECT pg_catalog.pg_get_userbyid(nspowner) = :'migrator_role'
     FROM pg_catalog.pg_namespace
    WHERE nspname = 'drizzle')
  AND
  (SELECT pg_catalog.pg_get_userbyid(class.relowner) = :'migrator_role'
     FROM pg_catalog.pg_class AS class
     JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'drizzle'
      AND class.relname = '__drizzle_migrations')
  AND pg_catalog.has_database_privilege(:'migrator_role', current_database(), 'CONNECT')
  AND pg_catalog.has_database_privilege(:'migrator_role', current_database(), 'CREATE')
  AND pg_catalog.has_schema_privilege(:'migrator_role', 'public', 'USAGE')
  AND pg_catalog.has_schema_privilege(:'migrator_role', 'public', 'CREATE')
  AND pg_catalog.has_database_privilege(:'runtime_role', current_database(), 'CONNECT')
  AND NOT pg_catalog.has_database_privilege(:'runtime_role', current_database(), 'CREATE')
  AND NOT pg_catalog.has_database_privilege(:'runtime_role', current_database(), 'TEMPORARY')
  AND pg_catalog.has_schema_privilege(:'runtime_role', 'public', 'USAGE')
  AND NOT pg_catalog.has_schema_privilege(:'runtime_role', 'public', 'CREATE')
  AND
  (SELECT bool_and(
            pg_catalog.has_table_privilege(
              :'runtime_role',
              format('%I.%I', 'public', table_name),
              privilege_name
            )
          )
     FROM unnest(ARRAY[
            'channel_membership_epochs',
            'channels',
            'principals',
            'tenants',
            'workspace_memberships',
            'workspaces'
          ]::text[]) AS tables(table_name)
    CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[])
      AS privileges(privilege_name))
  AND NOT pg_catalog.has_schema_privilege(:'runtime_role', 'drizzle', 'USAGE')
  AND NOT pg_catalog.has_table_privilege(
    :'runtime_role',
    'drizzle.__drizzle_migrations',
    'SELECT'
  )
  AND NOT pg_catalog.has_table_privilege(
    :'runtime_role',
    'drizzle.__drizzle_migrations',
    'INSERT'
  )
  AND NOT pg_catalog.has_table_privilege(
    :'runtime_role',
    'drizzle.__drizzle_migrations',
    'UPDATE'
  )
  AND NOT pg_catalog.has_table_privilege(
    :'runtime_role',
    'drizzle.__drizzle_migrations',
    'DELETE'
  )
) AS catalog_ok
\gset
\if :catalog_ok
\else
\quit 1
\endif
SQL
then
  fail "database ledger, table, role, or privilege catalog verification failed"
fi

if ! postgres_psql runtime >/dev/null 2>&1 <<'SQL'
\set QUIET on
\set VERBOSITY terse
BEGIN;
INSERT INTO public.tenants (tenant_id) VALUES ('aw008e_smoke_runtime');
INSERT INTO public.workspaces (tenant_id, workspace_id)
VALUES ('aw008e_smoke_runtime', 'workspace');
INSERT INTO public.principals (tenant_id, principal_id, principal_kind)
VALUES ('aw008e_smoke_runtime', 'principal', 'human');
INSERT INTO public.workspace_memberships (tenant_id, workspace_id, principal_id, role)
VALUES ('aw008e_smoke_runtime', 'workspace', 'principal', 'member');
INSERT INTO public.channels (tenant_id, workspace_id, channel_id, kind)
VALUES ('aw008e_smoke_runtime', 'workspace', 'channel', 'public');
INSERT INTO public.channel_membership_epochs (
  tenant_id,
  channel_id,
  principal_id,
  membership_epoch,
  history_mode,
  joined_event_seq
) VALUES (
  'aw008e_smoke_runtime',
  'channel',
  'principal',
  'epoch',
  'full',
  1
);

SELECT (
  (SELECT count(*) = 1 FROM public.tenants WHERE tenant_id = 'aw008e_smoke_runtime')
  AND (SELECT count(*) = 1 FROM public.workspaces WHERE tenant_id = 'aw008e_smoke_runtime')
  AND (SELECT count(*) = 1 FROM public.principals WHERE tenant_id = 'aw008e_smoke_runtime')
  AND (SELECT count(*) = 1 FROM public.workspace_memberships WHERE tenant_id = 'aw008e_smoke_runtime')
  AND (SELECT count(*) = 1 FROM public.channels WHERE tenant_id = 'aw008e_smoke_runtime')
  AND (SELECT count(*) = 1 FROM public.channel_membership_epochs WHERE tenant_id = 'aw008e_smoke_runtime')
) AS select_ok
\gset
\if :select_ok
\else
\quit 1
\endif

UPDATE public.tenants SET version = version + 1 WHERE tenant_id = 'aw008e_smoke_runtime';
UPDATE public.workspaces SET version = version + 1 WHERE tenant_id = 'aw008e_smoke_runtime';
UPDATE public.principals SET version = version + 1 WHERE tenant_id = 'aw008e_smoke_runtime';
UPDATE public.workspace_memberships SET version = version + 1 WHERE tenant_id = 'aw008e_smoke_runtime';
UPDATE public.channels SET version = version + 1 WHERE tenant_id = 'aw008e_smoke_runtime';
UPDATE public.channel_membership_epochs SET version = version + 1 WHERE tenant_id = 'aw008e_smoke_runtime';

SELECT (
  (SELECT bool_and(version = 2) FROM public.tenants WHERE tenant_id = 'aw008e_smoke_runtime')
  AND (SELECT bool_and(version = 2) FROM public.workspaces WHERE tenant_id = 'aw008e_smoke_runtime')
  AND (SELECT bool_and(version = 2) FROM public.principals WHERE tenant_id = 'aw008e_smoke_runtime')
  AND (SELECT bool_and(version = 2) FROM public.workspace_memberships WHERE tenant_id = 'aw008e_smoke_runtime')
  AND (SELECT bool_and(version = 2) FROM public.channels WHERE tenant_id = 'aw008e_smoke_runtime')
  AND (SELECT bool_and(version = 2) FROM public.channel_membership_epochs WHERE tenant_id = 'aw008e_smoke_runtime')
) AS update_ok
\gset
\if :update_ok
\else
\quit 1
\endif

DELETE FROM public.channel_membership_epochs WHERE tenant_id = 'aw008e_smoke_runtime';
DELETE FROM public.workspace_memberships WHERE tenant_id = 'aw008e_smoke_runtime';
DELETE FROM public.channels WHERE tenant_id = 'aw008e_smoke_runtime';
DELETE FROM public.principals WHERE tenant_id = 'aw008e_smoke_runtime';
DELETE FROM public.workspaces WHERE tenant_id = 'aw008e_smoke_runtime';
DELETE FROM public.tenants WHERE tenant_id = 'aw008e_smoke_runtime';

SELECT NOT EXISTS (
  SELECT 1 FROM public.tenants WHERE tenant_id = 'aw008e_smoke_runtime'
) AS delete_ok
\gset
\if :delete_ok
\else
\quit 1
\endif
ROLLBACK;
SQL
then
  fail "runtime CRUD verification failed"
fi

ddl_denied=true
if postgres_psql runtime >/dev/null 2>&1 <<'SQL'
\set QUIET on
\set VERBOSITY terse
BEGIN;
CREATE TABLE public.aw008e_runtime_ddl_forbidden (id bigint PRIMARY KEY);
ROLLBACK;
SQL
then
  ddl_denied=false
fi

if ! postgres_psql owner >/dev/null 2>&1 <<'SQL'
\set QUIET on
SELECT pg_catalog.to_regclass('public.aw008e_runtime_ddl_forbidden') IS NULL AS no_residue
\gset
\if :no_residue
\else
DROP TABLE IF EXISTS public.aw008e_runtime_ddl_forbidden;
\quit 1
\endif
SQL
then
  fail "runtime DDL probe residue verification failed"
fi
if [[ "$ddl_denied" != "true" ]]; then
  fail "runtime DDL was not denied"
fi

printf '%s\n' "container smoke passed: exact services and states, endpoints, migration integrity, role separation, runtime denial, and hardened image"
