# AW-008E Compose/Runtime Specification Closure — xhigh

## Scope and authority

- Closure review only for M1 in `docs/reviews/aw-008e-compose-runtime-spec-review-xhigh.md`, against HEAD `e84bae5c1425bf226736889ab821bcdc70ca1f6b` plus the current E-owned correction.
- The approved plan §§8–13 and AW-008E remain authoritative. This closure neither reopens prior passing determinations nor expands E into F/F1-owned CI, upload, ignore, manifest, lockfile, or workspace policy.
- No implementation, prior review, config, manifest, lockfile, source outside the review target, or commit was edited by this closure review.

## M1 closure determination

| ID | Prior severity | Determination | Result |
|---|---|---|---|
| M1 | MAJOR | Both exact stateful images now run as their image users with all capabilities dropped and privilege gain disabled; smoke proves the effective settings, and writable state is preserved. | **RESOLVED** |

## Exact correction evidence

- PostgreSQL remains pinned to `postgres:17.11-bookworm@sha256:84560e3b9c6874893fc4e2854f5dc3e7c1a37bc9d1dfd7a8c641310ae22ba5ad`; `docker-compose.yml:32-38` now sets exact `user: postgres`, `cap_drop: [ALL]`, and `security_opt: [no-new-privileges:true]`.
- `docker-compose.yml:49-51` keeps `postgres-data:/var/lib/postgresql/data` writable; only the initializer bind is read-only. No stateful `read_only` root policy was introduced.
- RustFS remains pinned to `rustfs/rustfs:1.0.0-rc.3@sha256:800cf3f352a0a27e3275ca854a51f0027975d7acc7a0d52089a35bcc9fcbf0b5`; `docker-compose.yml:59-65` now sets exact `user: rustfs` and the same capability/privilege-gain controls.
- `docker-compose.yml:73-74` keeps `rustfs-data:/data` writable and likewise adds no stateful `read_only` setting.
- `scripts/container-smoke.sh:312-338` inspects `.Config.User`, `.HostConfig.CapDrop`, `.HostConfig.SecurityOpt`, and `.HostConfig.Privileged` for both services; it requires exact users `postgres`/`rustfs`, `ALL`, `no-new-privileges:true`, and `false` privileged mode.
- Effective Compose inspection reproduced both exact users, `CapDrop=ALL`, and `SecurityOpt=no-new-privileges:true`; both named data mounts remained writable and neither service resolved to a read-only root.

## Runtime and regression evidence

- Parent reran a full cold lifecycle under a unique generated project with high-entropy role/storage values and random host ports: cold `up -d --build --wait` completed, PostgreSQL and RustFS were healthy, the PostgreSQL role initializer succeeded, `db-migrate` and `storage-init` exited successfully, and smoke passed.
- The cold PostgreSQL initializer ran successfully as OS user `postgres`, created the owner/migrator/runtime role split, and supported migration/catalog checks without root or any retained capability. RustFS became healthy as exact image user `rustfs`, and `storage-init` succeeded against it with the stateful controls active. Thus no required capability was lost.
- Forced `db-migrate` recreation completed; the second smoke passed and the migration ledger remained exactly one row.
- `down -v` completed, followed by exact zero project containers, networks, and volumes.
- Reproduced static gates: `scripts/compose.sh config --quiet`, `bash -n scripts/container-smoke.sh`, and `git diff --check` all passed.
- Inspection found the correction confined to M1's feasible controls and their effective-runtime assertions; the prior review's passing topology, role segregation, artifacts, ledger/catalog, CRUD/DDL-denial, lifecycle, and writable-state determinations remain satisfied.

Remaining severity: **CRITICAL none; MAJOR none; MINOR none.**

Verdict: PASS
