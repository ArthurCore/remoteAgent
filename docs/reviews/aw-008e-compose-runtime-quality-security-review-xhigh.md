# AW-008E Compose/Runtime Quality & Security Review — xhigh

## Scope

- Reviewed HEAD `e84bae5c1425bf226736889ab821bcdc70ca1f6b` plus the E-owned changes in `Dockerfile`, `docker-compose.yml`, and `scripts/container-smoke.sh`.
- Consulted the approved AW-008 plan and E specification review/closure; this is an independent quality/security assessment, not a specification re-review.
- The prior stateful-hardening M1 is closed: Compose and smoke now enforce exact image users, `cap_drop: ALL`, no-new-privileges, and non-privileged mode for PostgreSQL and RustFS.

## Verified strengths

- `Dockerfile:2,33-60` pins both Node stages by digest, separates build/production dependencies, removes package-manager/toolchain entry points, keeps runtime payload root-owned, runs as `10001:10001`, and uses Tini.
- The live image probe passed exact user `10001:10001`, entrypoint `["/usr/bin/tini","--"]`, Node command, required migration payload, root ownership/non-writability, and absent package managers/development toolchains.
- Compose defines the exact seven services, digest-pins stateful images, loopback-binds published ports, separates owner/migrator/runtime credentials, gives DB material only to the required roles, and hardens all containers without making state volumes read-only.
- `container-smoke.sh` checks exact topology/states, endpoint bodies, one-shot behavior, effective HostConfig, one-image identity, payload exclusions, the migration hash/ledger, catalog ownership/grants, runtime CRUD, DDL denial, and residue absence without printing credentials.
- Two supplied real lifecycle proofs using generated component-safe hex values passed cold and repeat smoke; forced migration recreation retained one ledger row and teardown left zero project resources.
- Reproduced static gates: Compose config validation, Bash syntax, and `git diff --check` all passed.

## Redaction artifacts and credential boundary

- Asterisks shown inside rendered database URLs in earlier Hermes tool output are redaction artifacts, not source literals. The earlier `safe_roundtrip=FAIL` parsed already-redacted Compose JSON, so it is invalid evidence and is excluded from findings.
- A fresh non-redacted in-process probe passed alphanumeric and base64url (`Abc_123-xyz`) password round trips. A reserved-character password failed; `bad@role` round-tripped as a URL component but was rejected by the authoritative cold-init identifier grammar.
- This is an accepted boundary, not arbitrary-credential support: approved E proof requires generated safe identifiers and high-entropy base64url passwords, defaults are component-safe, and credential/customer paths are out of AW-008 scope.
- No separate severity is assigned to percent-encoding. After Q2, smoke must continue to validate the effective generated grammar/base64url boundary and fail closed without echoing values; documentation for general operator-supplied credentials is not an E approval gate.

## Severity ledger

| ID | Severity | Location | Finding | Required fix and proof |
|---|---|---|---|---|
| Q1 | **MAJOR** | `docker-compose.yml:20-29,82-110,136-166` | The shared app image is built only by `api`; the other four app roles declare that image without a build or no-pull policy. With a unique absent `APP_IMAGE`, `up --build --wait --dry-run` attempted four registry pulls/authentications and had not reached the eventual build path when the 180-second probe timed out. Local cold-image startup is therefore network/registry-dependent and creates unpinned registry-resolution ambiguity before the intended local build. | Prevent every shared-role pull while preserving one API build. Prefer `pull_policy: never` on `x-app-service` if an absent-image probe proves Compose builds API first; otherwise use another exact Compose mechanism. Remove a unique local tag, run real `up -d --build --wait`, prove zero pulls, exactly one build path, identical image IDs for all five roles, both smokes, and zero teardown residue. |
| Q2 | **MINOR** | `scripts/container-smoke.sh:192-216` | URL expectations come from the smoke process environment/defaults, while Compose also loads unexported `.env` values. A valid lifecycle created from custom safe `.env` credentials can therefore fail smoke against defaults. This is test-oracle drift, not a privilege bypass. | Derive expected DB/role/password values from effective inspected/container configuration without printing them, then compare role URLs and segregation. With host variables unset, prove custom safe `.env` values pass; prove a deliberately misrouted role fails; repeat base64url-pass and reserved-password/invalid-identifier fail-closed probes with no secret output. |
| — | CRITICAL | — | None. | — |

## Disposition

- Q1 is deterministic, reproduced, security-relevant supply-chain ambiguity and independently blocks approval despite successful warm/local-image lifecycle evidence.
- Q2 does not weaken runtime grants, but the smoke must be authoritative for every supported Compose input path.
- No other material quality, secret-handling, least-privilege, runtime-image, migration, or teardown issue was found in E scope.

Verdict: REQUEST_CHANGES
