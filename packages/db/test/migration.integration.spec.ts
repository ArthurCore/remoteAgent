import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as drizzleMigrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles, type MigrationConfig } from "drizzle-orm/migrator";
import type { PoolClient } from "pg";
import { getContainerRuntimeClient } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MIGRATIONS_SCHEMA, MIGRATIONS_TABLE, migrationConfig } from "../src/migration-config.js";
import {
  FOUNDATION_MIGRATION_HASH,
  MigrationIntegrityError,
  verifyMigrationIntegrity,
} from "../src/migration-integrity.js";
import { runMigrations, type MigrationClient } from "../src/migrate.js";
import {
  POSTGRES_TEST_IMAGE,
  startPostgresTestHarness,
  type PostgresTestHarness,
  type PostgresTestRole,
} from "./support/postgres.js";

const HARNESS_START_TIMEOUT_MILLISECONDS = 180_000;
const HARNESS_STOP_TIMEOUT_MILLISECONDS = 60_000;
const TEST_TIMEOUT_MILLISECONDS = 30_000;
const LOCK_OBSERVATION_TIMEOUT_MILLISECONDS = 10_000;
const FOUNDATION_CREATED_AT = 1_787_648_708_709;
const FAILING_MIGRATION_CREATED_AT = 1_900_000_000_000;
const FAILING_MIGRATION_FOLDER = join(import.meta.dirname, "fixtures", "failing-migration");
const EXPECTED_TABLE_NAMES = [
  "channel_membership_epochs",
  "channels",
  "principals",
  "tenants",
  "workspace_memberships",
  "workspaces",
] as const;
type LedgerRow = {
  id: number;
  created_at: string;
  hash: string;
};

type NameRow = {
  name: string;
};

type RegistrationRow = {
  ledger: string | null;
  probe: string | null;
};

type AdvisoryLockState = {
  holders: number;
  waiters: number;
};

let harness: PostgresTestHarness | undefined;

function activeHarness(): PostgresTestHarness {
  if (harness === undefined) throw new Error("PostgreSQL test harness is not running");
  return harness;
}

function migrationEnvironment(role: Extract<PostgresTestRole, "migrator" | "runtime">) {
  return {
    ...process.env,
    DATABASE_URL: "postgresql://ambient.invalid/ignored",
    PGDATABASE: "ambient_database_must_be_ignored",
    PGHOST: "ambient.invalid",
    PGPORT: "1",
    PGUSER: "ambient_user_must_be_ignored",
    MIGRATION_DATABASE_URL: activeHarness().connectionUrls[role],
    MIGRATION_TARGET_CLASS: "testcontainer",
  } as const;
}

async function ledgerRows(): Promise<LedgerRow[]> {
  const result = await activeHarness().query<LedgerRow>(
    "migrator",
    `SELECT id, created_at::text AS created_at, hash
       FROM ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}
      ORDER BY id ASC`,
  );
  return result.rows;
}

async function publicTableNames(): Promise<string[]> {
  const result = await activeHarness().query<NameRow>(
    "owner",
    `SELECT table_name AS name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC`,
  );
  return result.rows.map(({ name }) => name);
}

async function publicEnumNames(): Promise<string[]> {
  const result = await activeHarness().query<NameRow>(
    "owner",
    `SELECT type.typname AS name
       FROM pg_type AS type
       JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
      WHERE namespace.nspname = 'public'
        AND type.typtype = 'e'
      ORDER BY type.typname ASC`,
  );
  return result.rows.map(({ name }) => name);
}

async function captureFailure(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the database operation to fail");
}

function errorCode(error: unknown): string | undefined {
  let current = error;
  const visited = new Set<object>();

  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    if ("code" in current && typeof current.code === "string") return current.code;
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

function errorMessages(error: unknown): string {
  const messages: string[] = [];
  let current = error;
  const visited = new Set<object>();

  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    if ("message" in current && typeof current.message === "string") {
      messages.push(current.message);
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return messages.join("\n");
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function migrateWithDrizzle(client: MigrationClient, config: MigrationConfig): Promise<void> {
  const database = drizzle(client as unknown as PoolClient);
  await drizzleMigrate(database, config);
}

async function advisoryLockState(): Promise<AdvisoryLockState> {
  const result = await activeHarness().query<AdvisoryLockState>(
    "owner",
    `SELECT count(*) FILTER (WHERE lock.granted)::integer AS holders,
            count(*) FILTER (WHERE NOT lock.granted)::integer AS waiters
       FROM pg_locks AS lock
       JOIN pg_stat_activity AS activity ON activity.pid = lock.pid
      WHERE lock.locktype = 'advisory'
        AND activity.datname = $1
        AND activity.usename = $2`,
    [activeHarness().resources.database, activeHarness().resources.migratorRole],
  );
  const state = result.rows[0];
  if (state === undefined) throw new Error("PostgreSQL did not return advisory-lock state");
  return state;
}

async function waitForSerializedRunners(): Promise<AdvisoryLockState> {
  const deadline = Date.now() + LOCK_OBSERVATION_TIMEOUT_MILLISECONDS;
  let lastState: AdvisoryLockState = { holders: 0, waiters: 0 };

  while (Date.now() < deadline) {
    lastState = await advisoryLockState();
    if (lastState.holders === 1 && lastState.waiters === 1) return lastState;
    await delay(25);
  }

  throw new Error(
    `Concurrent migration runners did not serialize (holders=${lastState.holders}, waiters=${lastState.waiters})`,
  );
}

async function assertHarnessEvidence(): Promise<void> {
  const currentHarness = activeHarness();
  const evidenceText = await readFile(currentHarness.evidencePath, "utf8");
  const evidenceDocument = JSON.parse(evidenceText) as unknown;
  const evidence = currentHarness.evidence;

  expect(evidenceDocument).toEqual(evidence);
  expect(evidence).toMatchObject({
    version: 1,
    runId: currentHarness.resources.runId,
    resourceName: currentHarness.resources.containerName,
    image: POSTGRES_TEST_IMAGE,
    dockerImageReference: POSTGRES_TEST_IMAGE,
    database: currentHarness.resources.database,
    schemas: ["public", "drizzle"],
    migrationHash: FOUNDATION_MIGRATION_HASH,
    testSeed: currentHarness.resources.runId,
    labels: currentHarness.resources.labels,
  });
  expect(evidence.dockerImageId).toMatch(/^sha256:[0-9a-f]{64}$/u);
  expect(evidence.containerId).toMatch(/^[0-9a-f]{64}$/u);
  expect(evidence.containerName.replace(/^\//u, "")).toBe(currentHarness.resources.containerName);
  expect(evidence.connection.host.length).toBeGreaterThan(0);
  expect(evidence.connection.mappedPort).toBeGreaterThan(0);
  expect(evidence.connection.dockerHostIp.length).toBeGreaterThan(0);
  expect(Number.isNaN(Date.parse(evidence.createdAt))).toBe(false);

  const expectedRoles: Readonly<Record<PostgresTestRole, string>> = {
    owner: currentHarness.resources.ownerRole,
    migrator: currentHarness.resources.migratorRole,
    runtime: currentHarness.resources.runtimeRole,
  };
  for (const role of Object.keys(expectedRoles) as PostgresTestRole[]) {
    const connectionUrl = currentHarness.connectionUrls[role];
    const parsedUrl = new URL(connectionUrl);
    expect(parsedUrl.hostname).toBe(evidence.connection.host);
    expect(Number(parsedUrl.port)).toBe(evidence.connection.mappedPort);
    expect(parsedUrl.pathname).toBe(`/${currentHarness.resources.database}`);
    expect(parsedUrl.username).toBe(expectedRoles[role]);
    expect(evidenceText).not.toContain(connectionUrl);
    expect(evidenceText).not.toContain(parsedUrl.username);
    expect(evidenceText).not.toContain(parsedUrl.password);
  }
}

async function containerResidue(labelFilter: string): Promise<string[]> {
  const runtimeClient = await getContainerRuntimeClient();
  const containers = await runtimeClient.container.dockerode.listContainers({
    all: true,
    filters: { label: [labelFilter] },
  });
  return containers.map(({ Id }) => Id.slice(0, 12));
}

beforeAll(async () => {
  harness = await startPostgresTestHarness();
}, HARNESS_START_TIMEOUT_MILLISECONDS);

beforeEach(async () => {
  await activeHarness().resetDatabase();
});

afterAll(async () => {
  const currentHarness = harness;
  if (currentHarness === undefined) return;

  const failures: unknown[] = [];
  let runLabelFilter: string | undefined;
  try {
    const runLabel = Object.entries(currentHarness.resources.labels).find(
      ([, value]) => value === currentHarness.resources.runId,
    );
    if (runLabel === undefined) throw new Error("Harness evidence omitted its run label");
    runLabelFilter = `${runLabel[0]}=${runLabel[1]}`;
  } catch (error) {
    failures.push(error);
  } finally {
    try {
      await currentHarness.stop();
    } catch (error) {
      failures.push(error);
    }
  }

  if (runLabelFilter !== undefined) {
    try {
      expect(await containerResidue(runLabelFilter)).toEqual([]);
    } catch (error) {
      failures.push(error);
    }
  }

  try {
    await access(currentHarness.evidencePath);
    failures.push(new Error("Harness evidence directory remained after cleanup"));
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      failures.push(error);
    }
  }

  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, "Harness cleanup verification failed");
}, HARNESS_STOP_TIMEOUT_MILLISECONDS);

describe.sequential("AW-008D real PostgreSQL migrations", () => {
  it(
    "uses the mapped migrator URL for the first application and leaves the exact ledger row on a no-op rerun",
    async () => {
      await assertHarnessEvidence();
      const environment = migrationEnvironment("migrator");

      await runMigrations(environment);

      const firstLedger = await ledgerRows();
      expect(firstLedger).toEqual([
        {
          id: 1,
          created_at: String(FOUNDATION_CREATED_AT),
          hash: FOUNDATION_MIGRATION_HASH,
        },
      ]);
      expect(await publicTableNames()).toEqual([...EXPECTED_TABLE_NAMES]);

      await runMigrations(environment);

      expect(await ledgerRows()).toEqual(firstLedger);
      expect(await publicTableNames()).toEqual([...EXPECTED_TABLE_NAMES]);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "serializes two concurrent runners with one advisory-lock holder and one waiter",
    async () => {
      const firstRunnerEnteredMigration = deferred();
      const releaseFirstRunner = deferred();
      const environment = migrationEnvironment("migrator");
      const firstRunner = runMigrations(environment, {
        migrate: async (client, config) => {
          firstRunnerEnteredMigration.resolve();
          await releaseFirstRunner.promise;
          await migrateWithDrizzle(client, config);
        },
      });
      let secondRunner: Promise<void> | undefined;

      try {
        await Promise.race([
          firstRunnerEnteredMigration.promise,
          firstRunner.then(
            () => {
              throw new Error("First migration runner exited before reaching migration");
            },
            (error: unknown) => {
              throw error;
            },
          ),
          delay(LOCK_OBSERVATION_TIMEOUT_MILLISECONDS).then(() => {
            throw new Error("First migration runner did not acquire its advisory lock in time");
          }),
        ]);

        secondRunner = runMigrations(environment);
        expect(await waitForSerializedRunners()).toEqual({ holders: 1, waiters: 1 });

        releaseFirstRunner.resolve();
        await Promise.all([firstRunner, secondRunner]);
      } finally {
        releaseFirstRunner.resolve();
        await Promise.allSettled(
          secondRunner === undefined ? [firstRunner] : [firstRunner, secondRunner],
        );
      }

      expect(await ledgerRows()).toEqual([
        {
          id: 1,
          created_at: String(FOUNDATION_CREATED_AT),
          hash: FOUNDATION_MIGRATION_HASH,
        },
      ]);
      expect(await publicTableNames()).toEqual([...EXPECTED_TABLE_NAMES]);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "rejects runtime-role ledger bootstrap without leaving a ledger or application object",
    async () => {
      const failure = await captureFailure(() => runMigrations(migrationEnvironment("runtime")));

      expect(errorCode(failure)).toBe("42501");
      const registration = await activeHarness().query<RegistrationRow>(
        "owner",
        `SELECT to_regclass('${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}')::text AS ledger,
                to_regclass('public.aw008_partial_migration_probe')::text AS probe`,
      );
      expect(registration.rows).toEqual([{ ledger: null, probe: null }]);
      expect(await publicTableNames()).toEqual([]);
      expect(await publicEnumNames()).toEqual([]);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "rolls back the exact partially-valid failing migration and inserts no ledger row",
    async () => {
      const client = await activeHarness().connect("migrator");
      let failure: unknown;
      try {
        const database = drizzle(client);
        failure = await captureFailure(() =>
          drizzleMigrate(database, {
            migrationsFolder: FAILING_MIGRATION_FOLDER,
            migrationsSchema: MIGRATIONS_SCHEMA,
            migrationsTable: MIGRATIONS_TABLE,
          }),
        );
      } finally {
        client.release();
      }

      expect(errorCode(failure)).toBe("P0001");
      expect(errorMessages(failure)).toContain("AW-008 intentional migration failure");
      const registration = await activeHarness().query<RegistrationRow>(
        "owner",
        `SELECT to_regclass('${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}')::text AS ledger,
                to_regclass('public.aw008_partial_migration_probe')::text AS probe`,
      );
      expect(registration.rows).toEqual([
        { ledger: `${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`, probe: null },
      ]);
      const ledgerCount = await activeHarness().query<{ count: number }>(
        "owner",
        `SELECT count(*)::integer AS count FROM ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`,
      );
      expect(ledgerCount.rows).toEqual([{ count: 0 }]);
      expect(await publicTableNames()).toEqual([]);

      const localFixture = readMigrationFiles({
        migrationsFolder: FAILING_MIGRATION_FOLDER,
        migrationsSchema: MIGRATIONS_SCHEMA,
        migrationsTable: MIGRATIONS_TABLE,
      });
      expect(localFixture.map(({ folderMillis }) => folderMillis)).toEqual([
        FAILING_MIGRATION_CREATED_AT,
      ]);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "rejects an injected local hash drift against the real applied ledger",
    async () => {
      await runMigrations(migrationEnvironment("migrator"));
      const originalLedger = await ledgerRows();
      const changedLocalMigrations = readMigrationFiles(migrationConfig).map((migration) => ({
        ...migration,
        hash: "0".repeat(64),
      }));
      const client = await activeHarness().connect("migrator");
      let failure: unknown;
      try {
        failure = await captureFailure(() =>
          verifyMigrationIntegrity(
            client as unknown as Pick<MigrationClient, "query">,
            migrationConfig,
            {
              allowMissingLedger: false,
              requireAllApplied: true,
              readMigrations: () => changedLocalMigrations,
            },
          ),
        );
      } finally {
        client.release();
      }

      expect(failure).toBeInstanceOf(MigrationIntegrityError);
      expect(errorMessages(failure)).toContain(
        "Applied migration hash does not match the local file",
      );
      expect(await ledgerRows()).toEqual(originalLedger);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );
});
