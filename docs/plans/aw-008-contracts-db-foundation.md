# AW-008 — Contracts and Database Foundation Plan (revision 2)

- **Card / baseline:** AW-008 / `0b4fc0a4459f042b22f09d0b9a794453c9143cb8`
- **Reasoning:** xhigh
- **Authority:** `sync-contract-v1.md` → `chat-projection-semantics-v1.md` → Chat Core ADR → test/release/security policy → this plan.
- **Goal:** canonical runtime contracts plus the minimum tenant-scoped PostgreSQL foundation for later vertical slices.
- **Dependency approval:** user-approved exact dev pins `testcontainers@12.1.0`, `@testcontainers/postgresql@12.1.0`, and `fast-check@4.9.0`; not yet installed.

## 1. Scope
**In:** strict Sync v1 Zod contracts, seven-event schema registry, generated JSON Schema/OpenAPI parity, tenant/access Drizzle schema, one forward migration, least-privilege DB roles, Testcontainers PostgreSQL tests, compiled migrator, one-shot Compose migration, exact gates and PR CI.

**Out:** AW-009 HTTP/Web behavior; AW-010 message/event/outbox command behavior; AW-011 WebSocket handlers; reducers/projections/read state; Agent, Shared Mind, product Kanban, Orchestrator, Redis/Kafka; placeholder scripts, rollback migrations, developer-volume reuse, credentials/customer paths.

## 2. Required tool/dependency disclosure — approval before installation
| Exact dev dependency | Purpose | Install location/method | Expected impact |
|---|---|---|---|
| `testcontainers@12.1.0` | policy-required Docker lifecycle/resource reaper | `packages/db` devDependency via pnpm exact pin | test/lock/SBOM graph grows; Node 24 compatible; absent from production closure |
| `@testcontainers/postgresql@12.1.0` | isolated real PostgreSQL fixture | `packages/db` devDependency | Docker required in PR; no production runtime package |
| `fast-check@4.9.0` | L1 property tests for wire bigint/cursor/ID invariants | `packages/contracts` devDependency | unit-test graph only; seeds recorded |

Zod 4.4.3 built-in JSON Schema conversion is used; no OpenAPI generator or Testcontainers replacement is added. The user also approved explicit `allowBuilds: false` for transitive `protobufjs@7.6.5`, `ssh2@1.17.0`, and `cpu-features@0.0.10`: their scripts are compatibility warnings or optional native accelerators, while denial prevents transitive install-time code execution and keeps CI frozen install strict.

## 3. Revised decisions for xhigh approval
| ID | Revision-2 recommendation |
|---|---|
| D1 | Implement every §4 reference symbol plus strict unsubscribe, all seven durable event schemas, `DurableEventV1`, and production `SyncItemV1.event = DurableEventV1`. First freeze exact payloads in `durable-event-payloads-v1.md`; no runtime code merges before its focused xhigh approval. Generate JSON Schema and OpenAPI 3.1 from the same registry and parity-check committed artifacts. |
| D2 | Keep six structural tables, but do **not** claim membership writes are ready. Epoch rows require a legitimate joined durable event sequence. AW-009 planning must assign membership event journal/allocator ownership before any insert; otherwise membership behavior remains blocked. AW-010 message behavior does not own/fabricate join sequences. |
| D3 | Use controlling Testcontainers policy: one locked-image PostgreSQL container per integration suite, fresh database/schema per test, Resource Reaper plus explicit cleanup. Docker Compose is supplemental L3 evidence only. |
| D4 | Keep `drizzle.__drizzle_migrations`; hold a session advisory lock around migrate, verify every applied `created_at/hash` against committed files, and serialize one migrator. Only pending migration statements+ledger insert are claimed atomic; ledger bootstrap is separately tested. |
| D5 | Opaque IDs are non-empty `varchar(255)`; event markers are PostgreSQL `bigint`; every tenant-owned PK/FK/index is `tenant_id`-leading. |
| D6 | Persist only principal kinds `human|service`; `system` is an envelope actor, never a principal row. No Agent/vendor credentials or capability behavior. |

## 4. Exact intended tree delta
```text
A  .github/workflows/ci.yml
M  .gitignore
M  package.json
M  pnpm-lock.yaml
M  pnpm-workspace.yaml
M  turbo.json
M  .dependency-cruiser.cjs
M  Dockerfile
M  docker-compose.yml
M  scripts/assert-aw007-tree.mjs
M  scripts/container-smoke.sh
A  scripts/postgres/init-roles.sh
A  docs/contracts/durable-event-payloads-v1.md
M  packages/contracts/package.json
M  packages/contracts/tsconfig.json
M  packages/contracts/src/index.ts
A  packages/contracts/src/primitives.ts
A  packages/contracts/src/events.ts
A  packages/contracts/src/sync.ts
A  packages/contracts/src/artifacts.ts
A  packages/contracts/scripts/generate-artifacts.ts
A  packages/contracts/generated/sync-v1.schema.json
A  packages/contracts/generated/openapi-sync-v1.json
A  packages/contracts/test/primitives.spec.ts
A  packages/contracts/test/events.spec.ts
A  packages/contracts/test/sync.spec.ts
A  packages/contracts/test/artifacts.spec.ts
A  packages/contracts/vitest.config.ts
M  packages/db/package.json
M  packages/db/tsconfig.json
M  packages/db/src/index.ts
A  packages/db/drizzle.config.ts
A  packages/db/drizzle/0000_aw008_foundation.sql
A  packages/db/drizzle/meta/_journal.json
A  packages/db/drizzle/meta/0000_snapshot.json
A  packages/db/src/schema/enums.ts
A  packages/db/src/schema/foundation.ts
A  packages/db/src/schema/index.ts
A  packages/db/src/migration-config.ts
A  packages/db/src/migration-env.ts
A  packages/db/src/migrate.ts
A  packages/db/src/migration-integrity.ts
A  packages/db/test/support/postgres.ts
A  packages/db/test/schema.spec.ts
A  packages/db/test/migration.integration.spec.ts
A  packages/db/test/constraints.integration.spec.ts
A  packages/db/test/roles.integration.spec.ts
A  packages/db/test/migration.spec.ts
A  packages/db/test/fixtures/failing-migration/0000_valid_then_fail.sql
A  packages/db/test/fixtures/failing-migration/meta/_journal.json
A  packages/db/vitest.config.ts
```

No implementation card edits another path. Review artifacts remain reviewer-owned.

## 5. Exact contract manifest
| Module | Public runtime exports |
|---|---|
| `primitives` | `OpaqueIdV1`, `CursorV1`, `EventSeqV1`, `UtcTimestampV1`, `EventTypeV1`, exact strict `ActorV1 {principal_id,kind}` |
| `events` | base `EventEnvelopeV1`; `MessageCreatedV1`, `MessageEditedV1`, `MessageDeletedV1`, `ReactionChangedV1`, `ChannelMemberJoinedV1`, `ChannelMemberLeftV1`, `ChannelMemberRevokedV1`; `DurableEventV1` |
| `sync` | production `SyncItemV1`; `snapshotResponseV1`; `DeltaResponseV1`; `SyncLimitsV1`; `SyncSubscribeV1`; `SyncSubscriptionReadyV1`; `SyncBarrierAppliedV1`; `SyncDeliveryV1`; `TransportAckV1`; `SyncLiveV1`; `SyncResyncRequiredV1`; `SyncRevokedV1`; `SyncErrorCodeV1`; `SyncErrorV1`; `SubscribeResultV1`; `BarrierAppliedResultV1`; strict `SyncUnsubscribeV1` |
| `artifacts` | schema registry, deterministic JSON Schema document builder, deterministic OpenAPI 3.1 sync document builder |

- `ActorV1` is the single normative strict object; it is not a discriminated union.
- `SyncItemV1.event` uses `DurableEventV1`; base envelope is never exported as production ingress.
- The payload contract freezes exact required/optional fields for all seven events before code. It must include `history_mode` on join and stable `reason_code` on leave/revoke without adding message behavior.
- Every object ingress is strict; sequence stays a decimal string in signed-bigint range; cursor remains opaque; unknown/legacy `seq`/`type` fail.
- Property/negative matrix: min/max/overflow/zero/sign/exponent/leading zero; ID/cursor/timestamp bounds; actor kind; seven event/payload mismatches; barrier equality; limits; result/error discriminants; unsubscribe extras; cross-field tenant/channel mismatch fixtures.
- `contracts:generate` writes both committed artifacts from one registry. `contracts:check` regenerates into a temporary directory and byte-compares; OpenAPI component schemas reference the same generated JSON schemas. No drift is accepted.

## 6. Frozen literal DDL
Enums are exactly `principal_kind_v1('human','service')`, `workspace_role_v1('owner','admin','member','guest')`, `channel_kind_v1('public','private','dm')`, `history_mode_v1('full','since_join')`. Every timestamp below is `timestamptz(6) NOT NULL DEFAULT now()` and every `version` is `bigint NOT NULL DEFAULT 1` with the literal table-prefixed positive check.

```text
tenants(
  tenant_id varchar(255) NOT NULL, created_at timestamptz(6) NOT NULL DEFAULT now(), version bigint NOT NULL DEFAULT 1,
  CONSTRAINT tenants_pk PRIMARY KEY(tenant_id), CONSTRAINT tenants_tenant_id_nonempty_ck CHECK(length(tenant_id)>0), CONSTRAINT tenants_version_positive_ck CHECK(version>0))
workspaces(
  tenant_id varchar(255) NOT NULL, workspace_id varchar(255) NOT NULL, created_at timestamptz(6) NOT NULL DEFAULT now(), version bigint NOT NULL DEFAULT 1,
  CONSTRAINT workspaces_pk PRIMARY KEY(tenant_id,workspace_id), CONSTRAINT workspaces_tenant_fk FOREIGN KEY(tenant_id) REFERENCES tenants(tenant_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT workspaces_tenant_id_nonempty_ck CHECK(length(tenant_id)>0), CONSTRAINT workspaces_workspace_id_nonempty_ck CHECK(length(workspace_id)>0), CONSTRAINT workspaces_version_positive_ck CHECK(version>0))
principals(
  tenant_id varchar(255) NOT NULL, principal_id varchar(255) NOT NULL, principal_kind principal_kind_v1 NOT NULL, created_at timestamptz(6) NOT NULL DEFAULT now(), version bigint NOT NULL DEFAULT 1,
  CONSTRAINT principals_pk PRIMARY KEY(tenant_id,principal_id), CONSTRAINT principals_tenant_fk FOREIGN KEY(tenant_id) REFERENCES tenants(tenant_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT principals_tenant_id_nonempty_ck CHECK(length(tenant_id)>0), CONSTRAINT principals_principal_id_nonempty_ck CHECK(length(principal_id)>0), CONSTRAINT principals_version_positive_ck CHECK(version>0))
workspace_memberships(
  tenant_id varchar(255) NOT NULL, workspace_id varchar(255) NOT NULL, principal_id varchar(255) NOT NULL, role workspace_role_v1 NOT NULL, created_at timestamptz(6) NOT NULL DEFAULT now(), version bigint NOT NULL DEFAULT 1,
  CONSTRAINT workspace_memberships_pk PRIMARY KEY(tenant_id,workspace_id,principal_id), CONSTRAINT workspace_memberships_workspace_fk FOREIGN KEY(tenant_id,workspace_id) REFERENCES workspaces(tenant_id,workspace_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT workspace_memberships_principal_fk FOREIGN KEY(tenant_id,principal_id) REFERENCES principals(tenant_id,principal_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT workspace_memberships_tenant_id_nonempty_ck CHECK(length(tenant_id)>0), CONSTRAINT workspace_memberships_workspace_id_nonempty_ck CHECK(length(workspace_id)>0), CONSTRAINT workspace_memberships_principal_id_nonempty_ck CHECK(length(principal_id)>0), CONSTRAINT workspace_memberships_version_positive_ck CHECK(version>0), INDEX workspace_memberships_principal_idx(tenant_id,principal_id,workspace_id))
channels(
  tenant_id varchar(255) NOT NULL, workspace_id varchar(255) NOT NULL, channel_id varchar(255) NOT NULL, kind channel_kind_v1 NOT NULL, created_at timestamptz(6) NOT NULL DEFAULT now(), version bigint NOT NULL DEFAULT 1,
  CONSTRAINT channels_pk PRIMARY KEY(tenant_id,channel_id), CONSTRAINT channels_workspace_fk FOREIGN KEY(tenant_id,workspace_id) REFERENCES workspaces(tenant_id,workspace_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT channels_tenant_id_nonempty_ck CHECK(length(tenant_id)>0), CONSTRAINT channels_workspace_id_nonempty_ck CHECK(length(workspace_id)>0), CONSTRAINT channels_channel_id_nonempty_ck CHECK(length(channel_id)>0), CONSTRAINT channels_version_positive_ck CHECK(version>0), INDEX channels_workspace_idx(tenant_id,workspace_id,channel_id))
channel_membership_epochs(
  tenant_id varchar(255) NOT NULL, channel_id varchar(255) NOT NULL, principal_id varchar(255) NOT NULL, membership_epoch varchar(255) NOT NULL, history_mode history_mode_v1 NOT NULL,
  joined_event_seq bigint NOT NULL, exited_event_seq bigint NULL, created_at timestamptz(6) NOT NULL DEFAULT now(), version bigint NOT NULL DEFAULT 1,
  CONSTRAINT channel_membership_epochs_pk PRIMARY KEY(tenant_id,channel_id,principal_id,membership_epoch),
  CONSTRAINT channel_membership_epochs_channel_fk FOREIGN KEY(tenant_id,channel_id) REFERENCES channels(tenant_id,channel_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT channel_membership_epochs_principal_fk FOREIGN KEY(tenant_id,principal_id) REFERENCES principals(tenant_id,principal_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT channel_membership_epochs_tenant_id_nonempty_ck CHECK(length(tenant_id)>0), CONSTRAINT channel_membership_epochs_channel_id_nonempty_ck CHECK(length(channel_id)>0), CONSTRAINT channel_membership_epochs_principal_id_nonempty_ck CHECK(length(principal_id)>0), CONSTRAINT channel_membership_epochs_epoch_nonempty_ck CHECK(length(membership_epoch)>0),
  CONSTRAINT channel_membership_epochs_joined_positive_ck CHECK(joined_event_seq>0), CONSTRAINT channel_membership_epochs_exit_after_join_ck CHECK(exited_event_seq IS NULL OR exited_event_seq>joined_event_seq), CONSTRAINT channel_membership_epochs_version_positive_ck CHECK(version>0),
  UNIQUE INDEX channel_membership_epochs_one_active_uq(tenant_id,channel_id,principal_id) WHERE exited_event_seq IS NULL,
  INDEX channel_membership_epochs_principal_idx(tenant_id,principal_id,channel_id,exited_event_seq), INDEX channel_membership_epochs_channel_seq_idx(tenant_id,channel_id,joined_event_seq))
```

No implicit PostgreSQL FK index is assumed; only the literal indexes above satisfy the plan. No message/event/outbox/projection table exists.

**Sequence ownership fence:** AW-008 tests structural epoch constraints with synthetic positive markers only. Product code may not insert an epoch until a later reviewed transaction persists the corresponding `channel.member_joined` durable event and uses its committed sequence. AW-009 must resolve that prerequisite before membership implementation; AW-010 cannot retroactively invent it.

## 7. Migrations, concurrency and integrity
- Generate SQL/journal/snapshot together with pinned Kit 0.31.10; applied files are immutable and corrections are forward-only.
- `migration-config` fixes folder, `drizzle` schema and `__drizzle_migrations` table. Compiled path resolution is tested from local and `/app/packages/db/dist/migrate.js` layouts.
- Runner requires `MIGRATION_DATABASE_URL` and explicit `MIGRATION_TARGET_CLASS=testcontainer|local-compose|managed-production`; it never falls back to runtime `DATABASE_URL`. Root CLI refuses absent/unknown class.
- A dedicated pool connection holds a fixed `pg_advisory_lock` until migrate and integrity verification finish; concurrent runner test proves one serialized application.
- Before applying pending files, compare every existing ledger `(created_at,hash)` with `readMigrationFiles`; changed/missing applied files fail closed. Recheck after migration.
- Atomicity claim is narrow: Drizzle wraps each pending migration SQL plus ledger insert; schema/table bootstrap occurs before that transaction. Tests separately cover bootstrap privilege failure, a synthetic partially-valid failing migration leaving no object/ledger row, second-run no-op, one ledger row, hash drift, compiled folder and pool closure.

## 8. Least-privilege database roles
Local cold-volume Postgres entrypoint mounts `scripts/postgres/init-roles.sh` and creates synthetic roles without shell tracing:

- owner/bootstrap: local Postgres initialization only; not passed to app roles;
- migrator: owns application schema/tables and receives DDL; only `db-migrate` gets `MIGRATION_DATABASE_URL`;
- runtime: CONNECT/USAGE plus table/sequence DML grants, no CREATE/ALTER/DROP; only API/worker get `DATABASE_URL`.

Migration SQL sets default privileges for runtime. Testcontainers setup runs the same script with generated values. Evidence proves migrator DDL succeeds, runtime CRUD succeeds, runtime DDL and ledger writes fail, URLs are not logged, and production provisioning remains M1-OPS-owned.

## 9. Integration topology and enforced PR lane

- `@testcontainers/postgresql` starts locked `postgres:17.11-bookworm@sha256:84560e3b9c6874893fc4e2854f5dc3e7c1a37bc9d1dfd7a8c641310ae22ba5ad`. Tests connect only through Testcontainers `getHost()`/random `getMappedPort()`; no portable loopback-only claim is made. The accepted boundary is a short-lived random port with generated credentials on the isolated PR runner or developer Docker host; inherited DB URLs are ignored and evidence records Docker's actual `HostIp`.
- Trap-equivalent cleanup is Testcontainers `afterAll/finally` plus Resource Reaper; each resource has run labels. Every test receives a fresh database/schema; suites are serial. SIGKILL residue is removed by Reaper and a stale-label janitor at next run.
- JUnit/JSON resource metadata records image digest, container ID, database/schema identity (non-secret), migration hash and test seed under ignored `artifacts/`.
- `.github/workflows/ci.yml` is the blocking PR lane: checkout `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09`, setup-node `a0853c24544627f65ddf259abe73b1d18a591444`, Node 24.15.0, pnpm 11.23.0, frozen install, uncached `pnpm run ci`, then `pnpm test:integration`; upload evidence with `ea165f8d65b6e75b540449e92b4886f43607fa02`. Permissions are read-only and actions use full SHAs.
- Compose remains L3 supplemental proof: seven services (`postgres`,`rustfs`,`storage-init`,`db-migrate`,`api`,`worker`,`web`), migration exit 0 before API/worker, read-only/cap-drop/no-new-privileges, ledger/hash/grant checks, cold volume and teardown 0.

## 10. Exact scripts and gates

Four root additions (15→19):

```text
db:generate       pnpm --filter @agent-workspace/db db:generate
db:check          pnpm --filter @agent-workspace/contracts contracts:check && pnpm --filter @agent-workspace/db db:check
db:migrate        pnpm --filter @agent-workspace/db db:migrate
test:integration  pnpm --filter @agent-workspace/db test:integration
```

Package bodies:

```text
contracts:generate  tsx scripts/generate-artifacts.ts
contracts:check     tsx scripts/generate-artifacts.ts --check && vitest run test/artifacts.spec.ts
contracts test:unit vitest run test/{primitives,events,sync}.spec.ts
db:generate         drizzle-kit generate --config drizzle.config.ts --name aw008_foundation
db:check            drizzle-kit check --config drizzle.config.ts && tsx src/migration-integrity.ts --check-files
db:migrate          tsx src/migrate.ts
db test:unit        vitest run test/schema.spec.ts test/migration.spec.ts
db test:integration vitest run --config vitest.config.ts --project integration --no-file-parallelism
```

Root `ci` adds real `db:check`; PR workflow enforces integration. `scaffold:check` changes messages/constants to AW-008, enforces exact tree/19 scripts/six tables and rejects future scripts/tables. Boundaries enforce contracts→no workspace/framework, web/chat-core/UI→no DB schema/migrator, DB→no apps. No no-op scripts.

The final root `ci` value is exactly `pnpm format:check && pnpm lint && pnpm typecheck && pnpm boundaries:check && pnpm test:unit && pnpm db:check && pnpm scaffold:check && pnpm build`.

## 11. Acceptance evidence

- Frozen install; uncached local CI; property seed/test counts; artifact byte parity; exact export list; clean boundaries/tree.
- Testcontainers resources recorded; first/second/concurrent/failing/hash-drift migration results; exact enums/tables/constraints/indexes; cross-tenant, epoch and runtime-DDL negatives; cleanup 0.
- PR workflow success is required, not a manual substitute.
- Cold-volume seven-service Compose, both health endpoints, storage-init and db-migrate exit 0, ledger/grants, runtime DDL denial, teardown 0.
- Gitleaks 0; final-image non-root/pruned/root-owned evidence; Trivy Critical fixed gate 0; parsed CycloneDX; `git diff --check`.
- `pnpm db:migrate` acceptance is invoked only by a Testcontainers/Compose-minted URL+target class; bare ambient execution must fail before network access.

## 12. Kanban cards (exactly 7)

### AW-008A — Payload authority + canonical contracts (contract architect/coder)
- **Owns:** payload contract doc and all contracts source/generated/test files except `packages/contracts/package.json`. **Depends:** F0 + D1.
- Freeze seven payloads; obtain focused xhigh payload review; write property/negative/artifact tests first; implement exports and generated parity.

### AW-008B — DDL + role foundation (PostgreSQL specialist)
- **Owns:** DB tsconfig/vitest, `src/schema/**`, schema unit test, `scripts/postgres/init-roles.sh`, necessary index exports; not `packages/db/package.json`. **Depends:** F0 + D2/D5/D6.
- Write exact-name/null/default/FK/index/role tests; implement six tables and role bootstrap; no product writes.

### AW-008C — Migration runner/integrity (migration specialist)
- **Owns:** Drizzle config/artifacts, migration config/env/runner/integrity, `test/migration.spec.ts`, and the two literal failing-fixture files. **Depends:** B/D4.
- Write injected unit/seam tests for lock, hash, path and cleanup before implementation; D owns all real-PostgreSQL assertions.

### AW-008D — Testcontainers integration (test specialist)
- **Owns:** `packages/db/test/support/postgres.ts` and all integration specs. **Depends:** B/C + dependency approval.
- Use locked image, fresh DB/schema, generated roles, resource evidence and explicit cleanup; prove constraints/grants/migration failure modes.

### AW-008E — Compose/runtime migration role (container/operations specialist)
- **Owns:** Dockerfile, Compose, container smoke. **Depends:** D completed and merged.
- Add migration artifacts/service and role-separated URLs; run cold volume, seven service states, ledger/hash/grant/runtime-DDL denial and teardown.

### AW-008F — Workspace/PR integration (build/CI/boundary specialist)
- **Owns exclusively:** root and both package manifests, lockfile, `pnpm-workspace.yaml`, turbo/dependency rules/tree checker, `.gitignore`, `.github/workflows/ci.yml`.
- **F0 dependency bootstrap (before A/B):** install only the three user-approved exact dev pins, deny the three reviewed transitive lifecycle scripts, add all frozen package/root script bodies, generate one lockfile, and prove CI-mode frozen install. No other card edits manifests/lock/workspace policy.
- **F1 final integration (after E):** reconcile the same owner-controlled lock without new dependencies, enforce AW-008 tree/boundaries and immutable action SHAs, then run frozen/uncached local+PR gates.

### AW-008G — Evidence handoff (independent verifier)
- **Owns:** no implementation file. **Depends:** merged F.
- Re-run §11; route failures to owning card. Parent then commissions separate spec and quality/security reviews before commit.

**Merge order:** `F0 → A ∥ B → C → D → E → F1 → G`. No D/E parallel closure. Package/lock conflicts go only to F.

## 13. Closure reviewer checklist

- D1 exact symbols, Actor shape, seven-event production union, payload authority and JSON/OpenAPI parity.
- D2 complete epoch DDL plus explicit no-write sequence fence; no AW-010 tables/behavior.
- D3 policy-required Testcontainers, fresh DB/schema, Reaper/stale cleanup and recorded resources.
- D4 advisory lock, ledger-bootstrap boundary, transactional pending SQL+ledger, hash drift and compiled path.
- Every DDL name/null/default/check/FK/index and tenant-leading access path; runtime DDL denial.
- Exact script bodies, 19-script transition, pinned PR workflow and non-overlapping cards in serial D→E order.
- No implementation or dependency installation before plan/dependency approval.

Status: PROPOSED — no implementation before xhigh approval