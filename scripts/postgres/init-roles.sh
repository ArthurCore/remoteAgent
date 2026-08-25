#!/usr/bin/env bash
set -Eeuo pipefail

: "${POSTGRES_DB:?POSTGRES_DB must be set to a generated local database name}"
: "${POSTGRES_USER:?POSTGRES_USER must be set to a generated local owner role}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set to a generated local owner password}"
: "${MIGRATOR_ROLE:?MIGRATOR_ROLE must be set to a generated local migrator role}"
: "${MIGRATOR_PASSWORD:?MIGRATOR_PASSWORD must be set to a generated local migrator password}"
: "${RUNTIME_ROLE:?RUNTIME_ROLE must be set to a generated local runtime role}"
: "${RUNTIME_PASSWORD:?RUNTIME_PASSWORD must be set to a generated local runtime password}"

if [[ "$POSTGRES_USER" == "$MIGRATOR_ROLE" || "$POSTGRES_USER" == "$RUNTIME_ROLE" || "$MIGRATOR_ROLE" == "$RUNTIME_ROLE" ]]; then
  printf '%s\n' "database owner, migrator, and runtime roles must be distinct" >&2
  exit 1
fi

# This bootstrap is for ephemeral local/Testcontainers PostgreSQL initialization only.
# Passwords enter psql via \getenv, never command arguments or shell interpolation.
psql \
  --no-psqlrc \
  --quiet \
  --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" <<'SQL'
\set QUIET on
\set VERBOSITY terse
\getenv database_name POSTGRES_DB
\getenv owner_role POSTGRES_USER
\getenv owner_password POSTGRES_PASSWORD
\getenv migrator_role MIGRATOR_ROLE
\getenv migrator_password MIGRATOR_PASSWORD
\getenv runtime_role RUNTIME_ROLE
\getenv runtime_password RUNTIME_PASSWORD

SELECT format('CREATE ROLE %I', :'migrator_role')
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = :'migrator_role')
\gexec
SELECT format('CREATE ROLE %I', :'runtime_role')
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = :'runtime_role')
\gexec

-- The official image has already created the owner/bootstrap role and database.
ALTER ROLE :"owner_role" WITH LOGIN PASSWORD :'owner_password';
ALTER ROLE :"migrator_role" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD :'migrator_password';
ALTER ROLE :"runtime_role" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD :'runtime_password';
ALTER DATABASE :"database_name" OWNER TO :"owner_role";

-- Remove any stale privilege inheritance before reapplying the split.
SELECT format('REVOKE %I FROM %I', :'owner_role', :'migrator_role')
WHERE pg_has_role(:'migrator_role', :'owner_role', 'MEMBER')
\gexec
SELECT format('REVOKE %I FROM %I', :'owner_role', :'runtime_role')
WHERE pg_has_role(:'runtime_role', :'owner_role', 'MEMBER')
\gexec
SELECT format('REVOKE %I FROM %I', :'migrator_role', :'runtime_role')
WHERE pg_has_role(:'runtime_role', :'migrator_role', 'MEMBER')
\gexec

REVOKE ALL PRIVILEGES ON DATABASE :"database_name" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON DATABASE :"database_name" FROM :"migrator_role";
REVOKE ALL PRIVILEGES ON DATABASE :"database_name" FROM :"runtime_role";
GRANT CONNECT, CREATE ON DATABASE :"database_name" TO :"migrator_role";
GRANT CONNECT ON DATABASE :"database_name" TO :"runtime_role";
REVOKE CREATE, TEMPORARY ON DATABASE :"database_name" FROM :"runtime_role";

REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO :"migrator_role";
REVOKE ALL PRIVILEGES ON SCHEMA public FROM :"runtime_role";
GRANT USAGE, CREATE ON SCHEMA public TO :"migrator_role";
GRANT USAGE ON SCHEMA public TO :"runtime_role";

-- Re-runs converge existing public objects to the same runtime DML grant set.
REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM :"runtime_role";
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM :"runtime_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"runtime_role";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM :"runtime_role";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO :"runtime_role";

-- Routine EXECUTE is granted to PUBLIC by PostgreSQL's global default. A
-- per-schema REVOKE cannot override that global default, so revoke it globally
-- for every future routine created by the migrator.
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_role"
  REVOKE EXECUTE ON ROUTINES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_role" IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM :"runtime_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_role" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"runtime_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_role" IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM :"runtime_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_role" IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"runtime_role";

-- The migration ledger is outside public and is never part of runtime DML.
SELECT format('REVOKE ALL PRIVILEGES ON SCHEMA %I FROM %I', 'drizzle', :'runtime_role')
WHERE pg_catalog.to_regnamespace('drizzle') IS NOT NULL
\gexec
SELECT format(
  'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
  'drizzle',
  '__drizzle_migrations',
  :'runtime_role'
)
WHERE pg_catalog.to_regclass('drizzle.__drizzle_migrations') IS NOT NULL
\gexec
SQL
