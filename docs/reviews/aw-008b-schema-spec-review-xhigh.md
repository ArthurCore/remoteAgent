# AW-008B Schema Specification Review — xhigh

## Scope and method

- Compared only AW-008B at baseline `fa0372f`: `packages/db/src/schema/{enums,foundation,index}.ts`, the necessary `packages/db/src/index.ts` export, `packages/db/test/schema.spec.ts`, `packages/db/vitest.config.ts`, and `scripts/postgres/init-roles.sh`.
- Authority was approved plan §6 (literal DDL), §8 (local roles), and AW-008B ownership/sequence. The concurrent A0 contract and all C/D/E/F artifacts are out of scope.
- Notation below: `NN` = `NOT NULL`; `∅` = no default; `U/D R` = `ON UPDATE/DELETE RESTRICT`. Drizzle's `timestamp (6) with time zone` is PostgreSQL `timestamptz(6)`.

## Plan §6 literal DDL audit

| Entity / element | Implementation checked against the frozen literal | Result |
|---|---|---|
| Enums | Exactly `principal_kind_v1(human,service)`; `workspace_role_v1(owner,admin,member,guest)`; `channel_kind_v1(public,private,dm)`; `history_mode_v1(full,since_join)` | PASS |
| `tenants` columns | `tenant_id varchar(255) NN ∅`; `created_at timestamptz(6) NN DEFAULT now()`; `version bigint NN DEFAULT 1` | PASS |
| `tenants` keys/checks/indexes | `tenants_pk(tenant_id)`; `tenants_tenant_id_nonempty_ck(length(tenant_id)>0)`; `tenants_version_positive_ck(version>0)`; no FK/index | PASS |
| `workspaces` columns | `tenant_id varchar(255) NN ∅`; `workspace_id varchar(255) NN ∅`; exact timestamp/version columns and defaults | PASS |
| `workspaces` keys/checks/indexes | `workspaces_pk(tenant_id,workspace_id)`; `workspaces_tenant_fk(tenant_id)->tenants(tenant_id) U/D R`; both ID nonempty checks; table-prefixed version-positive check; no index | PASS |
| `principals` columns | `tenant_id varchar(255) NN ∅`; `principal_id varchar(255) NN ∅`; `principal_kind principal_kind_v1 NN ∅`; exact timestamp/version columns and defaults | PASS |
| `principals` keys/checks/indexes | `principals_pk(tenant_id,principal_id)`; `principals_tenant_fk(tenant_id)->tenants(tenant_id) U/D R`; both ID nonempty checks; table-prefixed version-positive check; no index | PASS |
| `workspace_memberships` columns | Tenant/workspace/principal IDs each `varchar(255) NN ∅`; `role workspace_role_v1 NN ∅`; exact timestamp/version columns and defaults | PASS |
| `workspace_memberships` keys/FKs | `workspace_memberships_pk(tenant_id,workspace_id,principal_id)`; exact workspace and principal composite tenant FKs, both U/D R | PASS |
| `workspace_memberships` checks/index | All three table-prefixed ID-nonempty checks; table-prefixed version-positive check; `workspace_memberships_principal_idx(tenant_id,principal_id,workspace_id)` nonunique | PASS |
| `channels` columns | Tenant/workspace/channel IDs each `varchar(255) NN ∅`; `kind channel_kind_v1 NN ∅`; exact timestamp/version columns and defaults | PASS |
| `channels` keys/FK | `channels_pk(tenant_id,channel_id)`; `channels_workspace_fk(tenant_id,workspace_id)->workspaces(tenant_id,workspace_id) U/D R` | PASS |
| `channels` checks/index | All three table-prefixed ID-nonempty checks; table-prefixed version-positive check; `channels_workspace_idx(tenant_id,workspace_id,channel_id)` nonunique | PASS |
| `channel_membership_epochs` columns | Four IDs `varchar(255) NN ∅`; `history_mode history_mode_v1 NN ∅`; `joined_event_seq bigint NN ∅`; `exited_event_seq bigint NULL ∅`; exact timestamp/version columns and defaults | PASS |
| `channel_membership_epochs` keys/FKs | Exact four-column `channel_membership_epochs_pk`; exact channel and principal composite tenant FKs, both U/D R | PASS |
| `channel_membership_epochs` checks | Exact four ID-nonempty checks, `joined_event_seq>0`, `exited_event_seq IS NULL OR exited_event_seq>joined_event_seq`, and table-prefixed version-positive check | PASS |
| `channel_membership_epochs` indexes | Unique `channel_membership_epochs_one_active_uq(tenant_id,channel_id,principal_id) WHERE exited_event_seq IS NULL`; exact tenant-leading principal and channel-sequence indexes | PASS |
| Cardinality / exclusions | Source defines exactly four enums and six tables; no message, event, outbox, projection, extra constraint, or extra explicit index exists | PASS |

## Public surface and sequence fence

| Check | Result |
|---|---|
| `schema/index.ts` exports only the four enums and six table objects; package root re-exports them | PASS |
| Existing `DatabasePool`, `DatabaseReadinessClient`, `createDatabasePool`, and `probeDatabase` exports remain intact | PASS |
| Exact runtime export test excludes product write helpers; source search found no product insert/update/delete/transaction API | PASS |
| Epoch implementation is structural only; it introduces constraints/indexes but no membership write path or fabricated durable sequence | PASS |

## Role bootstrap audit

| Requirement | Static determination | Result |
|---|---|---|
| Local/Testcontainers bootstrap only | Dedicated executable `scripts/postgres/init-roles.sh`; scope is explicit; uses official image `POSTGRES_*` inputs and `psql` | PASS |
| Generated inputs and separation | All seven inputs are required nonempty; owner, migrator, and runtime pairwise equality is rejected | PASS |
| Idempotence | Roles use catalog-guarded `CREATE`; attributes, ownership, revokes, grants, existing-object grants, defaults, and ledger denial are convergently reapplied | PASS |
| Secret/static safety | `set -Eeuo pipefail`, no xtrace, quoted heredoc, `--no-psqlrc`, quiet/terse psql, `ON_ERROR_STOP`, `\getenv`, identifier/literal quoting; secrets are not argv/interpolated output | PASS |
| Migrator capability | Distinct constrained login receives DB `CONNECT,CREATE`, owns `public`, and has schema `USAGE,CREATE`; this is the intended DDL role | PASS |
| Runtime capability | Distinct constrained login receives DB `CONNECT`, schema `USAGE`, table DML and sequence-use grants only; DB temporary/create and schema create are revoked | PASS |
| Ledger denial | Conditional revokes cover `drizzle` and `drizzle.__drizzle_migrations`; no runtime grant targets either | PASS |
| Evidence boundary | B performs syntax/static assertions only; real PostgreSQL CRUD/DDL-denial/idempotence evidence correctly remains AW-008D-owned | PASS |

## Ownership and focused evidence

- B changed only its owned schema source, schema unit test, Vitest config, role script, and necessary package index export; `packages/db/tsconfig.json` is unchanged. No manifest, migration, Compose, plan, board, or A0 file is attributed to B.
- `vitest run test/schema.spec.ts --config vitest.config.ts --project unit`: **1 file, 9/9 tests passed**.
- DB typecheck and a build to a temporary external `outDir`: **passed**; explicit ESLint over every B TypeScript file: **passed**.
- Prettier over every B TypeScript file: **passed**; `bash -n scripts/postgres/init-roles.sh`: **passed**; `git diff --check`: **passed**.
- Package `lint` currently stops only because its F0-owned command names C-owned, not-yet-present `drizzle.config.ts`. Explicit B lint is green, so this is an acceptable `F0 → B → C` staged dependency, not a B source defect.

## Severity-classified gaps

| Severity | Exact gap |
|---|---|
| Critical | None |
| Major | None |
| Minor | None |

AW-008B is spec-complete and may proceed unchanged to the separate code-quality review.

Verdict: PASS