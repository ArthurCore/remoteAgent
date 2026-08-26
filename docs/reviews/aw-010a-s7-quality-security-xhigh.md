# AW-010A S7 Quality and Security Review — xhigh

Status: **APPROVED**

## Final reliability finding closure

The former MEDIUM partial-client-acquisition finding is closed:

- `acquireRuntimeClients()` records each successfully begun runtime client immediately with `clients.push(await beginRuntimeClient())`. A setup failure for the client currently being opened is handled inside `beginRuntimeClient()`, while the acquisition helper rolls back and releases every earlier client it already recorded before rethrowing.
- `rollbackAndRelease()` puts `client.release()` in `finally`. `rollbackAndReleaseAll()` starts cleanup for every recorded client and awaits the complete `Promise.allSettled(...)` result, so one failed rollback/release cannot short-circuit the remaining cleanup attempts.
- Failure propagation is deterministic: a sole cleanup failure is preserved, multiple cleanup failures use the fixed `PostgreSQL runtime client cleanup failed` aggregate, and simultaneous acquisition plus cleanup failure preserves both reasons in acquisition-then-cleanup order under the fixed `PostgreSQL runtime client acquisition and cleanup failed` aggregate.
- All three concurrency cases now call `acquireRuntimeClients(...)`; none retains a `Promise.all(...)` acquisition of `beginRuntimeClient()`. Each case still begins every client before creating/releasing its explicit barrier, retains its bounded `withDeadline(...)` aggregate, and awaits `rollbackAndReleaseAll(clients)` in `finally`.
- A repository source scan found no analogous `Promise.all`/`Promise.allSettled` block concurrently acquiring explicit harness or pool clients. The remaining concurrent aggregates operate on already-owned promises, pool-managed one-shot queries, filesystem reads/writes, or non-resource results and do not reproduce the lost-client-reference failure mode.

## Checker closure

- The checker pins the corrected integration test SHA-256 as `844db833c25e327b8c617cdad7c4f46c828ed40f759cb15b35306ad9f5c08b6f`; an independent recomputation matched it exactly. The API Vitest config hash also independently matched its pinned value, `ef19485759b1279fb8430ee36da7ff494e89cc00ee761ec8190eb3bc45fbf030`.
- Its S7 harness tokens now require `acquireRuntimeClients`, immediate successful-client recording, all-settled cleanup, release/rollback helpers, and both fixed aggregate diagnostics. Per-test tokens require the helper in all three concurrency cases while preserving all three barriers and bounded aggregates. The byte-exact test oracle prevents restoration of any former acquisition spelling without a checker update.

## Verified unaffected controls

- The adapter is still exercised through generated runtime-role clients against the digest-pinned real PostgreSQL harness; no fake is treated as integration authority.
- The narrow real-client wrapper still copies parameters and maps nullable PostgreSQL `rowCount` to `-1`; adapter cardinality checks therefore fail closed.
- Frozen migration bytes, ordered ledger behavior, runtime-role permissions, exact diagnostics, evidence confidentiality/integrity checks, and evidence → stop → residue teardown aggregation remain intact.
- No production adapter, package dependency, DB public export, or migration artifact changed for this correction.

## Independent verification

- `pnpm --filter @agent-workspace/api test:integration` — **1 file, 20 tests passed**.
- `pnpm scaffold:check` — **passed** (`117` required files, `9` workspace packages, `19` root scripts, `6` migration tables).
- `git diff --check` — **passed**.

No remaining quality, reliability, or security finding blocks S7.
