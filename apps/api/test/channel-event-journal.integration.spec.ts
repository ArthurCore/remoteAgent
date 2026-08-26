import { execFile as execFileCallback } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import type {
  AppendChannelEventInput,
  ChannelEventIntent,
  TrustedChannelActor,
} from "@agent-workspace/chat-core";
import { DurableEventV1 } from "@agent-workspace/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  PostgresChannelEventJournalError,
  createPostgresChannelEventTransaction,
  type ChannelEventJournalTransactionClient,
} from "../src/adapters/postgres/channel-event-journal.adapter.js";
import {
  startPostgresTestHarness,
  type PostgresTestHarness,
} from "../../../packages/db/test/support/postgres.js";

const execFile = promisify(execFileCallback);
const HARNESS_START_TIMEOUT_MILLISECONDS = 180_000;
const TEST_TIMEOUT_MILLISECONDS = 30_000;
const AGGREGATE_DEADLINE_MILLISECONDS = 20_000;
const OCCURRED_AT = "2026-08-25T12:34:56.123456Z";
const MAX_PG_BIGINT = "9223372036854775807";
const MAX_PG_BIGINT_MINUS_ONE = "9223372036854775806";
const BEYOND_SAFE_INTEGER = "9007199254740992";
const BEYOND_SAFE_INTEGER_PLUS_ONE = "9007199254740993";
const FROZEN_MIGRATIONS = [
  {
    url: new URL("../../../packages/db/drizzle/0000_aw008_foundation.sql", import.meta.url),
    hash: "645229b04fc4eddd44d47301d47f1efbd394daa6c97852c3ea4a3cbb26df23c2",
    createdAt: "1787648708709",
  },
  {
    url: new URL("../../../packages/db/drizzle/0001_aw010a_channel_stream.sql", import.meta.url),
    hash: "e44f52f786360ac502c0d928cebaebdca718abdd39ae2e78275b9d21505aef26",
    createdAt: "1787695124181",
  },
] as const;
const DRIZZLE_STATEMENT_BREAKPOINT = "--> statement-breakpoint";

type ActorLiteral =
  | Readonly<{ kind: "human" | "service"; principalId: string }>
  | Readonly<{ kind: "system"; principalId: "system:channel-lifecycle" }>;

function trustedActor<const Actor extends ActorLiteral>(actor: Actor): Actor & TrustedChannelActor {
  return actor as Actor & TrustedChannelActor;
}

const SYSTEM_ACTOR = trustedActor({
  kind: "system",
  principalId: "system:channel-lifecycle",
});

type Client = Awaited<ReturnType<PostgresTestHarness["connect"]>>;
type QueryRow = Readonly<Record<string, unknown>>;
type RecordedQuery = Readonly<{ statement: string; values: readonly unknown[] }>;
type Fixture = Readonly<{
  tenantId: string;
  workspaceId: string;
  principalId: string;
  channelId: string;
  messageId: string;
}>;
type StoredEventRow = Readonly<{
  tenant_id: string;
  channel_id: string;
  event_seq: string;
  event_id: string;
  schema_version: number;
  event_type: string;
  actor_principal_id: string;
  actor_kind: "human" | "service" | "system";
  occurred_at: string;
  payload: unknown;
}>;
type Deferred<Value> = Readonly<{
  promise: Promise<Value>;
  resolve(value: Value | PromiseLike<Value>): void;
  reject(reason?: unknown): void;
}>;

type PgDiagnostic = Error & Readonly<{ code?: string; constraint?: string }>;
type HarnessEvidenceCapture = Readonly<{
  runId: string;
  resources: Readonly<{
    containerName: string;
    database: string;
    labels: readonly string[];
  }>;
  roleNames: readonly [string, string, string];
  connectionUrls: readonly [string, string, string];
  evidencePath: string;
  expectedEvidence: PostgresTestHarness["evidence"];
  expectedBytes: Buffer;
}>;

let harness: PostgresTestHarness | undefined;
let fixtureOrdinal = 0;

function activeHarness(): PostgresTestHarness {
  if (harness === undefined) {
    throw new Error("PostgreSQL integration harness is not active");
  }
  return harness;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function withDeadline<Value>(
  operation: Promise<Value>,
  milliseconds = AGGREGATE_DEADLINE_MILLISECONDS,
): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("Concurrent channel-event aggregate exceeded its deadline")),
      milliseconds,
    );
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function fixtureId(prefix: string): string {
  fixtureOrdinal += 1;
  const runFragment = activeHarness()
    .resources.runId.replaceAll(/[^a-zA-Z0-9]/gu, "")
    .slice(-12);
  return `${prefix}_${runFragment}_${fixtureOrdinal}_${randomUUID().replaceAll("-", "")}`;
}

function createdIntent(messageId: string): ChannelEventIntent {
  return {
    eventType: "message.created",
    payload: {
      message_id: messageId,
      thread_root_id: null,
      version: 1,
      resolved_mention_principal_ids: [],
      resolved_mention_items: [],
    },
  };
}

function appendInput(
  fixture: Fixture,
  options: Readonly<{
    actor?: TrustedChannelActor;
    intent?: ChannelEventIntent;
  }> = {},
): AppendChannelEventInput {
  return {
    tenantId: fixture.tenantId,
    channelId: fixture.channelId,
    actor: options.actor ?? SYSTEM_ACTOR,
    intent: options.intent ?? createdIntent(fixture.messageId),
  };
}

function narrowTransaction(
  client: Client,
  onQuery?: (statement: string, values: readonly unknown[]) => void,
): ChannelEventJournalTransactionClient {
  return {
    async query(statement: string, values: readonly unknown[]) {
      const copiedValues = [...values];
      onQuery?.(statement, copiedValues);
      const result = await client.query<QueryRow>(statement, copiedValues);
      return {
        rows: result.rows,
        rowCount: result.rowCount ?? -1,
      };
    },
  };
}

function makeJournal(
  client: Client,
  options: Readonly<{
    eventId?: string;
    occurredAt?: string;
    onQuery?: (statement: string, values: readonly unknown[]) => void;
  }> = {},
) {
  const eventId = options.eventId ?? fixtureId("evt");
  const occurredAt = options.occurredAt ?? OCCURRED_AT;
  return {
    eventId,
    occurredAt,
    journal: createPostgresChannelEventTransaction({
      transaction: narrowTransaction(client, options.onQuery),
      generateEventId: () => eventId,
      clock: () => occurredAt,
    }),
  };
}

async function beginRuntimeClient(): Promise<Client> {
  const client = await activeHarness().connect("runtime");
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL lock_timeout = '10s'");
    return client;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    throw error;
  }
}

async function rollbackAndRelease(client: Client): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
}

async function rollbackAndReleaseAll(clients: readonly Client[]): Promise<void> {
  const settled = await Promise.allSettled(clients.map((client) => rollbackAndRelease(client)));
  const failures = settled.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  if (failures.length === 1) {
    throw failures[0];
  }
  if (failures.length > 1) {
    throw new AggregateError(failures, "PostgreSQL runtime client cleanup failed");
  }
}

async function acquireRuntimeClients(count: number): Promise<readonly Client[]> {
  const clients: Client[] = [];
  try {
    for (let index = 0; index < count; index += 1) {
      clients.push(await beginRuntimeClient());
    }
    return clients;
  } catch (error) {
    try {
      await rollbackAndReleaseAll(clients);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "PostgreSQL runtime client acquisition and cleanup failed",
      );
    }
    throw error;
  }
}

async function withRuntimeTransaction<Value>(
  operation: (client: Client) => Promise<Value>,
): Promise<Value> {
  const client = await beginRuntimeClient();
  let committed = false;
  try {
    const result = await operation(client);
    await client.query("COMMIT");
    committed = true;
    return result;
  } finally {
    try {
      if (!committed) {
        await client.query("ROLLBACK");
      }
    } finally {
      client.release();
    }
  }
}

async function seedFixture(
  options: Readonly<{ principalKind?: "human" | "service" }> = {},
): Promise<Fixture> {
  const fixture: Fixture = {
    tenantId: fixtureId("ten"),
    workspaceId: fixtureId("wsp"),
    principalId: fixtureId("prn"),
    channelId: fixtureId("chn"),
    messageId: fixtureId("msg"),
  };
  const client = await activeHarness().connect("owner");
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO public.tenants (tenant_id) VALUES ($1)", [fixture.tenantId]);
    await client.query("INSERT INTO public.workspaces (tenant_id, workspace_id) VALUES ($1, $2)", [
      fixture.tenantId,
      fixture.workspaceId,
    ]);
    await client.query(
      `INSERT INTO public.principals (tenant_id, principal_id, principal_kind)
       VALUES ($1, $2, $3)`,
      [fixture.tenantId, fixture.principalId, options.principalKind ?? "human"],
    );
    await client.query(
      `INSERT INTO public.channels (tenant_id, workspace_id, channel_id, kind)
       VALUES ($1, $2, $3, 'public')`,
      [fixture.tenantId, fixture.workspaceId, fixture.channelId],
    );
    await client.query("COMMIT");
    return fixture;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function seedSecondChannel(fixture: Fixture): Promise<Fixture> {
  const channelFixture: Fixture = {
    ...fixture,
    channelId: fixtureId("chn"),
    messageId: fixtureId("msg"),
  };
  const client = await activeHarness().connect("owner");
  try {
    await client.query(
      `INSERT INTO public.channels (tenant_id, workspace_id, channel_id, kind)
       VALUES ($1, $2, $3, 'public')`,
      [channelFixture.tenantId, channelFixture.workspaceId, channelFixture.channelId],
    );
    return channelFixture;
  } finally {
    client.release();
  }
}

async function setSequence(fixture: Fixture, value: string): Promise<void> {
  const client = await activeHarness().connect("owner");
  try {
    const result = await client.query(
      `UPDATE public.channel_event_sequences
       SET last_event_seq = $3::bigint
       WHERE tenant_id = $1 AND channel_id = $2`,
      [fixture.tenantId, fixture.channelId, value],
    );
    expect(result.rowCount).toBe(1);
  } finally {
    client.release();
  }
}

async function queryState(fixture: Fixture): Promise<string | undefined> {
  const client = await activeHarness().connect("owner");
  try {
    const result = await client.query<{ last_event_seq: string }>(
      `SELECT last_event_seq::text AS last_event_seq
       FROM public.channel_event_sequences
       WHERE tenant_id = $1 AND channel_id = $2`,
      [fixture.tenantId, fixture.channelId],
    );
    expect(result.rowCount).not.toBeNull();
    return result.rows[0]?.last_event_seq;
  } finally {
    client.release();
  }
}

async function queryEventsWithClient(
  client: Client,
  fixture: Fixture,
): Promise<readonly StoredEventRow[]> {
  const result = await client.query<StoredEventRow>(
    `SELECT
         tenant_id,
         channel_id,
         event_seq::text AS event_seq,
         event_id,
         schema_version,
         event_type,
         actor_principal_id,
         actor_kind::text AS actor_kind,
         to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at,
         payload
       FROM public.channel_events
       WHERE tenant_id = $1 AND channel_id = $2
       ORDER BY event_seq`,
    [fixture.tenantId, fixture.channelId],
  );
  return result.rows;
}

async function queryEvents(fixture: Fixture): Promise<readonly StoredEventRow[]> {
  const client = await activeHarness().connect("owner");
  try {
    return await queryEventsWithClient(client, fixture);
  } finally {
    client.release();
  }
}

function durableFromStored(row: StoredEventRow) {
  return DurableEventV1.parse({
    schema_version: row.schema_version,
    event_id: row.event_id,
    tenant_id: row.tenant_id,
    channel_id: row.channel_id,
    event_seq: row.event_seq,
    event_type: row.event_type,
    actor: {
      principal_id: row.actor_principal_id,
      kind: row.actor_kind,
    },
    occurred_at: row.occurred_at,
    payload: row.payload,
  });
}

async function captureError(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error("Expected operation to reject");
}

async function captureRuntimePgFailure(
  statement: string,
  values: readonly unknown[] = [],
): Promise<PgDiagnostic> {
  const client = await beginRuntimeClient();
  try {
    return (await captureError(client.query(statement, [...values]))) as PgDiagnostic;
  } finally {
    await rollbackAndRelease(client);
  }
}

function captureHarnessEvidence(testHarness: PostgresTestHarness): HarnessEvidenceCapture {
  const expectedEvidence = testHarness.evidence;
  return {
    runId: testHarness.resources.runId,
    resources: {
      containerName: testHarness.resources.containerName,
      database: testHarness.resources.database,
      labels: Object.entries(testHarness.resources.labels).map(([key, value]) => `${key}=${value}`),
    },
    roleNames: [
      testHarness.resources.ownerRole,
      testHarness.resources.migratorRole,
      testHarness.resources.runtimeRole,
    ],
    connectionUrls: [
      testHarness.connectionUrls.owner,
      testHarness.connectionUrls.migrator,
      testHarness.connectionUrls.runtime,
    ],
    evidencePath: testHarness.evidencePath,
    expectedEvidence,
    expectedBytes: Buffer.from(`${JSON.stringify(expectedEvidence, undefined, 2)}\n`, "utf8"),
  };
}

async function inspectEvidenceBeforeStop(capture: HarnessEvidenceCapture): Promise<unknown[]> {
  const failures: unknown[] = [];
  let originalBytes: Buffer | undefined;
  let rereadBytes: Buffer | undefined;
  try {
    const stats = await lstat(capture.evidencePath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      failures.push(new Error("evidence: expected a regular non-symlink file"));
    }
    if ((stats.mode & 0o777) !== 0o600) {
      failures.push(new Error("evidence: expected mode 0600"));
    }
  } catch {
    failures.push(new Error("evidence: lstat failed"));
  }

  try {
    originalBytes = await readFile(capture.evidencePath);
    if (!originalBytes.equals(capture.expectedBytes)) {
      failures.push(new Error("evidence: bytes did not equal the expected JSON object"));
    }
  } catch {
    failures.push(new Error("evidence: initial read failed"));
  }

  try {
    try {
      await writeFile(capture.evidencePath, Buffer.from("exclusive-create-probe", "utf8"), {
        flag: "wx",
        mode: 0o600,
      });
      failures.push(new Error("evidence: exclusive create unexpectedly succeeded"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        failures.push(new Error("evidence: exclusive create did not fail with EEXIST"));
      }
    }
  } catch {
    failures.push(new Error("evidence: exclusive-create probe failed unexpectedly"));
  }

  try {
    rereadBytes = await readFile(capture.evidencePath);
    if (originalBytes !== undefined && !rereadBytes.equals(originalBytes)) {
      failures.push(new Error("evidence: bytes changed after exclusive-create probe"));
    }
    if (!rereadBytes.equals(capture.expectedBytes)) {
      failures.push(new Error("evidence: re-read bytes did not equal the expected JSON object"));
    }
  } catch {
    failures.push(new Error("evidence: re-read failed"));
  }

  const completeBytes = originalBytes ?? rereadBytes;
  if (completeBytes !== undefined) {
    const text = completeBytes.toString("utf8");
    const forbiddenValues = [...capture.roleNames, ...capture.connectionUrls];
    const leakedValueCount = forbiddenValues.filter((value) => text.includes(value)).length;
    const credentialGrammar = [
      /postgres(?:ql)?:\/\//giu,
      /[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+(?::[^/\s@]*)?@/giu,
      /["']?(?:password|passwd|pwd|secret|username|user)["']?\s*[:=]/giu,
      /\b(?:DATABASE_URL|MIGRATION_DATABASE_URL)\b/gu,
    ];
    const grammarMatchCount = credentialGrammar.reduce(
      (count, pattern) => count + (text.match(pattern)?.length ?? 0),
      0,
    );
    if (leakedValueCount !== 0 || grammarMatchCount !== 0) {
      failures.push(
        new Error(
          `evidence: forbidden credential scan failed (${leakedValueCount} values, ${grammarMatchCount} grammar matches)`,
        ),
      );
    }
  }
  return failures;
}

async function findResidualContainerIds(labels: readonly string[]): Promise<readonly string[]> {
  const args = ["ps", "-a"];
  for (const label of labels) {
    args.push("--filter", `label=${label}`);
  }
  args.push("--format", "{{.ID}}");
  const { stdout } = await execFile("docker", args, { encoding: "utf8" });
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function applyFrozenMigrations(): Promise<void> {
  const migrations = await Promise.all(
    FROZEN_MIGRATIONS.map(async (migration) => {
      const bytes = await readFile(migration.url);
      if (createHash("sha256").update(bytes).digest("hex") !== migration.hash) {
        throw new Error("Frozen PostgreSQL migration bytes do not match the S7 oracle");
      }
      const statements = bytes
        .toString("utf8")
        .split(DRIZZLE_STATEMENT_BREAKPOINT)
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);
      return { ...migration, statements };
    }),
  );

  const client = await activeHarness().connect("migrator");
  let transactionStarted = false;
  let committed = false;
  try {
    await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
    await client.query(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`);
    await client.query("BEGIN");
    transactionStarted = true;
    for (const migration of migrations) {
      for (const statement of migration.statements) {
        await client.query(statement);
      }
      await client.query(
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
         VALUES ($1, $2::bigint)`,
        [migration.hash, migration.createdAt],
      );
    }
    await client.query("COMMIT");
    committed = true;
  } finally {
    if (transactionStarted && !committed) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    client.release();
  }
}

beforeAll(async () => {
  harness = await startPostgresTestHarness();
}, HARNESS_START_TIMEOUT_MILLISECONDS);

beforeEach(async () => {
  fixtureOrdinal = 0;
  const testHarness = activeHarness();
  await testHarness.resetDatabase();
  await applyFrozenMigrations();
});

afterAll(async () => {
  const testHarness = harness;
  if (testHarness === undefined) {
    return;
  }

  const capture = captureHarnessEvidence(testHarness);
  const failures: unknown[] = [];

  try {
    failures.push(...(await inspectEvidenceBeforeStop(capture)));
  } catch {
    failures.push(new Error("evidence: inspection pipeline failed"));
  }
  try {
    await testHarness.stop();
  } catch (error) {
    failures.push(error);
  } finally {
    try {
      const residue = await findResidualContainerIds(capture.resources.labels);
      if (residue.length !== 0) {
        failures.push(new Error(`residue: expected zero containers, received ${residue.length}`));
      }
    } catch (error) {
      failures.push(error);
    }
  }
  harness = undefined;

  if (failures.length === 1) {
    throw failures[0];
  }
  if (failures.length > 1) {
    throw new AggregateError(failures, "PostgreSQL integration teardown failed");
  }
}, 90_000);

describe("AW010A-S7 real PostgreSQL channel event journal", () => {
  it(
    "AW010A-S7 commits and round-trips one canonical event through DurableEventV1",
    async () => {
      const fixture = await seedFixture();
      const eventId = fixtureId("evt");
      const result = await withRuntimeTransaction(async (client) => {
        const { journal } = makeJournal(client, { eventId, occurredAt: OCCURRED_AT });
        return journal.append(appendInput(fixture));
      });

      expect(result).toEqual({ eventSeq: 1n, eventId, occurredAt: OCCURRED_AT });
      const rows = await queryEvents(fixture);
      expect(rows).toHaveLength(1);
      const expectedEvent = {
        schema_version: 1,
        event_id: eventId,
        tenant_id: fixture.tenantId,
        channel_id: fixture.channelId,
        event_seq: "1",
        event_type: "message.created",
        actor: {
          principal_id: "system:channel-lifecycle",
          kind: "system",
        },
        occurred_at: OCCURRED_AT,
        payload: createdIntent(fixture.messageId).payload,
      };
      expect(durableFromStored(rows[0]!)).toEqual(DurableEventV1.parse(expectedEvent));
      expect(rows[0]!.payload).toEqual(expectedEvent.payload);
      expect(await queryState(fixture)).toBe("1");
      expect(rows).toHaveLength(1);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S7 allocates exact unique contiguous 1 through 4 for four same-channel commits",
    async () => {
      const fixture = await seedFixture();
      const clients = await acquireRuntimeClients(4);
      const barrier = deferred<void>();
      const eventIds = clients.map(() => fixtureId("evt"));
      try {
        const operations = clients.map(async (client, index) => {
          await barrier.promise;
          const { journal } = makeJournal(client, { eventId: eventIds[index] });
          const result = await journal.append({
            ...appendInput(fixture),
            intent: createdIntent(fixtureId("msg")),
          });
          await client.query("COMMIT");
          return result;
        });
        barrier.resolve();
        const results = await withDeadline(Promise.all(operations));
        expect(results.map(({ eventSeq }) => eventSeq).sort((a, b) => (a < b ? -1 : 1))).toEqual([
          1n,
          2n,
          3n,
          4n,
        ]);
        expect(new Set(results.map(({ eventId }) => eventId))).toEqual(new Set(eventIds));
      } finally {
        await rollbackAndReleaseAll(clients);
      }

      const rows = await queryEvents(fixture);
      expect(rows.map(({ event_seq }) => BigInt(event_seq))).toEqual([1n, 2n, 3n, 4n]);
      expect(new Set(rows.map(({ event_id }) => event_id))).toEqual(new Set(eventIds));
      expect(await queryState(fixture)).toBe("4");
      expect(rows).toHaveLength(4);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S7 allocates sequence 1 independently for concurrent different-channel commits",
    async () => {
      const first = await seedFixture();
      const second = await seedSecondChannel(first);
      const fixtures = [first, second] as const;
      const clients = await acquireRuntimeClients(fixtures.length);
      const barrier = deferred<void>();
      try {
        const operations = clients.map(async (client, index) => {
          await barrier.promise;
          const { journal } = makeJournal(client);
          const result = await journal.append(appendInput(fixtures[index]!));
          await client.query("COMMIT");
          return result;
        });
        barrier.resolve();
        const results = await withDeadline(Promise.all(operations));
        expect(results[0]!.eventSeq).toBe(1n);
        expect(results[1]!.eventSeq).toBe(1n);
      } finally {
        await rollbackAndReleaseAll(clients);
      }

      for (const fixture of fixtures) {
        expect(await queryState(fixture)).toBe("1");
        expect((await queryEvents(fixture)).map(({ event_seq }) => event_seq)).toEqual(["1"]);
      }
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S7 caller rollback after successful append leaves sequence zero and no events",
    async () => {
      const fixture = await seedFixture();
      const client = await beginRuntimeClient();
      try {
        const { journal } = makeJournal(client);
        const result = await journal.append(appendInput(fixture));
        expect(result.eventSeq).toBe(1n);
        await client.query("ROLLBACK");
      } finally {
        await rollbackAndRelease(client);
      }
      expect(await queryState(fixture)).toBe("0");
      expect(await queryEvents(fixture)).toEqual([]);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S7 duplicate event ID rolls back the attempted sequence allocation",
    async () => {
      const fixture = await seedFixture();
      const duplicateEventId = fixtureId("evt");
      await withRuntimeTransaction(async (client) => {
        const { journal } = makeJournal(client, { eventId: duplicateEventId });
        await journal.append(appendInput(fixture));
      });

      const client = await beginRuntimeClient();
      try {
        const { journal } = makeJournal(client, { eventId: duplicateEventId });
        const error = (await captureError(journal.append(appendInput(fixture)))) as PgDiagnostic;
        expect(error.code).toBe("23505");
        expect(error.constraint).toBe("channel_events_event_id_key");
      } finally {
        await rollbackAndRelease(client);
      }

      expect(await queryState(fixture)).toBe("1");
      const rows = await queryEvents(fixture);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.event_id).toBe(duplicateEventId);
      expect(rows[0]!.event_seq).toBe("1");
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S7 invalid envelope and payload fail before allocation with zero state change",
    async () => {
      const fixture = await seedFixture();
      const cases: readonly Readonly<{
        intent: ChannelEventIntent;
        occurredAt: string;
      }>[] = [
        {
          intent: {
            eventType: "message.updated",
            payload: createdIntent(fixture.messageId).payload,
          } as unknown as ChannelEventIntent,
          occurredAt: OCCURRED_AT,
        },
        {
          intent: createdIntent(fixture.messageId),
          occurredAt: "2026-08-25T12:34:56.123456+00:00",
        },
      ];

      for (const testCase of cases) {
        const client = await beginRuntimeClient();
        let queryCount = 0;
        try {
          const { journal } = makeJournal(client, {
            occurredAt: testCase.occurredAt,
            onQuery: () => {
              queryCount += 1;
            },
          });
          const error = await captureError(
            journal.append(appendInput(fixture, { intent: testCase.intent })),
          );
          expect(error).toBeInstanceOf(PostgresChannelEventJournalError);
          expect((error as PostgresChannelEventJournalError).code).toBe("CHANNEL_EVENT_INVALID");
          expect(queryCount).toBe(0);
        } finally {
          await rollbackAndRelease(client);
        }
      }

      expect(await queryState(fixture)).toBe("0");
      expect(await queryEvents(fixture)).toEqual([]);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S7 round-trips bigint beyond the JavaScript safe integer exactly",
    async () => {
      const fixture = await seedFixture();
      await setSequence(fixture, BEYOND_SAFE_INTEGER);
      const result = await withRuntimeTransaction(async (client) => {
        const { journal } = makeJournal(client);
        return journal.append(appendInput(fixture));
      });
      expect(result.eventSeq).toBe(9_007_199_254_740_993n);
      expect(typeof result.eventSeq).toBe("bigint");
      expect(await queryState(fixture)).toBe(BEYOND_SAFE_INTEGER_PLUS_ONE);
      const rows = await queryEvents(fixture);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.event_seq).toBe(BEYOND_SAFE_INTEGER_PLUS_ONE);
      expect(durableFromStored(rows[0]!).event_seq).toBe(BEYOND_SAFE_INTEGER_PLUS_ONE);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S7 allocates and commits bigint MAX from MAX minus one",
    async () => {
      const fixture = await seedFixture();
      await setSequence(fixture, MAX_PG_BIGINT_MINUS_ONE);
      const result = await withRuntimeTransaction(async (client) => {
        const { journal } = makeJournal(client);
        return journal.append(appendInput(fixture));
      });
      expect(result.eventSeq).toBe(9_223_372_036_854_775_807n);
      expect(await queryState(fixture)).toBe(MAX_PG_BIGINT);
      const rows = await queryEvents(fixture);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.event_seq).toBe(MAX_PG_BIGINT);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S7 rejects exhausted bigint MAX without insert or state change",
    async () => {
      const fixture = await seedFixture();
      await setSequence(fixture, MAX_PG_BIGINT);
      const client = await beginRuntimeClient();
      try {
        const { journal } = makeJournal(client);
        const error = await captureError(journal.append(appendInput(fixture)));
        expect(error).toBeInstanceOf(PostgresChannelEventJournalError);
        expect((error as PostgresChannelEventJournalError).code).toBe("CHANNEL_STREAM_EXHAUSTED");
      } finally {
        await rollbackAndRelease(client);
      }
      expect(await queryState(fixture)).toBe(MAX_PG_BIGINT);
      expect(await queryEvents(fixture)).toEqual([]);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S7 commits exactly one bigint MAX winner for two MAX minus one contenders",
    async () => {
      const fixture = await seedFixture();
      await setSequence(fixture, MAX_PG_BIGINT_MINUS_ONE);
      const clients = await acquireRuntimeClients(2);
      const barrier = deferred<void>();
      let settled: readonly PromiseSettledResult<{
        eventSeq: bigint;
        eventId: string;
        occurredAt: string;
      }>[] = [];
      try {
        const operations = clients.map(async (client) => {
          await barrier.promise;
          try {
            const { journal } = makeJournal(client);
            const result = await journal.append(appendInput(fixture));
            await client.query("COMMIT");
            return result;
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          }
        });
        barrier.resolve();
        settled = await withDeadline(Promise.allSettled(operations));
      } finally {
        await rollbackAndReleaseAll(clients);
      }

      const fulfilled = settled.filter(
        (
          result,
        ): result is PromiseFulfilledResult<{
          eventSeq: bigint;
          eventId: string;
          occurredAt: string;
        }> => result.status === "fulfilled",
      );
      const rejected = settled.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      expect(fulfilled).toHaveLength(1);
      expect(fulfilled[0]!.value.eventSeq).toBe(9_223_372_036_854_775_807n);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.reason).toBeInstanceOf(PostgresChannelEventJournalError);
      expect((rejected[0]!.reason as PostgresChannelEventJournalError).code).toBe(
        "CHANNEL_STREAM_EXHAUSTED",
      );
      expect(await queryState(fixture)).toBe(MAX_PG_BIGINT);
      const rows = await queryEvents(fixture);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.event_seq).toBe(MAX_PG_BIGINT);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S7 maps an existing channel with missing sequence state without writes",
    async () => {
      const target = await seedFixture();
      const sentinel = await seedFixture();
      await withRuntimeTransaction(async (client) => {
        const { journal } = makeJournal(client);
        await journal.append(appendInput(sentinel));
      });
      const sentinelStateBefore = await queryState(sentinel);
      const sentinelEventsBefore = await queryEvents(sentinel);
      expect(sentinelStateBefore).toBe("1");
      expect(sentinelEventsBefore).toHaveLength(1);

      const owner = await activeHarness().connect("owner");
      try {
        const deleted = await owner.query(
          `DELETE FROM public.channel_event_sequences
           WHERE tenant_id = $1 AND channel_id = $2`,
          [target.tenantId, target.channelId],
        );
        expect(deleted.rowCount).toBe(1);
      } finally {
        owner.release();
      }

      const client = await beginRuntimeClient();
      try {
        const { journal } = makeJournal(client);
        const error = await captureError(journal.append(appendInput(target)));
        expect(error).toMatchObject({
          name: "PostgresChannelEventJournalError",
          code: "CHANNEL_STREAM_STATE_MISSING",
          message: "Channel stream state is missing.",
        });
      } finally {
        await rollbackAndRelease(client);
      }

      expect(await queryState(target)).toBeUndefined();
      expect(await queryEvents(target)).toEqual([]);
      expect(await queryState(sentinel)).toBe(sentinelStateBefore);
      expect(await queryEvents(sentinel)).toEqual(sentinelEventsBefore);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S7 rejects a channel that exists only in another tenant without cross-tenant writes",
    async () => {
      const tenantAControl = await seedFixture();
      const tenantBChannel = await seedFixture();
      const tenantAProbe: Fixture = {
        ...tenantAControl,
        channelId: tenantBChannel.channelId,
        messageId: fixtureId("msg"),
      };
      const tenantAStateBefore = await queryState(tenantAControl);
      const tenantAEventsBefore = await queryEvents(tenantAControl);
      const tenantBStateBefore = await queryState(tenantBChannel);
      const tenantBEventsBefore = await queryEvents(tenantBChannel);

      const client = await beginRuntimeClient();
      try {
        const { journal } = makeJournal(client);
        const error = await captureError(journal.append(appendInput(tenantAProbe)));
        expect(error).toMatchObject({
          name: "PostgresChannelEventJournalError",
          code: "CHANNEL_STREAM_STATE_MISSING",
          message: "Channel stream state is missing.",
        });
      } finally {
        await rollbackAndRelease(client);
      }

      expect(await queryState(tenantAProbe)).toBeUndefined();
      expect(await queryEvents(tenantAProbe)).toEqual([]);
      expect(await queryState(tenantAControl)).toBe(tenantAStateBefore);
      expect(await queryEvents(tenantAControl)).toEqual(tenantAEventsBefore);
      expect(await queryState(tenantBChannel)).toBe(tenantBStateBefore);
      expect(await queryEvents(tenantBChannel)).toEqual(tenantBEventsBefore);
      expect(tenantAStateBefore).toBe("0");
      expect(tenantAEventsBefore).toEqual([]);
      expect(tenantBStateBefore).toBe("0");
      expect(tenantBEventsBefore).toEqual([]);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S7 rejects a cross-tenant human principal before allocation",
    async () => {
      const target = await seedFixture();
      const tenantB = await seedFixture();
      const tenantBStateBefore = await queryState(tenantB);
      const tenantBEventsBefore = await queryEvents(tenantB);
      const actor = trustedActor({ kind: "human", principalId: tenantB.principalId });
      const queries: RecordedQuery[] = [];

      const client = await beginRuntimeClient();
      try {
        const { journal } = makeJournal(client, {
          onQuery: (statement, values) => queries.push({ statement, values }),
        });
        const error = await captureError(journal.append(appendInput(target, { actor })));
        expect(error).toMatchObject({
          name: "PostgresChannelEventJournalError",
          code: "CHANNEL_ACTOR_NOT_FOUND",
          message: "Channel actor was not found.",
        });
      } finally {
        await rollbackAndRelease(client);
      }

      expect(queries).toEqual([
        {
          statement: `SELECT principal_kind::text AS principal_kind
FROM public.principals
WHERE tenant_id = $1
  AND principal_id = $2
FOR SHARE`,
          values: [target.tenantId, tenantB.principalId],
        },
      ]);
      expect(await queryState(target)).toBe("0");
      expect(await queryEvents(target)).toEqual([]);
      expect(await queryState(tenantB)).toBe(tenantBStateBefore);
      expect(await queryEvents(tenantB)).toEqual(tenantBEventsBefore);
      expect(tenantBStateBefore).toBe("0");
      expect(tenantBEventsBefore).toEqual([]);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S7 rejects a database principal kind mismatch before allocation",
    async () => {
      const fixture = await seedFixture({ principalKind: "service" });
      const actor = trustedActor({ kind: "human", principalId: fixture.principalId });
      const queries: RecordedQuery[] = [];

      const client = await beginRuntimeClient();
      try {
        const { journal } = makeJournal(client, {
          onQuery: (statement, values) => queries.push({ statement, values }),
        });
        const error = await captureError(journal.append(appendInput(fixture, { actor })));
        expect(error).toMatchObject({
          name: "PostgresChannelEventJournalError",
          code: "CHANNEL_ACTOR_KIND_MISMATCH",
          message: "Channel actor kind does not match.",
        });
      } finally {
        await rollbackAndRelease(client);
      }

      expect(queries).toEqual([
        {
          statement: `SELECT principal_kind::text AS principal_kind
FROM public.principals
WHERE tenant_id = $1
  AND principal_id = $2
FOR SHARE`,
          values: [fixture.tenantId, fixture.principalId],
        },
      ]);
      expect(await queryState(fixture)).toBe("0");
      expect(await queryEvents(fixture)).toEqual([]);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S7 accepts only the lifecycle system actor and rejects arbitrary system IDs before queries",
    async () => {
      const fixture = await seedFixture();
      const committedEventId = fixtureId("evt");
      const committed = await withRuntimeTransaction(async (client) => {
        const { journal } = makeJournal(client, { eventId: committedEventId });
        return journal.append(appendInput(fixture));
      });
      expect(committed).toEqual({
        eventSeq: 1n,
        eventId: committedEventId,
        occurredAt: OCCURRED_AT,
      });
      const storedBefore = await queryEvents(fixture);
      expect(storedBefore).toHaveLength(1);
      expect(storedBefore[0]).toMatchObject({
        actor_principal_id: "system:channel-lifecycle",
        actor_kind: "system",
      });
      expect(await queryState(fixture)).toBe("1");

      let queryCount = 0;
      let generatorCalls = 0;
      let clockCalls = 0;
      const forgedActor = {
        kind: "system",
        principalId: "system:arbitrary-s7",
      } as unknown as TrustedChannelActor;
      const client = await beginRuntimeClient();
      try {
        const journal = createPostgresChannelEventTransaction({
          transaction: narrowTransaction(client, () => {
            queryCount += 1;
          }),
          generateEventId: () => {
            generatorCalls += 1;
            return fixtureId("evt");
          },
          clock: () => {
            clockCalls += 1;
            return OCCURRED_AT;
          },
        });
        const error = await captureError(
          journal.append(appendInput(fixture, { actor: forgedActor })),
        );
        expect(error).toMatchObject({
          name: "PostgresChannelEventJournalError",
          code: "CHANNEL_ACTOR_INVALID",
          message: "Channel actor is invalid.",
        });
      } finally {
        await rollbackAndRelease(client);
      }

      expect(queryCount).toBe(0);
      expect(generatorCalls).toBe(0);
      expect(clockCalls).toBe(0);
      expect(await queryState(fixture)).toBe("1");
      expect(await queryEvents(fixture)).toEqual(storedBefore);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S7 enforces event ID and tenant channel sequence uniqueness with exact catalog diagnostics",
    async () => {
      const constraints = await activeHarness().query<{
        constraint_name: string;
        definition: string;
      }>(
        "owner",
        `SELECT
           constraint_record.conname AS constraint_name,
           pg_catalog.pg_get_constraintdef(constraint_record.oid, true) AS definition
         FROM pg_catalog.pg_constraint AS constraint_record
         JOIN pg_catalog.pg_class AS relation
           ON relation.oid = constraint_record.conrelid
         JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = 'public'
           AND relation.relname = 'channel_events'
           AND constraint_record.conname IN ('channel_events_event_id_key', 'channel_events_pkey')
         ORDER BY constraint_record.conname`,
      );
      expect(constraints.rows).toEqual([
        {
          constraint_name: "channel_events_event_id_key",
          definition: "UNIQUE (event_id)",
        },
        {
          constraint_name: "channel_events_pkey",
          definition: "PRIMARY KEY (tenant_id, channel_id, event_seq)",
        },
      ]);

      const fixture = await seedFixture();
      const seededEventId = fixtureId("evt");
      await withRuntimeTransaction(async (client) => {
        const { journal } = makeJournal(client, { eventId: seededEventId });
        await journal.append(appendInput(fixture));
      });
      const seededRows = await queryEvents(fixture);
      expect(seededRows).toHaveLength(1);

      const duplicateEventIdError = await captureRuntimePgFailure(
        `INSERT INTO public.channel_events (
           tenant_id, channel_id, event_seq, event_id, schema_version,
           event_type, actor_principal_id, actor_kind, occurred_at, payload
         )
         SELECT
           tenant_id, channel_id, event_seq + 1, event_id, schema_version,
           event_type, actor_principal_id, actor_kind, occurred_at, payload
         FROM public.channel_events
         WHERE tenant_id = $1 AND channel_id = $2 AND event_seq = 1`,
        [fixture.tenantId, fixture.channelId],
      );
      expect(duplicateEventIdError.code).toBe("23505");
      expect(duplicateEventIdError.constraint).toBe("channel_events_event_id_key");

      const duplicateSequenceError = await captureRuntimePgFailure(
        `INSERT INTO public.channel_events (
           tenant_id, channel_id, event_seq, event_id, schema_version,
           event_type, actor_principal_id, actor_kind, occurred_at, payload
         )
         SELECT
           tenant_id, channel_id, event_seq, $3, schema_version,
           event_type, actor_principal_id, actor_kind, occurred_at, payload
         FROM public.channel_events
         WHERE tenant_id = $1 AND channel_id = $2 AND event_seq = 1`,
        [fixture.tenantId, fixture.channelId, fixtureId("evt")],
      );
      expect(duplicateSequenceError.code).toBe("23505");
      expect(duplicateSequenceError.constraint).toBe("channel_events_pkey");

      expect(await queryState(fixture)).toBe("1");
      expect(await queryEvents(fixture)).toEqual(seededRows);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S7 rejects runtime journal UPDATE and DELETE while preserving the stored event",
    async () => {
      const fixture = await seedFixture();
      await withRuntimeTransaction(async (client) => {
        const { journal } = makeJournal(client);
        await journal.append(appendInput(fixture));
      });
      const storedBefore = await queryEvents(fixture);
      expect(storedBefore).toHaveLength(1);
      expect(await queryState(fixture)).toBe("1");

      const updateError = await captureRuntimePgFailure(
        `UPDATE public.channel_events
         SET payload = payload
         WHERE tenant_id = $1 AND channel_id = $2 AND event_seq = $3::bigint`,
        [fixture.tenantId, fixture.channelId, "1"],
      );
      expect(updateError.code).toBe("55000");
      expect(updateError.message).toBe("channel events are append-only");

      const deleteError = await captureRuntimePgFailure(
        `DELETE FROM public.channel_events
         WHERE tenant_id = $1 AND channel_id = $2 AND event_seq = $3::bigint`,
        [fixture.tenantId, fixture.channelId, "1"],
      );
      expect(deleteError.code).toBe("55000");
      expect(deleteError.message).toBe("channel events are append-only");

      expect(await queryState(fixture)).toBe("1");
      expect(await queryEvents(fixture)).toEqual(storedBefore);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S7 runtime-role adapter append and select round-trip a human event",
    async () => {
      const fixture = await seedFixture();
      const actor = trustedActor({ kind: "human", principalId: fixture.principalId });
      const eventId = fixtureId("evt");
      const client = await beginRuntimeClient();
      let committed = false;
      try {
        const identity = await client.query<{ current_user: string }>("SELECT current_user");
        expect(identity.rowCount).toBe(1);
        expect(identity.rows).toEqual([{ current_user: activeHarness().resources.runtimeRole }]);

        const { journal } = makeJournal(client, { eventId, occurredAt: OCCURRED_AT });
        const result = await journal.append(appendInput(fixture, { actor }));
        expect(result).toEqual({ eventSeq: 1n, eventId, occurredAt: OCCURRED_AT });
        await client.query("COMMIT");
        committed = true;

        const rows = await queryEventsWithClient(client, fixture);
        expect(rows).toHaveLength(1);
        const expectedEvent = {
          schema_version: 1,
          event_id: eventId,
          tenant_id: fixture.tenantId,
          channel_id: fixture.channelId,
          event_seq: "1",
          event_type: "message.created",
          actor: {
            principal_id: fixture.principalId,
            kind: "human",
          },
          occurred_at: OCCURRED_AT,
          payload: createdIntent(fixture.messageId).payload,
        };
        expect(durableFromStored(rows[0]!)).toEqual(DurableEventV1.parse(expectedEvent));
        expect(rows[0]!.payload).toEqual(expectedEvent.payload);
        expect(rows[0]).toMatchObject({
          event_seq: "1",
          event_id: eventId,
          actor_principal_id: fixture.principalId,
          actor_kind: "human",
        });
      } finally {
        try {
          if (!committed) {
            await client.query("ROLLBACK");
          }
        } finally {
          client.release();
        }
      }
      expect(await queryState(fixture)).toBe("1");
      expect(await queryEvents(fixture)).toHaveLength(1);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S7 runtime role cannot perform DDL or mutate the Drizzle ledger",
    async () => {
      const runtimeRole = activeHarness().resources.runtimeRole;
      const creationPrivileges = await activeHarness().query<{
        can_create_in_database: boolean;
        can_create_in_public: boolean;
      }>(
        "owner",
        `SELECT
           pg_catalog.has_database_privilege($1, current_database(), 'CREATE') AS can_create_in_database,
           pg_catalog.has_schema_privilege($1, 'public', 'CREATE') AS can_create_in_public`,
        [runtimeRole],
      );
      expect(creationPrivileges.rows).toEqual([
        { can_create_in_database: false, can_create_in_public: false },
      ]);

      const ledgerPrivileges = await activeHarness().query<{
        can_create_schema: boolean;
        can_delete: boolean;
        can_insert: boolean;
        can_truncate: boolean;
        can_update: boolean;
        can_use_schema: boolean;
      }>(
        "owner",
        `SELECT
           pg_catalog.has_schema_privilege($1, 'drizzle', 'USAGE') AS can_use_schema,
           pg_catalog.has_schema_privilege($1, 'drizzle', 'CREATE') AS can_create_schema,
           pg_catalog.has_table_privilege($1, 'drizzle.__drizzle_migrations', 'INSERT') AS can_insert,
           pg_catalog.has_table_privilege($1, 'drizzle.__drizzle_migrations', 'UPDATE') AS can_update,
           pg_catalog.has_table_privilege($1, 'drizzle.__drizzle_migrations', 'DELETE') AS can_delete,
           pg_catalog.has_table_privilege($1, 'drizzle.__drizzle_migrations', 'TRUNCATE') AS can_truncate`,
        [runtimeRole],
      );
      expect(ledgerPrivileges.rows).toEqual([
        {
          can_use_schema: false,
          can_create_schema: false,
          can_insert: false,
          can_update: false,
          can_delete: false,
          can_truncate: false,
        },
      ]);

      const expectedLedger = [
        {
          id: 1,
          created_at: "1787648708709",
          hash: "645229b04fc4eddd44d47301d47f1efbd394daa6c97852c3ea4a3cbb26df23c2",
        },
        {
          id: 2,
          created_at: "1787695124181",
          hash: "e44f52f786360ac502c0d928cebaebdca718abdd39ae2e78275b9d21505aef26",
        },
      ] as const;
      const ledgerBefore = await activeHarness().query<{
        id: number;
        created_at: string;
        hash: string;
      }>(
        "owner",
        `SELECT id, created_at::text AS created_at, hash
         FROM drizzle.__drizzle_migrations
         ORDER BY id`,
      );
      expect(ledgerBefore.rows).toEqual(expectedLedger);

      const forbiddenTable = fixtureId("ddl");
      expect(forbiddenTable).toMatch(/^[a-z][a-z0-9_]{0,62}$/u);
      const ddlError = await captureRuntimePgFailure(
        `CREATE TABLE public.${forbiddenTable} (id bigint)`,
      );
      expect(ddlError.code).toBe("42501");

      const ledgerInsertError = await captureRuntimePgFailure(
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
         VALUES ($1, $2::bigint)`,
        ["0000000000000000000000000000000000000000000000000000000000000000", "1787695124182"],
      );
      expect(ledgerInsertError.code).toBe("42501");

      const ledgerUpdateError = await captureRuntimePgFailure(
        `UPDATE drizzle.__drizzle_migrations
         SET hash = $1
         WHERE id = 1`,
        ["0000000000000000000000000000000000000000000000000000000000000000"],
      );
      expect(ledgerUpdateError.code).toBe("42501");

      const ledgerDeleteError = await captureRuntimePgFailure(
        `DELETE FROM drizzle.__drizzle_migrations
         WHERE id = 1`,
      );
      expect(ledgerDeleteError.code).toBe("42501");

      const ledgerAfter = await activeHarness().query<{
        id: number;
        created_at: string;
        hash: string;
      }>(
        "owner",
        `SELECT id, created_at::text AS created_at, hash
         FROM drizzle.__drizzle_migrations
         ORDER BY id`,
      );
      expect(ledgerAfter.rows).toEqual(expectedLedger);
      expect(ledgerAfter.rows).toEqual(ledgerBefore.rows);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );

  it(
    "AW010A-S7 discloses runtime raw sequence-state UPDATE and DELETE access inside rollback",
    async () => {
      const first = await seedFixture();
      const second = await seedSecondChannel(first);
      const client = await beginRuntimeClient();
      try {
        const privileges = await client.query<{
          can_delete: boolean;
          can_update: boolean;
          current_user: string;
        }>(
          `SELECT
             current_user,
             pg_catalog.has_table_privilege(
               current_user,
               'public.channel_event_sequences',
               'UPDATE'
             ) AS can_update,
             pg_catalog.has_table_privilege(
               current_user,
               'public.channel_event_sequences',
               'DELETE'
             ) AS can_delete`,
        );
        expect(privileges.rows).toEqual([
          {
            current_user: activeHarness().resources.runtimeRole,
            can_update: true,
            can_delete: true,
          },
        ]);

        const updated = await client.query(
          `UPDATE public.channel_event_sequences
           SET last_event_seq = $3::bigint
           WHERE tenant_id = $1 AND channel_id = $2`,
          [first.tenantId, first.channelId, "7"],
        );
        expect(updated.rowCount).toBe(1);

        const deleted = await client.query(
          `DELETE FROM public.channel_event_sequences
           WHERE tenant_id = $1 AND channel_id = $2`,
          [second.tenantId, second.channelId],
        );
        expect(deleted.rowCount).toBe(1);

        const observed = await client.query<{
          channel_id: string;
          last_event_seq: string;
          tenant_id: string;
        }>(
          `SELECT tenant_id, channel_id, last_event_seq::text AS last_event_seq
           FROM public.channel_event_sequences
           WHERE tenant_id = $1 AND (channel_id = $2 OR channel_id = $3)
           ORDER BY channel_id`,
          [first.tenantId, first.channelId, second.channelId],
        );
        expect(observed.rows).toEqual([
          {
            tenant_id: first.tenantId,
            channel_id: first.channelId,
            last_event_seq: "7",
          },
        ]);
      } finally {
        await rollbackAndRelease(client);
      }

      expect(await queryState(first)).toBe("0");
      expect(await queryState(second)).toBe("0");
      expect(await queryEvents(first)).toEqual([]);
      expect(await queryEvents(second)).toEqual([]);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );
});
