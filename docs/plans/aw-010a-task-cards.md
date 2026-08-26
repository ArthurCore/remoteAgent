# AW-010A Bite-Sized Execution Cards

> **For Hermes:** Execute only after the parent AW-010A plan is independently PASS/APPROVED. Use a fresh xhigh worker per card.

## Mandatory card protocol

Cards run strictly `S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8`; the predecessor must be a reviewed commit at the worker's HEAD. For every card: write the named failing test, run the exact red command, make only the listed minimum edit, run focused and regression commands, then run `pnpm scaffold:check` and `TURBO_FORCE=true pnpm run ci`; both must pass before review/commit and Turbo must report zero cached tasks. Only then dispatch fresh spec and quality/security reviewers to the two literal review paths printed in that card. Any finding returns to the implementer, who edits only the card's exclusive paths; all focused, scaffold, uncached-CI, and both reviewer gates rerun until `PASS`/`APPROVED`. The literal exclusive paths plus those two literal review paths are the complete `git add` set; globs/incidental files are forbidden. No skipped/todo/only/retries or old migration rewrite.

Every S1–S8 edit to `scripts/assert-aw007-tree.mjs` is cumulative and anti-weakening: add only this card's literal files/directories/scripts/dependencies/tables/artifacts; never add a broad glob, allow-extra branch, ignore expansion, subset-only comparison, missing/future placeholder, or pre-allowance for a later card. Preserve every existing AW-008 migration/snapshot/journal hash oracle, exactly-six foundation-table boundary, role/default-privilege checks, package-manager/lifecycle denial, workflow action pins/permissions/setup-node cache rule, and all previously reviewed current-manifest entries. The card's spec and quality reviewers inspect the checker diff explicitly.

## S1 — Correlated event-intent and caller-owned port

**Predecessor:** approved plan commit.

**Exclusive implementation paths:**

- Create `packages/chat-core/src/modules/messaging/channel-event-journal.ts`
- Create `packages/chat-core/test/channel-event-journal.spec.ts`
- Create `packages/chat-core/vitest.config.ts`
- Modify `packages/chat-core/package.json`
- Modify `pnpm-lock.yaml` only for the new chat-core `vitest@4.1.11` importer entry
- Modify `scripts/assert-aw007-tree.mjs` to add only the S1 files/scripts/importer to the current exact manifest while preserving every frozen AW-008 oracle

**Red:** create 12 named `AW010A-S1` tests for correlated payload types, trusted actor union, client-envelope exclusion, bigint return, injected clock/ID, and no commit method. Run:

```bash
pnpm exec vitest run packages/chat-core/test/channel-event-journal.spec.ts --config packages/chat-core/vitest.config.ts
```

Expected: exit 1, module `src/modules/messaging/channel-event-journal.ts` cannot be resolved; zero skipped/todo.

**Minimum green:** add only the contract-derived mapped union, trusted actor/input/result types and port; add the already pinned `vitest@4.1.11` dev importer plus `test:unit`; lint includes `test` and config. To preserve the existing chat-core dependency boundary, do not import `@agent-workspace/test-config`: freeze the same node environment, globals false, passWithNoTests false, clearMocks true, and restoreMocks true directly in the local Vitest config. No DB/framework/runtime implementation.

**Green:** same command → `12 passed`; `pnpm --filter @agent-workspace/chat-core lint && pnpm --filter @agent-workspace/chat-core typecheck && pnpm --filter @agent-workspace/chat-core test:unit` → exit 0, 12/12.

**Review/commit:** reviewers write `docs/reviews/aw-010a-s1-spec-xhigh.md` then `docs/reviews/aw-010a-s1-quality-security-xhigh.md`; resolve and rerun both. `git add` exactly the six implementation paths plus those two review files; commit `feat: define channel event journal port`.

## S2 — Public export and forbidden-dependency fixture

**Predecessor:** reviewed S1 commit.

**Exclusive implementation paths:**

- Modify `packages/chat-core/src/index.ts`
- Create `packages/chat-core/test/public-api.spec.ts`
- Create `packages/chat-core/test/fixtures/forbidden-db-import.ts`
- Modify `apps/web/test/fixtures/forbidden-db-import.ts` to use its exact resolved relative DB public entry so fixture mode never disables unresolved-import enforcement
- Modify `packages/chat-core/vitest.config.ts` to add exactly `test/public-api.spec.ts` to canonical unit selection
- Modify `packages/chat-core/package.json` to add exactly `test/public-api.spec.ts` to `typecheck:test`
- Modify `.dependency-cruiser.cjs`
- Modify `scripts/assert-boundary-fixture.mjs`
- Modify `scripts/assert-aw007-tree.mjs` to add only S2 files/exports/boundary fixture expectations to the current exact manifest

**Red:** add 4 `AW010A-S2` exact-export tests and register the fixture. Run:

```bash
pnpm exec vitest run packages/chat-core/test/public-api.spec.ts --config packages/chat-core/vitest.config.ts && pnpm boundaries:check
```

Expected: exit 1 because the journal symbols are absent from root exports; after that test is made green, boundary command must fail specifically on `forbidden-db-import.ts` until the rule is added.

**Minimum green:** export only the approved S1 surface; add one rule forbidding chat-core imports of DB/apps/frameworks and make the fixture oracle require that violation.

**Green:** exact command → 4 passed and boundary exit 0; `pnpm --filter @agent-workspace/chat-core test:unit` → 16/16.

**Review/commit:** `docs/reviews/aw-010a-s2-spec-xhigh.md`, then `docs/reviews/aw-010a-s2-quality-security-xhigh.md`; fix/re-review. Add exactly the nine implementation paths and two review docs; commit `test: freeze channel journal boundary`.

## S3 — Current Drizzle stream declarations

**Predecessor:** reviewed S2 commit.

**Exclusive implementation paths:**

- Create `packages/db/src/schema/channel-stream.ts`
- Modify `packages/db/src/schema/index.ts`
- Create `packages/db/test/channel-stream-schema.spec.ts`
- Modify `packages/db/test/schema.spec.ts` only to add `channelEventSequences` and `channelEvents` to its exact public DB export expectation; preserve every existing AW-008 schema and role assertion
- Modify `packages/db/package.json` to add exactly `test/channel-stream-schema.spec.ts` to `test:unit`
- Modify `scripts/assert-aw007-tree.mjs` to add only the S3 schema/test surface to the current exact manifest

**Red:** write exactly 6 `AW010A-S3` tests containing 18 assertions for exact two tables/columns/types/PK/FK/check names and normalized predicates, forbidden-table absence, and absence of any new actor-kind/event-type PostgreSQL enum. The check set includes the parent plan's four reviewed S3 corrections: `channel_events_event_id_nonempty_check`, `channel_events_actor_principal_id_nonempty_check`, `channel_events_actor_kind_check`, and `channel_events_payload_object_check`. Run:

```bash
pnpm --filter @agent-workspace/db exec vitest run test/channel-stream-schema.spec.ts
```

Expected: exit 1, `src/schema/channel-stream.ts` unresolved.

**Minimum green:** declare only `channelEventSequences` and `channelEvents` using the parent plan's exact SQL names and reviewed scalar types (`integer` schema version with no default, `text` event/actor discriminants, `jsonb` payload); export from schema index. Trigger/function/FK alterations remain S4 SQL. Do not introduce actor-kind or event-type enums.

**Green:** `pnpm --filter @agent-workspace/db exec vitest run test/channel-stream-schema.spec.ts` → 6 tests and 18 assertions passed; `pnpm --filter @agent-workspace/db lint && pnpm --filter @agent-workspace/db typecheck && pnpm --filter @agent-workspace/db test:unit` → exit 0 with zero skipped/todo.

**Review/commit:** exact review files `docs/reviews/aw-010a-s3-spec-xhigh.md` and `docs/reviews/aw-010a-s3-quality-security-xhigh.md`; fix/re-review; add the six implementation paths plus reviews; commit `feat: declare channel stream schema`.

## S4 — Generate and freeze `0001_aw010a_channel_stream`

**Predecessor:** reviewed S3 commit.

**Exclusive implementation paths:**

- Create `packages/db/drizzle/0001_aw010a_channel_stream.sql`
- Create `packages/db/drizzle/meta/0001_snapshot.json`
- Modify `packages/db/drizzle/meta/_journal.json`
- Modify `packages/db/src/migration-integrity.ts`
- Create `packages/db/test/channel-stream-migration.spec.ts`
- Modify `packages/db/test/migration.spec.ts`
- Modify `packages/db/package.json` to add exactly `test/channel-stream-migration.spec.ts` to `test:unit`
- Modify `scripts/assert-aw007-tree.mjs` to add only the exact S4 migration/artifact/test/hash surface to the current manifest

**Frozen SQL objects:** tables/constraints from parent §3 plus functions `initialize_channel_event_sequence()`, `reject_channel_event_mutation()`, `enforce_channel_membership_event_types()`; triggers `channels_initialize_event_sequence`, `channel_events_append_only_guard`, `channel_membership_epochs_event_type_guard`; FKs `channel_membership_epochs_joined_event_fk`, `channel_membership_epochs_exited_event_fk`.

**Red:** add 22 `AW010A-S4` artifact/hash/order/object/precondition tests. Run:

```bash
pnpm --filter @agent-workspace/db exec vitest run test/channel-stream-migration.spec.ts test/migration.spec.ts
```

Expected: exit 1, `0001_aw010a_channel_stream.sql` absent and journal cardinality remains one.

**Minimum green:** run `pnpm --filter @agent-workspace/db exec drizzle-kit generate --config drizzle.config.ts --name aw010a_channel_stream`; inspect/replace generated SQL to implement one transaction with exact locks, preflight, objects, backfill and postconditions. Freeze new SQL/snapshot/journal hashes while preserving exact `0000` hashes.

**Green:** `pnpm --filter @agent-workspace/db exec vitest run test/channel-stream-migration.spec.ts test/migration.spec.ts` → 22 new tests plus existing migration tests pass; `pnpm --filter @agent-workspace/db db:check && pnpm --filter @agent-workspace/db test:unit && git diff --exit-code -- packages/db/drizzle` → exit 0.

**Review/commit:** exact review files `docs/reviews/aw-010a-s4-spec-xhigh.md`, `docs/reviews/aw-010a-s4-quality-security-xhigh.md`; fix/re-review. Add exactly eight implementation paths and reviews; commit `feat: add channel stream migration`.

## S5 — Migration cutover and typed-reference integration

**Predecessor:** reviewed S4 commit; `0001` is still unpublished and may be corrected only by this card before AW-010A merge. After merge it is immutable.

**Exclusive implementation/correction paths:**

- Create `packages/db/test/channel-stream-migration.integration.spec.ts`
- Modify `packages/db/vitest.config.ts` to replace the integration-project glob with the exact four-file list including the new S5 file
- Modify `packages/db/test/migration.integration.spec.ts` only for the exact two-row ledger, cumulative eight-table catalog, and latest retained migration-hash evidence expectations
- Modify `packages/db/test/constraints.integration.spec.ts` to preserve its ten tests while advancing the exact cumulative table/constraint/index/timestamp catalog and replacing synthetic membership markers with real typed journal-event fixtures
- Modify `packages/db/test/roles.integration.spec.ts` to preserve its ten tests while advancing cumulative table ownership/grants and separating catalog grants from trigger-enforced runtime behavior: direct journal update/delete must fail, while current raw sequence-state access remains explicitly disclosed rather than misrepresented as blocked
- Modify `packages/db/test/support/postgres.ts` only to report the current frozen channel-stream migration hash in retained evidence; preserve generated credentials, no-secret serialization/scans, mode `0600`, no-overwrite, cleanup/residue verification, dead-owner-only running cleanup, stopped-container convergence, and all stale-container safety
- Modify `scripts/assert-aw007-tree.mjs` to add the S5 integration file/project expectation and exact SHA-256 oracles for all six changed non-checker S5 files; preserve every prior oracle
- If and only if red evidence proves the reviewed S4 SQL is wrong, modify `packages/db/drizzle/0001_aw010a_channel_stream.sql`, `packages/db/drizzle/meta/0001_snapshot.json`, `packages/db/drizzle/meta/_journal.json`, `packages/db/src/migration-integrity.ts`, and `packages/db/test/channel-stream-migration.spec.ts`; rerun S4 reviews as well.

**Red:** write exactly 24 named `AW010A-S5` tests with this frozen inventory: (1) exact four-file integration registration; (2) populated pre-stream membership fail-atomic preflight; (3) existing-channel zero-state backfill; (4) concurrent channel-DML lock exclusion; (5) concurrent membership-DML lock exclusion; (6) post-migration channel trigger; (7) joined acceptance; (8) left-exit acceptance; (9) revoked-exit acceptance; (10) nullable-exit acceptance; (11) all six non-join event types rejected for `joined_event_seq`; (12) all five non-exit event types rejected for `exited_event_seq`; (13) missing-event immediate-FK rejection; (14) wrong-tenant rejection; (15) same-tenant/wrong-channel rejection; (16) supported event-first→membership→commit order; (17) epoch-first immediate-FK rejection; (18) commit-time typed failure rolls back event, epoch, and sequence together; (19) no-op rerun leaves the exact two-row ledger; (20) concurrent migrators serialize; (21) pre-AW-010A application rollback compatibility over additive objects; (22) migration hash drift fails closed; (23) exact live function/trigger/FK deferrability catalog; and (24) synthetic positive membership markers and row-bearing diagnostics remain rejected. The pre-change integration glob makes test (1) deterministically RED; do not rely on file non-selection as red evidence. Run:

```bash
pnpm --filter @agent-workspace/db exec vitest run --config vitest.config.ts --project integration --no-file-parallelism test/channel-stream-migration.integration.spec.ts
```

Expected focused exit 1 from named test (1) because the integration-project include is still a broad glob. Record the separate full existing-suite baseline of 11 semantic failures / 14 passes caused by one-migration/synthetic-marker assumptions. No infrastructure retry and no skipped tests count as acceptance.

**Minimum green:** register the exact file; correct only the listed unpublished migration artifacts when a named assertion proves necessity. No new migration number.

**Green:** `pnpm --filter @agent-workspace/db exec vitest run --config vitest.config.ts --project integration --no-file-parallelism test/channel-stream-migration.integration.spec.ts` → 24 passed; `pnpm --filter @agent-workspace/db test:integration` → existing 25 plus 24 = 49 passed, residue zero.

**Review/commit:** `docs/reviews/aw-010a-s5-spec-xhigh.md`, then `docs/reviews/aw-010a-s5-quality-security-xhigh.md`; if SQL changed, S4 reviewers also reapprove. Add the seven base implementation paths, any evidence-proven S4 correction paths, and review docs; commit `test: verify channel stream cutover`.

## S6 — PostgreSQL journal adapter unit behavior

**Predecessor:** reviewed S5 commit.

**Exclusive implementation paths:**

- Create `apps/api/src/adapters/postgres/channel-event-journal.adapter.ts`
- Create `apps/api/test/channel-event-journal.spec.ts`
- Modify `apps/api/package.json`
- Modify `apps/api/vitest.config.ts`
- Modify `pnpm-lock.yaml` only for the new API chat-core workspace importer
- Modify `scripts/assert-aw007-tree.mjs` to add only the S6 adapter/test/script/importer expectations to the current exact manifest

**Frozen adapter contract:** the API adapter exports an adapter-owned narrow `ChannelEventJournalTransactionClient` query interface rather than importing `pg` or `@types/pg` (neither is an API dependency), a fixed-code `PostgresChannelEventJournalError`, and `createPostgresChannelEventTransaction({ transaction, generateEventId, clock })` returning the type-only chat-core `ChannelEventTransaction`. The production call site wraps a caller-owned PostgreSQL transaction client in the narrow query interface; a pool or controller is not accepted as authority.

For human/service actors, the first SQL query is parameterized and tenant-leading against `public.principals`, returns `principal_kind::text`, and uses `FOR SHARE` so both delete and non-key kind updates remain blocked through the caller transaction. Exactly one same-tenant row with the exact actor kind is required. The sole system allowlist entry is `system:channel-lifecycle`, which skips principal lookup; structurally forged system IDs fail before any query.

Before allocation, the adapter explicitly constructs a dummy positive-sequence server envelope from only tenant/channel/actor/intent plus one generated ID and one clock value and validates it with exact `DurableEventV1`; it never spreads caller input. The clock value must be canonical UTC with no more than six fractional digits so the returned value and `timestamptz(6)` storage boundary do not diverge. Invalid ID, timestamp, event/payload correlation, actor/payload relationship, tenant, channel, or payload fails with fixed `CHANNEL_EVENT_INVALID` diagnostics before the sequence row is touched.

Allocation performs exact tenant-leading `SELECT last_event_seq::text ... FROM public.channel_event_sequences ... FOR UPDATE`; no row is `CHANNEL_STREAM_STATE_MISSING`, and PostgreSQL bigint max is `CHANNEL_STREAM_EXHAUSTED`. It then performs one parameterized guarded update for the exact current bigint and `< 9223372036854775807`, returning text. A zero-row guarded update is reclassified by a locked status re-read as missing or exhausted when applicable and otherwise fails `CHANNEL_STREAM_ALLOCATION_FAILED`. JavaScript `Number`, `MAX()+1`, a standalone sequence, and transaction control are forbidden.

The actual-sequence envelope is validated again, serialized explicitly, and inserted with the exact ten non-`created_at` columns into `public.channel_events`, with `payload` cast to `jsonb` and `event_seq` to `bigint`. `RETURNING event_seq::text, event_id` must yield exactly one row matching the constructed envelope or fail `CHANNEL_EVENT_INSERT_FAILED`; the result uses `bigint`, returned ID, and the validated injected timestamp. Custom diagnostics are fixed and contain no tenant/channel/principal/event/payload values.

**Red:** add exactly 16 named `AW010A-S6` fake-client tests in this frozen inventory: (1) tenant-leading human/service actor SQL uses `FOR SHARE` and accepts exact kind; (2) missing actor; (3) actor-kind mismatch; (4) allowlisted system skips principal SQL; (5) arbitrary system actor rejected before queries; (6) tenant-leading sequence-state SQL uses `FOR UPDATE` and text bigint; (7) missing state; (8) bigint-max exhaustion; (9) guarded bigint update and no `Number`; (10) zero-row update status mapping/fail-closed fallback; (11) explicit server-owned envelope with one ID/clock call; (12) forged event/payload or invalid ID/timestamp rejected before allocation; (13) exact parameterized insert columns and JSON payload; (14) insert cardinality/mismatch and bigint result; (15) all custom errors use fixed row-free diagnostics; and (16) exact actor→prevalidate→lock→update→insert query order with no begin/commit/rollback. Run:

```bash
pnpm --filter @agent-workspace/api exec vitest run --config vitest.config.ts test/channel-event-journal.spec.ts
```

Expected: exit 1, adapter module unresolved.

**Minimum green:** add only the exact workspace dependency `@agent-workspace/chat-core`; do not add direct `pg`, `@types/pg`, or any external dependency. Add API scripts `test:unit` for an exact unit project containing only health plus S6 and `test:integration` for `vitest --project integration --no-file-parallelism`. S6 intentionally defines no integration project, so that future command fails closed with `No projects matched` until S7 owns the real project; it is not a passing placeholder and is not an S6 green command. Implement the adapter with the injected narrow transaction query capability, clock, and ID generator and no controller/transaction control. The lockfile delta is exactly one `apps/api` importer link to `../../packages/chat-core`, with no lifecycle/build-policy or resolution change.

**Green:** `pnpm --filter @agent-workspace/api exec vitest run --config vitest.config.ts test/channel-event-journal.spec.ts` → 16 passed; `pnpm --filter @agent-workspace/api lint && pnpm --filter @agent-workspace/api typecheck && pnpm --filter @agent-workspace/api test:unit` → exit 0, health regression plus 16 new tests pass.

**Review/commit:** `docs/reviews/aw-010a-s6-spec-xhigh.md`, `docs/reviews/aw-010a-s6-quality-security-xhigh.md`; fix/re-review; add exact six paths plus reviews; commit `feat: implement channel journal adapter`.

## S7 — Adversarial journal integration

**Predecessor:** reviewed S6 commit.

**Exclusive implementation/correction paths:**

- Create `apps/api/test/channel-event-journal.integration.spec.ts`
- Modify `apps/api/vitest.config.ts`
- Correct `apps/api/src/adapters/postgres/channel-event-journal.adapter.ts` only when a named integration assertion fails.
- Modify `scripts/assert-aw007-tree.mjs` to add only the S7 integration project/file expectation to the current exact manifest

**Red:** add 20 `AW010A-S7` tests for same/different channel concurrency, allocation/insert rollback, MAX-1/MAX/exhausted, duplicate/validation failure, tenant/actor mismatch, system allowlist, immutable trigger, and disclosed runtime-role matrix. Run:

```bash
pnpm --filter @agent-workspace/api exec vitest run --config vitest.config.ts --project integration --no-file-parallelism test/channel-event-journal.integration.spec.ts
```

Expected: exit 1 until the API integration project and real harness are wired.

**Minimum green:** register the integration project and import `../../../packages/db/test/support/postgres.ts` from the API test only for this pre-public-support card; make only evidence-driven adapter corrections. The exact ordered 20-test denominator and executable harness/transaction/teardown contract are frozen by `docs/reviews/aw-010a-s7-integration-contract-spec-xhigh.md`: one live harness, reset+migrate per test, real runtime clients, bounded begin-all concurrency barriers, rollback/release in `finally`, pre-stop evidence mode/no-overwrite/credential inspection, guaranteed single stop, post-stop exact-label container residue read-back, and deterministic evidence→stop→residue failure aggregation. No manifest, lockfile, DB support, or direct API `pg`/Testcontainers dependency change is permitted.

**Green:** `pnpm --filter @agent-workspace/api exec vitest run --config vitest.config.ts --project integration --no-file-parallelism test/channel-event-journal.integration.spec.ts` → 20 passed; `pnpm --filter @agent-workspace/api test:unit && pnpm --filter @agent-workspace/api test:integration` → exit 0, no skipped/todo, evidence credential scan zero and Docker residue zero.

**Review/commit:** `docs/reviews/aw-010a-s7-spec-xhigh.md`, `docs/reviews/aw-010a-s7-quality-security-xhigh.md`; fix/re-review; add exact listed paths plus reviews; commit `test: harden channel stream integration`.

## S8 — Exact checker, hosted gate, and closure

**Predecessor:** reviewed S7 commit.

**Exclusive implementation paths:**

- Modify `scripts/assert-aw007-tree.mjs`
- Modify `package.json`
- Modify `.github/workflows/ci.yml`
- Create `docs/reviews/aw-010a-full-evidence-handoff-xhigh.md`
- Create `docs/reviews/aw-010a-final-spec-closure-xhigh.md`
- Create `docs/reviews/aw-010a-final-quality-security-closure-xhigh.md`
- `docs/execution-board.md` is not in the S8 implementation commit; only the orchestrator may modify it after final-head proof

**Red:** audit the cumulative S1–S7 checker oracles first, then add only S8 evidence/review/hosted-workflow expectations and run `pnpm scaffold:check`. Expected exit 1 only because the S8-specific evidence/workflow surface is not yet represented; all S1–S7 entries must already pass and may not be reintroduced or rewritten.

**Minimum green:** preserve and audit the cumulative current checker; add only S8's API integration root script, evidence/review files, and hosted order frozen install→uncached CI→DB integration→API integration→secret-safe exact evidence upload. Preserve action pins/read-only permission and every prior oracle.

**Green:** `TURBO_FORCE=true pnpm run ci && pnpm test:integration && pnpm --filter @agent-workspace/api test:integration && git diff --check` → exit 0; cache hits 0, DB 49 and API 20 integration tests, residue 0. Final candidate Gitleaks 0 and Trivy config 0.

**Review/commit:** final spec and quality reviewers replace the named closure docs until PASS/APPROVED. Add exactly `scripts/assert-aw007-tree.mjs`, `package.json`, `.github/workflows/ci.yml`, and the three named AW-010A review docs; commit `docs: close AW-010A stream foundation`. Push PR and require actual final-head hosted success before merge; only then the orchestrator makes a separate board-only DONE commit.
