# AW-010A S7 Specification Review — xhigh

Status: **PASS**

The failure-safe client-acquisition correction closes the prior partial-acquisition leak without changing the authoritative S7 test inventory, production behavior, package/dependency surface, migration contract, or Vitest project selection. I re-read the current integration test and cumulative checker against the prior final specification PASS and the authoritative ordered integration contract. No S7 specification blocker remains.

## Failure-safe acquisition revalidation

- `acquireRuntimeClients(count)` now acquires sequentially with `clients.push(await beginRuntimeClient())`. Each successfully begun runtime client is recorded before acquisition of the next client starts.
- A successful return therefore contains every requested client after each has issued `BEGIN` and both local PostgreSQL timeouts. No concurrency operation or barrier release can occur while acquisition is still in progress.
- If any later acquisition/setup rejects, the helper calls `rollbackAndReleaseAll(clients)` for every client already recorded. `rollbackAndReleaseAll` uses `Promise.allSettled`, so one rollback/release failure cannot prevent cleanup from being attempted for another recorded client; each individual release remains in `finally`.
- If cleanup succeeds, the original acquisition failure is rethrown unchanged. If cleanup also fails, the helper throws `AggregateError([error, cleanupError], "PostgreSQL runtime client acquisition and cleanup failed")`. Multiple cleanup failures are retained by the nested cleanup `AggregateError`, preserving the acquisition failure and every cleanup failure rather than masking either class.
- The obsolete `Promise.all(beginRuntimeClient...)` acquisition pattern is absent. The cumulative checker pins the corrected integration bytes and requires the sequential record, rollback-all, all-settled cleanup, and aggregate-failure tokens.

## Concurrency and inventory preservation

- Same-channel concurrency calls `acquireRuntimeClients(4)`.
- Different-channel concurrency defines `fixtures = [first, second] as const` and calls `acquireRuntimeClients(fixtures.length)`, so it acquires exactly two clients.
- MAX-contender concurrency calls `acquireRuntimeClients(2)`.
- In all three tests, acquisition completes before the deferred barrier and operation array are constructed; every operation awaits that barrier, and the barrier is resolved only after all requested clients have begun. Deterministic aggregate deadlines and `finally` cleanup remain intact.
- The integration file still registers exactly **20 unique ordered direct-literal** `AW010A-S7` tests. Their names and order match both `exactAw010aS7TestNames` and the authoritative integration contract. No test was added, removed, renamed, reordered, disabled, parameterized, or made conditional.
- The S7 Vitest configuration remains byte-identical to the prior final candidate and still contains only the exact S6 unit project plus the one fail-closed, non-file-parallel S7 integration project.

## Checker and protected-surface result

- Current integration SHA-256 is `844db833c25e327b8c617cdad7c4f46c828ed40f759cb15b35306ad9f5c08b6f`, exactly matching the cumulative checker.
- Current API Vitest config SHA-256 remains `ef19485759b1279fb8430ee36da7ff494e89cc00ee761ec8190eb3bc45fbf030`, exactly matching the cumulative checker and the prior final candidate.
- `scaffold:check` passes the cumulative S1–S7 manifest, frozen hashes, imports, migrations, transaction/teardown controls, direct-literal denominator, and per-test semantic tokens. The correction requires no adapter, package manifest, lockfile, DB source/export, migration, harness, or dependency change.
- `git diff --check` is clean.

## Executed acceptance evidence

- Targeted API S7 integration: **1 file passed, 20/20 tests passed**; no skipped/todo tests were reported.
- Scaffold: **117 required files, 9 workspace packages, 19 root scripts, 6 migration tables**.
- Boundaries: **0 violations across 97 modules / 229 dependencies**; both forbidden-import fixtures and the unresolved-dependency fixture checks behaved as required.

The corrected acquisition path begins all requested runtime transactions before each concurrency barrier, deterministically rolls back and releases every recorded client after a partial acquisition failure, and preserves acquisition plus cleanup failures. The three concurrency counts and exact 20-test specification remain unchanged. Final S7 specification status is **PASS**.
