# AW-008D Testcontainers Integration Quality/Security Closure — xhigh

## Scope and verdict

- Closure review only for H1, M1, and M2 in `docs/reviews/aw-008d-testcontainers-integration-quality-security-review-xhigh.md`.
- Reviewed HEAD `d533616e79bd1908c040040e4bbb128d3f8c478f` plus the current untracked D implementation; inspected the fixes and regression tests and independently reran the focused live probes.
- No implementation, test, prior review, configuration, manifest, lockfile, workflow, generated artifact, or commit was changed by this closure review.
- **Verdict: APPROVED.** H1, M1, and M2 are resolved; the accepted L1 remains the only open item and is not a commit blocker.

## Closure ledger

| ID | Prior severity | Determination | Disposition |
|---|---|---|---|
| H1 | HIGH | Running cleanup now requires positive dead-local ownership, and removal rechecks running state/proof. | **RESOLVED** |
| M1 | MEDIUM | Callback and cleanup outcomes are captured independently with identity-preserving composition. | **RESOLVED** |
| M2 | MEDIUM | Teardown stages are failure-independent and preserve sole or ordered multiple failures. | **RESOLVED** |
| L1 | LOW (accepted) | Docker-inspect credential visibility and the same-user evidence-directory TOCTOU remain within the accepted local trust boundary. | **OPEN — ACCEPTED** |

## Exact closure evidence

### H1 — destructive stale cleanup

- `support/postgres.ts:225-242` classifies a running entry as stale only when it has a valid same-host PID that currently reports `ESRCH`; age applies to stopped entries, while stopped dead-local entries may be removed immediately.
- `support/postgres.ts:244-271` reinspects each target. Non-forced cleanup refuses a target found running if its list entry was not running or dead-local proof no longer holds, closing the stopped-to-running and PID-reuse windows. `:341-345` passes `forceRunning: true` only for exact run-ID ownership cleanup.
- `roles.integration.spec.ts:377-512` creates exactly five labeled Docker targets: old running foreign-host, current-PID/different-instance, and live other-PID targets survive; running dead-local and old stopped targets are removed. It asserts initial inspect state, exact returned IDs, survivor listing/inspect state, removed-target 404s, and aggregates cleanup of every target.
- The prior red probes documented removal of running foreign/current-PID-different-instance targets (`quality-security-review-xhigh.md:23-24`). The equivalent green live test independently passed **1/1** (9 skipped) in **22.31s**, followed by zero labeled residue.

### M1 — callback/cleanup failure composition

- `support/postgres.ts:750-778` records callback and cleanup results separately; success returns the exact result, either sole failure is rethrown by identity, and dual failure is `AggregateError([callback, cleanup], "PostgreSQL test harness callback and cleanup failed")` in stable order.
- `roles.integration.spec.ts:514-560` exercises success, callback-only, cleanup-only, and both-fail paths with identity sentinels and exact message/order assertions.
- The prior red probe showed cleanup replacing the callback error (`quality-security-review-xhigh.md:31-32`). The green real-harness probe independently passed **1/1** (9 skipped) in **4.63s**, with zero labeled residue.

### M2 — failure-independent teardown

- `roles.integration.spec.ts:167-191` runs every stage, rethrows the sole exact error, or emits ordered `AggregateError` with stable message. Main `afterAll` at `:321-374` independently runs stop, residue assertion, retained-evidence assertion, evidence-directory removal, environment restoration, and console restoration.
- The dedicated retained-evidence path uses the same accumulator at `:1098-1140`, preserving startup as primary while still attempting stop, residue/evidence checks, and fixture removal.
- The seam test at `:562-630` proves stop-only, removal-only, both, and primary-plus-both ordering; every scenario observes all stage markers and restored environment/console markers.
- The prior red probe left evidence after stop failure and showed restoration could be skipped (`quality-security-review-xhigh.md:39-40`). The green seam test independently passed **1/1** (9 skipped) in **1.26s**, with zero labeled residue.

## Commit-safety verification

- Full roles integration: **1 file, 10/10 passed**. Full integration: **3 files, 25/25 passed**. DB unit: **2 files, 64/64 passed**.
- DB TypeScript no-emit, DB lint, `pnpm db:check` (including contracts **81/81**), root `format:check`, and `git diff --check`: **PASS**.
- No TODO/FIXME/XXX or skipped/todo/only test markers were found in DB tests; `packages/db/dist` was absent.
- Post-run AW-008D labeled-container residue: **0**; AW-008D temporary paths: **0**. Roles coverage re-exercised evidence/diagnostic credential-denial assertions.

## Remaining ledger and final determination

- Remaining BLOCKER/HIGH/MEDIUM findings: **none**.
- Remaining LOW finding: **L1 only, accepted**; no new closure finding was identified.
- The reviewed D change is commit-safe within this review scope.

**Final verdict: APPROVED.**
