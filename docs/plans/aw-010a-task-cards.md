# AW-010A Bite-Sized Execution Cards

> **For Hermes:** Execute only after the parent AW-010A plan is independently PASS/APPROVED. Use a fresh xhigh worker per card.

## Mandatory card protocol

Cards run strictly `S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8`; the predecessor must be a reviewed commit at the worker's HEAD. For every card: write the named failing test, run the exact red command, make only the listed minimum edit, run focused and regression commands, then dispatch fresh spec and quality/security reviewers to the two literal review paths printed in that card. Any finding returns to the implementer, who may edit only that card's exclusive paths; both reviewers rerun until `PASS`/`APPROVED`. The literal exclusive paths plus those two literal review paths are the complete `git add` set; globs/incidental files are forbidden. No skipped/todo/only/retries or old migration rewrite.

## S1 — Correlated event-intent and caller-owned port

**Predecessor:** approved plan commit.

**Exclusive implementation paths:**

- Create `packages/chat-core/src/modules/messaging/channel-event-journal.ts`
- Create `packages/chat-core/test/channel-event-journal.spec.ts`
- Create `packages/chat-core/vitest.config.ts`
- Modify `packages/chat-core/package.json`

**Red:** create 12 named `AW010A-S1` tests for correlated payload types, trusted actor union, client-envelope exclusion, bigint return, injected clock/ID, and no commit method. Run:

```bash
pnpm exec vitest run packages/chat-core/test/channel-event-journal.spec.ts --config packages/chat-core/vitest.config.ts
```

Expected: exit 1, module `src/modules/messaging/channel-event-journal.ts` cannot be resolved; zero skipped/todo.

**Minimum green:** add only the contract-derived mapped union, trusted actor/input/result types and port; add `vitest@4.1.11` and `@agent-workspace/test-config` workspace dev importers plus `test:unit`; lint includes `test` and config. No DB/framework/runtime implementation.

**Green:** same command → `12 passed`; `pnpm --filter @agent-workspace/chat-core lint && pnpm --filter @agent-workspace/chat-core typecheck && pnpm --filter @agent-workspace/chat-core test:unit` → exit 0, 12/12.

**Review/commit:** reviewers write `docs/reviews/aw-010a-s1-spec-xhigh.md` then `docs/reviews/aw-010a-s1-quality-security-xhigh.md`; resolve and rerun both. `git add` exactly the four implementation paths plus those two review files; commit `feat: define channel event journal port`.

## S2 — Public export and forbidden-dependency fixture

**Predecessor:** reviewed S1 commit.

**Exclusive implementation paths:**

- Modify `packages/chat-core/src/index.ts`
- Create `packages/chat-core/test/public-api.spec.ts`
- Create `packages/chat-core/test/fixtures/forbidden-db-import.ts`
- Modify `.dependency-cruiser.cjs`
- Modify `scripts/assert-boundary-fixture.mjs`

**Red:** add 4 `AW010A-S2` exact-export tests and register the fixture. Run:

```bash
pnpm exec vitest run packages/chat-core/test/public-api.spec.ts --config packages/chat-core/vitest.config.ts && pnpm boundaries:check
```

Expected: exit 1 because the journal symbols are absent from root exports; after that test is made green, boundary command must fail specifically on `forbidden-db-import.ts` until the rule is added.

**Minimum green:** export only the approved S1 surface; add one rule forbidding chat-core imports of DB/apps/frameworks and make the fixture oracle require that violation.

**Green:** exact command → 4 passed and boundary exit 0; `pnpm --filter @agent-workspace/chat-core test:unit` → 16/16.

**Review/commit:** `docs/reviews/aw-010a-s2-spec-xhigh.md`, then `docs/reviews/aw-010a-s2-quality-security-xhigh.md`; fix/re-review. Add exactly the five implementation paths and two review docs; commit `test: freeze channel journal boundary`.

## S3 — Current Drizzle stream declarations

**Predecessor:** reviewed S2 commit.

**Exclusive implementation paths:**

- Create `packages/db/src/schema/channel-stream.ts`
- Modify `packages/db/src/schema/index.ts`
- Create `packages/db/test/channel-stream-schema.spec.ts`

**Red:** write 18 `AW010A-S3` assertions for exact two tables/columns/types/PK/FK/check names and forbidden-table absence. Run:

```bash
pnpm --filter @agent-workspace/db exec vitest run test/channel-stream-schema.spec.ts
```

Expected: exit 1, `src/schema/channel-stream.ts` unresolved.

**Minimum green:** declare only `channelEventSequences` and `channelEvents` using the parent plan's exact SQL names; export from schema index. Trigger/function/FK alterations remain S4 SQL.

**Green:** `pnpm --filter @agent-workspace/db exec vitest run test/channel-stream-schema.spec.ts` → 18 passed; `pnpm --filter @agent-workspace/db lint && pnpm --filter @agent-workspace/db typecheck && pnpm --filter @agent-workspace/db test:unit` → exit 0 with zero skipped/todo.

**Review/commit:** exact review files `docs/reviews/aw-010a-s3-spec-xhigh.md` and `docs/reviews/aw-010a-s3-quality-security-xhigh.md`; fix/re-review; add the three implementation paths plus reviews; commit `feat: declare channel stream schema`.

## S4 — Generate and freeze `0001_aw010a_channel_stream`

**Predecessor:** reviewed S3 commit.

**Exclusive implementation paths:**

- Create `packages/db/drizzle/0001_aw010a_channel_stream.sql`
- Create `packages/db/drizzle/meta/0001_snapshot.json`
- Modify `packages/db/drizzle/meta/_journal.json`
- Modify `packages/db/src/migration-integrity.ts`
- Create `packages/db/test/channel-stream-migration.spec.ts`
- Modify `packages/db/test/migration.spec.ts`

**Frozen SQL objects:** tables/constraints from parent §3 plus functions `initialize_channel_event_sequence()`, `reject_channel_event_mutation()`, `enforce_channel_membership_event_types()`; triggers `channels_initialize_event_sequence`, `channel_events_append_only_guard`, `channel_membership_epochs_event_type_guard`; FKs `channel_membership_epochs_joined_event_fk`, `channel_membership_epochs_exited_event_fk`.

**Red:** add 22 `AW010A-S4` artifact/hash/order/object/precondition tests. Run:

```bash
pnpm --filter @agent-workspace/db exec vitest run test/channel-stream-migration.spec.ts test/migration.spec.ts
```

Expected: exit 1, `0001_aw010a_channel_stream.sql` absent and journal cardinality remains one.

**Minimum green:** run `pnpm --filter @agent-workspace/db exec drizzle-kit generate --config drizzle.config.ts --name aw010a_channel_stream`; inspect/replace generated SQL to implement one transaction with exact locks, preflight, objects, backfill and postconditions. Freeze new SQL/snapshot/journal hashes while preserving exact `0000` hashes.

**Green:** `pnpm --filter @agent-workspace/db exec vitest run test/channel-stream-migration.spec.ts test/migration.spec.ts` → 22 new tests plus existing migration tests pass; `pnpm --filter @agent-workspace/db db:check && pnpm --filter @agent-workspace/db test:unit && git diff --exit-code -- packages/db/drizzle` → exit 0.

**Review/commit:** exact review files `docs/reviews/aw-010a-s4-spec-xhigh.md`, `docs/reviews/aw-010a-s4-quality-security-xhigh.md`; fix/re-review. Add exactly six implementation paths and reviews; commit `feat: add channel stream migration`.

## S5 — Migration cutover and typed-reference integration

**Predecessor:** reviewed S4 commit; `0001` is still unpublished and may be corrected only by this card before AW-010A merge. After merge it is immutable.

**Exclusive implementation/correction paths:**

- Create `packages/db/test/channel-stream-migration.integration.spec.ts`
- Modify `packages/db/vitest.config.ts`
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

**Red:** add 16 `AW010A-S6` fake-client tests for tenant-leading lock SQL, missing/exhausted errors, server envelope, actor checks, insert result, and absence of begin/commit. Run:

```bash
pnpm --filter @agent-workspace/api exec vitest run --config vitest.config.ts test/channel-event-journal.spec.ts
```

Expected: exit 1, adapter module unresolved.

**Minimum green:** add exact workspace dependency `@agent-workspace/chat-core`; add API scripts `test:unit` for the unit project and `test:integration` for `vitest --project integration --no-file-parallelism`; implement adapter with injected transaction/clock/ID and no controller/commit.

**Green:** `pnpm --filter @agent-workspace/api exec vitest run --config vitest.config.ts test/channel-event-journal.spec.ts` → 16 passed; `pnpm --filter @agent-workspace/api lint && pnpm --filter @agent-workspace/api typecheck && pnpm --filter @agent-workspace/api test:unit` → exit 0, health regression plus 16 new tests pass.

**Review/commit:** `docs/reviews/aw-010a-s6-spec-xhigh.md`, `docs/reviews/aw-010a-s6-quality-security-xhigh.md`; fix/re-review; add exact four paths plus reviews; commit `feat: implement channel journal adapter`.

## S7 — Adversarial journal integration

**Predecessor:** reviewed S6 commit.

**Exclusive implementation/correction paths:**

- Create `apps/api/test/channel-event-journal.integration.spec.ts`
- Modify `apps/api/vitest.config.ts`
- Correct `apps/api/src/adapters/postgres/channel-event-journal.adapter.ts` only when a named integration assertion fails.

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

**Red:** first add exact two-table/SQL/hash/script/workflow oracles; run `pnpm scaffold:check`. Expected exit 1 until current manifest/workflow/scripts include S1–S7 without weakening AW-008 `0000` checks.

**Minimum green:** advance exact checker; add API integration root script; hosted order frozen install→uncached CI→DB integration→API integration→secret-safe exact evidence upload. Preserve action pins/read-only permission.

**Green:** `TURBO_FORCE=true pnpm run ci && pnpm test:integration && pnpm --filter @agent-workspace/api test:integration && git diff --check` → exit 0; cache hits 0, DB 49 and API 20 integration tests, residue 0. Final candidate Gitleaks 0 and Trivy config 0.

**Review/commit:** final spec and quality reviewers replace the named closure docs until PASS/APPROVED. Add exactly `scripts/assert-aw007-tree.mjs`, `package.json`, `.github/workflows/ci.yml`, and the three named AW-010A review docs; commit `docs: close AW-010A stream foundation`. Push PR and require actual final-head hosted success before merge; only then the orchestrator makes a separate board-only DONE commit.
