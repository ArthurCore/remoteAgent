# AW-008C Migration Runner Specification Review — xhigh

## Scope and authority

- Reviewed only HEAD `bd43a50efd106605e9ab6de927970ce440f0072f` plus exactly 11 untracked C paths: `packages/db/drizzle.config.ts`; `drizzle/{0000_aw008_foundation.sql,meta/_journal.json,meta/0000_snapshot.json}`; `src/{migration-config,migration-env,migrate,migration-integrity}.ts`; `test/migration.spec.ts`; and `test/fixtures/failing-migration/{0000_valid_then_fail.sql,meta/_journal.json}` (paths after the first are under `packages/db/`).
- Authority: approved `docs/plans/aw-008-contracts-db-foundation.md` §§6–7, 10–13 and AW-008C at `:217-219`; B-owned role bootstrap at `scripts/postgres/init-roles.sh:72-89` is consulted only to resolve §8's default-privilege wording.
- Out of scope: implementation/generated/test/prior-review edits, manifests, B schema/role changes, and D/E/F work. AW-008D owns every real-PostgreSQL assertion; this review requires C's injected unit/seam coverage and preserves integration as fail-closed rather than demanding D evidence early.

## Exact requirement matrix

| Requirement | Exact determination | Result |
|---|---|---|
| Change fence | Pre-review implementation status contains exactly the 11 named C paths; the only additional path is this reviewer-owned artifact, with no tracked diff and no `packages/db/dist` | PASS |
| Kit/runtime configuration | `drizzle.config.ts:3-11` fixes PostgreSQL, `./src/schema/index.ts`, `./drizzle`, breakpoints, schema `drizzle`, and table `__drizzle_migrations`; `migration-config.ts:6-23` repeats the exact runtime values | PASS |
| Source/compiled folder | `migration-config.ts:10-23` resolves one package-relative `drizzle` folder from both `src` and `dist`; `migration.spec.ts:97-110` covers local source and `/app/packages/db/dist/migrate.js` layouts | PASS |
| Frozen DDL | `0000_aw008_foundation.sql:1-96` has exactly four frozen enums and six §6 tables with exact names, types, nullability, defaults, PKs, FKs, checks, and tenant-leading indexes; no AW-010 table/behavior | PASS |
| Generated artifact consistency | One journal entry (`idx=0`, tag/time/breakpoints exact), one zero-parent snapshot, and one SQL file agree; snapshot contains the same four enums/six tables and no sequence, role, policy, view, or extra schema; `drizzle-kit check` passes | PASS |
| Forward-only/frozen bytes | Exact set is SQL + snapshot + journal only; SHA-256 values are respectively `645229b04fc4eddd44d47301d47f1efbd394daa6c97852c3ea4a3cbb26df23c2`, `2dbb8666e9f74ba19e1faa4d3df0309db2a5d29f65aaa6648e399070cbe23fc1`, and `e10eae9ec0df3cc6b2d809031b4250a1bc369d51f51659d7b60dc2262bec228d` | PASS |
| Environment/network fence | `migration-env.ts:21-60` requires a trimmed parseable PostgreSQL URL with host/database and exactly `testcontainer\|local-compose\|managed-production`; `migrate.ts:84-99,145-160` validates before pool construction and never reads `DATABASE_URL` | PASS |
| One-session lock | `migrate.ts:44-68,84-138` creates a Pool, acquires one dedicated client, takes fixed parameterized advisory lock `0x4157008c`, then runs precheck → Drizzle migrate on that PoolClient → postcheck before unlock | PASS |
| Cleanup/failure precedence | `migrate.ts:77-82,92-138` attempts unlock, client release, and pool end on every applicable path while preserving the primary failure; unlock result must be true | PASS |
| Bootstrap boundary | `migrate.ts:48-57` permits a missing ledger only during the locked precheck; `migration-integrity.ts:176-224` returns the explicit bootstrap boundary pre-migration and rejects an absent ledger post-migration | PASS |
| Applied-ledger rules | `migration-integrity.ts:49-161` rejects malformed/unsafe timestamps and hashes, duplicate/out-of-order/unknown applied rows, missing earlier rows, and hash drift; only a local pending suffix is accepted and postcheck requires all local migrations applied | PASS |
| Ledger SQL safety | `migration-integrity.ts:163-168,185-216` parameterizes `to_regclass`, requires its exact fixed qualified result, allowlists then quotes both identifiers, and selects only fixed `created_at/hash` ordered ascending | PASS |
| Offline integrity | `migration-integrity.ts:226-269` recursively requires the exact three-file set, byte-checks all frozen hashes, re-reads Drizzle metadata, and requires the single foundation hash | PASS |
| CLI/import safety | Both CLIs use realpath-based main guards (`migrate.ts:168-179`, `migration-integrity.ts:308-319`), strict arguments, rc 0/1/2, and generic diagnostics that disclose neither URL nor operational error text | PASS |
| Literal failing fixture | The two fixture files are exactly a valid table statement followed by a deterministic exception and one matching journal entry; no snapshot/extra fixture artifact is introduced | PASS |
| C test obligation | `migration.spec.ts` provides 47 passing tests for exact config/path, strict env, CLI/import seams, ledger rules/bootstrap, lock ordering/same-client/cleanup, frozen artifacts, no AW-010 tables, and the literal fixture | PASS |

## §8 default-privilege classification

- `0000_aw008_foundation.sql` intentionally has no role grants. This is **not** a missing C authority requirement: AW-008B owns role bootstrap (`plan:213-215`), §8 requires Testcontainers to run that same bootstrap with generated values (`plan:153-160`), and those generated migrator/runtime identifiers cannot be frozen into a deterministic Kit artifact.
- The approved realization is B's SQL at `scripts/postgres/init-roles.sh:80-89`: `ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_role" IN SCHEMA public` grants table DML and sequence use to `:"runtime_role"`. It executes before C's migrator-owned objects, so the semantic §8 requirement is met without static grants or a C/B ownership violation.

## Evidence and scope boundary

- Reproduced: focused C suite **47/47**, DB unit suite **56/56**, `db:check`, typecheck, lint, temporary external-`outDir` build, root `format:check`, and `git diff --check` all pass; exact-11 status and absent `dist` were rechecked.
- No real PostgreSQL/Compose claim is made here. Bootstrap privilege failure, transactional partial-failure cleanup, first/second/concurrent runs, runtime grants/DDL denial, and resource cleanup remain blocking AW-008D integration obligations and must continue to fail closed until D supplies them.

## Severity-classified gaps

| Severity | Exact file:line | Gap | Required fix |
|---|---|---|---|
| Critical | None | None | None |
| Major | None | None | None |
| Minor | None | None | None |

AW-008C is exact-spec compliant and may proceed unchanged to separate quality/security review and then AW-008D.

Verdict: PASS
