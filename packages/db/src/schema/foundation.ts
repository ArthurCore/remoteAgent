import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { channelKindV1, historyModeV1, principalKindV1, workspaceRoleV1 } from "./enums.js";

export const tenants = pgTable(
  "tenants",
  {
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull().defaultNow(),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
  },
  (table) => [
    primaryKey({ name: "tenants_pk", columns: [table.tenantId] }),
    check("tenants_tenant_id_nonempty_ck", sql`length(${table.tenantId}) > 0`),
    check("tenants_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const workspaces = pgTable(
  "workspaces",
  {
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    workspaceId: varchar("workspace_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull().defaultNow(),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
  },
  (table) => [
    primaryKey({ name: "workspaces_pk", columns: [table.tenantId, table.workspaceId] }),
    foreignKey({
      name: "workspaces_tenant_fk",
      columns: [table.tenantId],
      foreignColumns: [tenants.tenantId],
    })
      .onUpdate("restrict")
      .onDelete("restrict"),
    check("workspaces_tenant_id_nonempty_ck", sql`length(${table.tenantId}) > 0`),
    check("workspaces_workspace_id_nonempty_ck", sql`length(${table.workspaceId}) > 0`),
    check("workspaces_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const principals = pgTable(
  "principals",
  {
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    principalId: varchar("principal_id", { length: 255 }).notNull(),
    principalKind: principalKindV1("principal_kind").notNull(),
    createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull().defaultNow(),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
  },
  (table) => [
    primaryKey({ name: "principals_pk", columns: [table.tenantId, table.principalId] }),
    foreignKey({
      name: "principals_tenant_fk",
      columns: [table.tenantId],
      foreignColumns: [tenants.tenantId],
    })
      .onUpdate("restrict")
      .onDelete("restrict"),
    check("principals_tenant_id_nonempty_ck", sql`length(${table.tenantId}) > 0`),
    check("principals_principal_id_nonempty_ck", sql`length(${table.principalId}) > 0`),
    check("principals_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    workspaceId: varchar("workspace_id", { length: 255 }).notNull(),
    principalId: varchar("principal_id", { length: 255 }).notNull(),
    role: workspaceRoleV1("role").notNull(),
    createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull().defaultNow(),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
  },
  (table) => [
    primaryKey({
      name: "workspace_memberships_pk",
      columns: [table.tenantId, table.workspaceId, table.principalId],
    }),
    foreignKey({
      name: "workspace_memberships_workspace_fk",
      columns: [table.tenantId, table.workspaceId],
      foreignColumns: [workspaces.tenantId, workspaces.workspaceId],
    })
      .onUpdate("restrict")
      .onDelete("restrict"),
    foreignKey({
      name: "workspace_memberships_principal_fk",
      columns: [table.tenantId, table.principalId],
      foreignColumns: [principals.tenantId, principals.principalId],
    })
      .onUpdate("restrict")
      .onDelete("restrict"),
    check("workspace_memberships_tenant_id_nonempty_ck", sql`length(${table.tenantId}) > 0`),
    check("workspace_memberships_workspace_id_nonempty_ck", sql`length(${table.workspaceId}) > 0`),
    check("workspace_memberships_principal_id_nonempty_ck", sql`length(${table.principalId}) > 0`),
    check("workspace_memberships_version_positive_ck", sql`${table.version} > 0`),
    index("workspace_memberships_principal_idx").on(
      table.tenantId,
      table.principalId,
      table.workspaceId,
    ),
  ],
);

export const channels = pgTable(
  "channels",
  {
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    workspaceId: varchar("workspace_id", { length: 255 }).notNull(),
    channelId: varchar("channel_id", { length: 255 }).notNull(),
    kind: channelKindV1("kind").notNull(),
    createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull().defaultNow(),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
  },
  (table) => [
    primaryKey({ name: "channels_pk", columns: [table.tenantId, table.channelId] }),
    foreignKey({
      name: "channels_workspace_fk",
      columns: [table.tenantId, table.workspaceId],
      foreignColumns: [workspaces.tenantId, workspaces.workspaceId],
    })
      .onUpdate("restrict")
      .onDelete("restrict"),
    check("channels_tenant_id_nonempty_ck", sql`length(${table.tenantId}) > 0`),
    check("channels_workspace_id_nonempty_ck", sql`length(${table.workspaceId}) > 0`),
    check("channels_channel_id_nonempty_ck", sql`length(${table.channelId}) > 0`),
    check("channels_version_positive_ck", sql`${table.version} > 0`),
    index("channels_workspace_idx").on(table.tenantId, table.workspaceId, table.channelId),
  ],
);

export const channelMembershipEpochs = pgTable(
  "channel_membership_epochs",
  {
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    channelId: varchar("channel_id", { length: 255 }).notNull(),
    principalId: varchar("principal_id", { length: 255 }).notNull(),
    membershipEpoch: varchar("membership_epoch", { length: 255 }).notNull(),
    historyMode: historyModeV1("history_mode").notNull(),
    joinedEventSeq: bigint("joined_event_seq", { mode: "bigint" }).notNull(),
    exitedEventSeq: bigint("exited_event_seq", { mode: "bigint" }),
    createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull().defaultNow(),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
  },
  (table) => [
    primaryKey({
      name: "channel_membership_epochs_pk",
      columns: [table.tenantId, table.channelId, table.principalId, table.membershipEpoch],
    }),
    foreignKey({
      name: "channel_membership_epochs_channel_fk",
      columns: [table.tenantId, table.channelId],
      foreignColumns: [channels.tenantId, channels.channelId],
    })
      .onUpdate("restrict")
      .onDelete("restrict"),
    foreignKey({
      name: "channel_membership_epochs_principal_fk",
      columns: [table.tenantId, table.principalId],
      foreignColumns: [principals.tenantId, principals.principalId],
    })
      .onUpdate("restrict")
      .onDelete("restrict"),
    check("channel_membership_epochs_tenant_id_nonempty_ck", sql`length(${table.tenantId}) > 0`),
    check("channel_membership_epochs_channel_id_nonempty_ck", sql`length(${table.channelId}) > 0`),
    check(
      "channel_membership_epochs_principal_id_nonempty_ck",
      sql`length(${table.principalId}) > 0`,
    ),
    check("channel_membership_epochs_epoch_nonempty_ck", sql`length(${table.membershipEpoch}) > 0`),
    check("channel_membership_epochs_joined_positive_ck", sql`${table.joinedEventSeq} > 0`),
    check(
      "channel_membership_epochs_exit_after_join_ck",
      sql`${table.exitedEventSeq} IS NULL OR ${table.exitedEventSeq} > ${table.joinedEventSeq}`,
    ),
    check("channel_membership_epochs_version_positive_ck", sql`${table.version} > 0`),
    uniqueIndex("channel_membership_epochs_one_active_uq")
      .on(table.tenantId, table.channelId, table.principalId)
      .where(sql`${table.exitedEventSeq} IS NULL`),
    index("channel_membership_epochs_principal_idx").on(
      table.tenantId,
      table.principalId,
      table.channelId,
      table.exitedEventSeq,
    ),
    index("channel_membership_epochs_channel_seq_idx").on(
      table.tenantId,
      table.channelId,
      table.joinedEventSeq,
    ),
  ],
);
