REQUEST_CHANGES

# AW-010A per-card manifest quality / anti-weakening closure 2

## High finding

### H1 — S2 still does not own its cumulative test-typecheck selection

The revised mandatory protocol closes the canonical-CI gap: every S1–S8 card must pass `pnpm scaffold:check` and `TURBO_FORCE=true pnpm run ci` with zero cached tasks before review/commit (`docs/plans/aw-010a-task-cards.md:7`). The cumulative anti-weakening rule also closes the prior exactness gap by forbidding broad globs, allow-extra behavior, ignore expansion, subset-only comparisons, and future placeholders while preserving all AW-008 migration/snapshot/journal hashes, the exactly-six-table boundary, role/default-privilege checks, lifecycle/package-manager denials, hosted-workflow pins/permissions/cache rules, and prior exact-manifest entries (`:9`). S8 now starts from the cumulative S1–S7 checker and may add only S8-owned evidence/review/workflow expectations (`:214-216`), so it no longer contradictorily reowns earlier manifest advancement. S3 and S4 now each own the exact cumulative DB `test:unit` script change through `packages/db/package.json` (`:75`, `:104`).

S2 remains incomplete. It owns `packages/chat-core/vitest.config.ts` and adds `test/public-api.spec.ts` to canonical unit selection (`:47`), but it does not own `packages/chat-core/package.json` (`:42-50`). The current package script still typechecks only the S1 test:

```json
"typecheck:test": "... test/channel-event-journal.spec.ts"
```

(`packages/chat-core/package.json:17`). Therefore S2's root `typecheck`/canonical CI cannot retain typechecking of `test/public-api.spec.ts`, despite the prior review explicitly requiring S2 to own the script additions needed to include **and typecheck** both literal test files.

Add `packages/chat-core/package.json` to S2's exclusive implementation paths and require S2 to update `typecheck:test` to name both literal test files exactly. Require the same-card checker delta to assert the complete exact script value; do not replace it with a test glob. Update S2's implementation-path and `git add` counts accordingly.

## Prior-finding disposition

- Canonical uncached CI on every card: **CLOSED**.
- Contradictory S8 reownership: **CLOSED**.
- S2–S4 test-selection ownership: **PARTIALLY CLOSED** — S3/S4 closed; S2 test typechecking remains open.
- Cumulative exact anti-weakening and AW-008 oracle preservation: **CLOSED**.

## Verdict

`REQUEST_CHANGES` until S2 atomically owns and exactly freezes cumulative unit-test typecheck selection.
