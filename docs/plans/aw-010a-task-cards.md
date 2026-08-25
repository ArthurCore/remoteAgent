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
- Modify `packages/db/vitest.config.ts`
- Modify `scripts/assert-aw007-tree.mjs` to add only the S5 integration file/project expectation to the current exact manifest
- If and only if red evidence proves the reviewed S4 SQL is wrong, modify `packages/db/drizzle/0001_aw010a_channel_stream.sql`, `packages/db/drizzle/meta/0001_snapshot.json`, `packages/db/drizzle/meta/_journal.json`, `packages/db/src/migration-integrity.ts`, and `packages/db/test/channel-stream-migration.spec.ts`; rerun S4 reviews as well.

**Red:** write 24 `AW010A-S5` real-PostgreSQL tests: empty-membership preflight, existing-channel backfill, concurrent channel/membership DML locks, post-migration channel trigger, correct joined/left/revoked types, every other existing event type rejected for the corresponding reference, wrong-tenant rejection, nullable exit, supported event-first→membership→commit ordering, epoch-first immediate-FK rejection, commit-failure rollback, rerun/concurrent migrator/app rollback/hash drift. Run:

```bash
pnpm --filter @agent-workspace/db exec vitest run --config vitest.config.ts --project integration --no-file-parallelism test/channel-stream-migration.integration.spec.ts
```

Expected: exit 1 before integration project includes the new file and/or before reviewed SQL satisfies typed-reference cases; no infrastructure retry.

**Minimum green:** register the exact file; correct only the listed unpublished migration artifacts when a named assertion proves necessity. No new migration number.

**Green:** `pnpm --filter @agent-workspace/db exec vitest run --config vitest.config.ts --project integration --no-file-parallelism test/channel-stream-migration.integration.spec.ts` → 24 passed; `pnpm --filter @agent-workspace/db test:integration` → existing 25 plus 24 = 49 passed, residue zero.

**Review/commit:** `docs/reviews/aw-010a-s5-spec-xhigh.md`, then `docs/reviews/aw-010a-s5-quality-security-xhigh.md`; if SQL changed, S4 reviewers also reapprove. Add exact changed paths and review docs; commit `test: verify channel stream cutover`.

## S6 — PostgreSQL journal adapter unit behavior

**Predecessor:** reviewed S5 commit.

**Exclusive implementation paths:**

- Create `apps/api/src/adapters/postgres/channel-event-journal.adapter.ts`
- Create `apps/api/test/channel-event-journal.spec.ts`
- Modify `apps/api/package.json`
- Modify `apps/api/vitest.config.ts`
- Modify `pnpm-lock.yaml` only for the new API chat-core workspace importer
- Modify `scripts/assert-aw007-tree.mjs` to add only the S6 adapter/test/script/importer expectations to the current exact manifest

**Red:** add 16 `AW010A-S6` fake-client tests for tenant-leading lock SQL, missing/exhausted errors, server envelope, actor checks, insert result, and absence of begin/commit. Run:

```bash
pnpm --filter @agent-workspace/api exec vitest run --config vitest.config.ts test/channel-event-journal.spec.ts
```

Expected: exit 1, adapter module unresolved.

**Minimum green:** add exact workspace dependency `@agent-workspace/chat-core`; add API scripts `test:unit` for the unit project and `test:integration` for `vitest --project integration --no-file-parallelism`; implement adapter with injected transaction/clock/ID and no controller/commit.

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

**Minimum green:** register the integration project and import `../../../packages/db/test/support/postgres.ts` from the API test only for this pre-public-support card; make only evidence-driven adapter corrections.

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
