# AW-008 Plan Exactness Addendum — xhigh

## Scope

- Reviewed only the current plan’s exact script/card sections, the approved xhigh closure review, and the one-line working-tree diff from approved commit `c21243c`.
- The diff changes only the DB package `test:unit` body from `vitest run test/schema.spec.ts` to `vitest run test/schema.spec.ts test/migration.spec.ts`.

## Determination

- **Omission resolved:** the approved tree includes `test/migration.spec.ts`; AW-008C owns it and requires injected unit/seam coverage for lock, hash, path, and cleanup. The former command did not execute that required spec.
- **D1–D6 unchanged:** the correction alters no approved decision or implementation boundary; it only makes the frozen unit command execute already-approved D4-oriented coverage.
- **Ownership unchanged:** AW-008C still owns the spec and its test content; AW-008F/F0 still exclusively owns package manifests and frozen script bodies.
- **Dependency graph unchanged:** no card dependency, merge-order edge, or D-before-E sequencing rule changes.
- **CI gates unchanged:** root `ci`, `db:check`, the blocking PR integration lane, and acceptance gates retain their approved definitions. The correction closes unit-test reachability without adding, removing, or weakening a gate.
- No dependency installation or implementation is authorized beyond the already-approved F0 bootstrap scope.

## Authorization

- F0 may implement the corrected command under the existing approved ownership and merge order.

Verdict: APPROVED
