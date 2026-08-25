import type { PoolClient, QueryResultRow } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../src/migrate.js";
import { startPostgresTestHarness, type PostgresTestHarness } from "./support/postgres.js";

const PUBLIC_TABLES = [
  "channel_membership_epochs",
  "channels",
  "principals",
  "tenants",
  "workspace_memberships",
  "workspaces",
] as const;

const FIXTURE = {
  tenantA: "tenant_aw008d_a",
  tenantB: "tenant_aw008d_b",
  workspaceA: "workspace_aw008d_a",
  workspaceB: "workspace_aw008d_b",
  principalA: "principal_aw008d_a",
  principalB: "principal_aw008d_b",
  channelA: "channel_aw008d_a",
  channelB: "channel_aw008d_b",
} as const;

interface EnumRow extends QueryResultRow {
  enum_name: string;
  labels: string[];
}

interface TableRow extends QueryResultRow {
  table_name: string;
}

interface ConstraintRow extends QueryResultRow {
  table_name: string;
  constraint_name: string;
  constraint_type: "c" | "f" | "p";
  definition: string;
}

interface IndexRow extends QueryResultRow {
  table_name: string;
  index_name: string;
  is_unique: boolean;
  definition: string;
  predicate: string | null;
}

interface FoundationColumnRow extends QueryResultRow {
  table_name: string;
  column_name: "created_at" | "version";
  data_type: string;
  datetime_precision: number | null;
  column_default: string;
  is_nullable: "NO";
}

interface EmptyTableRow extends QueryResultRow {
  table_name: string;
  row_count: number;
}

interface ConstraintProbe {
  readonly constraint: string;
  readonly statement: string;
  readonly parameters: unknown[];
}

function constraintRow(
  tableName: string,
  constraintName: string,
  constraintType: ConstraintRow["constraint_type"],
  definition: string,
): ConstraintRow {
  return {
    table_name: tableName,
    constraint_name: constraintName,
    constraint_type: constraintType,
    definition,
  };
}

function primaryKey(tableName: string, constraintName: string, columns: string): ConstraintRow {
  return constraintRow(tableName, constraintName, "p", `PRIMARY KEY (${columns})`);
}

function foreignKey(
  tableName: string,
  constraintName: string,
  columns: string,
  referencedTable: string,
  referencedColumns: string,
): ConstraintRow {
  return constraintRow(
    tableName,
    constraintName,
    "f",
    `FOREIGN KEY (${columns}) REFERENCES ${referencedTable}(${referencedColumns}) ON UPDATE RESTRICT ON DELETE RESTRICT`,
  );
}

function checkConstraint(
  tableName: string,
  constraintName: string,
  expression: string,
): ConstraintRow {
  return constraintRow(tableName, constraintName, "c", `CHECK (${expression})`);
}

function compareConstraintRows(left: ConstraintRow, right: ConstraintRow): number {
  const leftKey = `${left.table_name}\u0000${left.constraint_type}\u0000${left.constraint_name}`;
  const rightKey = `${right.table_name}\u0000${right.constraint_type}\u0000${right.constraint_name}`;
  if (leftKey < rightKey) return -1;
  if (leftKey > rightKey) return 1;
  return 0;
}

const EXPECTED_CONSTRAINTS = [
  primaryKey("tenants", "tenants_pk", "tenant_id"),
  primaryKey("workspaces", "workspaces_pk", "tenant_id, workspace_id"),
  primaryKey("principals", "principals_pk", "tenant_id, principal_id"),
  primaryKey(
    "workspace_memberships",
    "workspace_memberships_pk",
    "tenant_id, workspace_id, principal_id",
  ),
  primaryKey("channels", "channels_pk", "tenant_id, channel_id"),
  primaryKey(
    "channel_membership_epochs",
    "channel_membership_epochs_pk",
    "tenant_id, channel_id, principal_id, membership_epoch",
  ),
  foreignKey("workspaces", "workspaces_tenant_fk", "tenant_id", "tenants", "tenant_id"),
  foreignKey("principals", "principals_tenant_fk", "tenant_id", "tenants", "tenant_id"),
  foreignKey(
    "workspace_memberships",
    "workspace_memberships_workspace_fk",
    "tenant_id, workspace_id",
    "workspaces",
    "tenant_id, workspace_id",
  ),
  foreignKey(
    "workspace_memberships",
    "workspace_memberships_principal_fk",
    "tenant_id, principal_id",
    "principals",
    "tenant_id, principal_id",
  ),
  foreignKey(
    "channels",
    "channels_workspace_fk",
    "tenant_id, workspace_id",
    "workspaces",
    "tenant_id, workspace_id",
  ),
  foreignKey(
    "channel_membership_epochs",
    "channel_membership_epochs_channel_fk",
    "tenant_id, channel_id",
    "channels",
    "tenant_id, channel_id",
  ),
  foreignKey(
    "channel_membership_epochs",
    "channel_membership_epochs_principal_fk",
    "tenant_id, principal_id",
    "principals",
    "tenant_id, principal_id",
  ),
  checkConstraint("tenants", "tenants_tenant_id_nonempty_ck", "length(tenant_id::text) > 0"),
  checkConstraint("tenants", "tenants_version_positive_ck", "version > 0"),
  checkConstraint("workspaces", "workspaces_tenant_id_nonempty_ck", "length(tenant_id::text) > 0"),
  checkConstraint(
    "workspaces",
    "workspaces_workspace_id_nonempty_ck",
    "length(workspace_id::text) > 0",
  ),
  checkConstraint("workspaces", "workspaces_version_positive_ck", "version > 0"),
  checkConstraint("principals", "principals_tenant_id_nonempty_ck", "length(tenant_id::text) > 0"),
  checkConstraint(
    "principals",
    "principals_principal_id_nonempty_ck",
    "length(principal_id::text) > 0",
  ),
  checkConstraint("principals", "principals_version_positive_ck", "version > 0"),
  checkConstraint(
    "workspace_memberships",
    "workspace_memberships_tenant_id_nonempty_ck",
    "length(tenant_id::text) > 0",
  ),
  checkConstraint(
    "workspace_memberships",
    "workspace_memberships_workspace_id_nonempty_ck",
    "length(workspace_id::text) > 0",
  ),
  checkConstraint(
    "workspace_memberships",
    "workspace_memberships_principal_id_nonempty_ck",
    "length(principal_id::text) > 0",
  ),
  checkConstraint(
    "workspace_memberships",
    "workspace_memberships_version_positive_ck",
    "version > 0",
  ),
  checkConstraint("channels", "channels_tenant_id_nonempty_ck", "length(tenant_id::text) > 0"),
  checkConstraint(
    "channels",
    "channels_workspace_id_nonempty_ck",
    "length(workspace_id::text) > 0",
  ),
  checkConstraint("channels", "channels_channel_id_nonempty_ck", "length(channel_id::text) > 0"),
  checkConstraint("channels", "channels_version_positive_ck", "version > 0"),
  checkConstraint(
    "channel_membership_epochs",
    "channel_membership_epochs_tenant_id_nonempty_ck",
    "length(tenant_id::text) > 0",
  ),
  checkConstraint(
    "channel_membership_epochs",
    "channel_membership_epochs_channel_id_nonempty_ck",
    "length(channel_id::text) > 0",
  ),
  checkConstraint(
    "channel_membership_epochs",
    "channel_membership_epochs_principal_id_nonempty_ck",
    "length(principal_id::text) > 0",
  ),
  checkConstraint(
    "channel_membership_epochs",
    "channel_membership_epochs_epoch_nonempty_ck",
    "length(membership_epoch::text) > 0",
  ),
  checkConstraint(
    "channel_membership_epochs",
    "channel_membership_epochs_joined_positive_ck",
    "joined_event_seq > 0",
  ),
  checkConstraint(
    "channel_membership_epochs",
    "channel_membership_epochs_exit_after_join_ck",
    "exited_event_seq IS NULL OR exited_event_seq > joined_event_seq",
  ),
  checkConstraint(
    "channel_membership_epochs",
    "channel_membership_epochs_version_positive_ck",
    "version > 0",
  ),
].sort(compareConstraintRows);

const EXPECTED_INDEXES: IndexRow[] = [
  {
    table_name: "channel_membership_epochs",
    index_name: "channel_membership_epochs_channel_seq_idx",
    is_unique: false,
    definition:
      "CREATE INDEX channel_membership_epochs_channel_seq_idx ON public.channel_membership_epochs USING btree (tenant_id, channel_id, joined_event_seq)",
    predicate: null,
  },
  {
    table_name: "channel_membership_epochs",
    index_name: "channel_membership_epochs_one_active_uq",
    is_unique: true,
    definition:
      "CREATE UNIQUE INDEX channel_membership_epochs_one_active_uq ON public.channel_membership_epochs USING btree (tenant_id, channel_id, principal_id) WHERE (exited_event_seq IS NULL)",
    predicate: "exited_event_seq IS NULL",
  },
  {
    table_name: "channel_membership_epochs",
    index_name: "channel_membership_epochs_principal_idx",
    is_unique: false,
    definition:
      "CREATE INDEX channel_membership_epochs_principal_idx ON public.channel_membership_epochs USING btree (tenant_id, principal_id, channel_id, exited_event_seq)",
    predicate: null,
  },
  {
    table_name: "channels",
    index_name: "channels_workspace_idx",
    is_unique: false,
    definition:
      "CREATE INDEX channels_workspace_idx ON public.channels USING btree (tenant_id, workspace_id, channel_id)",
    predicate: null,
  },
  {
    table_name: "workspace_memberships",
    index_name: "workspace_memberships_principal_idx",
    is_unique: false,
    definition:
      "CREATE INDEX workspace_memberships_principal_idx ON public.workspace_memberships USING btree (tenant_id, principal_id, workspace_id)",
    predicate: null,
  },
];

let harness: PostgresTestHarness | undefined;
let databaseReady = false;

function currentHarness(): PostgresTestHarness {
  if (harness === undefined) throw new Error("PostgreSQL integration harness is not running");
  return harness;
}

async function withRollbackTransaction(
  callback: (client: PoolClient) => Promise<void>,
): Promise<void> {
  const client = await currentHarness().connect("runtime");
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    await callback(client);
  } finally {
    try {
      if (transactionStarted) await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }
}

async function expectConstraintViolation(
  client: PoolClient,
  probe: ConstraintProbe,
  code: "23503" | "23505" | "23514" = "23514",
): Promise<void> {
  await client.query("SAVEPOINT constraint_probe");
  try {
    await expect(client.query(probe.statement, probe.parameters)).rejects.toMatchObject({
      code,
      constraint: probe.constraint,
    });
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT constraint_probe");
    await client.query("RELEASE SAVEPOINT constraint_probe");
  }
}

async function seedTwoTenantFixture(client: PoolClient): Promise<void> {
  await client.query(
    `INSERT INTO tenants (tenant_id)
     VALUES ($1), ($2)`,
    [FIXTURE.tenantA, FIXTURE.tenantB],
  );
  await client.query(
    `INSERT INTO workspaces (tenant_id, workspace_id)
     VALUES ($1, $2), ($3, $4)`,
    [FIXTURE.tenantA, FIXTURE.workspaceA, FIXTURE.tenantB, FIXTURE.workspaceB],
  );
  await client.query(
    `INSERT INTO principals (tenant_id, principal_id, principal_kind)
     VALUES ($1, $2, 'human'), ($3, $4, 'service')`,
    [FIXTURE.tenantA, FIXTURE.principalA, FIXTURE.tenantB, FIXTURE.principalB],
  );
  await client.query(
    `INSERT INTO channels (tenant_id, workspace_id, channel_id, kind)
     VALUES ($1, $2, $3, 'public'), ($4, $5, $6, 'private')`,
    [
      FIXTURE.tenantA,
      FIXTURE.workspaceA,
      FIXTURE.channelA,
      FIXTURE.tenantB,
      FIXTURE.workspaceB,
      FIXTURE.channelB,
    ],
  );
}

beforeAll(async () => {
  harness = await startPostgresTestHarness();
}, 120_000);

beforeEach(async () => {
  databaseReady = false;
  const activeHarness = currentHarness();
  await activeHarness.resetDatabase();
  await runMigrations({
    MIGRATION_DATABASE_URL: activeHarness.connectionUrls.migrator,
    MIGRATION_TARGET_CLASS: "testcontainer",
  });
  databaseReady = true;
}, 60_000);

afterEach(async () => {
  if (!databaseReady) return;
  const result = await currentHarness().query<EmptyTableRow>(
    "runtime",
    `SELECT table_name, row_count
       FROM (
         SELECT 'channel_membership_epochs' AS table_name, count(*)::integer AS row_count FROM channel_membership_epochs
         UNION ALL SELECT 'channels', count(*)::integer FROM channels
         UNION ALL SELECT 'principals', count(*)::integer FROM principals
         UNION ALL SELECT 'tenants', count(*)::integer FROM tenants
         UNION ALL SELECT 'workspace_memberships', count(*)::integer FROM workspace_memberships
         UNION ALL SELECT 'workspaces', count(*)::integer FROM workspaces
       ) AS public_counts
      ORDER BY table_name`,
  );
  expect(result.rows).toEqual(
    PUBLIC_TABLES.map((tableName) => ({ table_name: tableName, row_count: 0 })),
  );
}, 30_000);

afterAll(async () => {
  await harness?.stop();
  harness = undefined;
}, 60_000);

describe.sequential("AW-008D PostgreSQL foundation constraints", () => {
  it("installs exactly the four ordered public v1 enums", async () => {
    const result = await currentHarness().query<EnumRow>(
      "migrator",
      `SELECT typ.typname AS enum_name,
              to_json(ARRAY(
                SELECT enum_value.enumlabel
                  FROM pg_enum AS enum_value
                 WHERE enum_value.enumtypid = typ.oid
                 ORDER BY enum_value.enumsortorder
              )) AS labels
         FROM pg_type AS typ
         JOIN pg_namespace AS namespace ON namespace.oid = typ.typnamespace
        WHERE namespace.nspname = 'public'
          AND typ.typtype = 'e'
        ORDER BY typ.typname`,
    );

    expect(result.rows).toEqual([
      { enum_name: "channel_kind_v1", labels: ["public", "private", "dm"] },
      { enum_name: "history_mode_v1", labels: ["full", "since_join"] },
      { enum_name: "principal_kind_v1", labels: ["human", "service"] },
      {
        enum_name: "workspace_role_v1",
        labels: ["owner", "admin", "member", "guest"],
      },
    ]);
  });

  it("installs exactly six public tables and no AW-010 product tables", async () => {
    const result = await currentHarness().query<TableRow>(
      "migrator",
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
    );

    expect(result.rows).toEqual(PUBLIC_TABLES.map((tableName) => ({ table_name: tableName })));
  });

  it("installs every exact primary key, foreign key, and check definition with no extras", async () => {
    const result = await currentHarness().query<ConstraintRow>(
      "migrator",
      `SELECT relation.relname AS table_name,
              constraint_entry.conname AS constraint_name,
              constraint_entry.contype AS constraint_type,
              pg_get_constraintdef(constraint_entry.oid, true) AS definition
         FROM pg_constraint AS constraint_entry
         JOIN pg_class AS relation ON relation.oid = constraint_entry.conrelid
         JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
        ORDER BY relation.relname, constraint_entry.contype, constraint_entry.conname`,
    );

    expect(result.rows).toEqual(EXPECTED_CONSTRAINTS);
    for (const constraint of result.rows.filter((row) => row.constraint_type !== "c")) {
      expect(constraint.definition).toMatch(/\(tenant_id(?:,|\))/u);
    }
  });

  it("installs only the exact tenant-leading indexes and one-active predicate", async () => {
    const result = await currentHarness().query<IndexRow>(
      "migrator",
      `SELECT table_relation.relname AS table_name,
              index_relation.relname AS index_name,
              index_entry.indisunique AS is_unique,
              pg_get_indexdef(index_entry.indexrelid) AS definition,
              pg_get_expr(index_entry.indpred, index_entry.indrelid, true) AS predicate
         FROM pg_index AS index_entry
         JOIN pg_class AS table_relation ON table_relation.oid = index_entry.indrelid
         JOIN pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
         JOIN pg_class AS index_relation ON index_relation.oid = index_entry.indexrelid
        WHERE namespace.nspname = 'public'
          AND NOT index_entry.indisprimary
        ORDER BY table_relation.relname, index_relation.relname`,
    );

    expect(result.rows).toEqual(EXPECTED_INDEXES);
    for (const index of result.rows) {
      expect(index.definition).toMatch(/ USING btree \(tenant_id,/u);
    }
    expect(result.rows.filter((row) => row.predicate !== null)).toEqual([EXPECTED_INDEXES[1]]);
  });

  it("keeps every timestamp and version exact, non-null, and defaulted", async () => {
    const result = await currentHarness().query<FoundationColumnRow>(
      "migrator",
      `SELECT table_name,
              column_name,
              data_type,
              datetime_precision,
              column_default,
              is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name IN ('created_at', 'version')
        ORDER BY table_name, column_name`,
    );

    expect(result.rows).toEqual(
      PUBLIC_TABLES.flatMap((tableName) => [
        {
          table_name: tableName,
          column_name: "created_at",
          data_type: "timestamp with time zone",
          datetime_precision: 6,
          column_default: "now()",
          is_nullable: "NO",
        },
        {
          table_name: tableName,
          column_name: "version",
          data_type: "bigint",
          datetime_precision: null,
          column_default: "1",
          is_nullable: "NO",
        },
      ]),
    );
  });

  it("accepts valid structural rows and synthetic positive epoch markers without claiming product writes", async () => {
    await withRollbackTransaction(async (client) => {
      await seedTwoTenantFixture(client);
      await client.query(
        `INSERT INTO workspace_memberships (tenant_id, workspace_id, principal_id, role)
         VALUES ($1, $2, $3, 'owner')`,
        [FIXTURE.tenantA, FIXTURE.workspaceA, FIXTURE.principalA],
      );
      await client.query(
        `INSERT INTO channel_membership_epochs
           (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq)
         VALUES ($1, $2, $3, $4, 'full', $5)`,
        [FIXTURE.tenantA, FIXTURE.channelA, FIXTURE.principalA, "epoch_synthetic_1", 101],
      );

      const defaults = await client.query<
        QueryResultRow & {
          table_name: string;
          created_at_present: boolean;
          version_is_one: boolean;
        }
      >(
        `SELECT table_name, created_at IS NOT NULL AS created_at_present, version = 1 AS version_is_one
           FROM (
             SELECT 'tenants' AS table_name, created_at, version FROM tenants WHERE tenant_id = $1
             UNION ALL SELECT 'workspaces', created_at, version FROM workspaces WHERE tenant_id = $1 AND workspace_id = $2
             UNION ALL SELECT 'principals', created_at, version FROM principals WHERE tenant_id = $1 AND principal_id = $3
             UNION ALL SELECT 'workspace_memberships', created_at, version FROM workspace_memberships WHERE tenant_id = $1 AND workspace_id = $2 AND principal_id = $3
             UNION ALL SELECT 'channels', created_at, version FROM channels WHERE tenant_id = $1 AND channel_id = $4
             UNION ALL SELECT 'channel_membership_epochs', created_at, version FROM channel_membership_epochs WHERE tenant_id = $1 AND channel_id = $4 AND principal_id = $3 AND membership_epoch = $5
           ) AS structural_rows
          ORDER BY table_name`,
        [
          FIXTURE.tenantA,
          FIXTURE.workspaceA,
          FIXTURE.principalA,
          FIXTURE.channelA,
          "epoch_synthetic_1",
        ],
      );

      expect(defaults.rows).toEqual(
        PUBLIC_TABLES.map((tableName) => ({
          table_name: tableName,
          created_at_present: true,
          version_is_one: true,
        })),
      );
    });
  });

  it("rejects every empty opaque ID and every non-positive version with exact checks", async () => {
    await withRollbackTransaction(async (client) => {
      await seedTwoTenantFixture(client);

      const nonemptyProbes: ConstraintProbe[] = [
        {
          constraint: "tenants_tenant_id_nonempty_ck",
          statement: "INSERT INTO tenants (tenant_id) VALUES ($1)",
          parameters: [""],
        },
        {
          constraint: "workspaces_tenant_id_nonempty_ck",
          statement: "INSERT INTO workspaces (tenant_id, workspace_id) VALUES ($1, $2)",
          parameters: ["", "workspace_probe"],
        },
        {
          constraint: "workspaces_workspace_id_nonempty_ck",
          statement: "INSERT INTO workspaces (tenant_id, workspace_id) VALUES ($1, $2)",
          parameters: [FIXTURE.tenantA, ""],
        },
        {
          constraint: "principals_tenant_id_nonempty_ck",
          statement:
            "INSERT INTO principals (tenant_id, principal_id, principal_kind) VALUES ($1, $2, 'human')",
          parameters: ["", "principal_probe"],
        },
        {
          constraint: "principals_principal_id_nonempty_ck",
          statement:
            "INSERT INTO principals (tenant_id, principal_id, principal_kind) VALUES ($1, $2, 'human')",
          parameters: [FIXTURE.tenantA, ""],
        },
        {
          constraint: "workspace_memberships_tenant_id_nonempty_ck",
          statement:
            "INSERT INTO workspace_memberships (tenant_id, workspace_id, principal_id, role) VALUES ($1, $2, $3, 'member')",
          parameters: ["", FIXTURE.workspaceA, FIXTURE.principalA],
        },
        {
          constraint: "workspace_memberships_workspace_id_nonempty_ck",
          statement:
            "INSERT INTO workspace_memberships (tenant_id, workspace_id, principal_id, role) VALUES ($1, $2, $3, 'member')",
          parameters: [FIXTURE.tenantA, "", FIXTURE.principalA],
        },
        {
          constraint: "workspace_memberships_principal_id_nonempty_ck",
          statement:
            "INSERT INTO workspace_memberships (tenant_id, workspace_id, principal_id, role) VALUES ($1, $2, $3, 'member')",
          parameters: [FIXTURE.tenantA, FIXTURE.workspaceA, ""],
        },
        {
          constraint: "channels_tenant_id_nonempty_ck",
          statement:
            "INSERT INTO channels (tenant_id, workspace_id, channel_id, kind) VALUES ($1, $2, $3, 'public')",
          parameters: ["", FIXTURE.workspaceA, "channel_probe"],
        },
        {
          constraint: "channels_workspace_id_nonempty_ck",
          statement:
            "INSERT INTO channels (tenant_id, workspace_id, channel_id, kind) VALUES ($1, $2, $3, 'public')",
          parameters: [FIXTURE.tenantA, "", "channel_probe"],
        },
        {
          constraint: "channels_channel_id_nonempty_ck",
          statement:
            "INSERT INTO channels (tenant_id, workspace_id, channel_id, kind) VALUES ($1, $2, $3, 'public')",
          parameters: [FIXTURE.tenantA, FIXTURE.workspaceA, ""],
        },
        {
          constraint: "channel_membership_epochs_tenant_id_nonempty_ck",
          statement:
            "INSERT INTO channel_membership_epochs (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq) VALUES ($1, $2, $3, $4, 'full', 1)",
          parameters: ["", FIXTURE.channelA, FIXTURE.principalA, "epoch_probe"],
        },
        {
          constraint: "channel_membership_epochs_channel_id_nonempty_ck",
          statement:
            "INSERT INTO channel_membership_epochs (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq) VALUES ($1, $2, $3, $4, 'full', 1)",
          parameters: [FIXTURE.tenantA, "", FIXTURE.principalA, "epoch_probe"],
        },
        {
          constraint: "channel_membership_epochs_principal_id_nonempty_ck",
          statement:
            "INSERT INTO channel_membership_epochs (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq) VALUES ($1, $2, $3, $4, 'full', 1)",
          parameters: [FIXTURE.tenantA, FIXTURE.channelA, "", "epoch_probe"],
        },
        {
          constraint: "channel_membership_epochs_epoch_nonempty_ck",
          statement:
            "INSERT INTO channel_membership_epochs (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq) VALUES ($1, $2, $3, $4, 'full', 1)",
          parameters: [FIXTURE.tenantA, FIXTURE.channelA, FIXTURE.principalA, ""],
        },
      ];

      for (const probe of nonemptyProbes) await expectConstraintViolation(client, probe);

      const versionProbes: ConstraintProbe[] = [
        {
          constraint: "tenants_version_positive_ck",
          statement: "INSERT INTO tenants (tenant_id, version) VALUES ($1, 0)",
          parameters: ["tenant_version_probe"],
        },
        {
          constraint: "workspaces_version_positive_ck",
          statement: "INSERT INTO workspaces (tenant_id, workspace_id, version) VALUES ($1, $2, 0)",
          parameters: [FIXTURE.tenantA, "workspace_version_probe"],
        },
        {
          constraint: "principals_version_positive_ck",
          statement:
            "INSERT INTO principals (tenant_id, principal_id, principal_kind, version) VALUES ($1, $2, 'human', 0)",
          parameters: [FIXTURE.tenantA, "principal_version_probe"],
        },
        {
          constraint: "workspace_memberships_version_positive_ck",
          statement:
            "INSERT INTO workspace_memberships (tenant_id, workspace_id, principal_id, role, version) VALUES ($1, $2, $3, 'member', 0)",
          parameters: [FIXTURE.tenantA, FIXTURE.workspaceA, FIXTURE.principalA],
        },
        {
          constraint: "channels_version_positive_ck",
          statement:
            "INSERT INTO channels (tenant_id, workspace_id, channel_id, kind, version) VALUES ($1, $2, $3, 'public', 0)",
          parameters: [FIXTURE.tenantA, FIXTURE.workspaceA, "channel_version_probe"],
        },
        {
          constraint: "channel_membership_epochs_version_positive_ck",
          statement:
            "INSERT INTO channel_membership_epochs (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq, version) VALUES ($1, $2, $3, $4, 'full', 1, 0)",
          parameters: [
            FIXTURE.tenantA,
            FIXTURE.channelA,
            FIXTURE.principalA,
            "epoch_version_probe",
          ],
        },
      ];

      for (const probe of versionProbes) await expectConstraintViolation(client, probe);
    });
  });

  it("rejects cross-tenant workspace, principal, and channel references by exact foreign key", async () => {
    await withRollbackTransaction(async (client) => {
      await seedTwoTenantFixture(client);

      const probes: ConstraintProbe[] = [
        {
          constraint: "workspace_memberships_workspace_fk",
          statement:
            "INSERT INTO workspace_memberships (tenant_id, workspace_id, principal_id, role) VALUES ($1, $2, $3, 'member')",
          parameters: [FIXTURE.tenantA, FIXTURE.workspaceB, FIXTURE.principalA],
        },
        {
          constraint: "workspace_memberships_principal_fk",
          statement:
            "INSERT INTO workspace_memberships (tenant_id, workspace_id, principal_id, role) VALUES ($1, $2, $3, 'member')",
          parameters: [FIXTURE.tenantA, FIXTURE.workspaceA, FIXTURE.principalB],
        },
        {
          constraint: "channels_workspace_fk",
          statement:
            "INSERT INTO channels (tenant_id, workspace_id, channel_id, kind) VALUES ($1, $2, $3, 'public')",
          parameters: [FIXTURE.tenantA, FIXTURE.workspaceB, "channel_cross_tenant"],
        },
        {
          constraint: "channel_membership_epochs_channel_fk",
          statement:
            "INSERT INTO channel_membership_epochs (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq) VALUES ($1, $2, $3, $4, 'since_join', 1)",
          parameters: [
            FIXTURE.tenantA,
            FIXTURE.channelB,
            FIXTURE.principalA,
            "epoch_cross_channel",
          ],
        },
        {
          constraint: "channel_membership_epochs_principal_fk",
          statement:
            "INSERT INTO channel_membership_epochs (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq) VALUES ($1, $2, $3, $4, 'since_join', 1)",
          parameters: [
            FIXTURE.tenantA,
            FIXTURE.channelA,
            FIXTURE.principalB,
            "epoch_cross_principal",
          ],
        },
      ];

      for (const probe of probes) await expectConstraintViolation(client, probe, "23503");
    });
  });

  it("requires a positive synthetic join marker and a null or later exit marker", async () => {
    await withRollbackTransaction(async (client) => {
      await seedTwoTenantFixture(client);

      for (const probe of [
        {
          constraint: "channel_membership_epochs_joined_positive_ck",
          statement:
            "INSERT INTO channel_membership_epochs (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq, exited_event_seq) VALUES ($1, $2, $3, $4, 'full', 0, 1)",
          parameters: [FIXTURE.tenantA, FIXTURE.channelA, FIXTURE.principalA, "epoch_join_zero"],
        },
        {
          constraint: "channel_membership_epochs_joined_positive_ck",
          statement:
            "INSERT INTO channel_membership_epochs (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq, exited_event_seq) VALUES ($1, $2, $3, $4, 'full', -1, 1)",
          parameters: [
            FIXTURE.tenantA,
            FIXTURE.channelA,
            FIXTURE.principalA,
            "epoch_join_negative",
          ],
        },
        {
          constraint: "channel_membership_epochs_exit_after_join_ck",
          statement:
            "INSERT INTO channel_membership_epochs (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq, exited_event_seq) VALUES ($1, $2, $3, $4, 'full', 10, 10)",
          parameters: [FIXTURE.tenantA, FIXTURE.channelA, FIXTURE.principalA, "epoch_exit_equal"],
        },
        {
          constraint: "channel_membership_epochs_exit_after_join_ck",
          statement:
            "INSERT INTO channel_membership_epochs (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq, exited_event_seq) VALUES ($1, $2, $3, $4, 'full', 10, 9)",
          parameters: [FIXTURE.tenantA, FIXTURE.channelA, FIXTURE.principalA, "epoch_exit_before"],
        },
      ] satisfies ConstraintProbe[]) {
        await expectConstraintViolation(client, probe);
      }

      await client.query(
        `INSERT INTO channel_membership_epochs
           (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq, exited_event_seq)
         VALUES ($1, $2, $3, 'epoch_closed_valid', 'full', 11, 12),
                ($1, $2, $3, 'epoch_active_valid', 'since_join', 13, NULL)`,
        [FIXTURE.tenantA, FIXTURE.channelA, FIXTURE.principalA],
      );
      const rows = await client.query<
        QueryResultRow & {
          membership_epoch: string;
          joined_event_seq: string;
          exited_event_seq: string | null;
        }
      >(
        `SELECT membership_epoch, joined_event_seq, exited_event_seq
           FROM channel_membership_epochs
          ORDER BY joined_event_seq`,
      );
      expect(rows.rows).toEqual([
        {
          membership_epoch: "epoch_closed_valid",
          joined_event_seq: "11",
          exited_event_seq: "12",
        },
        {
          membership_epoch: "epoch_active_valid",
          joined_event_seq: "13",
          exited_event_seq: null,
        },
      ]);
    });
  });

  it("enforces one active epoch per tenant/channel/principal while preserving closed history", async () => {
    await withRollbackTransaction(async (client) => {
      await seedTwoTenantFixture(client);
      await client.query(
        `INSERT INTO channel_membership_epochs
           (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq)
         VALUES ($1, $2, $3, 'epoch_first', 'full', 100)`,
        [FIXTURE.tenantA, FIXTURE.channelA, FIXTURE.principalA],
      );

      await expectConstraintViolation(
        client,
        {
          constraint: "channel_membership_epochs_one_active_uq",
          statement:
            "INSERT INTO channel_membership_epochs (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq) VALUES ($1, $2, $3, 'epoch_second', 'since_join', 101)",
          parameters: [FIXTURE.tenantA, FIXTURE.channelA, FIXTURE.principalA],
        },
        "23505",
      );

      await client.query(
        `UPDATE channel_membership_epochs
            SET exited_event_seq = 102
          WHERE tenant_id = $1
            AND channel_id = $2
            AND principal_id = $3
            AND membership_epoch = 'epoch_first'`,
        [FIXTURE.tenantA, FIXTURE.channelA, FIXTURE.principalA],
      );
      await client.query(
        `INSERT INTO channel_membership_epochs
           (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq)
         VALUES ($1, $2, $3, 'epoch_second', 'since_join', 103),
                ($4, $5, $6, 'epoch_other_tenant', 'full', 100)`,
        [
          FIXTURE.tenantA,
          FIXTURE.channelA,
          FIXTURE.principalA,
          FIXTURE.tenantB,
          FIXTURE.channelB,
          FIXTURE.principalB,
        ],
      );

      const rows = await client.query<
        QueryResultRow & {
          tenant_id: string;
          membership_epoch: string;
          exited_event_seq: string | null;
        }
      >(
        `SELECT tenant_id, membership_epoch, exited_event_seq
           FROM channel_membership_epochs
          ORDER BY tenant_id, joined_event_seq`,
      );
      expect(rows.rows).toEqual([
        {
          tenant_id: FIXTURE.tenantA,
          membership_epoch: "epoch_first",
          exited_event_seq: "102",
        },
        {
          tenant_id: FIXTURE.tenantA,
          membership_epoch: "epoch_second",
          exited_event_seq: null,
        },
        {
          tenant_id: FIXTURE.tenantB,
          membership_epoch: "epoch_other_tenant",
          exited_event_seq: null,
        },
      ]);
    });
  });
});
