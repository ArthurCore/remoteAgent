REQUEST_CHANGES

# AW-010A S5 Cumulative Integration Ownership — Quality/Security (xhigh)

**Verdict:** **REQUEST_CHANGES.** The revised seven-path S5 ownership set closes the obvious missing-file gap, but it still leaves anti-weakening, role-security, harness-safety, and one tenant/channel negative underspecified. No additional package, lockfile, or TypeScript-config path is required; the card text and checker contract must be tightened before dispatch.

## Blocking findings

### H1 — The checker does not yet own byte-exact S5 integration anti-weakening

`docs/plans/aw-010a-task-cards.md:138` authorizes only “the S5 integration file/project expectation.” Exact tree membership, an exact four-file Vitest list, and a 49-test total do not prevent a worker from weakening assertions inside an existing AW-008 integration test while retaining its filename and test count.

Require the final S5 checker delta to add one byte-exact S5 hash oracle for every S5-owned non-checker path:

1. `packages/db/vitest.config.ts`
2. `packages/db/test/channel-stream-migration.integration.spec.ts`
3. `packages/db/test/migration.integration.spec.ts`
4. `packages/db/test/constraints.integration.spec.ts`
5. `packages/db/test/roles.integration.spec.ts`
6. `packages/db/test/support/postgres.ts`

The checker itself is necessarily not self-hashed. Preserve every existing S2–S4 hash map and all AW-008 exact-tree, dependency, script, six-foundation-table, `0000` migration/snapshot, journal-entry-zero, role/default-privilege, lifecycle, and workflow oracles. Do not replace a prior hash map, use a broad glob, or pre-allow an S6/S7 file.

### H2 — The role-test instruction can still conflate SQL grants with trigger-enforced behavior

`docs/plans/aw-010a-task-cards.md:136` says only “trigger-aware runtime behavior.” That is insufficiently exact against the disclosures in `docs/plans/aw-010a-channel-stream-foundation.md:77,88`.

Keep the existing ten role tests, but require separate assertions that:

- the migrator owns all eight cumulative public tables and the runtime role has the disclosed SQL `SELECT`, `INSERT`, `UPDATE`, and `DELETE` table privileges;
- direct `channel_events` `UPDATE` and `DELETE` fail with the append-only trigger's SQLSTATE `55000` and fixed diagnostic despite those SQL grants, not with permission-denied `42501`;
- direct journal insert remains SQL-granted but constrained by the journal schema/FKs/checks;
- raw `channel_event_sequences` table access, including the presently disclosed direct state `UPDATE`/`DELETE` capability, is demonstrated and reported as residual risk rather than silently described as denied; and
- the existing runtime DDL, migration-ledger, routine, role-attribute, and default-privilege denials remain unchanged.

S5 must not introduce an unreviewed grant/routine redesign to hide this result. The point is to distinguish catalog authorization from trigger behavior and accurately freeze the known raw-sequence exposure.

### H3 — Harness ownership omits explicit `0600` and residue preservation

`docs/plans/aw-010a-task-cards.md:137` mentions credential/cleanup/stale-container invariants, but the authorized harness change must be narrower and explicitly preserve the evidence mode and residue defenses.

Require `packages/db/test/support/postgres.ts` to change only the imported/recorded hash from the foundation migration to the current frozen channel-stream migration. Preserve, byte-for-behavior, generated credentials, evidence credential rejection, real-directory/symlink validation, `wx` creation with mode `0o600`, retained and temporary evidence semantics, pool/container/volume cleanup, cleanup-failure composition, run-label residue removal, and conservative stale-container ownership checks. H1's hash oracle must freeze this reviewed result.

### H4 — The named typed-reference negatives omit wrong-channel isolation

The parent acceptance contract requires wrong-tenant **and wrong-channel** rejection (`docs/plans/aw-010a-channel-stream-foundation.md:86`), while the S5 test list at `docs/plans/aw-010a-task-cards.md:141` names only wrong-tenant rejection. Add an explicit same-tenant/different-channel event-reference negative, using a real fully populated typed journal event. It may be grouped within the frozen 24 tests, so it needs no additional path or test-count increase.

All constraints integration fixtures that currently use synthetic positive markers must instead create real `channel.member_joined` and, where applicable, `channel.member_left`/`channel.member_revoked` rows before referencing their exact sequences. Preserve the ten existing constraints tests and every non-superseded AW-008 assertion while advancing the exact cumulative table/constraint/index/timestamp catalog.

### M1 — The focused-red expectation is not deterministic under the current glob

The predecessor `packages/db/vitest.config.ts:22` already uses `test/**/*.integration.spec.ts`, so after the new `channel-stream-migration.integration.spec.ts` is created, the existing integration project already selects it. The statement at `docs/plans/aw-010a-task-cards.md:147` that red occurs “before integration project includes the new file” is therefore false. If the reviewed S4 SQL satisfies all runtime cases, requiring exit 1 would incentivize a fabricated assertion or an unnecessary migration change.

Rewrite the red protocol to record the behavioral result honestly and add a separate fail-first exact-config/checker assertion, or explicitly treat S5 as verification-first when the 24 behavioral tests pass on first execution. The green config must spell and freeze only these four literals, with no glob or future pre-allowance:

- `test/channel-stream-migration.integration.spec.ts`
- `test/constraints.integration.spec.ts`
- `test/migration.integration.spec.ts`
- `test/roles.integration.spec.ts`

## Verified baseline and path decision

- `vitest list --project integration` reports the existing **25** tests: 5 migration, 10 constraints, and 10 roles.
- `pnpm scaffold:check` passes the predecessor manifest: 113 required files, 9 packages, 19 root scripts, and the exact six-table AW-008 foundation boundary.
- The seven base implementation paths at `docs/plans/aw-010a-task-cards.md:132-138` are otherwise complete. No `packages/db/package.json`, lockfile, `tsconfig`, role bootstrap, or workflow edit is justified by S5.
- Any evidence-proven correction to unpublished `0001` remains confined to the five listed S4 correction paths and requires both S4 re-reviews.

S5 may proceed only after H1–H4 and M1 are incorporated without weakening the cumulative predecessor contract.
