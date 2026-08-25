APPROVED

# AW-010A per-card manifest quality / anti-weakening closure 3

## Closure finding

### S2 cumulative compiler-selection ownership — CLOSED

S2 now literally owns `packages/chat-core/package.json` and requires that card to add exactly `test/public-api.spec.ts` to `typecheck:test` (`docs/plans/aw-010a-task-cards.md:48`). Because the previously reviewed S1 test remains part of the cumulative script, this closes the open requirement that canonical S2 typechecking retain both literal chat-core test files without replacing them with a glob.

S2 now has exactly eight exclusive implementation paths (`:42-51`):

1. `packages/chat-core/src/index.ts`
2. `packages/chat-core/test/public-api.spec.ts`
3. `packages/chat-core/test/fixtures/forbidden-db-import.ts`
4. `packages/chat-core/vitest.config.ts`
5. `packages/chat-core/package.json`
6. `.dependency-cruiser.cjs`
7. `scripts/assert-boundary-fixture.mjs`
8. `scripts/assert-aw007-tree.mjs`

The review/commit instruction is consistent with that manifest and says to add exactly eight implementation paths (`:65`). The cumulative checker rule requires each card to add its literal scripts while preserving all prior exact-manifest entries and forbids globs, allow-extra behavior, ignore expansion, subset-only comparison, and future pre-allowance (`:9`); S2's checker path remains same-card owned (`:51`).

## Regression check

No prior finding is reopened:

- Every card still requires `pnpm scaffold:check` and uncached `TURBO_FORCE=true pnpm run ci` before review/commit (`:7`).
- Cumulative exact anti-weakening and all frozen AW-008 oracles remain mandatory (`:9`).
- S3 and S4 still own their exact cumulative DB test-selection changes through `packages/db/package.json` (`:76`, `:105`).
- S8 still audits the cumulative S1–S7 checker and adds only S8-owned expectations, rather than reowning earlier manifest advancement (`:215-221`).

## Verdict

`APPROVED` — the sole remaining S2 compiler-selection ownership finding is closed, the S2 manifest/count is internally consistent, and no previously closed finding is reopened.
