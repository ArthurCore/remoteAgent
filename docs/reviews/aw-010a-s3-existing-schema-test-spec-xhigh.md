PASS

# AW-010A S3 Existing Schema Test Ownership — Specification Review (xhigh)

**Verdict:** **PASS for the proposed ownership correction.** The revised S3 card necessarily adds `packages/db/test/schema.spec.ts` as the sixth implementation path and scopes its edit to exactly the two new public schema exports. That edit is sufficient to restore the canonical DB unit contract without weakening or conflicting with the existing AW-008 assertions.

## Scope reviewed

- `docs/plans/aw-010a-task-cards.md` S3, including its six exclusive implementation paths and six-path review/commit instruction
- `packages/db/test/schema.spec.ts:319-336`
- `packages/db/src/index.ts` and `packages/db/src/schema/index.ts`
- `packages/db/test/channel-stream-schema.spec.ts`
- `scripts/assert-aw007-tree.mjs` manifest and byte-exact oracles

## Findings

1. **The ownership addition is necessary.** `packages/db/src/index.ts` re-exports the schema index, and S3 intentionally adds `channelEventSequences` and `channelEvents` there. Removing either public export would contradict S3 minimum green and the focused exact-export assertion. Therefore the pre-existing root-surface expectation in `schema.spec.ts` must be updated in the same S3 card.
2. **Exactly two expected keys are sufficient.** The canonical schema test currently reports one failure with eight other tests passing, and its diff contains only the two unexpected received keys `channelEventSequences` and `channelEvents`. An exact comparison against the existing list plus only those two keys passes with all 14 runtime exports.
3. **The edit remains exact and anti-weakening.** The revised card permits only adding those two literals to the existing `Object.keys(database).sort()` expectation. It does not permit changing the assertion form, deleting prior keys, broadening to subset matching, or altering any other AW-008 schema or role assertion.
4. **There is no ownership or manifest conflict.** The revised card now enumerates six implementation paths and says to add six paths at review/commit. `schema.spec.ts` is already part of the repository's exact file manifest but is not covered by a pre-existing byte hash that would forbid this narrow additive expectation update; `scripts/assert-aw007-tree.mjs` remains an S3-owned path for the cumulative S3 oracle.
5. **The test meaning remains coherent.** The two added values are declarative table exports, not product write functions. Adding them to the exact public DB surface does not undermine the test's prohibition on exposing product write entry points.

## Verification evidence

- `pnpm --filter @agent-workspace/db exec vitest run test/channel-stream-schema.spec.ts` — **6/6 passed**.
- `pnpm --filter @agent-workspace/db exec vitest run test/schema.spec.ts` — reproduced **1/9 failed**, with only the two new exports in the equality diff.
- Exact runtime comparison using the prior expected list plus `channelEventSequences` and `channelEvents` — **passed (14 keys)**.
- `pnpm scaffold:check` — **passed**.

No additional path, expected export, assertion relaxation, or S3 behavior change is required for this correction.
