import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { SQL } from "drizzle-orm";
import { type AnyPgTable, getTableConfig, PgDialect, type PgEnum } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as database from "../src/index.js";
import {
  channelKindV1,
  channelMembershipEpochs,
  channels,
  historyModeV1,
  principalKindV1,
  principals,
  tenants,
  workspaceMemberships,
  workspaceRoleV1,
  workspaces,
} from "../src/schema/index.js";

const dialect = new PgDialect();
const roleScriptPath = fileURLToPath(
  new URL("../../../scripts/postgres/init-roles.sh", import.meta.url),
);

const tables = [
  tenants,
  workspaces,
  principals,
  workspaceMemberships,
  channels,
  channelMembershipEpochs,
] as const;

const expectedColumns = {
  tenants: [
    ["tenant_id", "varchar(255)", true, null],
    ["created_at", "timestamp (6) with time zone", true, "now()"],
    ["version", "bigint", true, "1"],
  ],
  workspaces: [
    ["tenant_id", "varchar(255)", true, null],
    ["workspace_id", "varchar(255)", true, null],
    ["created_at", "timestamp (6) with time zone", true, "now()"],
    ["version", "bigint", true, "1"],
  ],
  principals: [
    ["tenant_id", "varchar(255)", true, null],
    ["principal_id", "varchar(255)", true, null],
    ["principal_kind", "principal_kind_v1", true, null],
    ["created_at", "timestamp (6) with time zone", true, "now()"],
    ["version", "bigint", true, "1"],
  ],
  workspace_memberships: [
    ["tenant_id", "varchar(255)", true, null],
    ["workspace_id", "varchar(255)", true, null],
    ["principal_id", "varchar(255)", true, null],
    ["role", "workspace_role_v1", true, null],
    ["created_at", "timestamp (6) with time zone", true, "now()"],
    ["version", "bigint", true, "1"],
  ],
  channels: [
    ["tenant_id", "varchar(255)", true, null],
    ["workspace_id", "varchar(255)", true, null],
    ["channel_id", "varchar(255)", true, null],
    ["kind", "channel_kind_v1", true, null],
    ["created_at", "timestamp (6) with time zone", true, "now()"],
    ["version", "bigint", true, "1"],
  ],
  channel_membership_epochs: [
    ["tenant_id", "varchar(255)", true, null],
    ["channel_id", "varchar(255)", true, null],
    ["principal_id", "varchar(255)", true, null],
    ["membership_epoch", "varchar(255)", true, null],
    ["history_mode", "history_mode_v1", true, null],
    ["joined_event_seq", "bigint", true, null],
    ["exited_event_seq", "bigint", false, null],
    ["created_at", "timestamp (6) with time zone", true, "now()"],
    ["version", "bigint", true, "1"],
  ],
} as const;

const expectedPrimaryKeys = {
  tenants: ["tenants_pk", ["tenant_id"]],
  workspaces: ["workspaces_pk", ["tenant_id", "workspace_id"]],
  principals: ["principals_pk", ["tenant_id", "principal_id"]],
  workspace_memberships: [
    "workspace_memberships_pk",
    ["tenant_id", "workspace_id", "principal_id"],
  ],
  channels: ["channels_pk", ["tenant_id", "channel_id"]],
  channel_membership_epochs: [
    "channel_membership_epochs_pk",
    ["tenant_id", "channel_id", "principal_id", "membership_epoch"],
  ],
} as const;

const expectedChecks = {
  tenants: {
    tenants_tenant_id_nonempty_ck: "length(tenant_id)>0",
    tenants_version_positive_ck: "version>0",
  },
  workspaces: {
    workspaces_tenant_id_nonempty_ck: "length(tenant_id)>0",
    workspaces_workspace_id_nonempty_ck: "length(workspace_id)>0",
    workspaces_version_positive_ck: "version>0",
  },
  principals: {
    principals_tenant_id_nonempty_ck: "length(tenant_id)>0",
    principals_principal_id_nonempty_ck: "length(principal_id)>0",
    principals_version_positive_ck: "version>0",
  },
  workspace_memberships: {
    workspace_memberships_tenant_id_nonempty_ck: "length(tenant_id)>0",
    workspace_memberships_workspace_id_nonempty_ck: "length(workspace_id)>0",
    workspace_memberships_principal_id_nonempty_ck: "length(principal_id)>0",
    workspace_memberships_version_positive_ck: "version>0",
  },
  channels: {
    channels_tenant_id_nonempty_ck: "length(tenant_id)>0",
    channels_workspace_id_nonempty_ck: "length(workspace_id)>0",
    channels_channel_id_nonempty_ck: "length(channel_id)>0",
    channels_version_positive_ck: "version>0",
  },
  channel_membership_epochs: {
    channel_membership_epochs_tenant_id_nonempty_ck: "length(tenant_id)>0",
    channel_membership_epochs_channel_id_nonempty_ck: "length(channel_id)>0",
    channel_membership_epochs_principal_id_nonempty_ck: "length(principal_id)>0",
    channel_membership_epochs_epoch_nonempty_ck: "length(membership_epoch)>0",
    channel_membership_epochs_joined_positive_ck: "joined_event_seq>0",
    channel_membership_epochs_exit_after_join_ck:
      "exited_event_seqisnullorexited_event_seq>joined_event_seq",
    channel_membership_epochs_version_positive_ck: "version>0",
  },
} as const;

const expectedForeignKeys = {
  tenants: [],
  workspaces: [["workspaces_tenant_fk", ["tenant_id"], "tenants", ["tenant_id"]]],
  principals: [["principals_tenant_fk", ["tenant_id"], "tenants", ["tenant_id"]]],
  workspace_memberships: [
    [
      "workspace_memberships_workspace_fk",
      ["tenant_id", "workspace_id"],
      "workspaces",
      ["tenant_id", "workspace_id"],
    ],
    [
      "workspace_memberships_principal_fk",
      ["tenant_id", "principal_id"],
      "principals",
      ["tenant_id", "principal_id"],
    ],
  ],
  channels: [
    [
      "channels_workspace_fk",
      ["tenant_id", "workspace_id"],
      "workspaces",
      ["tenant_id", "workspace_id"],
    ],
  ],
  channel_membership_epochs: [
    [
      "channel_membership_epochs_channel_fk",
      ["tenant_id", "channel_id"],
      "channels",
      ["tenant_id", "channel_id"],
    ],
    [
      "channel_membership_epochs_principal_fk",
      ["tenant_id", "principal_id"],
      "principals",
      ["tenant_id", "principal_id"],
    ],
  ],
} as const;

const expectedIndexes = {
  tenants: [],
  workspaces: [],
  principals: [],
  workspace_memberships: [
    [
      "workspace_memberships_principal_idx",
      false,
      ["tenant_id", "principal_id", "workspace_id"],
      null,
    ],
  ],
  channels: [["channels_workspace_idx", false, ["tenant_id", "workspace_id", "channel_id"], null]],
  channel_membership_epochs: [
    [
      "channel_membership_epochs_one_active_uq",
      true,
      ["tenant_id", "channel_id", "principal_id"],
      "exited_event_seqisnull",
    ],
    [
      "channel_membership_epochs_principal_idx",
      false,
      ["tenant_id", "principal_id", "channel_id", "exited_event_seq"],
      null,
    ],
    [
      "channel_membership_epochs_channel_seq_idx",
      false,
      ["tenant_id", "channel_id", "joined_event_seq"],
      null,
    ],
  ],
} as const;

function sqlText(value: SQL): string {
  const query = dialect.sqlToQuery(value);
  expect(query.params).toEqual([]);
  return query.sql
    .replace(/"[^"]+"\./g, "")
    .replaceAll('"', "")
    .replaceAll(/\s/g, "")
    .toLowerCase();
}

function enumDefinition(value: PgEnum<[string, ...string[]]>): [string, string[]] {
  return [value.enumName, [...value.enumValues]];
}

function tableByName(name: string): AnyPgTable {
  const table = tables.find((candidate) => getTableConfig(candidate).name === name);
  if (table === undefined) {
    throw new Error(`Missing table ${name}`);
  }
  return table;
}

describe("AW-008 frozen Drizzle foundation", () => {
  it("defines only the four exact v1 enums", () => {
    expect([
      enumDefinition(principalKindV1),
      enumDefinition(workspaceRoleV1),
      enumDefinition(channelKindV1),
      enumDefinition(historyModeV1),
    ]).toEqual([
      ["principal_kind_v1", ["human", "service"]],
      ["workspace_role_v1", ["owner", "admin", "member", "guest"]],
      ["channel_kind_v1", ["public", "private", "dm"]],
      ["history_mode_v1", ["full", "since_join"]],
    ]);
  });

  it("defines exactly six tables with literal column types, nullability, and defaults", () => {
    expect(tables.map((table) => getTableConfig(table).name)).toEqual(Object.keys(expectedColumns));

    for (const [tableName, expected] of Object.entries(expectedColumns)) {
      const columns = getTableConfig(tableByName(tableName)).columns.map((column) => [
        column.name,
        column.getSQLType(),
        column.notNull,
        column.default instanceof SQL ? sqlText(column.default) : (column.default ?? null),
      ]);
      expect(columns, tableName).toEqual(expected);
    }
  });

  it("defines every named primary key and literal check, with no extras", () => {
    for (const [tableName, expectedPrimaryKey] of Object.entries(expectedPrimaryKeys)) {
      const config = getTableConfig(tableByName(tableName));
      expect(config.primaryKeys, `${tableName} primary key`).toHaveLength(1);
      expect([
        config.primaryKeys[0]?.getName(),
        config.primaryKeys[0]?.columns.map((column) => column.name),
      ]).toEqual(expectedPrimaryKey);

      expect(
        Object.fromEntries(
          config.checks.map((constraint) => [constraint.name, sqlText(constraint.value)]),
        ),
        `${tableName} checks`,
      ).toEqual(expectedChecks[tableName as keyof typeof expectedChecks]);
    }
  });

  it("defines only tenant-leading named RESTRICT foreign keys", () => {
    for (const [tableName, expected] of Object.entries(expectedForeignKeys)) {
      const actual = getTableConfig(tableByName(tableName)).foreignKeys.map((foreignKey) => {
        const reference = foreignKey.reference();
        expect(foreignKey.onUpdate).toBe("restrict");
        expect(foreignKey.onDelete).toBe("restrict");
        return [
          foreignKey.getName(),
          reference.columns.map((column) => column.name),
          getTableConfig(reference.foreignTable).name,
          reference.foreignColumns.map((column) => column.name),
        ];
      });
      expect(actual, tableName).toEqual(expected);
    }
  });

  it("defines only the three literal indexes and one partial unique index", () => {
    for (const [tableName, expected] of Object.entries(expectedIndexes)) {
      const actual = getTableConfig(tableByName(tableName)).indexes.map((tableIndex) => [
        tableIndex.config.name,
        tableIndex.config.unique,
        tableIndex.config.columns.map((column) => {
          if (!("name" in column)) {
            throw new Error(`Unexpected SQL index expression on ${tableName}`);
          }
          return column.name;
        }),
        tableIndex.config.where === undefined ? null : sqlText(tableIndex.config.where),
      ]);
      expect(actual, tableName).toEqual(expected);
    }
  });

  it("keeps the epoch table structural and the public DB surface free of product writes", () => {
    expect(Object.keys(database).sort()).toEqual(
      [
        "channelKindV1",
        "channelMembershipEpochs",
        "channels",
        "createDatabasePool",
        "historyModeV1",
        "principalKindV1",
        "principals",
        "probeDatabase",
        "tenants",
        "workspaceMemberships",
        "workspaceRoleV1",
        "workspaces",
      ].sort(),
    );
  });
});

describe("local PostgreSQL role bootstrap", () => {
  const script = readFileSync(roleScriptPath, "utf8");

  it("is valid Bash without executing PostgreSQL", () => {
    const syntaxCheck = spawnSync("bash", ["-n", roleScriptPath], { encoding: "utf8" });
    expect(syntaxCheck.status, syntaxCheck.stderr).toBe(0);
  });

  it("fails fast, requires generated values, and never enables tracing", () => {
    expect(script).toMatch(/^#!\/usr\/bin\/env bash\n/);
    expect(script).toContain("set -Eeuo pipefail");
    for (const variable of [
      "POSTGRES_DB",
      "POSTGRES_USER",
      "POSTGRES_PASSWORD",
      "MIGRATOR_ROLE",
      "MIGRATOR_PASSWORD",
      "RUNTIME_ROLE",
      "RUNTIME_PASSWORD",
    ]) {
      expect(script).toContain(`\${${variable}:?`);
    }
    expect(script).not.toMatch(/\bset\s+-[^\n]*x|\bxtrace\b/i);
    expect(script).not.toMatch(/(password|secret)\s*=\s*["'][^$][^"']*["']/i);
  });

  it("uses psql-safe generated role values and keeps runtime out of DDL and the ledger", () => {
    for (const environmentVariable of [
      "POSTGRES_USER",
      "POSTGRES_PASSWORD",
      "MIGRATOR_ROLE",
      "MIGRATOR_PASSWORD",
      "RUNTIME_ROLE",
      "RUNTIME_PASSWORD",
    ]) {
      expect(script).toContain(`\\getenv`);
      expect(script).toContain(environmentVariable);
    }
    expect(script).toMatch(/ALTER ROLE :"migrator_role" WITH LOGIN NOSUPERUSER/i);
    expect(script).toMatch(/ALTER ROLE :"runtime_role" WITH LOGIN NOSUPERUSER/i);
    expect(script).toMatch(
      /GRANT CONNECT, CREATE ON DATABASE :"database_name" TO :"migrator_role"/i,
    );
    expect(script).toMatch(/GRANT CONNECT ON DATABASE :"database_name" TO :"runtime_role"/i);
    expect(script).toMatch(
      /REVOKE CREATE, TEMPORARY ON DATABASE :"database_name" FROM :"runtime_role"/i,
    );
    expect(script).toMatch(/GRANT USAGE ON SCHEMA public TO :"runtime_role"/i);
    expect(script).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON (ALL )?TABLES/i);
    expect(script).toMatch(/GRANT USAGE, SELECT, UPDATE ON (ALL )?SEQUENCES/i);
    expect(script).toContain("REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;");
    expect(script).toContain(
      'REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM :"runtime_role";',
    );
    expect(script).toContain(
      'ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_role" IN SCHEMA public\n' +
        "  REVOKE EXECUTE ON ROUTINES FROM PUBLIC;",
    );
    expect(script).toContain("__drizzle_migrations");
    expect(script).toMatch(/REVOKE ALL PRIVILEGES[^\n]+runtime_role/i);
    expect(script).not.toMatch(/GRANT\s+(CREATE|ALL)[^\n]+runtime_role/i);
  });
});
