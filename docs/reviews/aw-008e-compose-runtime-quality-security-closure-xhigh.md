# AW-008E Compose/Runtime Quality & Security Closure — xhigh

## Scope

- Closure review only for Q1/Q2 from `aw-008e-compose-runtime-quality-security-review-xhigh.md`, against HEAD `e84bae5c1425bf226736889ab821bcdc70ca1f6b` plus the current E-owned correction.
- This review does not reopen prior passing determinations or expand scope beyond E.
- The accepted credential boundary remains generated safe identifiers plus high-entropy base64url passwords; arbitrary reserved-character credentials remain out of scope.

## Closure ledger

| ID | Prior severity | Determination | Result |
|---|---|---|---|
| Q1 | MAJOR | Every shared app role now inherits an explicit no-pull policy while API remains the sole build owner; absent-image dry-run and real cold lifecycle evidence prove one build, no registry pull, and one resulting image identity. | **RESOLVED** |
| Q2 | MINOR | Smoke now derives its credential oracle from effective container configuration, enforces the accepted grammar without disclosure, accepts unexported custom values, and rejects a misrouted runtime URL generically. | **RESOLVED** |

## Q1 closure evidence

- `docker-compose.yml:20-30` puts `pull_policy: never` on `x-app-service`; all five app roles inherit it, while only `api` retains `build` at `:105-111`.
- With Docker Compose 5.5.0 and an absent unique `APP_IMAGE`, the dry-run operation stream emitted exactly one `Image ... Building` and no `Pulling`, authentication, or registry line.
- Dry-run `--wait` itself stalls on simulated health, so it is not lifecycle-completion evidence; the non-wait raw operation stream establishes the exact planned operations.
- More importantly, a real absent-image `up -d --build --wait` completed with exactly one build marker and no pull marker. Smoke then compared Docker image IDs for API, storage-init, db-migrate, worker, and web (`container-smoke.sh:355-360`) and passed.
- This removes the reproduced registry dependency and unpinned resolution ambiguity without duplicating build definitions.

## Q2 closure evidence

- `container-smoke.sh:107-138` pipes the target container and PostgreSQL container `.Config.Env` JSON directly from `docker inspect` into Node; it no longer reads host PostgreSQL defaults as its oracle.
- `:201-229` derives database, owner, migrator, runtime, and password expectations from the effective PostgreSQL container, requires safe identifier and base64url grammars plus distinct roles, and matches exact role-specific URLs.
- Parsing and comparison output is redirected; failure remains only the generic `<service> environment segregation failed` (`:279-284`), so values are neither printed nor interpolated into diagnostics.
- Full real proof generated safe custom values, performed a cold absent-image start, unset every host `POSTGRES_*` variable, and passed smoke. A temporary overlay recreated a healthy API with the migrator URL; smoke failed exactly `api environment segregation failed` and disclosed no value.
- After restoring the base API, forced migration recreation succeeded; smoke passed with exactly one migration ledger row. `down -v` then left zero project containers, networks, and volumes.
- Boundary probes passed safe alphanumeric/base64url values and failed closed for a reserved-character password and an invalid identifier. The previously accepted component-safe boundary is preserved.

## Regression and remaining severity

- Reproduced static gates passed: Compose configuration validation, `bash -n scripts/container-smoke.sh`, and `git diff --check`.
- Q1/Q2 corrections preserve the prior passing topology, hardening, secret handling, role separation, migration/catalog, runtime CRUD/DDL denial, immutable-image, and teardown determinations.
- Remaining ledger: **CRITICAL none; MAJOR none; MINOR none.**

Verdict: APPROVED
