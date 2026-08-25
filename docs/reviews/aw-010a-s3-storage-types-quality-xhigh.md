APPROVED

# AW-010A S3 Scalar Storage-Type Quality and Migration-Stability Review — xhigh

**Verdict:** **APPROVED for the proposed correction.** The exact `integer` / `text` / `jsonb` freeze is preferable to the parent plan's current ambiguous declarations, is stable under the repository's pinned Drizzle toolchain, and leaves deliberate migration paths for future protocol versions. Approval requires parent §3 and the S3 assertions to adopt the exact declarations below before implementation; it does not approve `integer/smallint`, an arbitrary `varchar(n)`, a schema-version default, or a new/reused PostgreSQL enum.

## Scope reviewed

- `docs/reviews/aw-010a-s3-storage-types-spec-xhigh.md`
- `docs/plans/aw-010a-channel-stream-foundation.md` §3
- `docs/plans/aw-010a-task-cards.md` S3/S4
- `packages/contracts/src/primitives.ts` and `packages/contracts/src/events.ts`
- `packages/db/src/schema/foundation.ts`, the `0000` migration/snapshot, and existing exact schema assertions
- pinned `drizzle-orm@0.45.2` and `drizzle-kit@0.31.10`

This is a focused pre-S3 storage-quality and migration-stability review. It does not claim that the S3 schema or S4 migration exists.

## Approved exact storage freeze

| Column | Exact declaration | Required companion rule |
|---|---|---|
| `schema_version` | `integer NOT NULL`, **no default** | `channel_events_schema_version_check (schema_version = 1)` |
| `event_type` | `text NOT NULL` | exact seven-literal `channel_events_event_type_check` |
| `actor_kind` | `text NOT NULL` | `channel_events_actor_kind_check (actor_kind IN ('human', 'service', 'system'))` |
| `payload` | `jsonb NOT NULL` | `channel_events_payload_object_check (jsonb_typeof(payload) = 'object')` |

The remaining scalar declarations also remain exact: every opaque ID is `varchar(255) NOT NULL`; sequence values are signed `bigint NOT NULL`; timestamps are `timestamptz(6) NOT NULL`; only sequence state has default `0`, and only `created_at` has default `now()`. No actor-kind or event-type enum is introduced or reused.

## Quality and future-compatibility assessment

### `text` plus a named finite-set check

`text` is the better representation for `event_type` and `actor_kind`. The contracts define membership in a literal set, not an independent byte/character ceiling. An arbitrary `varchar(n)` would add a second, undocumented invariant that could reject a future registered literal even after the finite-set check was updated. Unbounded `varchar` offers no useful PostgreSQL storage or performance advantage over `text` and would still create a distinct Drizzle snapshot type.

The named checks preserve fail-closed v1 behavior while keeping evolution explicit. A future reviewed event or actor kind changes a constraint predicate without requiring a column-type conversion. This is materially simpler than coupling the journal to another PostgreSQL enum object, especially for removal, rename, ordering, rollback, and snapshot/hash ownership. Reusing `principal_kind_v1` is semantically invalid because it excludes `system`.

### `integer`, not `smallint`, and no default

The equality check currently restricts the value to `1`, so `smallint` saves no meaningful space or integrity work. Exact `integer` is the conventional protocol-version scalar, has ample future range, and avoids a later widening migration if versioning policy changes. The type and equality check serve different purposes: `integer` is the durable representation, while the named check deliberately blocks unreviewed versions.

`schema_version` must have **no database default**. The journal service owns the envelope and injects literal `1` before validating and inserting it. Omitting the column must therefore fail rather than silently manufacturing a v1 envelope for an incomplete or stale writer. Future version support must deliberately update the application contract and database check; it must not arrive through a storage default.

### `jsonb` with an object-shape check

`jsonb NOT NULL` plus `jsonb_typeof(payload) = 'object'` matches the envelope's record/object boundary. It admits `{}` and future object keys while rejecting arrays, scalar JSON values, JSON `null`, and—through independent `NOT NULL`—SQL `NULL`. It also gives a canonical PostgreSQL JSON representation without freezing event-specific payload fields into DDL.

The check intentionally does not duplicate the discriminated `DurableEventV1` payload schemas. Strict event-type/payload correlation remains an application invariant before insert and after read, allowing payload contracts to evolve without unnecessary table-type migrations.

## Drizzle generation and migration stability

I exercised the exact declarations in a temporary additive schema against the committed `0000` snapshot, then removed the probe. With the pinned versions:

- Drizzle ORM reported the exact SQL types `integer`, `text`, `jsonb`, `varchar(255)`, `bigint`, and `timestamp (6) with time zone`;
- Drizzle Kit generated `schema_version integer NOT NULL`, both discriminants as `text NOT NULL`, and `payload jsonb NOT NULL` with the exact named checks;
- the generated snapshot recorded the same literal types and recorded no default for `schema_version`;
- generated SQL contained no `CREATE TYPE` or enum alteration; and
- `drizzle-kit check` completed successfully.

A second temporary probe expanded the accepted schema versions and event literals. Drizzle generated only named check-constraint drop/add statements—no column-type conversion and no enum operation—and its consistency check still passed. That is the desired future migration shape. Constraint replacement still requires the ordinary reviewed transaction, locking, validation, snapshot inspection, and hash freeze already assigned to S4/S5; generation is evidence to inspect, not authority to apply unchecked.

S3 must distinguish these exact types and defaults through `getSQLType()`/table metadata and freeze the normalized check predicates. S4 must inspect and freeze both generated SQL and snapshot metadata. Under those gates, no quality or migration-stability blocker remains.
