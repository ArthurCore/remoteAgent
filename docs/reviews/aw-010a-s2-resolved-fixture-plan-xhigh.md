# AW-010A S2 Resolved Fixture Scope Correction — Specification

Status: PASS

## Scope decision

The revised S2 card correctly authorizes the complete resolved-fixture repair with exactly nine implementation paths. The two fixture imports are deliberately distinct relative requests:

- `apps/web/test/fixtures/forbidden-db-import.ts` requests `../../../../packages/db/src/index.js`. From `apps/web/test/fixtures/`, four parent traversals reach the repository root, so the request resolves to `packages/db/src/index.ts`.
- `packages/chat-core/test/fixtures/forbidden-db-import.ts` requests `../../../db/src/index.js`. From `packages/chat-core/test/fixtures/`, three parent traversals reach `packages/`, so the request also resolves to `packages/db/src/index.ts`.

The fixture oracle can therefore require, for each fixture, its exact source and distinct requested module, the common resolved target `packages/db/src/index.ts`, the expected rule violation, absence of `unresolvedTo` on the resolved edge, and `result.status === 0`. Keeping unresolved-import enforcement enabled in fixture mode is compatible with both requests because neither edge is unresolved.

## Authorized implementation paths

The revised exclusive scope contains exactly these nine paths:

1. `packages/chat-core/src/index.ts`
2. `packages/chat-core/test/public-api.spec.ts`
3. `packages/chat-core/test/fixtures/forbidden-db-import.ts`
4. `apps/web/test/fixtures/forbidden-db-import.ts`
5. `packages/chat-core/vitest.config.ts`
6. `packages/chat-core/package.json`
7. `.dependency-cruiser.cjs`
8. `scripts/assert-boundary-fixture.mjs`
9. `scripts/assert-aw007-tree.mjs`

The added Web fixture path is necessary and sufficient: the other fixture, dependency-cruiser configuration, fixture harness, export/test registration, and exact-tree manifest are already explicitly owned by S2. No additional implementation path is required.

This PASS covers the corrected task-card scope. S2 implementation and quality review must still verify the exact per-fixture requests, common resolved target, absent `unresolvedTo`, zero status, and all other fixture-oracle expectations.
