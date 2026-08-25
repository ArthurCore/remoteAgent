# AW-008D Testcontainers Integration Specification Closure — xhigh

## Scope and authority

- Closure review only for M1 in `docs/reviews/aw-008d-testcontainers-integration-spec-review-xhigh.md`, against HEAD `d533616e79bd1908c040040e4bbb128d3f8c478f` plus the current D-owned untracked implementation.
- The approved plan remains authoritative: D owns the retained-output capability in its support/spec files; F1 exclusively owns manifests, lock/workspace policy, `.gitignore`, the repository-relative destination, CI environment wiring, workflow, and upload action.
- No source, test, prior review, config, generated artifact, manifest, lockfile, workflow, or commit was edited by this closure review.

## M1 closure determination

| ID | Prior severity | Determination | Result |
|---|---|---|---|
| M1 | MAJOR | The harness now provides an opt-in retained evidence handoff while preserving temporary local cleanup, and real integration coverage proves retention after stop. | **RESOLVED** |

- `support/postgres.ts:17,86-89` exports `POSTGRES_TEST_EVIDENCE_DIRECTORY_ENV = "AW008D_TEST_EVIDENCE_DIRECTORY"` and `StartPostgresTestHarnessOptions.evidenceDirectory`.
- `support/postgres.ts:425-435,596-609` captures option-or-environment configuration exactly once, gives the option precedence, and rejects empty, whitespace-altered, or non-absolute values before Docker runtime discovery.
- `support/postgres.ts:410-423,613-624` keeps the default under a unique OS-temporary harness directory, while opt-in mode creates the destination, requires `lstat` to report a real non-symlink directory, and resolves a unique `<32-hex-character runId>.json` path; `runId` is generated from 16 random bytes at `:154-179`.
- Destination resolution is inside the failed-start cleanup boundary at `support/postgres.ts:619-624,732-744`; normal and failed cleanup remove only the harness container/labeled residue and harness temporary directory at `:498-521,568-594`, so an external evidence file survives.
- `support/postgres.ts:553-565,683-720` retains the existing exact evidence object and secret denylist, serializes no roles, passwords, or URLs, and writes once with `flag: "wx"` and mode `0600`.
- `roles.integration.spec.ts:229-278` drives the primary harness through the exported environment contract, stops it in `afterAll`, proves labeled-container cleanup and evidence survival, validates exact JSON/secret absence, then removes the external test directory.
- `roles.integration.spec.ts:747-768` independently drives the option contract with a second exact locked PostgreSQL harness, stops it, proves zero run-labeled containers, verifies the retained file and mode `0600`, checks exact evidence equality and secret absence, then cleans its destination.
- Local default behavior remains temporary-and-deleted; opt-in behavior alone retains output. The correction is D-owned and introduces no manifest, ignore-rule, workflow, upload, or repository-artifact policy change.

## F1 boundary

- F1 must select the ignored repository-relative `artifacts/` destination, set `AW008D_TEST_EVIDENCE_DIRECTORY` for the integration lane, and upload the resulting JSON with the approved immutable action.
- F1 still owns `.gitignore`, root/package manifests, lock/workspace and tree policy, `.github/workflows/ci.yml`, PR execution, and retention. None of that is required to establish or test D's now-complete handoff capability.

## Reproduced evidence

- Focused roles integration: **1 file, 7/7 tests passed**.
- Full root integration: **3 files, 22/22 tests passed**.
- DB lint, root `format:check`, and `git diff --check`: **PASS**.
- Post-run AW-008D labeled-container residue: **0**; retained test destinations were removed by their owning specs.
- Source and test inspection found the M1 correction narrowly scoped and found no regression against the prior review's passing D requirements.

Remaining severity: **CRITICAL none; MAJOR none; MINOR none.**

Verdict: PASS
