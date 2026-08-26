REQUEST_CHANGES

# AW-010A S3 Existing Schema Test Ownership — Anti-Weakening Review (xhigh)

**Verdict:** **REQUEST_CHANGES.** The six-path ownership correction is exact, but the implementation has not yet applied or frozen the owned `schema.spec.ts` change.

## Blocking findings

1. **The required two-name correction is absent.** `git diff -- packages/db/test/schema.spec.ts` is empty, and the exact public DB export expectation still omits only `channelEventSequences` and `channelEvents`. Consequently, `pnpm --filter @agent-workspace/db exec vitest run test/schema.spec.ts` fails **1/9** tests with exactly those two unexpected received keys. The closure edit must add only those two string literals; it must not alter the assertion form or any other foundation enum/table/column/PK/check/FK/index/public-surface or role-bootstrap assertion.
2. **The checker does not freeze the corrected existing test.** `exactAw010aS3FileHashes` hashes four S3 artifacts but omits `packages/db/test/schema.spec.ts`; `pnpm scaffold:check` therefore passes while the stale test remains. Add the corrected file to that byte-exact map. For the current file plus only the two required literal insertions, the SHA-256 is `df6b89171e6ba4e14adac4d76049865fffa3aa7974698387bda9e43de0779d45`.

## Verified non-blocking scope

- S3 now enumerates exactly **6** exclusive implementation paths, including `packages/db/test/schema.spec.ts`, and the review/commit instruction correctly says six paths.
- A generated comparison against the current test confirms the intended corrected file differs by exactly two added lines (`"channelEventSequences"` and `"channelEvents"`); every pre-existing test and assertion is otherwise byte-identical.
- `pnpm scaffold:check` currently passes and still reports the frozen foundation boundary as **6 migration tables**, but that pass is insufficient until the corrected schema test is included in the S3 hash oracle.
