# AW-008D Testcontainers Integration Specification Review — xhigh

## Scope and authority

- Reviewed HEAD `d533616e79bd1908c040040e4bbb128d3f8c478f` plus exactly four untracked D paths: `packages/db/test/support/postgres.ts`, `migration.integration.spec.ts`, `constraints.integration.spec.ts`, and `roles.integration.spec.ts`; there was no tracked implementation diff before this reviewer-owned report.
- Authority: approved `docs/plans/aw-008-contracts-db-foundation.md` §§7–9, 11–13 and AW-008D at `:221-223`, with the authoritative global routine-default correction at HEAD. E owns Compose; F/F1 exclusively own manifests, lock/workspace policy, `.gitignore`, PR workflow, and upload wiring.
- This is a specification review only. No implementation, test, config, generated artifact, manifest, lockfile, workflow, or prior review was edited.

## Exact requirement matrix

| Requirement | Exact determination | Result |
|---|---|---|
| Change/ownership fence | Status contained exactly the four D-owned paths above; D does not edit E/F files or claim future AW-009/AW-010 behavior | PASS |
| Locked real PostgreSQL | `support/postgres.ts:12-16,567-572,589-610` validates and starts the exact approved 17.11 digest; the live probe observed that exact image | PASS |
| Bootstrap and generated isolation | `support/postgres.ts:115-182,574,590-608` generates a random database, three distinct role identities and three passwords, copies the authoritative init-role script, and passes no inherited URL | PASS |
| Portable connection boundary | `support/postgres.ts:610-645` constructs every connection only from `getHost()` and `getMappedPort(5432)`; `roles.integration.spec.ts:225-239,648-655` plants ambient URLs and proves they are ignored | PASS |
| Reaper, labels, stale janitor | Testcontainers retains its default Resource Reaper; `support/postgres.ts:18-25,158-176,273-341,579-601` labels each resource and removes dead/sufficiently-aged labeled residue before each start | PASS |
| Evidence content/security | `support/postgres.ts:46-67,648-685` records image/reference/ID, container, database, schemas, migration hash, seed, labels, mapped endpoint and Docker `HostIp`; serialization rejects roles/passwords/URLs and writes mode `0600` | PASS |
| Reset, serialization, cleanup | `support/postgres.ts:353-395,460-493,539-565,697-722`; each spec's `beforeEach` resets both schemas, Vitest disables file parallelism, all describes are sequential, and normal/partial-start cleanup removes pools/container/volume/temp data | PASS |
| First/second migration | `migration.integration.spec.ts:309-333` applies once, verifies exactly one frozen ledger row/six tables, reruns, and proves no-op identity | PASS |
| Concurrent advisory lock | `migration.integration.spec.ts:165-195,335-388` observes exactly one holder and one waiter, releases the holder, completes both runners, and leaves one ledger row | PASS |
| Bootstrap denial and transaction boundary | `migration.integration.spec.ts:390-453` proves runtime cannot bootstrap ledger/application objects and the exact failing fixture leaves its probe absent and ledger row count zero | PASS |
| Real-ledger hash drift | `migration.integration.spec.ts:455-489` applies the real frozen migration, supplies a changed local hash to the production integrity checker against the real ledger, and proves fail-closed/no ledger mutation | PASS |
| Exact structural catalog | `constraints.integration.spec.ts:410-530` checks the exact four ordered enums, exact six public tables/no AW-010 table, every named PK/FK/CHECK with no extras, exact tenant-leading indexes/predicate, and timestamp/version nullability/defaults | PASS |
| Constraint behavior/fence | `constraints.integration.spec.ts:532-921` uses only explicit synthetic positive sequence markers and proves valid defaults, every nonempty/version check, cross-tenant FKs, epoch ordering, and one-active-epoch behavior | PASS |
| Roles and ownership | `roles.integration.spec.ts:267-414` proves generated identity separation, exact constrained migrator/runtime flags, no memberships, migrator schema/table ownership and DDL, plus future-routine PUBLIC/runtime EXECUTE denial | PASS |
| Runtime grants/denials | `roles.integration.spec.ts:416-646` proves CRUD on all six tables, future table/identity-sequence defaults, and denial of DB/schema/temp/object DDL plus all ledger access | PASS |
| Secret scan and zero residue | `roles.integration.spec.ts:71-199,242-265,648-732` scans captured diagnostics and evidence for URLs/credentials, verifies the live inspection/HostIp/labels, then verifies no labeled container or temp evidence directory remains | PASS |
| Test substance | Three real, serial integration files contain 21 non-skipped/non-todo tests; failures are SQLSTATE/catalog/row/lock/resource assertions, not trivial truth assertions | PASS |
| Retained acceptance artifact | Evidence exists only in an OS-temporary directory and is deliberately deleted on stop, so no JSON/JUnit resource record survives for F1's required `artifacts/` upload | FAIL |

## Severity-classified gaps and exact fixes

| ID | Severity | Exact file:line | Gap | Required fix |
|---|---|---|---|---|
| M1 | MAJOR | `packages/db/test/support/postgres.ts:430-445,584-585,681-695,487-488`; `packages/db/test/migration.integration.spec.ts:289-301`; `packages/db/test/roles.integration.spec.ts:246-257` | The sole evidence file is under `mkdtemp(tmpdir())`, and every suite requires it to disappear. After `pnpm test:integration` there is nothing F1 can upload, contrary to plan §9 `:166-167` and §11 `:201-202`. | Add a D-owned opt-in evidence destination (option or environment contract) that writes a uniquely named mode-`0600` non-secret JSON record and preserves it after harness stop; retain temp-and-delete as the local default. Add a real test proving retained mode survives stop and remains secret-free. F1 must later point that contract at ignored `artifacts/` and upload it; D must not edit `.gitignore`, manifests, or workflow. |
| — | CRITICAL | None | None | None |
| — | MINOR | None | None | None |

## F1 boundary determination

- Temporary asserted evidence is sufficient for D's live harness/security assertions, but **not** sufficient for D closure: F1 cannot wire upload of a file that D unconditionally destroys, and F1 cannot repair `support/postgres.ts` without violating card ownership.
- D therefore owns retained-output capability now. F1 owns only the final repository-relative `artifacts/` destination, ignore rule, script/workflow invocation, immutable upload action, and PR evidence retention. This fix preserves the card boundary rather than moving F1 work into D.

## Reproduced evidence

- Colima-only invocation environment (no source assumption): exact-image probe reported `host=localhost`, random mapped port `32804`, Docker `HostIp=0.0.0.0`, evidence mode `600`, required metadata, and cleanup residue `0`.
- Migration integration ran three consecutive times: **5/5**, **5/5**, **5/5**. Final root `pnpm test:integration`: **3 files, 21/21 tests passed**.
- DB unit: **2 files, 64/64**; `pnpm db:check`, DB lint, root `format:check`, and `git diff --check` passed. No labeled AW-008D container, generated `dist`, retained temp evidence, or other implementation residue remained.

M1 blocks exact §9/§11 acceptance-evidence compliance; the otherwise substantive D1–D4 suite must not be called complete until retained handoff is possible.

Verdict: REQUEST_CHANGES
