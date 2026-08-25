import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { SQL } from "drizzle-orm";
import { type AnyPgTable, getTableConfig, isPgEnum, PgDialect } from "drizzle-orm/pg-core";
import { expect, it } from "vitest";

import * as channelStream from "../src/schema/channel-stream.js";
import * as schema from "../src/schema/index.js";

const dialect = new PgDialect();
const streamSourcePath = fileURLToPath(new URL("../src/schema/channel-stream.ts", import.meta.url));
const foundationSourcePath = fileURLToPath(new URL("../src/schema/foundation.ts", import.meta.url));
const streamTables = [channelStream.channelEventSequences, channelStream.channelEvents] as const;
const forbiddenTableNamePattern =
  /(?:^|_)(?:message(?:s|_versions?)?|mentions?|reactions?|outbox|idempotency|projections?|read_states?)(?:_|$)/u;

function normalizedSql(value: SQL): string {
  const query = dialect.sqlToQuery(value);
  if (query.params.length !== 0) {
    throw new Error(`Expected literal SQL without parameters: ${query.sql}`);
  }
  return query.sql
    .replace(/"[^"]+"\./gu, "")
    .replaceAll('"', "")
    .replace(/\s+/gu, "")
    .toLowerCase();
}

function tableDeclarations(sourcePath: string): string[] {
  return [...readFileSync(sourcePath, "utf8").matchAll(/\bpgTable\(\s*"([^"]+)"/gu)].flatMap(
    (match) => (match[1] === undefined ? [] : [match[1]]),
  );
}

function columnMetadata(table: AnyPgTable): unknown[][] {
  return getTableConfig(table).columns.map((column) => {
    const columnDefault =
      column.default instanceof SQL
        ? normalizedSql(column.default)
        : column.default === undefined
          ? null
          : column.default;
    return [column.name, column.getSQLType(), column.notNull, columnDefault];
  });
}

function primaryKeyMetadata(table: AnyPgTable): unknown[][] {
  return getTableConfig(table).primaryKeys.map((primaryKey) => [
    primaryKey.getName(),
    primaryKey.columns.map((column) => column.name),
  ]);
}

function foreignKeyMetadata(table: AnyPgTable): unknown[][] {
  return getTableConfig(table).foreignKeys.map((foreignKey) => {
    const reference = foreignKey.reference();
    return [
      foreignKey.getName(),
      reference.columns.map((column) => column.name),
      getTableConfig(reference.foreignTable).name,
      reference.foreignColumns.map((column) => column.name),
      foreignKey.onDelete,
      foreignKey.onUpdate,
    ];
  });
}

function uniqueMetadata(table: AnyPgTable): unknown[][] {
  return getTableConfig(table).uniqueConstraints.map((constraint) => [
    constraint.name,
    constraint.columns.map((column) => column.name),
    constraint.nullsNotDistinct,
  ]);
}

function checkMetadata(table: AnyPgTable): string[][] {
  return getTableConfig(table).checks.map((constraint) => [
    constraint.name,
    normalizedSql(constraint.value),
  ]);
}

function checkPredicate(table: AnyPgTable, name: string): string {
  const constraint = getTableConfig(table).checks.find((candidate) => candidate.name === name);
  if (constraint === undefined) {
    throw new Error(`Missing check constraint ${name}`);
  }
  return normalizedSql(constraint.value);
}

function quotedLiterals(predicate: string): string[] {
  return [...predicate.matchAll(/'([^']+)'/gu)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

it("AW010A-S3 declares and exports exactly the two stream tables", () => {
  expect(tableDeclarations(streamSourcePath)).toEqual([
    "channel_event_sequences",
    "channel_events",
  ]);
  expect(Object.keys(channelStream).sort()).toEqual(["channelEventSequences", "channelEvents"]);
  expect(Object.keys(schema).sort()).toEqual(
    [
      "channelEventSequences",
      "channelEvents",
      "channelKindV1",
      "channelMembershipEpochs",
      "channels",
      "historyModeV1",
      "principalKindV1",
      "principals",
      "tenants",
      "workspaceMemberships",
      "workspaceRoleV1",
      "workspaces",
    ].sort(),
  );
});

it("AW010A-S3 freezes column order, SQL types, nullability, and defaults", () => {
  expect(columnMetadata(channelStream.channelEventSequences)).toEqual([
    ["tenant_id", "varchar(255)", true, null],
    ["channel_id", "varchar(255)", true, null],
    ["last_event_seq", "bigint", true, "0"],
    ["created_at", "timestamp (6) with time zone", true, "now()"],
  ]);
  expect(columnMetadata(channelStream.channelEvents)).toEqual([
    ["tenant_id", "varchar(255)", true, null],
    ["channel_id", "varchar(255)", true, null],
    ["event_seq", "bigint", true, null],
    ["event_id", "varchar(255)", true, null],
    ["schema_version", "integer", true, null],
    ["event_type", "text", true, null],
    ["actor_principal_id", "varchar(255)", true, null],
    ["actor_kind", "text", true, null],
    ["occurred_at", "timestamp (6) with time zone", true, null],
    ["payload", "jsonb", true, null],
    ["created_at", "timestamp (6) with time zone", true, "now()"],
  ]);
  expect(
    streamTables.map((table) =>
      getTableConfig(table).columns.flatMap((column) =>
        column.default === undefined ? [] : [column.name],
      ),
    ),
  ).toEqual([["last_event_seq", "created_at"], ["created_at"]]);
});

it("AW010A-S3 freezes primary keys and tenant-leading RESTRICT channel foreign keys", () => {
  expect(primaryKeyMetadata(channelStream.channelEventSequences)).toEqual([
    ["channel_event_sequences_pkey", ["tenant_id", "channel_id"]],
  ]);
  expect(primaryKeyMetadata(channelStream.channelEvents)).toEqual([
    ["channel_events_pkey", ["tenant_id", "channel_id", "event_seq"]],
  ]);
  expect(streamTables.map(foreignKeyMetadata)).toEqual([
    [
      [
        "channel_event_sequences_tenant_channel_fk",
        ["tenant_id", "channel_id"],
        "channels",
        ["tenant_id", "channel_id"],
        "restrict",
        "restrict",
      ],
    ],
    [
      [
        "channel_events_tenant_channel_fk",
        ["tenant_id", "channel_id"],
        "channels",
        ["tenant_id", "channel_id"],
        "restrict",
        "restrict",
      ],
    ],
  ]);
});

it("AW010A-S3 freezes the unique and normalized check constraint surface", () => {
  expect(uniqueMetadata(channelStream.channelEventSequences)).toEqual([]);
  expect(uniqueMetadata(channelStream.channelEvents)).toEqual([
    ["channel_events_event_id_key", ["event_id"], false],
  ]);
  expect(streamTables.map(checkMetadata)).toEqual([
    [["channel_event_sequences_last_event_seq_check", "last_event_seq>=0"]],
    [
      ["channel_events_event_seq_check", "event_seq>0"],
      ["channel_events_event_id_nonempty_check", "length(event_id)>0"],
      ["channel_events_schema_version_check", "schema_version=1"],
      [
        "channel_events_event_type_check",
        "event_typein('message.created','message.edited','message.deleted','reaction.changed','channel.member_joined','channel.member_left','channel.member_revoked')",
      ],
      ["channel_events_actor_principal_id_nonempty_check", "length(actor_principal_id)>0"],
      ["channel_events_actor_kind_check", "actor_kindin('human','service','system')"],
      ["channel_events_payload_object_check", "jsonb_typeof(payload)='object'"],
    ],
  ]);
});

it("AW010A-S3 freezes event and actor literals without a new PostgreSQL enum", () => {
  expect(
    quotedLiterals(
      checkPredicate(channelStream.channelEvents, "channel_events_event_type_check"),
    ).sort(),
  ).toEqual(
    [
      "message.created",
      "message.edited",
      "message.deleted",
      "reaction.changed",
      "channel.member_joined",
      "channel.member_left",
      "channel.member_revoked",
    ].sort(),
  );
  expect(
    quotedLiterals(
      checkPredicate(channelStream.channelEvents, "channel_events_actor_kind_check"),
    ).sort(),
  ).toEqual(["human", "service", "system"].sort());
  expect(
    (Object.values(schema) as unknown[])
      .filter(isPgEnum)
      .map((value) => ({ name: value.enumName, values: [...value.enumValues] }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  ).toEqual([
    { name: "channel_kind_v1", values: ["public", "private", "dm"] },
    { name: "history_mode_v1", values: ["full", "since_join"] },
    { name: "principal_kind_v1", values: ["human", "service"] },
    { name: "workspace_role_v1", values: ["owner", "admin", "member", "guest"] },
  ]);
});

it("AW010A-S3 excludes deferred product tables and later-card indexes", () => {
  const declaredTables = [
    ...tableDeclarations(foundationSourcePath),
    ...tableDeclarations(streamSourcePath),
  ];
  expect(declaredTables.filter((name) => forbiddenTableNamePattern.test(name))).toEqual([]);
  expect(
    Object.keys(schema).filter((name) =>
      forbiddenTableNamePattern.test(name.replace(/([a-z\d])([A-Z])/gu, "$1_$2").toLowerCase()),
    ),
  ).toEqual([]);
  expect(streamTables.map((table) => getTableConfig(table).indexes)).toEqual([[], []]);
});
