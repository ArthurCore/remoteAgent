import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as drizzleMigrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles, type MigrationConfig } from "drizzle-orm/migrator";
import type { PoolClient, QueryResultRow } from "pg";
import { getContainerRuntimeClient } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MIGRATIONS_SCHEMA, MIGRATIONS_TABLE, migrationConfig } from "../src/migration-config.js";
import {
  CHANNEL_STREAM_MIGRATION_HASH,
  FOUNDATION_MIGRATION_HASH,
  MigrationIntegrityError,
  verifyMigrationIntegrity,
} from "../src/migration-integrity.js";
import {
  MIGRATION_ADVISORY_LOCK_ID,
  runMigrations,
  type MigrationClient,
  type MigrationIntegrityPhase,
} from "../src/migrate.js";
import {
  POSTGRES_TEST_IMAGE,
  startPostgresTestHarness,
  type PostgresTestHarness,
} from "./support/postgres.js";

const HARNESS_START_TIMEOUT_MILLISECONDS = 180_000;
const HARNESS_STOP_TIMEOUT_MILLISECONDS = 60_000;
const TEST_TIMEOUT_MILLISECONDS = 30_000;
const LOCK_OBSERVATION_TIMEOUT_MILLISECONDS = 10_000;
const FOUNDATION_CREATED_AT = 1_787_648_708_709;
const CHANNEL_STREAM_CREATED_AT = 1_787_695_124_181;
const EXPECTED_INTEGRATION_FILES = [
  "test/channel-stream-migration.integration.spec.ts",
  "test/constraints.integration.spec.ts",
  "test/migration.integration.spec.ts",
  "test/roles.integration.spec.ts",
] as const;
const ALL_EVENT_TYPES = [
  "message.created",
  "message.edited",
  "message.deleted",
  "reaction.changed",
  "channel.member_joined",
  "channel.member_left",
  "channel.member_revoked",
] as const;
const NON_JOIN_EVENT_TYPES = ALL_EVENT_TYPES.filter(
  (eventType) => eventType !== "channel.member_joined",
);
const NON_EXIT_EVENT_TYPES = ALL_EVENT_TYPES.filter(
  (eventType) => eventType !== "channel.member_left" && eventType !== "channel.member_revoked",
);
const FIXTURE = {
  tenantA: "tenant_aw010a_s5_a",
  tenantB: "tenant_aw010a_s5_b",
  workspaceA: "workspace_aw010a_s5_a",
  workspaceB: "workspace_aw010a_s5_b",
  principalA: "principal_aw010a_s5_a",
  principalB: "principal_aw010a_s5_b",
  channelA: "channel_aw010a_s5_a",
  channelAOther: "channel_aw010a_s5_a_other",
  channelB: "channel_aw010a_s5_b",
} as const;

type EventType = (typeof ALL_EVENT_TYPES)[number];
type PgRole = "migrator" | "runtime";

interface LedgerRow extends QueryResultRow {
  id: number;
  created_at: string;
  hash: string;
}

interface CountRow extends QueryResultRow {
  count: number;
}

interface SequenceRow extends QueryResultRow {
  tenant_id: string;
  channel_id: string;
  last_event_seq: string;
}

interface RelationLockEvidence extends QueryResultRow {
  relation_name: string;
  mode: string;
  granted: false;
  blocking_pids: number[];
}

interface MigrationLockSequenceEvidence extends QueryResultRow {
  migrator_pid: number;
  channels_relation_name: "channels";
  channels_mode: "AccessExclusiveLock";
  channels_granted: true;
  membership_relation_name: "channel_membership_epochs";
  membership_mode: "AccessExclusiveLock";
  membership_granted: false;
  blocking_pids: number[];
}

interface AdvisoryLockEvidence extends QueryResultRow {
  holders: number;
  waiters: number;
}

interface FunctionCatalogRow extends QueryResultRow {
  function_name: string;
  identity_arguments: string;
  result_type: string;
  language_name: string;
  security_definer: boolean;
}

interface TriggerCatalogRow extends QueryResultRow {
  trigger_name: string;
  table_name: string;
  is_deferrable: boolean;
  is_initially_deferred: boolean;
  definition: string;
}

interface ForeignKeyCatalogRow extends QueryResultRow {
  constraint_name: string;
  is_deferrable: boolean;
  is_initially_deferred: boolean;
  definition: string;
}

interface IsolatedMigrations {
  readonly directory: string;
  readonly config: MigrationConfig;
}

interface PreAw010aApplicationFixture {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly principalId: string;
  readonly channelId: string;
}

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  resolve(value: Value): void;
}

let harness: PostgresTestHarness | undefined;
let eventIdOrdinal = 0;
let membershipEpochOrdinal = 0;
let preAw010aApplicationFixtureOrdinal = 0;

function activeHarness(): PostgresTestHarness {
  if (harness === undefined) throw new Error("PostgreSQL test harness is not running");
  return harness;
}

function migrationEnvironment(): Readonly<Record<string, unknown>> {
  return {
    MIGRATION_DATABASE_URL: activeHarness().connectionUrls.migrator,
    MIGRATION_TARGET_CLASS: "testcontainer",
  };
}

function deferred<Value>(): Deferred<Value> {
  let resolvePromise: ((value: Value) => void) | undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: Value): void {
      if (resolvePromise === undefined) throw new Error("Deferred promise was not initialized");
      resolvePromise(value);
    },
  };
}

async function captureFailure(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the PostgreSQL operation to fail");
}

function nestedErrorField(error: unknown, field: string): unknown {
  let current = error;
  const visited = new Set<object>();
  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    if (field in current) return Reflect.get(current, field);
    current = "cause" in current ? Reflect.get(current, "cause") : undefined;
  }
  return undefined;
}

function errorCode(error: unknown): string | undefined {
  const code = nestedErrorField(error, "code");
  return typeof code === "string" ? code : undefined;
}

function errorMessages(error: unknown): string[] {
  const messages: string[] = [];
  let current = error;
  const visited = new Set<object>();
  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    const message = Reflect.get(current, "message");
    if (typeof message === "string") messages.push(message);
    current = "cause" in current ? Reflect.get(current, "cause") : undefined;
  }
  return messages;
}

function errorMessage(error: unknown): string | undefined {
  const message = nestedErrorField(error, "message");
  return typeof message === "string" ? message : undefined;
}

function errorConstraint(error: unknown): string | undefined {
  const constraint = nestedErrorField(error, "constraint");
  return typeof constraint === "string" ? constraint : undefined;
}

function diagnosticText(error: unknown): string {
  const diagnostics: string[] = [];
  let current = error;
  const visited = new Set<object>();
  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    for (const field of ["message", "detail", "hint", "where"] as const) {
      const value = Reflect.get(current, field);
      if (typeof value === "string") diagnostics.push(value);
    }
    current = "cause" in current ? Reflect.get(current, "cause") : undefined;
  }
  return diagnostics.join("\n");
}

function expectPgFailure(
  failure: unknown,
  code: "23503" | "23514" | "55000",
  options: { readonly constraint?: string; readonly message?: string } = {},
): void {
  expect(errorCode(failure)).toBe(code);
  if (options.constraint !== undefined) expect(errorConstraint(failure)).toBe(options.constraint);
  if (options.message !== undefined) expect(errorMessages(failure)).toContain(options.message);
}

async function ledgerRows(): Promise<LedgerRow[]> {
  const result = await activeHarness().query<LedgerRow>(
    "migrator",
    `SELECT id, created_at::text AS created_at, hash
       FROM ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}
      ORDER BY id`,
  );
  return result.rows;
}

function expectedLedgerRows(): LedgerRow[] {
  return [
    { id: 1, created_at: String(FOUNDATION_CREATED_AT), hash: FOUNDATION_MIGRATION_HASH },
    {
      id: 2,
      created_at: String(CHANNEL_STREAM_CREATED_AT),
      hash: CHANNEL_STREAM_MIGRATION_HASH,
    },
  ];
}

async function migrateWithDrizzle(client: MigrationClient, config: MigrationConfig): Promise<void> {
  const database = drizzle(client as unknown as PoolClient);
  await drizzleMigrate(database, config);
}

async function runMigrationsFrom(config: MigrationConfig, expectedCount: number): Promise<void> {
  await runMigrations(migrationEnvironment(), {
    checkFiles: () => {
      const migrations = readMigrationFiles(config);
      if (migrations.length !== expectedCount) {
        throw new MigrationIntegrityError("Isolated migration folder has an unexpected count");
      }
    },
    checkIntegrity: async (
      client: MigrationClient,
      _canonicalConfig: MigrationConfig,
      phase: MigrationIntegrityPhase,
    ) =>
      verifyMigrationIntegrity(client, config, {
        allowMissingLedger: phase === "pre",
        requireAllApplied: phase === "post",
      }),
    migrate: async (client: MigrationClient) => migrateWithDrizzle(client, config),
  });
}

async function createFoundationOnlyMigrations(): Promise<IsolatedMigrations> {
  const directory = await mkdtemp(join(tmpdir(), "aw010a-s5-foundation-only-"));
  const migrationsFolder = join(directory, "drizzle");
  await cp(migrationConfig.migrationsFolder, migrationsFolder, { recursive: true });
  await Promise.all([
    rm(join(migrationsFolder, "0001_aw010a_channel_stream.sql")),
    rm(join(migrationsFolder, "meta", "0001_snapshot.json")),
  ]);
  const journalPath = join(migrationsFolder, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
    version: string;
    dialect: string;
    entries: unknown[];
  };
  journal.entries = journal.entries.slice(0, 1);
  await writeFile(journalPath, `${JSON.stringify(journal, undefined, 2)}\n`, "utf8");
  return {
    directory,
    config: { ...migrationConfig, migrationsFolder },
  };
}

async function createDriftedMigrations(): Promise<IsolatedMigrations> {
  const directory = await mkdtemp(join(tmpdir(), "aw010a-s5-drifted-"));
  const migrationsFolder = join(directory, "drizzle");
  await cp(migrationConfig.migrationsFolder, migrationsFolder, { recursive: true });
  const streamMigrationPath = join(migrationsFolder, "0001_aw010a_channel_stream.sql");
  const migrationSql = await readFile(streamMigrationPath, "utf8");
  await writeFile(streamMigrationPath, `${migrationSql}-- isolated AW010A-S5 drift\n`, "utf8");
  return {
    directory,
    config: { ...migrationConfig, migrationsFolder },
  };
}

async function withFoundationOnlyMigrations(
  action: (isolated: IsolatedMigrations) => Promise<void>,
): Promise<void> {
  const isolated = await createFoundationOnlyMigrations();
  try {
    await action(isolated);
  } finally {
    await rm(isolated.directory, { recursive: true, force: true });
  }
}

async function seedTenantWorkspace(
  client: PoolClient,
  tenantId: string,
  workspaceId: string,
): Promise<void> {
  await client.query("INSERT INTO tenants (tenant_id) VALUES ($1)", [tenantId]);
  await client.query("INSERT INTO workspaces (tenant_id, workspace_id) VALUES ($1, $2)", [
    tenantId,
    workspaceId,
  ]);
}

async function seedPrincipal(
  client: PoolClient,
  tenantId: string,
  principalId: string,
): Promise<void> {
  await client.query(
    "INSERT INTO principals (tenant_id, principal_id, principal_kind) VALUES ($1, $2, 'human')",
    [tenantId, principalId],
  );
}

async function seedChannel(
  client: PoolClient,
  tenantId: string,
  workspaceId: string,
  channelId: string,
): Promise<void> {
  await client.query(
    "INSERT INTO channels (tenant_id, workspace_id, channel_id, kind) VALUES ($1, $2, $3, 'public')",
    [tenantId, workspaceId, channelId],
  );
}

async function seedCompleteFixture(client: PoolClient): Promise<void> {
  await client.query("INSERT INTO tenants (tenant_id) VALUES ($1), ($2)", [
    FIXTURE.tenantA,
    FIXTURE.tenantB,
  ]);
  await client.query("INSERT INTO workspaces (tenant_id, workspace_id) VALUES ($1, $2), ($3, $4)", [
    FIXTURE.tenantA,
    FIXTURE.workspaceA,
    FIXTURE.tenantB,
    FIXTURE.workspaceB,
  ]);
  await client.query(
    `INSERT INTO principals (tenant_id, principal_id, principal_kind)
     VALUES ($1, $2, 'human'), ($3, $4, 'human')`,
    [FIXTURE.tenantA, FIXTURE.principalA, FIXTURE.tenantB, FIXTURE.principalB],
  );
  await client.query(
    `INSERT INTO channels (tenant_id, workspace_id, channel_id, kind)
     VALUES ($1, $2, $3, 'public'), ($1, $2, $4, 'private'), ($5, $6, $7, 'public')`,
    [
      FIXTURE.tenantA,
      FIXTURE.workspaceA,
      FIXTURE.channelA,
      FIXTURE.channelAOther,
      FIXTURE.tenantB,
      FIXTURE.workspaceB,
      FIXTURE.channelB,
    ],
  );
}

function nextPreAw010aApplicationFixture(): PreAw010aApplicationFixture {
  preAw010aApplicationFixtureOrdinal += 1;
  const suffix = `aw010a_s5_pre_application_${preAw010aApplicationFixtureOrdinal}`;
  return {
    tenantId: `tenant_${suffix}`,
    workspaceId: `workspace_${suffix}`,
    principalId: `principal_${suffix}`,
    channelId: `channel_${suffix}`,
  };
}

async function writePreAw010aApplicationFixture(
  client: PoolClient,
  fixture: PreAw010aApplicationFixture,
): Promise<void> {
  await client.query("INSERT INTO tenants (tenant_id) VALUES ($1)", [fixture.tenantId]);
  await client.query("INSERT INTO workspaces (tenant_id, workspace_id) VALUES ($1, $2)", [
    fixture.tenantId,
    fixture.workspaceId,
  ]);
  await client.query(
    "INSERT INTO principals (tenant_id, principal_id, principal_kind) VALUES ($1, $2, 'human')",
    [fixture.tenantId, fixture.principalId],
  );
  await client.query(
    `INSERT INTO workspace_memberships (tenant_id, workspace_id, principal_id, role)
     VALUES ($1, $2, $3, 'owner')`,
    [fixture.tenantId, fixture.workspaceId, fixture.principalId],
  );
  await client.query(
    "INSERT INTO channels (tenant_id, workspace_id, channel_id, kind) VALUES ($1, $2, $3, 'public')",
    [fixture.tenantId, fixture.workspaceId, fixture.channelId],
  );
}

async function withClient(
  role: PgRole,
  action: (client: PoolClient) => Promise<void>,
): Promise<void> {
  const client = await activeHarness().connect(role);
  try {
    await action(client);
  } finally {
    client.release();
  }
}

async function withCommittedTransaction(
  action: (client: PoolClient) => Promise<void>,
  role: PgRole = "runtime",
): Promise<void> {
  await withClient(role, async (client) => {
    let committed = false;
    await client.query("BEGIN");
    try {
      await action(client);
      await client.query("COMMIT");
      committed = true;
    } finally {
      if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    }
  });
}

function nextEventId(eventType: EventType, tenantId: string, channelId: string): string {
  eventIdOrdinal += 1;
  return `event_aw010a_s5_${eventIdOrdinal}_${tenantId}_${channelId}_${eventType.replaceAll(".", "_")}`;
}

function nextMembershipEpoch(label: string): string {
  membershipEpochOrdinal += 1;
  return `epoch_aw010a_s5_${membershipEpochOrdinal}_${label}`;
}

async function appendEvent(
  client: PoolClient,
  input: {
    readonly tenantId: string;
    readonly channelId: string;
    readonly eventSeq: number;
    readonly eventType: EventType;
  },
): Promise<string> {
  const eventId = nextEventId(input.eventType, input.tenantId, input.channelId);
  const sequenceUpdate = await client.query(
    `UPDATE channel_event_sequences
        SET last_event_seq = $3
      WHERE tenant_id = $1
        AND channel_id = $2
      RETURNING last_event_seq::text AS last_event_seq`,
    [input.tenantId, input.channelId, String(input.eventSeq)],
  );
  if (sequenceUpdate.rowCount !== 1) throw new Error("Channel sequence state was not present");
  const actorPrincipalId =
    input.tenantId === FIXTURE.tenantB ? FIXTURE.principalB : FIXTURE.principalA;
  await client.query(
    `INSERT INTO channel_events
       (tenant_id, channel_id, event_seq, event_id, schema_version, event_type,
        actor_principal_id, actor_kind, occurred_at, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      input.tenantId,
      input.channelId,
      String(input.eventSeq),
      eventId,
      1,
      input.eventType,
      actorPrincipalId,
      "human",
      "2026-08-26T00:00:00.000Z",
      { source: "AW010A-S5", ordinal: eventIdOrdinal },
    ],
  );
  return eventId;
}

async function insertMembership(
  client: PoolClient,
  input: {
    readonly tenantId?: string;
    readonly channelId?: string;
    readonly principalId?: string;
    readonly epochLabel: string;
    readonly joinedEventSeq: number;
    readonly exitedEventSeq?: number | null;
  },
): Promise<string> {
  const membershipEpoch = nextMembershipEpoch(input.epochLabel);
  await client.query(
    `INSERT INTO channel_membership_epochs
       (tenant_id, channel_id, principal_id, membership_epoch, history_mode,
        joined_event_seq, exited_event_seq)
     VALUES ($1, $2, $3, $4, 'full', $5, $6)`,
    [
      input.tenantId ?? FIXTURE.tenantA,
      input.channelId ?? FIXTURE.channelA,
      input.principalId ?? FIXTURE.principalA,
      membershipEpoch,
      String(input.joinedEventSeq),
      input.exitedEventSeq === undefined || input.exitedEventSeq === null
        ? null
        : String(input.exitedEventSeq),
    ],
  );
  return membershipEpoch;
}

async function expectTypedCommitFailure(
  action: (client: PoolClient) => Promise<void>,
  message:
    "channel membership joined event is invalid" | "channel membership exited event is invalid",
): Promise<unknown> {
  let failure: unknown;
  await withClient("runtime", async (client) => {
    await client.query("BEGIN");
    try {
      await action(client);
      failure = await captureFailure(() => client.query("COMMIT"));
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
    }
  });
  expectPgFailure(failure, "23514", { message });
  return failure;
}

async function relationLockEvidence(
  relationName: "channels" | "channel_membership_epochs",
): Promise<RelationLockEvidence[]> {
  const result = await activeHarness().query<RelationLockEvidence>(
    "owner",
    `SELECT relation.relname AS relation_name,
            relation_lock.mode,
            relation_lock.granted,
            pg_blocking_pids(relation_lock.pid) AS blocking_pids
       FROM pg_locks AS relation_lock
       JOIN pg_class AS relation ON relation.oid = relation_lock.relation
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       JOIN pg_stat_activity AS activity ON activity.pid = relation_lock.pid
      WHERE activity.datname = $1
        AND activity.usename = $2
        AND namespace.nspname = 'public'
        AND relation.relname = $3
        AND relation_lock.mode = 'AccessExclusiveLock'
        AND NOT relation_lock.granted`,
    [activeHarness().resources.database, activeHarness().resources.migratorRole, relationName],
  );
  return result.rows;
}

async function waitForRelationLock(
  relationName: "channels" | "channel_membership_epochs",
  blockingPid: number,
): Promise<RelationLockEvidence> {
  const deadline = Date.now() + LOCK_OBSERVATION_TIMEOUT_MILLISECONDS;
  let lastEvidence: RelationLockEvidence[] = [];
  while (Date.now() < deadline) {
    lastEvidence = await relationLockEvidence(relationName);
    const matching = lastEvidence.find((row) => row.blocking_pids.includes(blockingPid));
    if (matching !== undefined) return matching;
    await delay(25);
  }
  throw new Error(
    `Migration did not expose an AccessExclusiveLock waiter on ${relationName}; observations=${JSON.stringify(lastEvidence)}`,
  );
}

async function membershipMigrationLockSequenceEvidence(): Promise<MigrationLockSequenceEvidence[]> {
  const result = await activeHarness().query<MigrationLockSequenceEvidence>(
    "owner",
    `SELECT membership_lock.pid AS migrator_pid,
            channels_relation.relname AS channels_relation_name,
            channels_lock.mode AS channels_mode,
            channels_lock.granted AS channels_granted,
            membership_relation.relname AS membership_relation_name,
            membership_lock.mode AS membership_mode,
            membership_lock.granted AS membership_granted,
            pg_blocking_pids(membership_lock.pid) AS blocking_pids
       FROM pg_locks AS membership_lock
       JOIN pg_class AS membership_relation ON membership_relation.oid = membership_lock.relation
       JOIN pg_namespace AS membership_namespace
         ON membership_namespace.oid = membership_relation.relnamespace
       JOIN pg_stat_activity AS activity ON activity.pid = membership_lock.pid
       JOIN pg_locks AS channels_lock
         ON channels_lock.pid = membership_lock.pid
        AND channels_lock.locktype = 'relation'
        AND channels_lock.mode = 'AccessExclusiveLock'
        AND channels_lock.granted
       JOIN pg_class AS channels_relation ON channels_relation.oid = channels_lock.relation
       JOIN pg_namespace AS channels_namespace
         ON channels_namespace.oid = channels_relation.relnamespace
      WHERE activity.datname = $1
        AND activity.usename = $2
        AND membership_namespace.nspname = 'public'
        AND membership_relation.relname = 'channel_membership_epochs'
        AND membership_lock.locktype = 'relation'
        AND membership_lock.mode = 'AccessExclusiveLock'
        AND NOT membership_lock.granted
        AND channels_namespace.nspname = 'public'
        AND channels_relation.relname = 'channels'`,
    [activeHarness().resources.database, activeHarness().resources.migratorRole],
  );
  return result.rows;
}

async function waitForMembershipMigrationLockSequence(
  blockingPid: number,
): Promise<MigrationLockSequenceEvidence> {
  const deadline = Date.now() + LOCK_OBSERVATION_TIMEOUT_MILLISECONDS;
  let lastEvidence: MigrationLockSequenceEvidence[] = [];
  while (Date.now() < deadline) {
    lastEvidence = await membershipMigrationLockSequenceEvidence();
    const matching = lastEvidence.find((row) => row.blocking_pids.includes(blockingPid));
    if (matching !== undefined) return matching;
    await delay(25);
  }
  throw new Error(
    `Migration did not hold the channels lock while waiting on membership DML; observations=${JSON.stringify(lastEvidence)}`,
  );
}

async function advisoryLockEvidence(): Promise<AdvisoryLockEvidence> {
  const result = await activeHarness().query<AdvisoryLockEvidence>(
    "owner",
    `SELECT count(*) FILTER (WHERE advisory_lock.granted)::integer AS holders,
            count(*) FILTER (WHERE NOT advisory_lock.granted)::integer AS waiters
       FROM pg_locks AS advisory_lock
       JOIN pg_stat_activity AS activity ON activity.pid = advisory_lock.pid
      WHERE advisory_lock.locktype = 'advisory'
        AND advisory_lock.objid = $1
        AND activity.datname = $2
        AND activity.usename = $3`,
    [
      MIGRATION_ADVISORY_LOCK_ID,
      activeHarness().resources.database,
      activeHarness().resources.migratorRole,
    ],
  );
  const evidence = result.rows[0];
  if (evidence === undefined) throw new Error("PostgreSQL did not return advisory-lock evidence");
  return evidence;
}

async function waitForMigratorSerialization(): Promise<AdvisoryLockEvidence> {
  const deadline = Date.now() + LOCK_OBSERVATION_TIMEOUT_MILLISECONDS;
  let lastEvidence: AdvisoryLockEvidence = { holders: 0, waiters: 0 };
  while (Date.now() < deadline) {
    lastEvidence = await advisoryLockEvidence();
    if (lastEvidence.holders === 1 && lastEvidence.waiters === 1) return lastEvidence;
    await delay(25);
  }
  throw new Error(
    `Concurrent migrators did not serialize; holders=${lastEvidence.holders}, waiters=${lastEvidence.waiters}`,
  );
}

async function backendPid(client: PoolClient): Promise<number> {
  const result = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  const pid = result.rows[0]?.pid;
  if (pid === undefined) throw new Error("PostgreSQL did not return the blocker backend PID");
  return pid;
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
  expect(activeHarness().evidence.image).toBe(POSTGRES_TEST_IMAGE);
}, HARNESS_START_TIMEOUT_MILLISECONDS);

beforeEach(async () => {
  await activeHarness().resetDatabase();
});

afterAll(async () => {
  const currentHarness = harness;
  harness = undefined;
  if (currentHarness === undefined) return;
  const failures: unknown[] = [];
  const runLabel = Object.entries(currentHarness.resources.labels).find(
    ([, value]) => value === currentHarness.resources.runId,
  );
  try {
    await currentHarness.stop();
  } catch (error) {
    failures.push(error);
  }
  if (runLabel === undefined) {
    failures.push(new Error("PostgreSQL harness omitted its exact run label"));
  } else {
    try {
      expect(await containerResidue(`${runLabel[0]}=${runLabel[1]}`)).toEqual([]);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, "AW010A-S5 PostgreSQL harness cleanup failed");
  }
}, HARNESS_STOP_TIMEOUT_MILLISECONDS);

describe.sequential("AW-010A S5 real PostgreSQL cutover", () => {
  it("AW010A-S5 registers exactly the four integration files in frozen order", async () => {
    const configSource = await readFile(
      join(import.meta.dirname, "..", "vitest.config.ts"),
      "utf8",
    );
    const integrationMatch =
      /name:\s*"integration"(?<project>[\s\S]*?)fileParallelism:\s*false/u.exec(configSource);
    const integrationProject = integrationMatch?.groups?.project;
    if (integrationProject === undefined) throw new Error("Integration project was not found");
    const includeMatch = /include:\s*\[(?<body>[\s\S]*?)\]/u.exec(integrationProject);
    const includeBody = includeMatch?.groups?.body;
    if (includeBody === undefined) throw new Error("Integration include list was not found");
    expect(
      [...includeBody.matchAll(/"(?<path>[^"]+)"/gu)].map((match) => match.groups?.path),
    ).toEqual(EXPECTED_INTEGRATION_FILES);
    expect(includeBody).not.toMatch(/[*!?{}[\]]/u);
  });

  it(
    "AW010A-S5 fails atomically when a 0000-only database contains pre-stream membership",
    async () => {
      await withFoundationOnlyMigrations(async (isolated) => {
        await runMigrationsFrom(isolated.config, 1);
        await withCommittedTransaction(async (client) => {
          await seedTenantWorkspace(client, FIXTURE.tenantA, FIXTURE.workspaceA);
          await seedPrincipal(client, FIXTURE.tenantA, FIXTURE.principalA);
          await seedChannel(client, FIXTURE.tenantA, FIXTURE.workspaceA, FIXTURE.channelA);
          await insertMembership(client, {
            epochLabel: "preflight_synthetic",
            joinedEventSeq: 101,
          });
        });

        const failure = await captureFailure(() => runMigrations(migrationEnvironment()));
        expectPgFailure(failure, "55000", {
          message: "channel stream migration precondition failed",
        });
        const diagnostics = diagnosticText(failure);
        for (const fixtureValue of Object.values(FIXTURE)) {
          expect(diagnostics).not.toContain(fixtureValue);
        }
        expect(diagnostics).not.toMatch(/epoch_aw010a_s5_|preflight_synthetic|\b101\b/iu);
        expect(await ledgerRows()).toEqual([expectedLedgerRows()[0]]);
        const objects = await activeHarness().query<
          QueryResultRow & {
            sequences: string | null;
            events: string | null;
            initialize_function: string | null;
            stream_trigger_count: number;
            typed_fk_count: number;
            membership_count: number;
          }
        >(
          "owner",
          `SELECT to_regclass('public.channel_event_sequences')::text AS sequences,
                  to_regclass('public.channel_events')::text AS events,
                  to_regprocedure('public.initialize_channel_event_sequence()')::text AS initialize_function,
                  (SELECT count(*)::integer FROM pg_trigger WHERE tgname IN
                    ('channels_initialize_event_sequence', 'channel_events_append_only_guard',
                     'channel_membership_epochs_event_type_guard')) AS stream_trigger_count,
                  (SELECT count(*)::integer FROM pg_constraint WHERE conname IN
                    ('channel_membership_epochs_joined_event_fk',
                     'channel_membership_epochs_exited_event_fk')) AS typed_fk_count,
                  (SELECT count(*)::integer FROM channel_membership_epochs) AS membership_count`,
        );
        expect(objects.rows).toEqual([
          {
            sequences: null,
            events: null,
            initialize_function: null,
            stream_trigger_count: 0,
            typed_fk_count: 0,
            membership_count: 1,
          },
        ]);
      });
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S5 backfills exactly one zero sequence state for every existing channel",
    async () => {
      await withFoundationOnlyMigrations(async (isolated) => {
        await runMigrationsFrom(isolated.config, 1);
        await withCommittedTransaction(async (client) => {
          await seedTenantWorkspace(client, FIXTURE.tenantA, FIXTURE.workspaceA);
          await seedChannel(client, FIXTURE.tenantA, FIXTURE.workspaceA, FIXTURE.channelA);
          await seedChannel(client, FIXTURE.tenantA, FIXTURE.workspaceA, FIXTURE.channelAOther);
        });
        await runMigrations(migrationEnvironment());
        const result = await activeHarness().query<SequenceRow>(
          "runtime",
          `SELECT tenant_id, channel_id, last_event_seq::text AS last_event_seq
             FROM channel_event_sequences
            ORDER BY tenant_id, channel_id`,
        );
        expect(result.rows).toEqual([
          { tenant_id: FIXTURE.tenantA, channel_id: FIXTURE.channelA, last_event_seq: "0" },
          {
            tenant_id: FIXTURE.tenantA,
            channel_id: FIXTURE.channelAOther,
            last_event_seq: "0",
          },
        ]);
      });
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S5 observes channel DML blocking the migration ACCESS EXCLUSIVE lock until release",
    async () => {
      await withFoundationOnlyMigrations(async (isolated) => {
        await runMigrationsFrom(isolated.config, 1);
        await withCommittedTransaction(async (client) => {
          await seedTenantWorkspace(client, FIXTURE.tenantA, FIXTURE.workspaceA);
        });
        const blocker = await activeHarness().connect("runtime");
        const releaseBlocker = deferred<void>();
        let migrationPromise: Promise<void> | undefined;
        let blockerPromise: Promise<void> | undefined;
        try {
          await blocker.query("BEGIN");
          await seedChannel(blocker, FIXTURE.tenantA, FIXTURE.workspaceA, FIXTURE.channelA);
          const blockerBackendPid = await backendPid(blocker);
          blockerPromise = (async () => {
            await releaseBlocker.promise;
            await blocker.query("ROLLBACK");
          })();
          migrationPromise = runMigrations(migrationEnvironment());
          expect(await waitForRelationLock("channels", blockerBackendPid)).toEqual({
            relation_name: "channels",
            mode: "AccessExclusiveLock",
            granted: false,
            blocking_pids: [blockerBackendPid],
          });
          releaseBlocker.resolve();
          await Promise.all([blockerPromise, migrationPromise]);
        } finally {
          releaseBlocker.resolve();
          await blocker.query("ROLLBACK").catch(() => undefined);
          await Promise.allSettled(
            [blockerPromise, migrationPromise].filter(
              (promise): promise is Promise<void> => promise !== undefined,
            ),
          );
          blocker.release();
        }
        const channelCount = await activeHarness().query<CountRow>(
          "runtime",
          "SELECT count(*)::integer AS count FROM channels",
        );
        expect(channelCount.rows).toEqual([{ count: 0 }]);
      });
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S5 observes membership DML blocking the migration ACCESS EXCLUSIVE lock until release",
    async () => {
      await withFoundationOnlyMigrations(async (isolated) => {
        await runMigrationsFrom(isolated.config, 1);
        await withCommittedTransaction(async (client) => {
          await seedTenantWorkspace(client, FIXTURE.tenantA, FIXTURE.workspaceA);
          await seedPrincipal(client, FIXTURE.tenantA, FIXTURE.principalA);
          await seedChannel(client, FIXTURE.tenantA, FIXTURE.workspaceA, FIXTURE.channelA);
        });
        const blocker = await activeHarness().connect("runtime");
        const releaseBlocker = deferred<void>();
        let migrationPromise: Promise<void> | undefined;
        let blockerPromise: Promise<void> | undefined;
        try {
          await blocker.query("BEGIN");
          const deleteResult = await blocker.query(
            "DELETE FROM channel_membership_epochs WHERE false",
          );
          expect(deleteResult.rowCount).toBe(0);
          const blockerBackendPid = await backendPid(blocker);
          blockerPromise = (async () => {
            await releaseBlocker.promise;
            await blocker.query("ROLLBACK");
          })();
          migrationPromise = runMigrations(migrationEnvironment());
          const lockSequence = await waitForMembershipMigrationLockSequence(blockerBackendPid);
          expect(lockSequence).toEqual({
            migrator_pid: expect.any(Number),
            channels_relation_name: "channels",
            channels_mode: "AccessExclusiveLock",
            channels_granted: true,
            membership_relation_name: "channel_membership_epochs",
            membership_mode: "AccessExclusiveLock",
            membership_granted: false,
            blocking_pids: [blockerBackendPid],
          });
          expect(lockSequence.migrator_pid).not.toBe(blockerBackendPid);
          releaseBlocker.resolve();
          await Promise.all([blockerPromise, migrationPromise]);
        } finally {
          releaseBlocker.resolve();
          await blocker.query("ROLLBACK").catch(() => undefined);
          await Promise.allSettled(
            [blockerPromise, migrationPromise].filter(
              (promise): promise is Promise<void> => promise !== undefined,
            ),
          );
          blocker.release();
        }
        const state = await activeHarness().query<SequenceRow>(
          "runtime",
          `SELECT tenant_id, channel_id, last_event_seq::text AS last_event_seq
             FROM channel_event_sequences`,
        );
        expect(state.rows).toEqual([
          { tenant_id: FIXTURE.tenantA, channel_id: FIXTURE.channelA, last_event_seq: "0" },
        ]);
      });
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it("AW010A-S5 initializes zero sequence state for a channel inserted after migration", async () => {
    await runMigrations(migrationEnvironment());
    await withCommittedTransaction(async (client) => {
      await seedTenantWorkspace(client, FIXTURE.tenantA, FIXTURE.workspaceA);
      await seedChannel(client, FIXTURE.tenantA, FIXTURE.workspaceA, FIXTURE.channelA);
    });
    const state = await activeHarness().query<SequenceRow>(
      "runtime",
      `SELECT tenant_id, channel_id, last_event_seq::text AS last_event_seq
         FROM channel_event_sequences`,
    );
    expect(state.rows).toEqual([
      { tenant_id: FIXTURE.tenantA, channel_id: FIXTURE.channelA, last_event_seq: "0" },
    ]);
  });

  it("AW010A-S5 accepts a joined epoch backed by channel.member_joined", async () => {
    await runMigrations(migrationEnvironment());
    await withCommittedTransaction(seedCompleteFixture);
    await withCommittedTransaction(async (client) => {
      await appendEvent(client, {
        tenantId: FIXTURE.tenantA,
        channelId: FIXTURE.channelA,
        eventSeq: 1,
        eventType: "channel.member_joined",
      });
    });
    const epoch = await withClient("runtime", async (client) => {
      await insertMembership(client, { epochLabel: "joined_acceptance", joinedEventSeq: 1 });
    });
    expect(epoch).toBeUndefined();
    const count = await activeHarness().query<CountRow>(
      "runtime",
      "SELECT count(*)::integer AS count FROM channel_membership_epochs",
    );
    expect(count.rows).toEqual([{ count: 1 }]);
  });

  it("AW010A-S5 accepts channel.member_left as an exited epoch event", async () => {
    await runMigrations(migrationEnvironment());
    await withCommittedTransaction(seedCompleteFixture);
    await withCommittedTransaction(async (client) => {
      await appendEvent(client, {
        tenantId: FIXTURE.tenantA,
        channelId: FIXTURE.channelA,
        eventSeq: 1,
        eventType: "channel.member_joined",
      });
      await appendEvent(client, {
        tenantId: FIXTURE.tenantA,
        channelId: FIXTURE.channelA,
        eventSeq: 2,
        eventType: "channel.member_left",
      });
    });
    await withClient("runtime", async (client) => {
      await insertMembership(client, {
        epochLabel: "left_acceptance",
        joinedEventSeq: 1,
        exitedEventSeq: 2,
      });
    });
    const count = await activeHarness().query<CountRow>(
      "runtime",
      "SELECT count(*)::integer AS count FROM channel_membership_epochs WHERE exited_event_seq = 2",
    );
    expect(count.rows).toEqual([{ count: 1 }]);
  });

  it("AW010A-S5 accepts channel.member_revoked as an exited epoch event", async () => {
    await runMigrations(migrationEnvironment());
    await withCommittedTransaction(seedCompleteFixture);
    await withCommittedTransaction(async (client) => {
      await appendEvent(client, {
        tenantId: FIXTURE.tenantA,
        channelId: FIXTURE.channelA,
        eventSeq: 1,
        eventType: "channel.member_joined",
      });
      await appendEvent(client, {
        tenantId: FIXTURE.tenantA,
        channelId: FIXTURE.channelA,
        eventSeq: 2,
        eventType: "channel.member_revoked",
      });
    });
    await withClient("runtime", async (client) => {
      await insertMembership(client, {
        epochLabel: "revoked_acceptance",
        joinedEventSeq: 1,
        exitedEventSeq: 2,
      });
    });
    const count = await activeHarness().query<CountRow>(
      "runtime",
      "SELECT count(*)::integer AS count FROM channel_membership_epochs WHERE exited_event_seq = 2",
    );
    expect(count.rows).toEqual([{ count: 1 }]);
  });

  it("AW010A-S5 accepts a nullable exited_event_seq for an active epoch", async () => {
    await runMigrations(migrationEnvironment());
    await withCommittedTransaction(seedCompleteFixture);
    await withCommittedTransaction(async (client) => {
      await appendEvent(client, {
        tenantId: FIXTURE.tenantA,
        channelId: FIXTURE.channelA,
        eventSeq: 1,
        eventType: "channel.member_joined",
      });
    });
    await withClient("runtime", async (client) => {
      await insertMembership(client, {
        epochLabel: "nullable_exit_acceptance",
        joinedEventSeq: 1,
        exitedEventSeq: null,
      });
    });
    const count = await activeHarness().query<CountRow>(
      "runtime",
      "SELECT count(*)::integer AS count FROM channel_membership_epochs WHERE exited_event_seq IS NULL",
    );
    expect(count.rows).toEqual([{ count: 1 }]);
  });

  it("AW010A-S5 rejects all six non-join event types for joined_event_seq", async () => {
    await runMigrations(migrationEnvironment());
    await withCommittedTransaction(seedCompleteFixture);
    expect(NON_JOIN_EVENT_TYPES).toHaveLength(6);
    for (const [index, eventType] of NON_JOIN_EVENT_TYPES.entries()) {
      const failure = await expectTypedCommitFailure(async (client) => {
        await appendEvent(client, {
          tenantId: FIXTURE.tenantA,
          channelId: FIXTURE.channelA,
          eventSeq: 1,
          eventType,
        });
        await insertMembership(client, {
          epochLabel: `invalid_join_${index}`,
          joinedEventSeq: 1,
        });
      }, "channel membership joined event is invalid");
      expect(diagnosticText(failure)).not.toContain(FIXTURE.tenantA);
      expect(diagnosticText(failure)).not.toContain(FIXTURE.channelA);
    }
  });

  it("AW010A-S5 rejects all five non-exit event types for exited_event_seq", async () => {
    await runMigrations(migrationEnvironment());
    await withCommittedTransaction(seedCompleteFixture);
    expect(NON_EXIT_EVENT_TYPES).toHaveLength(5);
    for (const [index, eventType] of NON_EXIT_EVENT_TYPES.entries()) {
      const failure = await expectTypedCommitFailure(async (client) => {
        await appendEvent(client, {
          tenantId: FIXTURE.tenantA,
          channelId: FIXTURE.channelA,
          eventSeq: 1,
          eventType: "channel.member_joined",
        });
        await appendEvent(client, {
          tenantId: FIXTURE.tenantA,
          channelId: FIXTURE.channelA,
          eventSeq: 2,
          eventType,
        });
        await insertMembership(client, {
          epochLabel: `invalid_exit_${index}`,
          joinedEventSeq: 1,
          exitedEventSeq: 2,
        });
      }, "channel membership exited event is invalid");
      expect(diagnosticText(failure)).not.toContain(FIXTURE.tenantA);
      expect(diagnosticText(failure)).not.toContain(FIXTURE.channelA);
    }
  });

  it("AW010A-S5 rejects a missing joined event through the immediate foreign key", async () => {
    await runMigrations(migrationEnvironment());
    await withCommittedTransaction(seedCompleteFixture);
    const failure = await captureFailure(() =>
      activeHarness().query(
        "runtime",
        `INSERT INTO channel_membership_epochs
           (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq)
         VALUES ($1, $2, $3, $4, 'full', $5)`,
        [
          FIXTURE.tenantA,
          FIXTURE.channelA,
          FIXTURE.principalA,
          nextMembershipEpoch("missing_event"),
          "999999",
        ],
      ),
    );
    expectPgFailure(failure, "23503", {
      constraint: "channel_membership_epochs_joined_event_fk",
    });
  });

  it("AW010A-S5 rejects an event reference from the wrong tenant", async () => {
    await runMigrations(migrationEnvironment());
    await withCommittedTransaction(seedCompleteFixture);
    const sharedCrossTenantChannelId = FIXTURE.channelA;
    await withCommittedTransaction(async (client) => {
      await seedChannel(client, FIXTURE.tenantB, FIXTURE.workspaceB, sharedCrossTenantChannelId);
      await appendEvent(client, {
        tenantId: FIXTURE.tenantB,
        channelId: sharedCrossTenantChannelId,
        eventSeq: 1,
        eventType: "channel.member_joined",
      });
    });
    const crossTenantRows = await activeHarness().query<
      QueryResultRow & { tenant_id: string; channel_id: string; joined_event_seq: string | null }
    >(
      "runtime",
      `SELECT channel.tenant_id,
              channel.channel_id,
              event.event_seq::text AS joined_event_seq
         FROM channels AS channel
         LEFT JOIN channel_events AS event
           ON event.tenant_id = channel.tenant_id
          AND event.channel_id = channel.channel_id
          AND event.event_seq = 1
        WHERE channel.channel_id = $1
          AND channel.tenant_id IN ($2, $3)
        ORDER BY channel.tenant_id`,
      [sharedCrossTenantChannelId, FIXTURE.tenantA, FIXTURE.tenantB],
    );
    expect(crossTenantRows.rows).toEqual([
      {
        tenant_id: FIXTURE.tenantA,
        channel_id: sharedCrossTenantChannelId,
        joined_event_seq: null,
      },
      {
        tenant_id: FIXTURE.tenantB,
        channel_id: sharedCrossTenantChannelId,
        joined_event_seq: "1",
      },
    ]);
    expect(crossTenantRows.rows.map(({ channel_id: channelId }) => channelId)).toEqual([
      sharedCrossTenantChannelId,
      sharedCrossTenantChannelId,
    ]);
    const failure = await captureFailure(() =>
      activeHarness().query(
        "runtime",
        `INSERT INTO channel_membership_epochs
           (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq)
         VALUES ($1, $2, $3, $4, 'full', 1)`,
        [
          FIXTURE.tenantA,
          sharedCrossTenantChannelId,
          FIXTURE.principalA,
          nextMembershipEpoch("wrong_tenant"),
        ],
      ),
    );
    expectPgFailure(failure, "23503", {
      constraint: "channel_membership_epochs_joined_event_fk",
    });
  });

  it("AW010A-S5 rejects an event reference from another channel in the same tenant", async () => {
    await runMigrations(migrationEnvironment());
    await withCommittedTransaction(seedCompleteFixture);
    await withCommittedTransaction(async (client) => {
      await appendEvent(client, {
        tenantId: FIXTURE.tenantA,
        channelId: FIXTURE.channelAOther,
        eventSeq: 1,
        eventType: "channel.member_joined",
      });
    });
    const failure = await captureFailure(() =>
      activeHarness().query(
        "runtime",
        `INSERT INTO channel_membership_epochs
           (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq)
         VALUES ($1, $2, $3, $4, 'full', 1)`,
        [
          FIXTURE.tenantA,
          FIXTURE.channelA,
          FIXTURE.principalA,
          nextMembershipEpoch("wrong_channel"),
        ],
      ),
    );
    expectPgFailure(failure, "23503", {
      constraint: "channel_membership_epochs_joined_event_fk",
    });
  });

  it("AW010A-S5 commits the supported event-first then membership transaction order", async () => {
    await runMigrations(migrationEnvironment());
    await withCommittedTransaction(seedCompleteFixture);
    await withCommittedTransaction(async (client) => {
      await appendEvent(client, {
        tenantId: FIXTURE.tenantA,
        channelId: FIXTURE.channelA,
        eventSeq: 1,
        eventType: "channel.member_joined",
      });
      await insertMembership(client, {
        epochLabel: "event_first_commit",
        joinedEventSeq: 1,
      });
    });
    const result = await activeHarness().query<
      QueryResultRow & { event_count: number; epoch_count: number; last_event_seq: string }
    >(
      "runtime",
      `SELECT (SELECT count(*)::integer FROM channel_events) AS event_count,
              (SELECT count(*)::integer FROM channel_membership_epochs) AS epoch_count,
              (SELECT last_event_seq::text FROM channel_event_sequences
                WHERE tenant_id = $1 AND channel_id = $2) AS last_event_seq`,
      [FIXTURE.tenantA, FIXTURE.channelA],
    );
    expect(result.rows).toEqual([{ event_count: 1, epoch_count: 1, last_event_seq: "1" }]);
  });

  it("AW010A-S5 rejects epoch-first ordering through the immediate event foreign key", async () => {
    await runMigrations(migrationEnvironment());
    await withCommittedTransaction(seedCompleteFixture);
    await withClient("runtime", async (client) => {
      await client.query("BEGIN");
      try {
        const failure = await captureFailure(() =>
          insertMembership(client, {
            epochLabel: "epoch_first",
            joinedEventSeq: 1,
          }),
        );
        expectPgFailure(failure, "23503", {
          constraint: "channel_membership_epochs_joined_event_fk",
        });
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
      }
    });
    const counts = await activeHarness().query<QueryResultRow & { events: number; epochs: number }>(
      "runtime",
      `SELECT (SELECT count(*)::integer FROM channel_events) AS events,
              (SELECT count(*)::integer FROM channel_membership_epochs) AS epochs`,
    );
    expect(counts.rows).toEqual([{ events: 0, epochs: 0 }]);
  });

  it(
    "AW010A-S5 rolls back event epoch and sequence together on commit-time wrong-type failure",
    async () => {
      await runMigrations(migrationEnvironment());
      await withCommittedTransaction(seedCompleteFixture);
      await expectTypedCommitFailure(async (client) => {
        await appendEvent(client, {
          tenantId: FIXTURE.tenantA,
          channelId: FIXTURE.channelA,
          eventSeq: 1,
          eventType: "message.created",
        });
        await insertMembership(client, {
          epochLabel: "atomic_wrong_type",
          joinedEventSeq: 1,
        });
      }, "channel membership joined event is invalid");
      const result = await activeHarness().query<
        QueryResultRow & { event_count: number; epoch_count: number; last_event_seq: string }
      >(
        "runtime",
        `SELECT (SELECT count(*)::integer FROM channel_events) AS event_count,
                (SELECT count(*)::integer FROM channel_membership_epochs) AS epoch_count,
                (SELECT last_event_seq::text FROM channel_event_sequences
                  WHERE tenant_id = $1 AND channel_id = $2) AS last_event_seq`,
        [FIXTURE.tenantA, FIXTURE.channelA],
      );
      expect(result.rows).toEqual([{ event_count: 0, epoch_count: 0, last_event_seq: "0" }]);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it("AW010A-S5 leaves the exact two-row ledger on a no-op rerun", async () => {
    await runMigrations(migrationEnvironment());
    const firstLedger = await ledgerRows();
    await runMigrations(migrationEnvironment());
    expect(firstLedger).toEqual(expectedLedgerRows());
    expect(await ledgerRows()).toEqual(firstLedger);
  });

  it(
    "AW010A-S5 serializes concurrent migrators with one advisory holder and one waiter",
    async () => {
      const firstRunnerEnteredMigration = deferred<void>();
      const releaseFirstRunner = deferred<void>();
      const firstRunner = runMigrations(migrationEnvironment(), {
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
          firstRunner.then(() => {
            throw new Error("First migrator exited before its release gate");
          }),
          delay(LOCK_OBSERVATION_TIMEOUT_MILLISECONDS).then(() => {
            throw new Error("First migrator did not reach its release gate");
          }),
        ]);
        secondRunner = runMigrations(migrationEnvironment());
        expect(await waitForMigratorSerialization()).toEqual({ holders: 1, waiters: 1 });
        releaseFirstRunner.resolve();
        await Promise.all([firstRunner, secondRunner]);
      } finally {
        releaseFirstRunner.resolve();
        await Promise.allSettled(
          secondRunner === undefined ? [firstRunner] : [firstRunner, secondRunner],
        );
      }
      expect(await ledgerRows()).toEqual(expectedLedgerRows());
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it("AW010A-S5 preserves pre-AW010A application rollback over additive stream objects", async () => {
    await runMigrations(migrationEnvironment());
    const applicationFixture = nextPreAw010aApplicationFixture();
    const preAw010aApplicationSource = writePreAw010aApplicationFixture.toString();
    expect(
      [...preAw010aApplicationSource.matchAll(/\bINSERT INTO\s+([a-z_]+)/gu)].map(
        (match) => match[1],
      ),
    ).toEqual(["tenants", "workspaces", "principals", "workspace_memberships", "channels"]);
    expect(preAw010aApplicationSource).not.toMatch(
      /\b(?:channel_events|channel_event_sequences|channel_membership_epochs)\b/u,
    );

    // The released pre-AW010A product had no channel or membership writer. This
    // generic old-table write probes old code ignoring the additive stream objects;
    // it does not claim that a preexisting product membership write path existed.
    await withCommittedTransaction((client) =>
      writePreAw010aApplicationFixture(client, applicationFixture),
    );
    const result = await activeHarness().query<
      QueryResultRow & {
        tenant_id: string;
        workspace_id: string;
        principal_id: string;
        workspace_role: string;
        channel_id: string;
        channel_kind: string;
        state_count: number;
        last_event_seq: string;
        events: number;
      }
    >(
      "runtime",
      `SELECT tenant.tenant_id,
              workspace.workspace_id,
              principal.principal_id,
              membership.role::text AS workspace_role,
              channel.channel_id,
              channel.kind::text AS channel_kind,
              (SELECT count(*)::integer
                 FROM channel_event_sequences AS sequence
                WHERE sequence.tenant_id = channel.tenant_id
                  AND sequence.channel_id = channel.channel_id) AS state_count,
              (SELECT sequence.last_event_seq::text
                 FROM channel_event_sequences AS sequence
                WHERE sequence.tenant_id = channel.tenant_id
                  AND sequence.channel_id = channel.channel_id) AS last_event_seq,
              (SELECT count(*)::integer FROM channel_events) AS events
         FROM tenants AS tenant
         JOIN workspaces AS workspace ON workspace.tenant_id = tenant.tenant_id
         JOIN principals AS principal ON principal.tenant_id = tenant.tenant_id
         JOIN workspace_memberships AS membership
           ON membership.tenant_id = tenant.tenant_id
          AND membership.workspace_id = workspace.workspace_id
          AND membership.principal_id = principal.principal_id
         JOIN channels AS channel
           ON channel.tenant_id = tenant.tenant_id
          AND channel.workspace_id = workspace.workspace_id
        WHERE tenant.tenant_id = $1
          AND workspace.workspace_id = $2
          AND principal.principal_id = $3
          AND channel.channel_id = $4`,
      [
        applicationFixture.tenantId,
        applicationFixture.workspaceId,
        applicationFixture.principalId,
        applicationFixture.channelId,
      ],
    );
    expect(result.rows).toEqual([
      {
        tenant_id: applicationFixture.tenantId,
        workspace_id: applicationFixture.workspaceId,
        principal_id: applicationFixture.principalId,
        workspace_role: "owner",
        channel_id: applicationFixture.channelId,
        channel_kind: "public",
        state_count: 1,
        last_event_seq: "0",
        events: 0,
      },
    ]);
  });

  it("AW010A-S5 fails closed on isolated local migration hash drift", async () => {
    await runMigrations(migrationEnvironment());
    const originalLedger = await ledgerRows();
    const drifted = await createDriftedMigrations();
    try {
      const failure = await captureFailure(() => runMigrationsFrom(drifted.config, 2));
      expect(failure).toBeInstanceOf(MigrationIntegrityError);
      expect(errorMessage(failure)).toBe("Applied migration hash does not match the local file");
      expect(await ledgerRows()).toEqual(originalLedger);
    } finally {
      await rm(drifted.directory, { recursive: true, force: true });
    }
  });

  it("AW010A-S5 freezes the exact live function trigger and FK deferrability catalog", async () => {
    await runMigrations(migrationEnvironment());
    const functions = await activeHarness().query<FunctionCatalogRow>(
      "migrator",
      `SELECT procedure.proname AS function_name,
              pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
              pg_get_function_result(procedure.oid) AS result_type,
              language.lanname AS language_name,
              procedure.prosecdef AS security_definer
         FROM pg_proc AS procedure
         JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
         JOIN pg_language AS language ON language.oid = procedure.prolang
        WHERE namespace.nspname = 'public'
          AND procedure.proname IN
            ('initialize_channel_event_sequence', 'reject_channel_event_mutation',
             'enforce_channel_membership_event_types')
        ORDER BY procedure.proname`,
    );
    expect(functions.rows).toEqual([
      {
        function_name: "enforce_channel_membership_event_types",
        identity_arguments: "",
        result_type: "trigger",
        language_name: "plpgsql",
        security_definer: false,
      },
      {
        function_name: "initialize_channel_event_sequence",
        identity_arguments: "",
        result_type: "trigger",
        language_name: "plpgsql",
        security_definer: false,
      },
      {
        function_name: "reject_channel_event_mutation",
        identity_arguments: "",
        result_type: "trigger",
        language_name: "plpgsql",
        security_definer: false,
      },
    ]);

    const triggers = await activeHarness().query<TriggerCatalogRow>(
      "migrator",
      `SELECT trigger_entry.tgname AS trigger_name,
              relation.relname AS table_name,
              trigger_entry.tgdeferrable AS is_deferrable,
              trigger_entry.tginitdeferred AS is_initially_deferred,
              pg_get_triggerdef(trigger_entry.oid, true) AS definition
         FROM pg_trigger AS trigger_entry
         JOIN pg_class AS relation ON relation.oid = trigger_entry.tgrelid
         JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND NOT trigger_entry.tgisinternal
          AND trigger_entry.tgname IN
            ('channels_initialize_event_sequence', 'channel_events_append_only_guard',
             'channel_membership_epochs_event_type_guard')
        ORDER BY trigger_entry.tgname`,
    );
    expect(triggers.rows).toEqual([
      {
        trigger_name: "channel_events_append_only_guard",
        table_name: "channel_events",
        is_deferrable: false,
        is_initially_deferred: false,
        definition:
          "CREATE TRIGGER channel_events_append_only_guard BEFORE DELETE OR UPDATE ON channel_events FOR EACH ROW EXECUTE FUNCTION reject_channel_event_mutation()",
      },
      {
        trigger_name: "channel_membership_epochs_event_type_guard",
        table_name: "channel_membership_epochs",
        is_deferrable: true,
        is_initially_deferred: true,
        definition:
          "CREATE CONSTRAINT TRIGGER channel_membership_epochs_event_type_guard AFTER INSERT OR UPDATE OF tenant_id, channel_id, joined_event_seq, exited_event_seq ON channel_membership_epochs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_channel_membership_event_types()",
      },
      {
        trigger_name: "channels_initialize_event_sequence",
        table_name: "channels",
        is_deferrable: false,
        is_initially_deferred: false,
        definition:
          "CREATE TRIGGER channels_initialize_event_sequence AFTER INSERT ON channels FOR EACH ROW EXECUTE FUNCTION initialize_channel_event_sequence()",
      },
    ]);

    const foreignKeys = await activeHarness().query<ForeignKeyCatalogRow>(
      "migrator",
      `SELECT constraint_entry.conname AS constraint_name,
              constraint_entry.condeferrable AS is_deferrable,
              constraint_entry.condeferred AS is_initially_deferred,
              pg_get_constraintdef(constraint_entry.oid, true) AS definition
         FROM pg_constraint AS constraint_entry
         JOIN pg_class AS relation ON relation.oid = constraint_entry.conrelid
         JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND constraint_entry.conname IN
            ('channel_membership_epochs_joined_event_fk',
             'channel_membership_epochs_exited_event_fk')
        ORDER BY constraint_entry.conname`,
    );
    expect(foreignKeys.rows).toEqual([
      {
        constraint_name: "channel_membership_epochs_exited_event_fk",
        is_deferrable: false,
        is_initially_deferred: false,
        definition:
          "FOREIGN KEY (tenant_id, channel_id, exited_event_seq) REFERENCES channel_events(tenant_id, channel_id, event_seq) ON UPDATE RESTRICT ON DELETE RESTRICT",
      },
      {
        constraint_name: "channel_membership_epochs_joined_event_fk",
        is_deferrable: false,
        is_initially_deferred: false,
        definition:
          "FOREIGN KEY (tenant_id, channel_id, joined_event_seq) REFERENCES channel_events(tenant_id, channel_id, event_seq) ON UPDATE RESTRICT ON DELETE RESTRICT",
      },
    ]);
  });

  it(
    "AW010A-S5 rejects synthetic positive markers and keeps typed errors free of fixture row data",
    async () => {
      await runMigrations(migrationEnvironment());
      await withCommittedTransaction(seedCompleteFixture);
      const syntheticFailure = await captureFailure(() =>
        activeHarness().query(
          "runtime",
          `INSERT INTO channel_membership_epochs
             (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq)
           VALUES ($1, $2, $3, $4, 'full', $5)`,
          [
            FIXTURE.tenantA,
            FIXTURE.channelA,
            FIXTURE.principalA,
            nextMembershipEpoch("synthetic_positive_marker"),
            "101",
          ],
        ),
      );
      expectPgFailure(syntheticFailure, "23503", {
        constraint: "channel_membership_epochs_joined_event_fk",
      });

      const genericFailure = await expectTypedCommitFailure(async (client) => {
        await appendEvent(client, {
          tenantId: FIXTURE.tenantA,
          channelId: FIXTURE.channelA,
          eventSeq: 1,
          eventType: "reaction.changed",
        });
        await insertMembership(client, {
          epochLabel: "generic_diagnostic_probe",
          joinedEventSeq: 1,
        });
      }, "channel membership joined event is invalid");
      const genericDiagnostics = diagnosticText(genericFailure);
      for (const fixtureValue of Object.values(FIXTURE)) {
        expect(genericDiagnostics).not.toContain(fixtureValue);
      }
      expect(genericDiagnostics).not.toMatch(/event_aw010a_s5_|epoch_aw010a_s5_|\{.*source/iu);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );
});
