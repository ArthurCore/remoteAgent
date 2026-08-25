# AW-008D Retained-Evidence Migration-Suite Correction Review — xhigh

## Scope and authority

- Reviewed HEAD `1807283` plus the current uncommitted implementation diff only in `packages/db/test/migration.integration.spec.ts`.
- Authority is the approved D retained-output capability and F1 workflow environment contract. Unmodified support/source behavior and all F1 diffs were excluded from implementation scope.
- This review adds only this report; it does not change implementation, prior reviews, workflow/configuration, F files, or commits.

## Severity closure

| ID | Severity | Determination | Closure |
|---|---|---|---|
| M1 (prior) | MAJOR | Teardown unconditionally required `evidencePath` to be absent, so an opted-in retained file failed the suite after all five migration tests passed. | CLOSED |
| — | CRITICAL | No finding in the correction. | None |
| — | MAJOR | No unresolved or new finding in the correction. | None |
| — | MINOR | No finding in the correction. | None |

## Exact review determinations

- `beforeAll` snapshots presence of `AW008D_TEST_EVIDENCE_DIRECTORY` exactly once, before harness startup, so teardown uses the same retention mode even if process environment later changes.
- Empty, relative, whitespace-altered, or non-directory values remain startup errors in the harness; the new branch does not weaken those fail-closed validations.
- Teardown still stops the harness and checks labeled-container residue before evidence disposition. Every stage preserves its failure in the existing sole-error/ordered-`AggregateError` path.
- External mode requires the retained path to remain readable, contain valid JSON, and be semantically identical to `harness.evidence`; it performs no unlink, removal, or other deletion.
- Local mode continues to require exact `ENOENT`; non-`ENOENT` access failures and surviving temporary evidence fail the suite.
- Existing harness creation guarantees a regular `wx` evidence file with mode `0600`; existing serialization/credential assertions remain unchanged, so this correction neither duplicates nor weakens those controls.
- The diff changes no migration, database, support, secret, or source semantics and performs no F1-owned workflow/upload work.

## Evidence

- Diff inspected: `25` additions and `10` deletions, limited to the migration integration specification.
- Supplied real PostgreSQL evidence: environment unset, **5/5 PASS** with evidence deleted; external absolute destination, **5/5 PASS** with exactly one retained JSON document.
- Reviewer static checks: `git diff --check` passed and Prettier reported the target file compliant.
- A reviewer rerun was unavailable because this execution environment exposed no working container runtime; the runtime determination therefore relies on the supplied two-mode PostgreSQL evidence.

The prior retained-evidence contradiction is closed exactly, with no open severity finding.

Verdict: APPROVED
