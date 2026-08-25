REQUEST_CHANGES

# AW-010A per-card manifest quality / anti-weakening review

## High findings

### H1 — The card protocol still permits reviewed commits with red canonical root CI

`docs/plans/aw-010a-task-cards.md:7` requires only each card's focused and regression commands. S1–S7 Green sections (`:32`, `:59`, `:83`, `:113`, `:139`, `:166`, `:191`) do not require `TURBO_FORCE=true pnpm run ci`; that command first appears in S8 (`:213`). This defeats the purpose of moving exact-manifest ownership into each card.

The failure is already observable on the reviewed S1 worktree: `TURBO_FORCE=true pnpm run ci` reached `pnpm scaffold:check` and failed because the current exact manifest rejects these three extra files:

- `packages/chat-core/src/modules/messaging/channel-event-journal.ts`
- `packages/chat-core/test/channel-event-journal.spec.ts`
- `packages/chat-core/vitest.config.ts`

No S1 review/commit may be accepted in that state. Require every S1–S8 Green gate, before either reviewer and before commit, to run the uncached canonical root CI successfully after that card's exact checker update. Re-run both S1 implementation reviews only after this is green. Cards that alter integration coverage must additionally run their exact integration gate, but that does not replace root CI.

### H2 — S8 remains a contradictory second owner of S1–S7 manifest advancement

S1–S7 now each list `scripts/assert-aw007-tree.mjs` as an exclusive path (`:20`, `:47`, `:72`, `:100`, `:126`, `:154`, `:179`), but S8 Red still says to “first add exact two-table/SQL/hash/script/workflow oracles” and expects failure until the manifest includes S1–S7 (`:209`). S8 Minimum green again says “advance exact checker” (`:211`). This leaves it ambiguous whether earlier cards add complete or provisional entries and allows omitted tables, hashes, dependencies, or scripts to be deferred until closure.

Rewrite S8 to start from a canonical-CI-green, exact S7 manifest. S8 may add only S8-owned root/API-integration script and workflow/evidence expectations. Its Red must fail only for those S8 additions. Remove S1–S7 files, two tables, `0001` SQL/snapshot/journal hashes, package scripts, and dependencies from S8 ownership; the card that introduces each item must add its exact oracle atomically.

### H3 — Per-card script ownership is incomplete, so new tests can fall out of canonical CI

The plan says checker edits add file “surface” or “expectations,” but several cards cannot make their stated regression count persistent in root CI:

- S2 does not own `packages/chat-core/vitest.config.ts` or `packages/chat-core/package.json` (`:40-47`), yet the S1 config currently has the literal include `test/channel-event-journal.spec.ts` only. Therefore S2's promised `test:unit` result of 16/16 (`:59`) cannot include `public-api.spec.ts`, and `typecheck:test` also names only the S1 test.
- S3 and S4 introduce `channel-stream-schema.spec.ts` and `channel-stream-migration.spec.ts`, but neither card owns `packages/db/package.json` (`:67-72`, `:93-100`). Its canonical `test:unit` script still names only `test/schema.spec.ts test/migration.spec.ts`, so root CI would not retain either new test after the focused command has passed.

Give S2 exact ownership of the chat-core config/script additions needed to include and typecheck both literal test files. Give S3/S4 exact ownership of cumulative DB `test:unit` script additions for their literal test files. Each same-card checker delta must assert the complete exact script value; do not use a broad test glob as a substitute.

### H4 — Anti-weakening rules are not cumulative or mechanically exact

Only S1 says to preserve every frozen AW-008 oracle (`:20`). Later cards use underspecified phrases such as “schema/test surface,” “migration/artifact/test/hash surface,” or “project expectation.” The mandatory protocol forbids globs only in the `git add` set (`:7`); it does not forbid weakening the checker with subset checks, broad filesystem/test globs, allow-extra branches, expanded ignore lists, or placeholders for future cards.

That is security-sensitive because the current checker uses exact equality for implementation/workflow files, dependencies, scripts, and the six AW-008 tables (`scripts/assert-aw007-tree.mjs:399-415,483-505,515-557,591-621`). Historical integrity also includes the immutable `0000_aw008_foundation.sql` and `meta/0000_snapshot.json` SHA-256 values (`packages/db/src/migration-integrity.ts:11-17`), the retained role integration oracle, and the exact pinned/read-only AW-008 hosted workflow.

Add one mandatory rule applying to every S1–S8 checker edit:

1. Append only the card's literal new file/directory, package script, dependency/importer, table, migration entry, and artifact-hash expectations; no future-card entry.
2. Preserve the AW-008 `0000` SQL/snapshot hash constants, six-table foundation oracle, role test/oracle, workflow permissions/action pins/frozen-install/uncached-CI/DB-integration/evidence semantics, and all exact-list/object/equality assertions.
3. Never introduce broad globs, subset/contains-only checks, allow-extra switches, new ignore exemptions, or future placeholders. Cumulative exact expected sets must reject both missing and extra values.
4. When `_journal.json` legitimately gains `0001`, retain a separate immutable assertion for the exact historical `0000` entry and append exact `0001` journal/hash expectations; do not replace the historical oracle wholesale.
5. Review the checker diff against the predecessor and prove uncached canonical root CI green in the same card before review/commit.

## Verification

- `git diff --check`: PASS.
- Current uncached canonical root CI: FAIL at `scaffold:check` for the three unmanifested S1 files listed in H1; all preceding lint, typecheck, boundaries, unit, and DB checks passed with cache 0.
- Verdict remains `REQUEST_CHANGES` until H1–H4 are corrected and the S1 root gate is rerun green.
