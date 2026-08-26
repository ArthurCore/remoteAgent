import { createHash } from "node:crypto";
import {
  cpSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import { expect, it } from "vitest";

import { migrationConfig } from "../src/migration-config.js";
import {
  CHANNEL_STREAM_MIGRATION_HASH,
  FOUNDATION_MIGRATION_HASH,
  MigrationIntegrityError,
  checkLocalMigrationFiles,
  compareMigrationLedger,
} from "../src/migration-integrity.js";

const migrationFolder = migrationConfig.migrationsFolder;
const foundationSqlPath = join(migrationFolder, "0000_aw008_foundation.sql");
const foundationSnapshotPath = join(migrationFolder, "meta", "0000_snapshot.json");
const channelStreamSqlPath = join(migrationFolder, "0001_aw010a_channel_stream.sql");
const channelStreamSnapshotPath = join(migrationFolder, "meta", "0001_snapshot.json");
const journalPath = join(migrationFolder, "meta", "_journal.json");
const foundationSnapshotHash = "2dbb8666e9f74ba19e1faa4d3df0309db2a5d29f65aaa6648e399070cbe23fc1";
const expectedArtifactHashes = new Map([
  ["0000_aw008_foundation.sql", FOUNDATION_MIGRATION_HASH],
  ["0001_aw010a_channel_stream.sql", CHANNEL_STREAM_MIGRATION_HASH],
  ["meta/0000_snapshot.json", foundationSnapshotHash],
  ["meta/0001_snapshot.json", "f118e261f89cd9e6d4faefa23c972c5bd4fc84dc5a14d9cca77cbf2b642751d2"],
  ["meta/_journal.json", "70c038f3554c6b0e9eeb3bf429920d4a20c5cdfb7e6d2d02e43ccbbcc5520762"],
] as const);
const expectedFoundationTables = [
  "public.channel_membership_epochs",
  "public.channels",
  "public.principals",
  "public.tenants",
  "public.workspace_memberships",
  "public.workspaces",
] as const;
const expectedStreamTables = ["public.channel_event_sequences", "public.channel_events"] as const;
const expectedEventTypes = [
  "message.created",
  "message.edited",
  "message.deleted",
  "reaction.changed",
  "channel.member_joined",
  "channel.member_left",
  "channel.member_revoked",
] as const;

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

interface SnapshotColumn {
  name: string;
  type: string;
  typeSchema?: string;
  primaryKey: boolean;
  notNull: boolean;
  default?: string;
}

interface SnapshotForeignKey {
  name: string;
  tableFrom: string;
  tableTo: string;
  columnsFrom: string[];
  columnsTo: string[];
  onDelete: string;
  onUpdate: string;
}

interface SnapshotTable {
  name: string;
  schema: string;
  columns: Record<string, SnapshotColumn>;
  indexes: Record<string, unknown>;
  foreignKeys: Record<string, SnapshotForeignKey>;
  compositePrimaryKeys: Record<string, { name: string; columns: string[] }>;
  uniqueConstraints: Record<string, { name: string; nullsNotDistinct: boolean; columns: string[] }>;
  policies: Record<string, unknown>;
  checkConstraints: Record<string, { name: string; value: string }>;
  isRLSEnabled: boolean;
}

interface Snapshot {
  id: string;
  prevId: string;
  version: string;
  dialect: string;
  tables: Record<string, SnapshotTable>;
  enums: Record<string, unknown>;
  schemas: Record<string, unknown>;
  sequences: Record<string, unknown>;
  roles: Record<string, unknown>;
  policies: Record<string, unknown>;
  views: Record<string, unknown>;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function collectArtifacts(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) return collectArtifacts(root, absolutePath);
    return [relative(root, absolutePath)];
  });
}

function readJournal(path = journalPath): Journal {
  return JSON.parse(readFileSync(path, "utf8")) as Journal;
}

function readSnapshot(path = channelStreamSnapshotPath): Snapshot {
  return JSON.parse(readFileSync(path, "utf8")) as Snapshot;
}

function readMigrationSql(path = channelStreamSqlPath): string {
  return readFileSync(path, "utf8");
}

function migrationStatements(sql = readMigrationSql()): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function normalizedSql(sql: string): string {
  return sql.replaceAll('"', "").replace(/\s+/gu, " ").trim().toLowerCase();
}

function tableStatement(tableName: string): string {
  const statement = migrationStatements().find((candidate) =>
    new RegExp(`^CREATE TABLE (?:"public"\\.)?"${tableName}"`, "u").test(candidate),
  );
  if (statement === undefined) throw new Error(`Missing CREATE TABLE ${tableName}`);
  return normalizedSql(statement);
}

function streamTables(snapshot = readSnapshot()): [SnapshotTable, SnapshotTable] {
  const sequences = snapshot.tables["public.channel_event_sequences"];
  const events = snapshot.tables["public.channel_events"];
  if (sequences === undefined || events === undefined) {
    throw new Error("Missing channel stream snapshot tables");
  }
  return [sequences, events];
}

function migrationMeta(createdAt: number, hash: string): MigrationMeta {
  return { sql: ["SELECT 1"], folderMillis: createdAt, hash, bps: true };
}

it("AW010A-S4 freezes the exact five-artifact set and every SHA256", () => {
  expect(collectArtifacts(migrationFolder).sort()).toEqual(
    [...expectedArtifactHashes.keys()].sort(),
  );
  expect(
    Object.fromEntries(
      [...expectedArtifactHashes.keys()].map((path) => [path, sha256(join(migrationFolder, path))]),
    ),
  ).toEqual(Object.fromEntries(expectedArtifactHashes));
});

it("AW010A-S4 preserves the immutable 0000 SQL and snapshot bytes", () => {
  expect(sha256(foundationSqlPath)).toBe(FOUNDATION_MIGRATION_HASH);
  expect(sha256(foundationSnapshotPath)).toBe(foundationSnapshotHash);
  expect(readFileSync(foundationSqlPath, "utf8")).not.toMatch(
    /channel_event_sequences|channel_events/u,
  );
});

it("AW010A-S4 preserves journal entry zero byte-for-field", () => {
  expect(readJournal().entries[0]).toEqual({
    idx: 0,
    version: "7",
    when: 1_787_648_708_709,
    tag: "0000_aw008_foundation",
    breakpoints: true,
  });
});

it("AW010A-S4 freezes the exact ordered second journal entry and timestamps", () => {
  const journal = readJournal();
  expect(journal).toEqual({
    version: "7",
    dialect: "postgresql",
    entries: [
      {
        idx: 0,
        version: "7",
        when: 1_787_648_708_709,
        tag: "0000_aw008_foundation",
        breakpoints: true,
      },
      {
        idx: 1,
        version: "7",
        when: 1_787_695_124_181,
        tag: "0001_aw010a_channel_stream",
        breakpoints: true,
      },
    ],
  });
  expect(journal.entries[1]?.when).toBeGreaterThan(journal.entries[0]?.when ?? Number.MAX_VALUE);
});

it("AW010A-S4 freezes snapshot lineage, format, and the cumulative eight-table set", () => {
  const foundation = JSON.parse(readFileSync(foundationSnapshotPath, "utf8")) as Snapshot;
  const snapshot = readSnapshot();
  expect(snapshot.id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u);
  expect(snapshot.id).not.toBe(foundation.id);
  expect(snapshot.prevId).toBe(foundation.id);
  expect({ version: snapshot.version, dialect: snapshot.dialect }).toEqual({
    version: "7",
    dialect: "postgresql",
  });
  expect(Object.keys(snapshot.tables).sort()).toEqual(
    [...expectedFoundationTables, ...expectedStreamTables].sort(),
  );
});

it("AW010A-S4 freezes snapshot stream columns, SQL types, nullability, and defaults", () => {
  const [sequences, events] = streamTables();
  expect(sequences.columns).toEqual({
    tenant_id: { name: "tenant_id", type: "varchar(255)", primaryKey: false, notNull: true },
    channel_id: { name: "channel_id", type: "varchar(255)", primaryKey: false, notNull: true },
    last_event_seq: {
      name: "last_event_seq",
      type: "bigint",
      primaryKey: false,
      notNull: true,
      default: "0",
    },
    created_at: {
      name: "created_at",
      type: "timestamp (6) with time zone",
      primaryKey: false,
      notNull: true,
      default: "now()",
    },
  });
  expect(events.columns).toEqual({
    tenant_id: { name: "tenant_id", type: "varchar(255)", primaryKey: false, notNull: true },
    channel_id: { name: "channel_id", type: "varchar(255)", primaryKey: false, notNull: true },
    event_seq: { name: "event_seq", type: "bigint", primaryKey: false, notNull: true },
    event_id: { name: "event_id", type: "varchar(255)", primaryKey: false, notNull: true },
    schema_version: { name: "schema_version", type: "integer", primaryKey: false, notNull: true },
    event_type: { name: "event_type", type: "text", primaryKey: false, notNull: true },
    actor_principal_id: {
      name: "actor_principal_id",
      type: "varchar(255)",
      primaryKey: false,
      notNull: true,
    },
    actor_kind: { name: "actor_kind", type: "text", primaryKey: false, notNull: true },
    occurred_at: {
      name: "occurred_at",
      type: "timestamp (6) with time zone",
      primaryKey: false,
      notNull: true,
    },
    payload: { name: "payload", type: "jsonb", primaryKey: false, notNull: true },
    created_at: {
      name: "created_at",
      type: "timestamp (6) with time zone",
      primaryKey: false,
      notNull: true,
      default: "now()",
    },
  });
});

it("AW010A-S4 freezes snapshot stream constraints without new enums, indexes, or policies", () => {
  const snapshot = readSnapshot();
  const foundation = JSON.parse(readFileSync(foundationSnapshotPath, "utf8")) as Snapshot;
  const [sequences, events] = streamTables(snapshot);
  expect(sequences.compositePrimaryKeys).toEqual({
    channel_event_sequences_pkey: {
      name: "channel_event_sequences_pkey",
      columns: ["tenant_id", "channel_id"],
    },
  });
  expect(events.compositePrimaryKeys).toEqual({
    channel_events_pkey: {
      name: "channel_events_pkey",
      columns: ["tenant_id", "channel_id", "event_seq"],
    },
  });
  expect(Object.keys(sequences.foreignKeys)).toEqual(["channel_event_sequences_tenant_channel_fk"]);
  expect(Object.keys(events.foreignKeys)).toEqual(["channel_events_tenant_channel_fk"]);
  for (const foreignKey of [
    ...Object.values(sequences.foreignKeys),
    ...Object.values(events.foreignKeys),
  ]) {
    expect([foreignKey.onDelete, foreignKey.onUpdate]).toEqual(["restrict", "restrict"]);
    expect(foreignKey.columnsFrom.slice(0, 2)).toEqual(["tenant_id", "channel_id"]);
    expect(foreignKey.tableTo).toBe("channels");
  }
  expect(events.uniqueConstraints).toEqual({
    channel_events_event_id_key: {
      name: "channel_events_event_id_key",
      nullsNotDistinct: false,
      columns: ["event_id"],
    },
  });
  expect(Object.keys(sequences.checkConstraints)).toEqual([
    "channel_event_sequences_last_event_seq_check",
  ]);
  expect(Object.keys(events.checkConstraints).sort()).toEqual(
    [
      "channel_events_event_seq_check",
      "channel_events_event_id_nonempty_check",
      "channel_events_schema_version_check",
      "channel_events_event_type_check",
      "channel_events_actor_principal_id_nonempty_check",
      "channel_events_actor_kind_check",
      "channel_events_payload_object_check",
    ].sort(),
  );
  expect([sequences.indexes, events.indexes, sequences.policies, events.policies]).toEqual([
    {},
    {},
    {},
    {},
  ]);
  expect(snapshot.enums).toEqual(foundation.enums);
  expect({
    schemas: snapshot.schemas,
    sequences: snapshot.sequences,
    roles: snapshot.roles,
    policies: snapshot.policies,
    views: snapshot.views,
  }).toEqual({ schemas: {}, sequences: {}, roles: {}, policies: {}, views: {} });
});

it("AW010A-S4 separates every top-level statement with a Drizzle breakpoint and omits transaction control", () => {
  const sql = readMigrationSql();
  const statements = migrationStatements(sql);
  expect(statements).toHaveLength(15);
  expect(sql.match(/--> statement-breakpoint/gu) ?? []).toHaveLength(statements.length - 1);
  expect(statements.every((statement) => statement.endsWith(";"))).toBe(true);
  expect(statements).not.toContainEqual(
    expect.stringMatching(/^\s*(?:BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK)\b/iu),
  );
});

it("AW010A-S4 acquires the exact ACCESS EXCLUSIVE locks first in frozen order", () => {
  expect(migrationStatements().slice(0, 2).map(normalizedSql)).toEqual([
    "lock table public.channels in access exclusive mode;",
    "lock table public.channel_membership_epochs in access exclusive mode;",
  ]);
});

it("AW010A-S4 performs a secret-safe row-free empty-membership preflight before object creation", () => {
  const statements = migrationStatements();
  const preflight = normalizedSql(statements[2] ?? "");
  expect(preflight).toContain("do $do$");
  expect(preflight).toContain("if exists (select 1 from public.channel_membership_epochs)");
  expect(preflight).toContain("message = 'channel stream migration precondition failed'");
  expect(preflight).not.toMatch(/select count|new\.|old\.|raise[^;]*%|format\s*\(/u);
  expect(statements[3]).toMatch(/^CREATE TABLE/u);
});

it("AW010A-S4 freezes exactly two stream tables and the sequence-state columns and constraints", () => {
  const sql = readMigrationSql();
  expect(
    [...sql.matchAll(/\bCREATE TABLE\s+(?:"public"\.)?"([^"]+)"/gu)].map((match) => match[1]),
  ).toEqual(["channel_event_sequences", "channel_events"]);
  expect(sql).not.toMatch(
    /\bCREATE\s+(?:TYPE|INDEX|UNIQUE\s+INDEX|SEQUENCE|VIEW|MATERIALIZED\s+VIEW)\b/iu,
  );
  expect(tableStatement("channel_event_sequences")).toBe(
    normalizedSql(`CREATE TABLE "public"."channel_event_sequences" (
      "tenant_id" varchar(255) NOT NULL,
      "channel_id" varchar(255) NOT NULL,
      "last_event_seq" bigint DEFAULT 0 NOT NULL,
      "created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "channel_event_sequences_pkey" PRIMARY KEY("tenant_id","channel_id"),
      CONSTRAINT "channel_event_sequences_tenant_channel_fk" FOREIGN KEY ("tenant_id","channel_id") REFERENCES "public"."channels"("tenant_id","channel_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
      CONSTRAINT "channel_event_sequences_last_event_seq_check" CHECK ("channel_event_sequences"."last_event_seq" >= 0)
    );`),
  );
});

it("AW010A-S4 freezes the append-only event table columns and complete constraint surface", () => {
  const statement = tableStatement("channel_events");
  for (const column of [
    "tenant_id varchar(255) not null",
    "channel_id varchar(255) not null",
    "event_seq bigint not null",
    "event_id varchar(255) not null",
    "schema_version integer not null",
    "event_type text not null",
    "actor_principal_id varchar(255) not null",
    "actor_kind text not null",
    "occurred_at timestamp (6) with time zone not null",
    "payload jsonb not null",
    "created_at timestamp (6) with time zone default now() not null",
  ]) {
    expect(statement).toContain(column);
  }
  expect([...statement.matchAll(/constraint ([a-z0-9_]+)/gu)].map((match) => match[1])).toEqual([
    "channel_events_pkey",
    "channel_events_tenant_channel_fk",
    "channel_events_event_id_key",
    "channel_events_event_seq_check",
    "channel_events_event_id_nonempty_check",
    "channel_events_schema_version_check",
    "channel_events_event_type_check",
    "channel_events_actor_principal_id_nonempty_check",
    "channel_events_actor_kind_check",
    "channel_events_payload_object_check",
  ]);
  expect(statement).toContain(
    `event_type in (${expectedEventTypes.map((eventType) => `'${eventType}'`).join(", ")})`,
  );
  expect(statement).toContain("actor_kind in ('human', 'service', 'system')");
  expect(statement).toContain("jsonb_typeof(channel_events.payload) = 'object'");
});

it("AW010A-S4 defines exactly three invoker-rights functions with static fully-qualified SQL", () => {
  const sql = readMigrationSql();
  expect(
    [...sql.matchAll(/\bCREATE FUNCTION public\.([a-z0-9_]+)\(\)/gu)].map((match) => match[1]),
  ).toEqual([
    "initialize_channel_event_sequence",
    "reject_channel_event_mutation",
    "enforce_channel_membership_event_types",
  ]);
  expect(sql).not.toMatch(
    /SECURITY\s+DEFINER|EXECUTE\s+FORMAT|\bformat\s*\(|\bEXECUTE\s+['"]|SET\s+(?:LOCAL\s+)?search_path/iu,
  );
  expect(sql).toMatch(/INSERT INTO public\.channel_event_sequences/iu);
  expect(sql.match(/FROM public\.channel_events/giu) ?? []).toHaveLength(2);
  for (const raise of sql.match(/RAISE EXCEPTION[^;]*;/giu) ?? []) {
    expect(raise).not.toMatch(/NEW\.|OLD\.|%|DETAIL|HINT|format\s*\(/iu);
  }
});

it("AW010A-S4 installs exact automatic state initialization after channel insert", () => {
  const sql = normalizedSql(readMigrationSql());
  expect(sql).toContain(
    "insert into public.channel_event_sequences (tenant_id, channel_id, last_event_seq) values (new.tenant_id, new.channel_id, 0);",
  );
  expect(sql).toContain(
    "create trigger channels_initialize_event_sequence after insert on public.channels for each row execute function public.initialize_channel_event_sequence();",
  );
  expect(sql).not.toMatch(/on conflict/u);
});

it("AW010A-S4 installs exact unconditional BEFORE UPDATE OR DELETE append-only rejection", () => {
  const sql = normalizedSql(readMigrationSql());
  expect(sql).toContain(
    "create trigger channel_events_append_only_guard before update or delete on public.channel_events for each row execute function public.reject_channel_event_mutation();",
  );
  expect(sql).toContain("message = 'channel events are append-only'");
  expect(sql).not.toMatch(/when\s*\(/u);
});

it("AW010A-S4 backfills one zero state per locked channel without synthetic data or conflict laundering", () => {
  const statements = migrationStatements();
  expect(normalizedSql(statements[10] ?? "")).toBe(
    "insert into public.channel_event_sequences (tenant_id, channel_id, last_event_seq) select channels.tenant_id, channels.channel_id, 0 from public.channels as channels;",
  );
  const backfillIndex = statements.findIndex((statement) =>
    /^INSERT INTO public\.channel_event_sequences/iu.test(statement),
  );
  const triggerIndex = statements.findIndex((statement) =>
    /^CREATE TRIGGER channels_initialize_event_sequence/iu.test(statement),
  );
  const foreignKeyIndex = statements.findIndex((statement) =>
    /ADD CONSTRAINT channel_membership_epochs_joined_event_fk/iu.test(statement),
  );
  expect(triggerIndex).toBeGreaterThan(1);
  expect(backfillIndex).toBeGreaterThan(triggerIndex);
  expect(foreignKeyIndex).toBeGreaterThan(backfillIndex);
  expect(readMigrationSql()).not.toMatch(
    /ON\s+CONFLICT|INSERT\s+INTO\s+public\.channel_events|\bmembership_epoch\b|synthetic/iu,
  );
});

it("AW010A-S4 adds ordinary immediate tenant-leading membership event FKs for event-first semantics", () => {
  const statements = migrationStatements();
  expect(statements.slice(11, 13).map(normalizedSql)).toEqual([
    "alter table public.channel_membership_epochs add constraint channel_membership_epochs_joined_event_fk foreign key (tenant_id, channel_id, joined_event_seq) references public.channel_events(tenant_id, channel_id, event_seq) on delete restrict on update restrict not deferrable;",
    "alter table public.channel_membership_epochs add constraint channel_membership_epochs_exited_event_fk foreign key (tenant_id, channel_id, exited_event_seq) references public.channel_events(tenant_id, channel_id, event_seq) on delete restrict on update restrict not deferrable;",
  ]);
});

it("AW010A-S4 defers only the typed membership guard and proves final cutover postconditions", () => {
  const statements = migrationStatements();
  const sql = normalizedSql(readMigrationSql());
  expect(normalizedSql(statements[13] ?? "")).toBe(
    "create constraint trigger channel_membership_epochs_event_type_guard after insert or update of tenant_id, channel_id, joined_event_seq, exited_event_seq on public.channel_membership_epochs deferrable initially deferred for each row execute function public.enforce_channel_membership_event_types();",
  );
  expect(sql).toContain("joined_event_type is distinct from 'channel.member_joined'");
  expect(sql).toContain("new.exited_event_seq is not null");
  expect(sql).toContain(
    "exited_event_type not in ('channel.member_left', 'channel.member_revoked')",
  );
  expect(sql).toContain("if not found then");
  expect(sql).toContain("message = 'channel membership joined event is invalid'");
  expect(sql).toContain("message = 'channel membership exited event is invalid'");
  const postcondition = normalizedSql(statements[14] ?? "");
  expect(postcondition).toContain("if exists (select 1 from public.channel_membership_epochs)");
  expect(postcondition).toContain(
    "select count(*) from public.channel_event_sequences as sequences",
  );
  expect(postcondition).toContain("sequences.tenant_id = channels.tenant_id");
  expect(postcondition).toContain("sequences.channel_id = channels.channel_id");
  expect(postcondition).toContain("<> 1");
  expect(postcondition).not.toMatch(/raise[^;]*%|format\s*\(|new\.|old\./u);
  expect(sql).not.toMatch(
    /\b(?:down|drop table|drop function|drop trigger|message_versions?|outbox|idempotency|projections?|read_states?)\b/u,
  );
});

it("AW010A-S4 proves pinned Drizzle wraps pending statements and ledger inserts in one transaction", () => {
  const require = createRequire(import.meta.url);
  const dialectPath = require.resolve("drizzle-orm/pg-core/dialect");
  const packagePath = join(dirname(dialectPath), "..", "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as { version: string };
  const dialectSource = readFileSync(dialectPath, "utf8");
  const transactionStart = dialectSource.indexOf("session.transaction");
  const statementExecution = dialectSource.indexOf("tx.execute", transactionStart);
  const ledgerInsert = dialectSource.indexOf("insert into", statementExecution);
  const transactionEnd = dialectSource.indexOf("});", ledgerInsert);
  expect(packageJson.version).toBe("0.45.2");
  expect(
    [transactionStart, statementExecution, ledgerInsert, transactionEnd].every(
      (index) => index >= 0,
    ),
  ).toBe(true);
  expect(transactionStart).toBeLessThan(statementExecution);
  expect(statementExecution).toBeLessThan(ledgerInsert);
  expect(ledgerInsert).toBeLessThan(transactionEnd);
});

it("AW010A-S4 reads exactly two ordered migrations with frozen hashes", () => {
  const migrations = readMigrationFiles(migrationConfig);
  expect(migrations).toHaveLength(2);
  expect(migrations.map((migration) => migration.folderMillis)).toEqual(
    readJournal().entries.map((entry) => entry.when),
  );
  expect(migrations.map((migration) => migration.hash)).toEqual([
    FOUNDATION_MIGRATION_HASH,
    expectedArtifactHashes.get("0001_aw010a_channel_stream.sql"),
  ]);
  expect(checkLocalMigrationFiles(migrationConfig)).toEqual({
    migrationCount: 2,
    hashes: [
      FOUNDATION_MIGRATION_HASH,
      expectedArtifactHashes.get("0001_aw010a_channel_stream.sql"),
    ],
  });
});

it("AW010A-S4 rejects a non-prefix ledger and either migration hash drifting", () => {
  const journal = readJournal();
  const first = migrationMeta(journal.entries[0]?.when ?? 0, FOUNDATION_MIGRATION_HASH);
  const second = migrationMeta(
    journal.entries[1]?.when ?? 1,
    expectedArtifactHashes.get("0001_aw010a_channel_stream.sql") ?? "",
  );
  expect(() =>
    compareMigrationLedger(
      [first, second],
      [{ createdAt: second.folderMillis, hash: second.hash }],
    ),
  ).toThrow(/missing/i);
  expect(() =>
    compareMigrationLedger(
      [first, second],
      [
        { createdAt: first.folderMillis, hash: first.hash },
        { createdAt: second.folderMillis, hash: "f".repeat(64) },
      ],
      true,
    ),
  ).toThrow(/hash/i);
});

it("AW010A-S4 rejects exact-set additions, artifact drift, and symlink topology", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "aw010a-s4-migrations-"));
  const copiedFolder = join(temporaryDirectory, "drizzle");
  try {
    cpSync(migrationFolder, copiedFolder, { recursive: true });
    writeFileSync(join(copiedFolder, "future.sql"), "SELECT 1;\n");
    expect(() =>
      checkLocalMigrationFiles({ ...migrationConfig, migrationsFolder: copiedFolder }),
    ).toThrow(/exact/i);
    rmSync(join(copiedFolder, "future.sql"));

    writeFileSync(
      join(copiedFolder, "0001_aw010a_channel_stream.sql"),
      `${readFileSync(channelStreamSqlPath, "utf8")}-- drift\n`,
    );
    expect(() =>
      checkLocalMigrationFiles({ ...migrationConfig, migrationsFolder: copiedFolder }),
    ).toThrow(/hash/i);
    rmSync(copiedFolder, { recursive: true, force: true });

    cpSync(migrationFolder, copiedFolder, { recursive: true });
    const copiedSql = join(copiedFolder, "0001_aw010a_channel_stream.sql");
    rmSync(copiedSql);
    symlinkSync(channelStreamSqlPath, copiedSql, "file");
    expect(lstatSync(copiedSql).isSymbolicLink()).toBe(true);
    expect(() =>
      checkLocalMigrationFiles({ ...migrationConfig, migrationsFolder: copiedFolder }),
    ).toThrow(MigrationIntegrityError);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
