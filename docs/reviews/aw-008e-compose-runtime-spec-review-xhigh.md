# AW-008E Compose/Runtime Specification Review — xhigh

## Scope and authority

- Reviewed HEAD `e84bae5c1425bf226736889ab821bcdc70ca1f6b` plus exactly three pre-review tracked diffs: `Dockerfile`, `docker-compose.yml`, and `scripts/container-smoke.sh`.
- Authority: approved `docs/plans/aw-008-contracts-db-foundation.md` §§8–13 and AW-008E (`:225-227`). HEAD contains merged AW-008D; E owns only Dockerfile, Compose, and container smoke. F/F1 retains CI, upload, `.gitignore`, manifests, lockfile, and workspace policy.
- Specification review only. No implementation, prior review, config, manifest, lock, environment, source, or commit was edited; this report is the sole reviewer-owned path.

## Exact requirement matrix

| Requirement | Exact determination | Result |
|---|---|---|
| Change and dependency fence | The pre-review status was exactly the three E-owned tracked paths; HEAD is the merged D commit and no F/F1 path changed | PASS |
| Runtime migration payload | `Dockerfile:47-55` installs production dependencies, copies compiled DB output plus the Drizzle directory; smoke `:319-365` requires the compiled runner/support, exact three frozen Drizzle files, root ownership, non-writability, exclusions, and absent toolchains | PASS |
| Runtime identity/image | `Dockerfile:38-60` prunes package managers, creates UID/GID 10001, retains root-owned copies, switches non-root, and uses Tini; all five app roles share the same image | PASS |
| Exact topology and pins | Compose has exactly `postgres,rustfs,storage-init,db-migrate,api,worker,web`; PostgreSQL and RustFS use the approved immutable digests | PASS |
| Cold role bootstrap | `docker-compose.yml:34-48` interpolates distinct owner/migrator/runtime identities and mounts the authoritative init script read-only for cold-volume initialization | PASS |
| Migrator isolation/order | `db-migrate` receives only `MIGRATION_DATABASE_URL` plus `local-compose`, is a hardened non-restarting one-shot, and waits for healthy PostgreSQL | PASS |
| Runtime isolation/order | API/worker receive only the runtime DB URL, no owner/migrator material, and wait for successful migration and storage initialization | PASS |
| Storage parser boundary | `storage-init` receives S3 configuration and exactly `postgresql://unused.invalid/unused`; no database-role identity or password is present | PASS |
| Web isolation and ports | Web receives neither DB nor S3 keys; all six published ports are loopback-bound and independently interpolated, and dependency conditions are explicit | PASS |
| Application-role hardening | The five app roles resolve to UID/GID 10001, read-only root, bounded hardened `/tmp`, `cap_drop: ALL`, no-new-privileges, and non-privileged mode; smoke inspects every role | PASS |
| Stateful-service hardening | PostgreSQL and RustFS resolve with no capability drop and no no-new-privileges, while §9's hardening clause is not limited to application roles | **FAIL (M1)** |
| Smoke topology/runtime | `container-smoke.sh:9-105` validates config, exact service names, five healthy long-running states, two successful one-shots, dynamic published ports, and all five HTTP contracts | PASS |
| Smoke segregation/artifacts | `:107-365` validates exact environment keysets and role-specific URLs without printing values, all five app HostConfigs, same image identity, artifacts, exclusions, ownership, and toolchain absence | PASS |
| Ledger/catalog proof | `:367-519` requires exactly one frozen-hash ledger row, exact six tables, owner/migrator ownership, constrained role flags, exact runtime DML grants, and no runtime ledger access | PASS |
| Runtime behavior | `:521-633` performs real CRUD across all six tables, rolls back, proves runtime DDL denial, and proves no forbidden-table residue | PASS |
| Parent lifecycle proof | Supplied run used a unique project, generated high-entropy role/storage values, and random host ports; cold `up -d --build --wait`, smoke, forced migration recreation, second smoke with ledger still one, `down -v`, and zero project containers/networks/volumes all passed | PASS |
| Static gates | `scripts/compose.sh config --quiet`, `bash -n scripts/container-smoke.sh`, and `git diff --check` passed; effective config independently confirmed exact seven services and the stated segregation | PASS |

## Severity-classified gap and concrete fix

| ID | Severity | Location | Gap | Required fix |
|---|---|---|---|---|
| M1 | MAJOR | `docker-compose.yml:32-70`; `scripts/container-smoke.sh:278-310` | The two stateful services omit both feasible §9 controls, and smoke limits HostConfig assertions to the five app roles. Writable state volumes justify not requiring read-only roots, but do not justify retaining default capabilities or permitting privilege gain. | Run PostgreSQL explicitly as `postgres` and RustFS as its existing `rustfs` user; apply `cap_drop: [ALL]` and `security_opt: [no-new-privileges:true]` to both; keep their named data mounts writable. Extend smoke to assert effective non-root identity, all-capability drop, no-new-privileges, and non-privileged mode for both services, then rerun the full cold/two-smoke/teardown proof. |
| — | CRITICAL | — | None | None |
| — | MINOR | — | None | None |

## Feasibility and disposition

- Disposable cold-volume trials against both exact digests passed with `cap_drop: ALL` and no-new-privileges. PostgreSQL also passed as explicit user `postgres`, ran the mounted role initializer, became ready, and created both child roles; RustFS became live as image user `rustfs`. Trial containers and volumes were removed.
- No read-only-root change is requested for either writable stateful image, and no CI/upload/ignore/manifests/lock work belongs in E.
- All other AW-008E requirements are exact. M1 is a direct, feasible §9 acceptance mismatch and blocks closure.

Verdict: REQUEST_CHANGES
