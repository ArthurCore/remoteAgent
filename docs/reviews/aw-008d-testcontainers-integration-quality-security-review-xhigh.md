# AW-008D Testcontainers Integration Quality/Security Review — xhigh

## Scope and verdict

- Reviewed HEAD `d533616e79bd1908c040040e4bbb128d3f8c478f` plus the current untracked D implementation in `packages/db/test/{support/postgres.ts,migration.integration.spec.ts,constraints.integration.spec.ts,roles.integration.spec.ts}`.
- This is report synthesis only. No implementation, test, prior review, configuration, manifest, lockfile, workflow, or commit was changed.
- **Verdict: REQUEST_CHANGES.** One HIGH destructive-cleanup defect and two MEDIUM failure-path defects remain; no BLOCKER was found.

## Severity ledger

| ID | Severity | Location | Determination | Disposition |
|---|---|---|---|---|
| B0 | BLOCKER | — | None found. | None. |
| H1 | HIGH | `packages/db/test/support/postgres.ts:225-272,320-336` | The stale janitor can stop and delete a currently running harness owned by a live/unknown peer. | Must fix. |
| M1 | MEDIUM | `packages/db/test/support/postgres.ts:748-757` | `withPostgresTestHarness` replaces a callback failure with a cleanup failure. | Must fix. |
| M2 | MEDIUM | `packages/db/test/roles.integration.spec.ts:248-278,747-767` | Teardown stages are not failure-independent; later cleanup/restoration can be skipped and errors masked. | Must fix. |
| L1 | LOW (accepted) | `packages/db/test/support/postgres.ts:410-435,625-635,716-720` | Docker-inspect credential visibility and a same-user evidence-directory TOCTOU remain within the stated local trust boundary. | No change requested. |

## Findings and required closure

### H1 — stale cleanup can destroy active concurrent runs

- `isStaleContainer` returns `true` solely for current PID plus a different module-instance label at `:235-242`, without checking whether the owner is live or the container is stopped. For foreign/unknown hosts, `:248-250` treats age alone as proof of staleness. `removeContainer` then explicitly stops a running target at `:253-272`.
- Live Docker probes confirmed both destructive paths: an old **running** different-host target was removed; a **running** same-host/current-PID target with a different process-instance was removed even with a future creation label and maximum age. Controls behaved narrowly: another live same-host PID survived, a dead/invalid same-host PID was removed, and a future different-host target survived.
- Impact: a shared/remote Docker daemon or a duplicated module instance can lose another active test database and its in-flight assertions. Testcontainers' Reaper already covers active-process crash cleanup; the fallback janitor must prefer false negatives over false-positive destruction.
- **Fix:** classify state before age. Remove a stopped labeled container when it satisfies the stale policy; remove a running container only when a valid same-host owner PID is positively dead. Preserve running foreign/unknown-host containers and running containers owned by any live PID, including current PID with a different module-instance. Keep exact run-ID cleanup forceful for the harness's own `stop()` path.
- **Tests:** prove (1) old running foreign-host survives, (2) running current-PID/different-instance survives regardless of timestamp/age, (3) running live other-PID survives, (4) running dead same-host PID is removed, and (5) old stopped residue is removed. Assert both returned IDs and actual container survival/removal.

### M1 — callback failure is lost when cleanup also fails

- JavaScript `finally` replacement at `:753-756` means a rejected `harness.stop()` supersedes the callback's primary exception.
- Mocked-harness probe: callback primary plus stop failure returned the cleanup object only (`samePrimary=false`, `sameCleanup=true`) and was not an `AggregateError`.
- Impact: CI remains red, but the causative migration/constraint/security assertion disappears, making diagnosis unreliable and violating the file's own startup/cleanup aggregation precedent at `:732-744`.
- **Fix:** preserve a sole callback failure; preserve a sole cleanup failure; when both fail, throw an `AggregateError` ordered `[primary, cleanup]` with a stable message.
- **Tests:** use identity sentinels for callback-fail/stop-pass, callback-pass/stop-fail, and callback-fail/stop-fail; require exact identity and ordered aggregate membership.

### M2 — role-suite teardown can skip residue cleanup and global restoration

- In the retained-evidence test, `await retainedHarness?.stop()` at `:765` prevents `rm` at `:766` when stop rejects. A patched-stop probe observed the cleanup error and confirmed the evidence directory survived.
- In main `afterAll`, an `rm` rejection at `:271-273` prevents `restoreEnvironment()` and `restoreConsole()` at `:275-276`; cleanup exceptions can also replace an earlier assertion/stop failure. This can leave process-wide console hooks/environment mutations and retained files after a failed run.
- **Fix:** execute stop, residue assertions/removal, retained-directory removal, environment restoration, and console restoration independently; collect failures and throw the sole error or an ordered `AggregateError`. Put synchronous restoration in an unconditional inner `finally`. The accumulator pattern in `migration.integration.spec.ts:263-305` is an available model.
- **Tests:** inject stop and directory-removal failures separately and together; prove every later stage ran, environment/console identities were restored, retained-directory removal was attempted, and all primary/cleanup errors were preserved.

## Positive security and quality evidence

- Recovered runs passed full integration **22/22**, DB unit **64/64**, TypeScript no-emit, DB lint/check, Prettier, and `git diff --check`.
- Exact probe confirmed generated credentials necessarily appear in Docker inspect `Config.Env` (official-image/bootstrap transport), but not in Docker labels, evidence JSON, captured console output, or the probed caught-error channel. Evidence mode was `0600`; runtime denial returned SQLSTATE `42501`; opt-in evidence survived normal stop.
- Empty, whitespace-altered, relative, symlink, and non-directory evidence destinations failed closed; environment configuration was captured once before the first await. The residual same-user directory swap window is accepted because the configured destination is trusted, the filename is unpredictable and opened with `wx`, and Docker access is already privileged.
- Normal cleanup probe observed one anonymous volume become zero, no surviving container, and no temporary evidence directory. The defects above concern adversarial failure/concurrency paths, not the verified success path.
- Exact digest pinning, generated role/password entropy, identifier grammar, parameterized test data, least-privilege assertions, non-secret retained evidence, and cleanup aggregation inside `StartedHarness.stop()` were otherwise sound in the reviewed scope.

## Approval gate

- Resolve H1, M1, and M2 with the listed regression tests, then rerun static checks, **64** unit tests, **22** integration tests, zero-residue checks, secret scans, and the destructive/failure-composition probes.
- **Final verdict: REQUEST_CHANGES.**
