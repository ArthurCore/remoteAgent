PASS

# AW-010A S5 Cumulative Integration Specification Closure 2 (xhigh)

**Status:** PASS

**Reviewed:** revised S5 in `docs/plans/aw-010a-task-cards.md`, the prior cumulative-integration specification and quality/security reviews, and the reviewed S4 base at `fed7591`.

## Closure verification

- **The unconditional implementation scope is exactly seven paths.** It comprises the new focused integration suite, `packages/db/vitest.config.ts`, the three retained 5/10/10 integration suites, the PostgreSQL evidence harness, and the cumulative checker. The checker must freeze all six non-checker S5 files by exact SHA-256 while preserving every predecessor oracle. No package, lockfile, TypeScript configuration, schema-source, bootstrap, workflow, or application path is needed.
- **The frozen S5 inventory is exactly 24 named tests.** Its numbering is complete and contiguous from (1) through (24), and item (15) explicitly adds the required same-tenant/wrong-channel rejection independently of item (14)'s wrong-tenant rejection. The inventory also retains exact type-family negatives, immediate-FK and deferred-type ordering, atomic rollback, migration serialization/rerun, application rollback, live catalog, hash-drift, and anti-synthetic-fixture coverage.
- **Integration registration is exact and the focused RED is deterministic.** The S5 result is the literal four-file set `channel-stream-migration.integration.spec.ts`, `constraints.integration.spec.ts`, `migration.integration.spec.ts`, and `roles.integration.spec.ts`. The predecessor config's broad `test/**/*.integration.spec.ts` glob selects the new file, so named test (1) must fail on the non-exact registration itself; the card correctly forbids relying on file non-selection. The focused command is separate from the full existing-suite baseline.
- **The full baseline is accurate and independently reproducible.** `pnpm --filter @agent-workspace/db test:integration` discovered three files / 25 tests and returned exactly 11 semantic failures / 14 passes: 2 migration, 7 constraints, and 2 roles failures. There was no infrastructure or skipped-test substitute. This establishes the existing-suite correction work separately from the focused config-first RED.
- **Latest retained evidence is tied to the current frozen migration.** The live SHA-256 of `packages/db/drizzle/0001_aw010a_channel_stream.sql` is `e44f52f786360ac502c0d928cebaebdca718abdd39ae2e78275b9d21505aef26`, matching `CHANNEL_STREAM_MIGRATION_HASH`; `pnpm --filter @agent-workspace/db db:check` passes. The base scope correctly limits `test/support/postgres.ts` to advancing retained evidence to that hash while preserving the named credential, mode, no-overwrite, cleanup, residue, and stale-container invariants.
- **Reviewed S4 artifacts remain conditional.** The only evidence-gated correction set is the exact five paths `0001_aw010a_channel_stream.sql`, `meta/0001_snapshot.json`, `meta/_journal.json`, `src/migration-integrity.ts`, and `test/channel-stream-migration.spec.ts`. They may change only when a named S5 red assertion proves the reviewed S4 artifact wrong, and any such change requires both S4 reviews to rerun. The observed cumulative baseline does not itself authorize those paths.

The revised card is necessary, sufficient, and executable for S5 specification dispatch. This PASS does not approve the future S5 implementation or substitute for its independent quality/security review.
