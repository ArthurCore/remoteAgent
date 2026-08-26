# AW-010A S7 real-PostgreSQL integration contract specification review — xhigh

Status: **PASS**

After re-reading the patched S7 card, including its teardown amendment, the S7 contract remains feasible, complete, and internally consistent. The amendment strengthens only the existing harness teardown into an evidence→stop→residue pipeline; it adds no test, implementation path, package dependency, or production-support surface. This review remains the authoritative S7 inventory: implementation must contain exactly these 20 ordered, direct, literal `it("AW010A-S7 ...")` declarations, with no `skip`, `todo`, `only`, conditional registration, or parameterized registration. A loop inside one registered test is allowed only where that test explicitly names multiple cases below; it does not change the denominator.

## Review findings and corrections

- Tests 1, 15, and 18 are not duplicates. Test 1 proves stored-envelope fidelity and `DurableEventV1` parsing with the lifecycle actor; test 15 proves the system-actor allowlist and the arbitrary-ID no-query boundary; test 18 proves the effective generated **runtime role**, including the human-principal lookup path.
- Tests 5 and 16 are not duplicates. Test 5 drives an event-ID collision through the adapter and proves allocation rollback. Test 16 separately proves both live PostgreSQL uniqueness constraints and their exact `23505` constraint diagnostics. Direct SQL in test 16 is a test-only constraint probe and does not create or authorize another production writer.
- The wrong-tenant wording is corrected. Test 11 is an existing channel whose sequence-state row is deliberately absent. Test 12 probes tenant A with a channel ID that exists only in tenant B and proves the tenant-leading lookup cannot touch tenant B. It is not the incoherent case where the same channel exists in both tenants and the selected tenant would therefore be valid.
- Tests 17 and 20 intentionally expose different properties. Test 17 proves the journal trigger rejects effective runtime `UPDATE` and `DELETE`; test 20 truthfully discloses that raw runtime `UPDATE` and `DELETE` on `channel_event_sequences` are granted and effective until the caller rolls back. Test 20 must not claim that those operations are prevented.
- The concurrency assertions concern committed sequence sets, not promise-completion, wall-clock, event-ID, or cross-channel order. No test may infer a global order.
- The API already obtains PostgreSQL transitively through `@agent-workspace/db`; S7 adds no direct `pg` or `@types/pg` dependency and makes no package or lockfile edit.

## Frozen harness, transaction, and configuration contract

1. `apps/api/test/channel-event-journal.integration.spec.ts` imports the harness source at `../../../packages/db/test/support/postgres.ts` and `runMigrations` from the DB migration-runner source only from this test. Repository ESM source imports may use their `.js` specifiers resolving to those `.ts` files. Neither support surface is added to a production public export.
2. One digest-pinned harness is started in `beforeAll` with a 180-second hook timeout. `beforeEach` calls `resetDatabase()` and then `runMigrations` with the generated migrator URL and `MIGRATION_TARGET_CLASS: "testcontainer"`. IDs are generated per test from the harness run ID plus an ordinal or `randomUUID`; no tenant, workspace, principal, channel, message, or event identity is reused accidentally.
3. `afterAll` uses one explicit failure-aggregating pipeline and never short-circuits a later stage:
   1. While the harness is live, capture its run ID, exact labels/resources, all three generated role names and connection URLs, evidence path, and expected evidence object.
   2. **Before stop**, collect rather than immediately throw evidence failures: `lstat` proves a regular non-symlink file with `(mode & 0o777) === 0o600`; read the complete bytes and require the exact expected JSON evidence; require an exclusive `writeFile(..., { flag: "wx" })` probe to fail with `EEXIST`; then re-read and require byte-for-byte identity. Scan the complete bytes for every captured generated role, every connection URL, PostgreSQL URI/userinfo or credential-bearing forms, and password/secret field names. Diagnostics contain only fixed labels/counts, never forbidden values or evidence bytes.
   3. In a guaranteed cleanup stage call `harness.stop()` exactly once whenever startup returned a harness, regardless of evidence failures.
   4. **After the stop attempt**, perform an independent parent-process container read-back for the captured exact labels/run ID and require zero running or stopped matches, even if evidence inspection or stop failed. The API test uses dependency-free `node:child_process` `execFile` with the container CLI and each label as a separate argument; it does not bare-import `testcontainers`, interpolate a shell command, print container environment, or modify DB support.
   5. Preserve failures in deterministic stage order—evidence, stop, residue. Throw a sole failure unchanged or one `AggregateError` for multiple failures. No evidence assertion may skip stop, and no stop failure may skip residue read-back.
4. Every adapter call uses a real client returned by `harness.connect("runtime")`. The test derives that client type from `PostgresTestHarness`; it does not import `PoolClient` from `pg`. The only adapter-facing wrapper exposes `query(statement, values)`, copies parameter arrays, returns rows, and normalizes PostgreSQL's nullable `rowCount` to a non-success sentinel such as `-1`. A null cardinality must therefore fail closed in the adapter.
5. The command-owning test caller issues `BEGIN`, then `SET LOCAL statement_timeout = '10s'` and `SET LOCAL lock_timeout = '10s'`, and finally the required `COMMIT` or `ROLLBACK`. On every thrown error it rolls back an open/aborted transaction before releasing the client. The adapter never begins, commits, rolls back, or releases a client.
6. Concurrency tests acquire and begin all clients before releasing an explicit deferred barrier. Every concurrent aggregate has a deterministic JavaScript deadline shorter than the Vitest test timeout, clears its deadline timer, and releases/rolls back all clients in `finally`. Sleeps, retrying product assertions, and timing-based ordering claims are forbidden.
7. `apps/api/vitest.config.ts` keeps the unit project byte-for-byte semantically exact—`extends: true`, name `unit`, and only `test/health.spec.ts` plus `test/channel-event-journal.spec.ts`—and appends exactly this integration project:

   ```ts
   {
     extends: true,
     test: {
       name: "integration",
       include: ["test/channel-event-journal.integration.spec.ts"],
       passWithNoTests: false,
       fileParallelism: false,
     },
   }
   ```

   No broad include or second integration file is allowed. The existing API `test:unit` and `test:integration` scripts remain exact; the explicit CLI `--no-file-parallelism` remains.

## Exact ordered 20-test inventory

1. `it("AW010A-S7 commits and round-trips one canonical event through DurableEventV1", ...)`
   - Seed one tenant/workspace/channel, use the exact `system:channel-lifecycle` actor, append one canonical `message.created` intent, and commit.
   - Assert the adapter result is sequence `1n`, the generated ID, and the injected canonical microsecond UTC timestamp. Select the stored ten envelope columns with `event_seq` as decimal text and `occurred_at` rendered canonically in UTC; rebuild the actor object and parse the whole value with `DurableEventV1`.
   - Assert the parsed value and JSON payload equal the server-owned canonical event, the state is exactly `1`, and exactly one event exists.

2. `it("AW010A-S7 allocates exact unique contiguous 1 through 4 for four same-channel commits", ...)`
   - Begin four runtime transactions on four clients, release one barrier, append distinct events to one stream, and commit every successful transaction.
   - Within the bounded aggregate, require four successes. Assert the returned and stored sequence sets are exactly `[1n, 2n, 3n, 4n]`, all event IDs are unique, state is `4`, and event count is four. Do not assert completion order.

3. `it("AW010A-S7 allocates sequence 1 independently for concurrent different-channel commits", ...)`
   - Begin two runtime transactions for two channels in the same tenant, release one barrier, append and commit both.
   - Assert each channel independently returns/stores sequence `1`, each state is `1`, and each has one event. Make no global ordering assertion of any kind.

4. `it("AW010A-S7 caller rollback after successful append leaves sequence zero and no events", ...)`
   - Append successfully in a caller-owned transaction, observe the returned sequence `1n`, then deliberately `ROLLBACK` instead of committing.
   - From a separate client assert state `0` and event count `0`.

5. `it("AW010A-S7 duplicate event ID rolls back the attempted sequence allocation", ...)`
   - Commit an initial adapter event at sequence 1. In a new caller transaction, force the generator to return that committed event ID, let allocation reach sequence 2, and require PostgreSQL `23505` on `channel_events_event_id_key`; then roll back the aborted transaction.
   - Assert the original event remains the sole row and state remains `1`, proving the failed insert did not retain its prior allocation.

6. `it("AW010A-S7 invalid envelope and payload fail before allocation with zero state change", ...)`
   - In separate rolled-back subcases, use the lifecycle actor with (a) an event-type/payload mismatch and (b) an invalid generated server-envelope value such as a noncanonical timestamp or invalid event ID.
   - Require `CHANNEL_EVENT_INVALID` before the first sequence-state query. An instrumented real-client wrapper must observe no adapter query in either lifecycle-actor subcase. Assert state `0` and event count `0` after both.

7. `it("AW010A-S7 round-trips bigint beyond the JavaScript safe integer exactly", ...)`
   - Set a stream state to decimal `9007199254740992`, append and commit one event, and require result `9007199254740993n` with JavaScript type `bigint`.
   - Select both state and event sequence as text and require exact string `"9007199254740993"`; parse the reconstructed event with `DurableEventV1` without any `Number` conversion.

8. `it("AW010A-S7 allocates and commits bigint MAX from MAX minus one", ...)`
   - Set state to `9223372036854775806`, append, and commit.
   - Assert returned bigint and stored decimal text are exactly `9223372036854775807`, with one committed event and state at MAX.

9. `it("AW010A-S7 rejects exhausted bigint MAX without insert or state change", ...)`
   - Set state to `9223372036854775807`, attempt append, require `CHANNEL_STREAM_EXHAUSTED`, and roll back.
   - Assert state remains MAX and event count remains zero.

10. `it("AW010A-S7 commits exactly one bigint MAX winner for two MAX minus one contenders", ...)`
    - Set one stream to MAX-1, begin two runtime transactions, release one barrier, and run both appends under one bounded aggregate. Each caller commits on success and rolls back on error.
    - Require exactly one fulfilled append returning MAX and exactly one `CHANNEL_STREAM_EXHAUSTED` rejection. Assert final state MAX and exactly one stored MAX event; do not assume which contender wins.

11. `it("AW010A-S7 maps an existing channel with missing sequence state without writes", ...)`
    - Seed an existing tenant-A channel, deliberately delete only its generated sequence-state row during setup, and retain an unrelated tenant-B sentinel stream.
    - Append as the lifecycle actor, require `CHANNEL_STREAM_STATE_MISSING`, and roll back. Assert the target has no state/event and every tenant-B sentinel state/event count is unchanged.

12. `it("AW010A-S7 rejects a channel that exists only in another tenant without cross-tenant writes", ...)`
    - Seed a tenant-A control stream and a tenant-B channel whose channel ID equals the ID probed by the tenant-A input; do not create that channel in tenant A.
    - Append with tenant A plus the lifecycle actor, require `CHANNEL_STREAM_STATE_MISSING`, and roll back. Assert tenant B remains at state `0` with zero events and the tenant-A control stream is unchanged. This is the required tenant-leading wrong-tenant channel/state proof.

13. `it("AW010A-S7 rejects a cross-tenant human principal before allocation", ...)`
    - Seed the target channel in tenant A and the named human principal only in tenant B.
    - Append to tenant A with that human actor, require `CHANNEL_ACTOR_NOT_FOUND`, and assert the instrumented adapter query sequence contains only the tenant-leading actor lookup. Assert target state `0`, no events, and no tenant-B writes.

14. `it("AW010A-S7 rejects a database principal kind mismatch before allocation", ...)`
    - Seed a same-tenant DB principal as `service` and call the adapter with a trusted actor represented as `human` for that ID.
    - Require `CHANNEL_ACTOR_KIND_MISMATCH`; only the actor lookup may run. Assert state `0` and event count `0`.

15. `it("AW010A-S7 accepts only the lifecycle system actor and rejects arbitrary system IDs before queries", ...)`
    - Commit one event with exact actor `{ kind: "system", principalId: "system:channel-lifecycle" }` and prove the stored actor fields are exact.
    - In a fresh caller transaction, cast only at the test boundary to present a forged arbitrary system ID. Require `CHANNEL_ACTOR_INVALID`, zero adapter-wrapper queries, and no generator/clock call. Assert the previously committed state/event remain exactly `1`/one.

16. `it("AW010A-S7 enforces event ID and tenant channel sequence uniqueness with exact catalog diagnostics", ...)`
    - Query the live catalog and require exactly `channel_events_event_id_key` as `UNIQUE (event_id)` and `channel_events_pkey` as `PRIMARY KEY (tenant_id, channel_id, event_seq)`.
    - Seed one committed row through the adapter. In two independent test-only runtime transactions, clone it by direct `INSERT ... SELECT`: first use a different sequence with the existing event ID and require `23505` plus constraint `channel_events_event_id_key`; then use a new event ID with the existing tenant/channel/sequence and require `23505` plus constraint `channel_events_pkey`. Roll back each aborted transaction.
    - Assert the adapter-seeded row is still the only event and state remains `1`.

17. `it("AW010A-S7 rejects runtime journal UPDATE and DELETE while preserving the stored event", ...)`
    - Seed and commit one event through the runtime-role adapter. In separate runtime transactions, attempt a matching `UPDATE` and a matching `DELETE`.
    - Require SQLSTATE `55000` and exact message `channel events are append-only` for each, roll back each aborted transaction, and finally require the stored envelope and state to remain unchanged.

18. `it("AW010A-S7 runtime-role adapter append and select round-trip a human event", ...)`
    - Assert the connected client's `current_user` equals the harness-generated runtime role. Seed a same-tenant human principal, append via the narrow wrapper, and commit.
    - Select through that runtime client, reconstruct and parse `DurableEventV1`, and assert the human actor, payload, returned identity, sequence `1`, and stored row are exact. This is the effective-role/actor-lookup proof, not a second system-actor baseline.

19. `it("AW010A-S7 runtime role cannot perform DDL or mutate the Drizzle ledger", ...)`
    - Separately assert catalog privileges: runtime lacks database/public-schema creation, lacks `USAGE`/`CREATE` on schema `drizzle`, and lacks `INSERT`, `UPDATE`, `DELETE`, and `TRUNCATE` on `drizzle.__drizzle_migrations`.
    - Require a runtime `CREATE TABLE public.<generated_name>` probe and independent ledger `INSERT`, `UPDATE`, and `DELETE` probes to fail with `42501`, rolling back each aborted transaction. Assert the exact two-row migration ledger is unchanged.

20. `it("AW010A-S7 discloses runtime raw sequence-state UPDATE and DELETE access inside rollback", ...)`
    - Seed two channels. Assert catalog/effective runtime `UPDATE` and `DELETE` privileges on `public.channel_event_sequences` are true.
    - In one runtime transaction, update one channel state and delete the other, requiring row count one for each and observing the changed in-transaction surface; then roll back.
    - Assert both states return to `0` and no events exist. The assertion is a disclosure of the residual grant surface and must contain no prevention, immutability, or least-privilege claim for this table.

## Exact acceptance and checker gate

- The targeted command must report exactly **20 passed / 20 tests**, with zero skipped/todo tests:

  ```bash
  pnpm --filter @agent-workspace/api exec vitest run --config vitest.config.ts --project integration --no-file-parallelism test/channel-event-journal.integration.spec.ts
  ```

- `pnpm --filter @agent-workspace/api test:unit` must retain the exact health plus 16-test S6 unit selection; `pnpm --filter @agent-workspace/api test:integration` must select only the new 20-test file and fail closed if it is absent.
- The S7 checker edit is additive and limited to: the exact new manifest path, the exact two-project API Vitest configuration above, this ordered 20-name array and exact direct-literal denominator, semantic rejection of disabled/conditional tests, and exact SHA-256 pins for the finalized integration test and modified config. Every S1-S6 manifest, hash, migration, dependency, role, lifecycle, and workflow oracle remains intact.
- The existing adapter SHA-256 remains unchanged unless one of the named tests fails against its semantics. Any adapter correction must cite that failing test, be the minimum correction at the sole authorized adapter path, and re-freeze only the resulting adapter hash without weakening an inherited oracle.
- `apps/api/package.json`, `pnpm-lock.yaml`, every DB source/migration/harness file, and all other production source remain byte-unchanged unless the preceding named-adapter-failure exception applies.

The patched Minimum green and this frozen contract therefore still close on exactly 20 tests and the same authorized paths and dependencies. No unresolved teardown, coverage, duplication, transaction-ownership, precision, concurrency, tenant-isolation, privilege-disclosure, or feasibility blocker remains.
