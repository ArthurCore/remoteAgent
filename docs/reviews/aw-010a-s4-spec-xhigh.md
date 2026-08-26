PASS

# AW-010A S4 Specification Review — xhigh

**Verdict:** **PASS.** Against base `c7e13cf`, the S4 candidate implements the frozen parent §3 contract and the S4 card exactly. I found no specification deviation, migration-history rewrite, dependency/lock drift, test weakening, checker weakening, future-object pre-allowance, or unrelated implementation edit.

## Scope reviewed

The implementation diff is exactly the eight S4-owned paths:

1. `packages/db/drizzle/0001_aw010a_channel_stream.sql`
2. `packages/db/drizzle/meta/0001_snapshot.json`
3. `packages/db/drizzle/meta/_journal.json`
4. `packages/db/src/migration-integrity.ts`
5. `packages/db/test/channel-stream-migration.spec.ts`
6. `packages/db/test/migration.spec.ts`
7. `packages/db/package.json`
8. `scripts/assert-aw007-tree.mjs`

This review file is the only additional working-tree path. `pnpm-lock.yaml`, both `0000` artifacts, and all dependency/devDependency objects are unchanged; there is no staged content and no implementation commit was made.

Controlling specifications:

- `docs/plans/aw-010a-channel-stream-foundation.md` §3
- `docs/plans/aw-010a-task-cards.md` S4 and its cumulative anti-weakening protocol
- reviewed S3 declaration, storage-type, check-constraint, and existing-schema-test decisions

## Specification findings

### Migration SQL

- The SQL contains no top-level `BEGIN`, `START TRANSACTION`, `COMMIT`, or `ROLLBACK`. Every top-level statement is breakpoint-separated, and the pinned Drizzle migrator is frozen by test to execute the pending statements and ledger insert inside one outer transaction.
- Its first two statements take `ACCESS EXCLUSIVE` locks in the exact order `public.channels` then `public.channel_membership_epochs`. A row-free, generic-error membership-empty preflight follows before any object is created.
- It creates exactly `channel_event_sequences` and `channel_events`, with the parent §3 column order, scalar types, nullability, defaults, PKs, tenant-leading channel FKs, global event-ID uniqueness, and complete named check surfaces. It introduces no event/actor enum, explicit index, view, role, policy, sequence, or unrelated table.
- It defines exactly three static, fully qualified, default-invoker-rights functions: `initialize_channel_event_sequence()`, `reject_channel_event_mutation()`, and `enforce_channel_membership_event_types()`. There is no dynamic SQL or `SECURITY DEFINER` surface.
- The exact `AFTER INSERT` channel initialization trigger and unconditional `BEFORE UPDATE OR DELETE` event append-only trigger are present. Existing locked channels are then backfilled with one zero state row each, with no synthetic event, conflict laundering, or sequence derivation.
- The joined and exited membership references are exactly two tenant-leading, `ON DELETE/UPDATE RESTRICT`, ordinary immediate (`NOT DEFERRABLE`) FKs to `(tenant_id, channel_id, event_seq)`.
- Exactly one deferred object exists: `channel_membership_epochs_event_type_guard`, a `DEFERRABLE INITIALLY DEFERRED` constraint trigger for insert and the four relevant update columns. Its static joined lookup requires `channel.member_joined`; nullable exit is accepted, while a non-null exit must be `channel.member_left` or `channel.member_revoked`. Missing and mistyped references fail with generic messages containing no row data.
- The final guarded block re-proves membership emptiness and that every channel resolves to exactly one state row. The state FK excludes extra orphan state. Error messages are generic, and the migration contains no down/destructive operation or future message/outbox/idempotency/projection/read-state surface.

### Generated lineage and integrity

- A fresh Drizzle `0.31.10` generation seeded only with the immutable `0000` SQL/snapshot/journal produced one `0001_aw010a_channel_stream` entry. After normalizing only the newly generated snapshot UUID, its `0001_snapshot.json` is structurally identical to the candidate; `prevId` equals the exact `0000` snapshot ID. The candidate SQL is the card-required inspected/custom replacement of generated DDL, while retaining that exact generated snapshot lineage.
- The journal is exactly version 7/PostgreSQL with two strictly ordered entries: unchanged `0000_aw008_foundation`, then `0001_aw010a_channel_stream`, both with breakpoints enabled and increasing `idx`/`when`.
- The migration directory contains exactly five artifacts: two SQL files, two snapshots, and `_journal.json`. The frozen SHA-256 values match all five actual files. `migration-integrity.ts` requires exactly those five paths and exactly two ordered migration hashes while preserving the immutable `0000` hashes.
- `0000_aw008_foundation.sql` and `meta/0000_snapshot.json` have zero diff from `c7e13cf`. The cumulative snapshot preserves every old table object byte-for-structure, adds only the two stream tables, preserves the existing enum/index/object surfaces, and has no future schema object.

### Tests, package, and checker

- `channel-stream-migration.spec.ts` contains exactly 22 uniquely named `AW010A-S4` tests, all active. They cover the five-artifact/hash set, immutable `0000`, exact journal order and snapshot lineage, transaction ownership, locks/preflight, tables/types/constraints, three functions, three triggers, backfill, immediate FKs, deferred typed logic, postconditions, exact two-migration reading, hash/prefix failures, extra/drift rejection, and topology rejection. There is no skip/todo/only/retry/conditional marker.
- Every pre-existing named test in `migration.spec.ts` is preserved in the same order. Its only behavioral updates change the committed artifact expectation from one migration/hash to the exact ordered two-migration/hash prefix.
- `packages/db/package.json` changes only `test:unit`, explicitly appending `test/channel-stream-migration.spec.ts`; scripts remain explicit and dependency sections are unchanged.
- The checker delta adds only the three S4 manifest paths, explicit DB unit selection, seven non-self byte-hash oracles, and exact S4 SQL/snapshot/journal/object checks. Its only removals are the predecessor package hash/script value and one-entry journal assertions that necessarily become exact two-entry assertions. Prior S3/AW-008 oracles remain enforced; there is no glob, subset comparison, allow-extra branch, ignore expansion, later-card placeholder, or anti-oracle weakening.

## Independent verification

- Focused S4 + existing migration suite: **2 files, 77/77 tests passed** (`22` named S4 tests plus all existing migration cases), zero skipped/todo.
- DB integrity gate: **exit 0**; Drizzle reported `Everything's fine`, and the offline exact-file/hash gate passed.
- Fresh generation lineage audit: **exit 0**; exactly one `0001` was generated, snapshot structure matched, `prevId` matched, and journal shape was exactly `[0000, 0001]`.
- Scaffold checker: **exit 0**, reporting **113 required files**, 9 workspace packages, 19 root scripts, and the frozen six foundation migration tables.
- `git diff --check`: **exit 0**. Exact no-diff checks for both `0000` artifacts and `pnpm-lock.yaml`: **exit 0**.

The supplied parent evidence additionally records the full DB unit suite at **92/92**, lint/typecheck/build, boundaries, frozen-lock, and uncached root CI (cache hits `0`) as passing. No implementation edit or commit was made by this reviewer.
