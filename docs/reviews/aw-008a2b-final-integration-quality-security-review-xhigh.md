# AW-008A2b Final Integration Quality/Security Review — xhigh

## Scope, boundary, and evidence

- Reviewed `2c3515d` plus the seven A2b2 paths authorized by `aw-008a2b-snapshot-artifact-decision-xhigh.md:33-45`: `packages/contracts/{src/artifacts.ts,src/index.ts,test/artifacts.spec.ts,vitest.config.ts,scripts/generate-artifacts.ts,generated/sync-v1.schema.json,generated/openapi-sync-v1.json}`.
- The final spec review's authentication finding is closed and its closure is PASS (`docs/reviews/aw-008a2b-final-integration-spec-closure-xhigh.md:7-33`).
- A2b1's metadata isolation, hostile fixed-name rejection, immutable registries, graph budgets, and cycle/depth closures remain closed (`docs/reviews/aw-008a2b-artifact-builders-quality-security-final-closure-xhigh.md:10-32`). The findings below are newly identified renderer/final-generator issues, not reversals of those closures.
- Recovered gates pass: `contracts:check` 59/59, all package tests 243/243, typecheck, lint, Prettier over all seven paths, and `git diff --check`.

## Severity ledger

- BLOCKER: 0
- HIGH: 0
- MEDIUM: 2
- LOW: 2

### MEDIUM M1 — valid typed numbers are silently rewritten

- **Evidence:** `JsonValue` admits every JavaScript `number` (`packages/contracts/src/artifacts.ts:44-45`). The primitive fast path preserves them without validation (`:1193-1197`), then `JSON.stringify` at `:1224-1235` maps `NaN`, `Infinity`, and `-Infinity` to `null`, and `-0` to `0`. Probes reproduced this at the root, object members, and array elements.
- **Impact/boundary:** `renderJsonArtifact` can return successful, valid-looking but semantically different bytes for an input accepted by its TypeScript API. Current core/full builder values are finite and their committed bytes are unaffected, so this is integrity loss in a build-time renderer rather than a current artifact exploit; MEDIUM, not HIGH.
- **Required fix:** in the path-aware prewalk at `src/artifacts.ts:1187-1221`, reject non-finite numbers and `Object.is(value, -0)` with a stable `TypeError` naming the JSON Pointer before any stringify operation.
- **Required tests:** extend `packages/contracts/test/artifacts.spec.ts:956-1036` with root/object/array cases for `NaN`, both infinities, and `-0`; require path-bearing rejection and prove no silent `null`/`0` output.

### MEDIUM M2 — `--check` does not enforce the exact generated tree

- **Evidence:** the authorized tree contains exactly two generated files (`docs/reviews/aw-008a2b-snapshot-artifact-decision-xhigh.md:33-45`). Although names are fixed at `packages/contracts/scripts/generate-artifacts.ts:14-15`, check mode only compares those two at `:169-212,247-252`. With `generated/unexpected.json` present, it returned rc0 and reported both canonical files `ok`; normal generation removed the extra.
- **Impact:** the required CI drift gate can approve stale or unauthorized generated entries, a false-green repository-integrity result. This is confined to committed/build output and does not create a runtime privilege boundary; MEDIUM.
- **Required fix:** enumerate `generated` with non-following file-type checks, compare its sorted entries exactly with `artifactNames`, and make missing, drifted, unexpected, non-regular, or symlink entries produce rc1 without writes.
- **Required tests:** add committed CLI sandbox tests for extra file/directory/symlink, both canonical files plus extra, and exact-tree success; assert rc, complete diagnostics, and byte/tree immutability. No committed CLI regression test currently covers `scripts/generate-artifacts.ts`.

### LOW L1 — Unicode display width diverges from the claimed Prettier layout

- **Evidence:** compact-array selection uses JavaScript code-unit `.length` at `packages/contracts/src/artifacts.ts:1224-1237`. A long CJK scalar array stayed inline, while pinned Prettier rendered it multiline; `packages/contracts/test/artifacts.spec.ts:956-970` covers only ASCII width cases.
- **Impact:** future Unicode annotations can create avoidable formatter drift. Current core/full fixtures are ASCII at the affected boundaries and remain byte-equal to Prettier; LOW.
- **Required fix/tests:** use a pinned display-width implementation matching the canonical formatter (or make that formatter authoritative), count the complete candidate line, and add CJK, emoji, combining-mark, escaped-control, and boundary-width fixtures.

### LOW L2 — replacement failure/concurrency can leave hidden backups

- **Evidence:** replacement renames the live directory away before install and cleans it afterward (`packages/contracts/scripts/generate-artifacts.ts:95-150`) without interprocess exclusion. In a repeated sandbox, 12/50 two-writer rounds produced one rc1 plus one `.generated-backup-*`; the visible two-file pair remained exact. An old target mode `0500` likewise installed the exact new pair, returned rc1 on cleanup, and retained one backup. The `finally` at `:153-166` only owns the stage path.
- **Impact/disposition:** this can dirty a checkout and violates intuitive failure-no-write behavior, but it did not produce a mixed/corrupt pair and requires concurrent generation or hostile local permissions. Generation is a serialized build-time tool, so this is LOW and is not the primary merge blocker.
- **Required fix:** serialize check/generate replacement with an ownership-safe lock and roll back an installed replacement when post-install cleanup fails; define stale-lock/backup recovery without following target symlinks.
- **Required tests:** deterministically pause/fault each rename and cleanup boundary; run two processes; signal before/after install; use non-writable parent and `0500` old target; require documented rc, original-or-complete-new pair, and no stage/backup/lock residue.

## Generator sandbox disposition and accepted build-time risks

- Baseline check was rc0/no-write; both-file drift and both-file missing were rc1/no-write; invalid args were rc2/no-write; fresh/repeat generation was rc0 with exactly the canonical pair. Current modes are generated directory `0700`, files `0644` (non-executable); these public contract bytes contain no secret, so the owner-only directory is restrictive but not a security finding.
- Replacing a `generated` symlink installed a real local directory and left the external target/sentinel untouched. A non-writable parent failed rc1 with the original pair unchanged. Interrupted probes exited 130/143 with an exact pair and no residue.
- The two directory renames at `generate-artifacts.ts:102-113` create a brief target-absence window; directory-level replacement preserved pair consistency. Concurrent readers remain an acceptable build-time risk only under the documented serialized-gate assumption; they must not be treated as runtime atomic-publication guarantees.
- Fixed names, `mkdtemp`, `wx` staging writes, and symlink replacement expose no credible privilege escalation: an actor able to race this same-user checkout can already edit its source. The concrete residue behavior remains L2 rather than a security escalation.

## Decision

- Passing canonical bytes and the A2b1/spec closures do not cover M1 or M2. Because the typed renderer can silently corrupt input and the required drift gate can false-pass an unauthorized tree, the unchanged final A2 change set is not safe to commit.

Verdict: REQUEST_CHANGES
