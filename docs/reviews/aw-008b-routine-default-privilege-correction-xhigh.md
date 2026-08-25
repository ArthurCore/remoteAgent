# AW-008B Routine Default-Privilege Correction Review — xhigh

## Scope
- Reviewed HEAD `5ecffd0363ec27e726c722a7ac5cbcf4ec6306bb` plus only the tracked correction in `scripts/postgres/init-roles.sh` and `packages/db/test/schema.spec.ts`.
- Untracked AW-008D files were not reviewed or edited. The D roles suite was executed only as real-PostgreSQL evidence.

## PostgreSQL semantics and correction
- PostgreSQL grants `EXECUTE` on new functions/routines to `PUBLIC` by built-in global default. Per PostgreSQL 17 `ALTER DEFAULT PRIVILEGES` semantics, per-schema defaults are added to global defaults; a per-schema `REVOKE` cannot subtract a global grant and only reverses a prior per-schema `GRANT`.
- The old `FOR ROLE ... IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM PUBLIC` was therefore ineffective. A PostgreSQL 17.11 probe produced zero `pg_default_acl` `f` rows for that role; its future function had `proacl IS NULL = true` and effective PUBLIC EXECUTE `true`.
- `scripts/postgres/init-roles.sh:80-84` now uses the valid syntax `ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_role"` followed by `REVOKE EXECUTE ON ROUTINES FROM PUBLIC;`. `ROUTINES` covers functions and procedures; omitting `IN SCHEMA` changes the target migrator's database-wide, future-routine default.
- Corrected PostgreSQL 17.11 probe: the migrator had a global `f` row (`defaclnamespace = 0`) with `{aw008b_migrator=X/aw008b_migrator}`; a future migrator function had the same explicit owner-only ACL, PUBLIC EXECUTE `false`, and runtime EXECUTE `false`.
- Defaults affect only routines later created as the target migrator in this database. Existing public routines remain covered by `REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC` at line 73.
- The database-wide scope is stronger than public-only scope but is necessary and intended least privilege: no future migrator routine is implicitly callable by every role in any schema. A deliberately public API must now use an explicit `GRANT EXECUTE`. No production SQL creates routines or grants EXECUTE, so no current behavior regresses.
- Table and sequence defaults remain intentionally scoped `IN SCHEMA public` at lines 85-92; the correction does not broaden runtime DML grants.

## Syntax, quoting, and security audit
- `FOR ROLE :"migrator_role"` is psql identifier interpolation sourced by `\getenv`; the single-quoted heredoc prevents shell expansion. Generated role names remain safely quoted, including in the corrected clause.
- Passwords still enter through `\getenv` and psql literal interpolation, never command arguments or shell expansion; no tracing, credential output, or new secret-bearing diagnostic was introduced.
- `packages/db/test/schema.spec.ts:393-400` positively requires the global form and negatively prohibits the ineffective `IN SCHEMA public` form, preventing recurrence.

## Exact verification
- `pnpm --filter @agent-workspace/db test:unit`: **2 files, 64/64 tests passed**.
- Focused untracked D roles evidence: **1 file, 6/6 tests passed** on pinned PostgreSQL 17.11; the future-function check proves PUBLIC/runtime lack EXECUTE and an actual runtime call is rejected with SQLSTATE `42501`.
- `bash -n scripts/postgres/init-roles.sh` and `git diff --check -- scripts/postgres/init-roles.sh packages/db/test/schema.spec.ts`: passed.
- The tracked delta is limited to those two B paths and is commit-safe when staged path-specifically. Untracked AW-008D support (including its reset mirror) remains D-owned and must not be swept into the B commit.

## Severity closure
- **M1 / MEDIUM — RESOLVED.** Both existing and future routine paths now deny implicit PUBLIC execution; static recurrence protection and real effective-denial evidence are present.
- Remaining findings: **BLOCKER 0 / HIGH 0 / MEDIUM 0 / LOW 0**. No credential, quoting, syntax, scope, or regression gap remains.

Verdict: APPROVED
