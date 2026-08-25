# AW-008B Schema Quality/Security Closure — xhigh

## Scope
- Reviewed only the B-owned H1/M1 corrections against `docs/reviews/aw-008b-schema-quality-security-review-xhigh.md` at HEAD `e2fcdf52e05deb7f14445afcfd1e2aa00e66f8fc` plus the supplied working tree.
- The existing specification review remains PASS; this closure does not expand B scope or substitute for D-owned integration evidence.

## Finding closure
### H1 — RESOLVED
- `packages/db/vitest.config.ts:18-24` defines the integration project, and line 21 now sets `passWithNoTests: false` directly rather than relying on inherited merge behavior.
- Focused verification: `pnpm exec vitest run --config vitest.config.ts --project integration` printed `No test files found, exiting with code 1` and exited 1; no placeholder test produced a false green.
- Regression verification: the unit project passed 1 file and 9/9 tests.

### M1 — RESOLVED
- `scripts/postgres/init-roles.sh:72-78` converges existing objects: line 73 revokes routine EXECUTE from PUBLIC, and line 74 revokes all routine privileges from runtime before table/sequence grants are reapplied.
- `scripts/postgres/init-roles.sh:80-81` makes migrator-created future routines fail closed by revoking default routine EXECUTE from PUBLIC.
- `packages/db/test/schema.spec.ts:389-396` statically asserts all three routine-hardening statements.
- Compatibility evidence remains clean: the recorded pinned PostgreSQL 17.11 official-image bootstrap reached ready with generated owner/migrator/runtime values and all three roles present; `bash -n scripts/postgres/init-roles.sh` also passed.

## Prior non-findings and residual ownership
- No prior non-finding is reopened: generated-value/secret handling, single-initializer race scope, sequence UPDATE plan residual, schema-test quality, exports, SQL apply/interpolation, and staged D ownership remain as assessed in the source review.
- Remaining B severities: BLOCKER none; HIGH none; MEDIUM none; LOW none.
- D handoff remains mandatory for empirical effective routine denial (existing and future routines), runtime CRUD/DDL denial, effective sequence grants, bootstrap rerun idempotence, fresh-database constraint/cross-tenant negatives, and migration behavior.

## Merge decision
- H1 and M1 are closed; B may merge unchanged from this reviewed correction set.

Verdict: APPROVED
