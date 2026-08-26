import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

import { channels } from "./foundation.js";

export const channelEventSequences = pgTable(
  "channel_event_sequences",
  {
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    channelId: varchar("channel_id", { length: 255 }).notNull(),
    lastEventSeq: bigint("last_event_seq", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "channel_event_sequences_pkey",
      columns: [table.tenantId, table.channelId],
    }),
    foreignKey({
      name: "channel_event_sequences_tenant_channel_fk",
      columns: [table.tenantId, table.channelId],
      foreignColumns: [channels.tenantId, channels.channelId],
    })
      .onUpdate("restrict")
      .onDelete("restrict"),
    check("channel_event_sequences_last_event_seq_check", sql`${table.lastEventSeq} >= 0`),
  ],
);

export const channelEvents = pgTable(
  "channel_events",
  {
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    channelId: varchar("channel_id", { length: 255 }).notNull(),
    eventSeq: bigint("event_seq", { mode: "bigint" }).notNull(),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    schemaVersion: integer("schema_version").notNull(),
    eventType: text("event_type").notNull(),
    actorPrincipalId: varchar("actor_principal_id", { length: 255 }).notNull(),
    actorKind: text("actor_kind").notNull(),
    occurredAt: timestamp("occurred_at", { precision: 6, withTimezone: true }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "channel_events_pkey",
      columns: [table.tenantId, table.channelId, table.eventSeq],
    }),
    foreignKey({
      name: "channel_events_tenant_channel_fk",
      columns: [table.tenantId, table.channelId],
      foreignColumns: [channels.tenantId, channels.channelId],
    })
      .onUpdate("restrict")
      .onDelete("restrict"),
    unique("channel_events_event_id_key").on(table.eventId),
    check("channel_events_event_seq_check", sql`${table.eventSeq} > 0`),
    check("channel_events_event_id_nonempty_check", sql`length(${table.eventId}) > 0`),
    check("channel_events_schema_version_check", sql`${table.schemaVersion} = 1`),
    check(
      "channel_events_event_type_check",
      sql`${table.eventType} IN ('message.created', 'message.edited', 'message.deleted', 'reaction.changed', 'channel.member_joined', 'channel.member_left', 'channel.member_revoked')`,
    ),
    check(
      "channel_events_actor_principal_id_nonempty_check",
      sql`length(${table.actorPrincipalId}) > 0`,
    ),
    check(
      "channel_events_actor_kind_check",
      sql`${table.actorKind} IN ('human', 'service', 'system')`,
    ),
    check("channel_events_payload_object_check", sql`jsonb_typeof(${table.payload}) = 'object'`),
  ],
);
