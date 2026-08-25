PASS

# AW-010A S5 Cumulative Integration Ownership — Specification Review (xhigh)

**Verdict:** **PASS.** The revised S5 card's seven base implementation paths are necessary and sufficient to retain the existing 25 real-PostgreSQL tests, add the 24 named `AW010A-S5` cases, register exactly four integration files, and keep retained evidence tied to the latest frozen migration. The five S4 SQL/metadata/integrity paths correctly remain conditional on a named red assertion proving a reviewed S4 artifact wrong.

## Scope reviewed

- Base: reviewed S4 commit `fed7591`.
- Revised `docs/plans/aw-010a-task-cards.md` S5 ownership, red/green, and commit rules.
- Existing integration owners:
  - `packages/db/test/migration.integration.spec.ts` — 5 tests.
  - `packages/db/test/constraints.integration.spec.ts` — 10 tests.
  - `packages/db/test/roles.integration.spec.ts` — 10 tests.
  - `packages/db/test/support/postgres.ts` — shared harness/evidence contract.
- Current `packages/db/vitest.config.ts`, `packages/db/package.json`, `scripts/assert-aw007-tree.mjs`, S4 migration/integrity artifacts, and the parent migration/cutover contract.

## Seven-path ownership closure

1. **Create `packages/db/test/channel-stream-migration.integration.spec.ts`.** This is the necessary dedicated owner for the 24 S5 cutover, lock, typed-reference, ordering, rollback, rerun/concurrent-runner, application-rollback, and hash-drift cases. None of the existing AW-008 suites should absorb those new cases.
2. **Modify `packages/db/vitest.config.ts`.** The integration project currently uses `test/**/*.integration.spec.ts`. Replacing that glob with an exact include set is necessary to prevent silent future integration-file admission. The complete S5 set is exactly:
   - `test/channel-stream-migration.integration.spec.ts`
   - `test/constraints.integration.spec.ts`
   - `test/migration.integration.spec.ts`
   - `test/roles.integration.spec.ts`
3. **Modify `packages/db/test/migration.integration.spec.ts`.** Both successful migration tests still hard-code one ledger row and six tables. This file also hard-codes foundation hash evidence. Its scoped updates to the exact two-row ledger, cumulative eight-table catalog, and latest evidence hash preserve all five existing first/rerun, concurrent-runner, wrong-role, failing-migration, and drift tests.
4. **Modify `packages/db/test/constraints.integration.spec.ts`.** Seven of its ten tests currently expose stale six-table, constraint, index, timestamp/version, or synthetic membership expectations. This is the sole correct owner for the cumulative eight-table live catalog and for converting epoch fixtures to genuine joined/left/revoked journal references without reducing the ten-test regression surface.
5. **Modify `packages/db/test/roles.integration.spec.ts`.** Two of its ten tests expose stale six-table ownership and synthetic epoch behavior. This file is the correct owner for all-eight-table ownership/grants and for runtime assertions that distinguish allowed insert/select and raw sequence-state CRUD from journal update/delete rejection by the append-only trigger. The revised card explicitly forbids the obsolete blanket raw-CRUD claim.
6. **Modify `packages/db/test/support/postgres.ts`.** The harness currently records `FOUNDATION_MIGRATION_HASH`. Changing only the evidence value/import to the current frozen channel-stream hash is required while leaving generated credentials, role setup, reset/default privileges, evidence permissions/redaction, stale-container cleanup, and teardown behavior untouched. At the reviewed head, the exact latest hash is `e44f52f786360ac502c0d928cebaebdca718abdd39ae2e78275b9d21505aef26`; `migration.integration.spec.ts` must assert that value through `CHANNEL_STREAM_MIGRATION_HASH`, including retained evidence.
7. **Modify `scripts/assert-aw007-tree.mjs`.** The exact manifest must add the new integration file and freeze the DB integration project to the same literal four-file set. This closes the config against a reintroduced glob or an unregistered/extra integration file while preserving all prior AW-008/S2/S3/S4 oracles.

No eighth unconditional path is needed. `packages/db/package.json` already runs the integration project without enumerating files; TypeScript and ESLint already cover `test`; unit selection already excludes `*.integration.spec.ts`. No dependency, lockfile, schema source, fixture, workflow, or API path is required for this ownership correction.

## Live failure and conditional-SQL assessment

The exact current integration command executed against PostgreSQL 17.11 and discovered exactly 3 files / 25 tests. It returned **11 semantic failures and 14 passes**, distributed exactly as the revised ownership predicts:

- migration: 2 stale one-row-ledger failures;
- constraints: 7 cumulative-catalog/synthetic-reference failures;
- roles: 2 cumulative-owner/synthetic-reference failures.

There was no infrastructure retry or harness-start failure. The failures show that all four existing owners named by the revision need correction; they do not prove the reviewed S4 SQL wrong. Independently, the S4 migration plus migration regression suite passed **77/77**, `db:check` passed with the exact five-artifact hashes, and the current `0001` SQL hash remains `e44f52f...aef26`. Therefore the SQL, snapshot, journal, integrity, and S4 unit-test paths correctly remain unavailable unless one of the new named S5 behavioral assertions supplies contrary red evidence. If any such artifact changes, both S4 reviews must rerun as the card requires.

## Acceptance exactness

The S5 green gate is auditable: the focused file must report exactly 24 passes; the exact four-file project must report existing 25 plus 24 = **49 passes**, with the existing 5/10/10 tests retained and residue zero. The mandatory scaffold and uncached-CI gates remain in force. No implementation or quality/security approval is implied by this ownership review.
