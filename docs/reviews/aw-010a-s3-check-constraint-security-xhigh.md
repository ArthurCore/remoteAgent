APPROVED

# AW-010A S3 Missing Check-Constraint Security Review — xhigh

**Verdict:** **APPROVED.** No security or data-integrity blocker remains in the proposed focused correction. The four checks below are the minimum additional database checks required by the frozen `channel_events` table contract. Approval is conditional on retaining each column's independent `NOT NULL`, exact constraint name, and exact normalized predicate in S3/S4.

## Scope reviewed

- `docs/reviews/aw-010a-s3-check-constraint-spec-xhigh.md`
- `docs/plans/aw-010a-channel-stream-foundation.md` §3
- `docs/plans/aw-010a-task-cards.md` S3/S4
- `packages/contracts/src/primitives.ts` and `packages/contracts/src/events.ts`
- existing AW-008 ID checks and `principal_kind_v1`

This is a focused pre-implementation security/data-integrity review. It does not approve payload-schema checks, a principal foreign key, a new enum, or any unimplemented S3/S4 artifact.

## Approved exact correction

Add these exact constraints to `channel_events`, in addition to the already frozen key, foreign-key, sequence, schema-version, and event-type constraints:

| Exact constraint name | Exact normalized predicate |
|---|---|
| `channel_events_event_id_nonempty_check` | `length(event_id) > 0` |
| `channel_events_actor_principal_id_nonempty_check` | `length(actor_principal_id) > 0` |
| `channel_events_actor_kind_check` | `actor_kind IN ('human', 'service', 'system')` |
| `channel_events_payload_object_check` | `jsonb_typeof(payload) = 'object'` |

All four names are below PostgreSQL's 63-byte identifier limit and are unambiguous on the owning table. S3 must freeze the names and normalized predicates, not merely assert that four checks exist.

## Security and data-integrity assessment

### SQL `NULL`, empty, and whitespace semantics

PostgreSQL accepts a `CHECK` when its expression is true **or SQL `NULL`**. Consequently, none of these predicates substitutes for column nullability. The frozen `event_id`, `actor_principal_id`, `actor_kind`, and `payload` columns must remain independently `NOT NULL`.

With that pairing:

- `length(event_id) > 0` and `length(actor_principal_id) > 0` reject the empty string;
- SQL `NULL` is rejected by `NOT NULL`, rather than accidentally passing through three-valued check semantics;
- whitespace-only strings pass. That is correct for the present contract: `OpaqueIdV1` is `z.string().min(1).max(255)` and does not trim or require a non-whitespace character. A `btrim(...)` predicate would be a new, stricter identifier contract and is not part of this correction.

Both nonempty checks are necessary. `event_id` is unique but uniqueness does not reject `''`; `actor_principal_id` deliberately lacks a blanket principal FK and therefore has no referenced-row check from which to inherit nonemptiness. By contrast, `tenant_id` and `channel_id` are already bound through the tenant-leading channel FK to checked, nonempty referenced keys, so duplicate child checks are not required for this focused table contract.

### JSON object enforcement

`jsonb NOT NULL` alone admits JSON arrays, strings, numbers, booleans, and JSON `null`. The approved predicate admits `{}` and other top-level objects while rejecting every non-object JSON kind. SQL `NULL` remains the responsibility of `NOT NULL`; JSON `null` has `jsonb_typeof(...) = 'null'` and therefore fails the check.

This check intentionally enforces only the frozen top-level object shape. Correlation between `event_type` and each strict payload schema remains the `DurableEventV1` application-boundary invariant and is outside this review. Expanding the database predicate into payload-schema validation is not approved.

### Actor representation and raw-role boundary

The scalar pair reconstructs the canonical actor object without excluding system actors:

- `actor_principal_id` is a nonempty `varchar(255)` opaque ID;
- `actor_kind` is constrained to exactly `human | service | system`.

`principal_kind_v1` cannot be reused because it intentionally contains only `human | service`, while canonical durable events permit `system`. A blanket FK to `principals` would likewise make the canonical system actor unrepresentable. Human/service existence, tenant agreement, kind agreement, and the `system:channel-lifecycle` allowlist remain transactional adapter invariants as already frozen.

The four checks do **not** turn the current generic raw-SQL runtime role into a least-privilege journal writer. A role that can insert directly can still choose a nonexistent human/service actor or an arbitrary nonempty system actor ID. The parent plan expressly discloses that limitation and does not claim these checks provide complete protection against a compromised raw-SQL role. Closing it requires the separately reviewed role/routine design already excluded from S3, not an invented principal FK or an overclaimed check-constraint fix.

### No new PostgreSQL enum

Do not add an actor-kind or event-type enum for this correction:

- reusing `principal_kind_v1` is semantically wrong because it excludes `system`;
- a new enum is an additional migration object outside the frozen two-table S3 surface;
- an enum would replace the required named check rather than implement its exact contract; and
- it adds avoidable schema-evolution coupling without closing the raw-role actor-identity limitation.

A scalar column plus the exact named finite-set check is the correct minimum representation.

## Independent PostgreSQL semantic probe

The exact four predicates were exercised against the repository-pinned PostgreSQL `17.11` image. The probe confirmed:

- ordinary values and `{}` are accepted;
- whitespace-only opaque IDs are accepted, matching the current Zod contract;
- empty event and actor IDs are rejected;
- an unregistered actor kind is rejected;
- array, scalar, JSON `null`, and SQL `NULL` payloads are rejected when paired with `NOT NULL`; and
- SQL `NULL` makes `length(NULL) > 0` evaluate to `NULL`, confirming why `NOT NULL` must remain explicit.

Within the frozen scope, no fifth check, payload-schema validation, principal FK, or enum is required.
