# AW-007 Final Code-Quality and Security Closure (xhigh)

## Scope and evidence

- Independently reviewed the prior timed-out transcript and current API, worker, config, DB, tests, Dockerfile, Compose, and shell scripts.
- Re-ran `TURBO_FORCE=true pnpm run ci`; all checks passed uncached, including 19/19 semantic tests, boundary rejection, exact-tree check, and production builds.
- Read-only checks passed: `git diff --check`, Bash syntax, Compose config validation, six-service resolution, and final-image metadata inspection.
- Accepted the parent's clean-volume Compose/runtime/scan evidence rather than rerunning Compose: six intended service outcomes, smoke PASS, teardown 0, root-owned mode-0644 app files, fixed UID/GID 10001, image `sha256:28fc25c5442f0fdf979d9eb2734859d015beade4187104d1d0479f9d22dd51d7` (100,797,738 bytes), Trivy Critical 0, Gitleaks 0, and parseable CycloneDX 1.7 with 3,538 components.
- Local credentials remain synthetic test defaults and are intentionally represented here only as `[REDACTED]`; RustFS rc.3 remains local-only.

## Severity classification

- BLOCKER: none.
- HIGH: none.
- MEDIUM: none.
- LOW-1 — Production transport policy remains scope-limited. `packages/config/src/env.ts:17-25,98-109` rejects malformed URLs and documented local defaults but still permits cleartext HTTP/PostgreSQL transports with non-default production values. AW-007 explicitly defers product policy (`docs/plans/aw-007-scaffold-manifest.md:271-273`) and Compose is loopback/local-only, so this is not an AW-007 release blocker; enforce TLS/proxy/identity policy before production enablement.
- LOW-2 — `scripts/container-smoke.sh:43-76` executes image immutability checks and HostConfig hardening assertions through the API container only. The shared image and current resolved Compose config make this valid now, and independent config inspection confirmed `read_only`, `/tmp` tmpfs, `cap_drop: ALL`, no-new-privileges, and non-privileged mode for storage-init/API/worker/web. Iterating all four roles would better prevent a future per-role override regression.
- LOW-3 — Startup-failure and signal-driven cleanup are implemented but not directly unit-tested because bootstrap wiring is not injectable/exported. Current code inspection verifies idempotent signal shutdown and cleanup on listen failure (`apps/api/src/main.ts:40-74`; `apps/worker/src/main.ts:52-84`). Add focused lifecycle tests when bootstrap composition is refactored by a later card.

## Prior potential MEDIUM closure

1. **RESOLVED — readiness could hang.** API and worker race all probes against a cleared 2-second timer (`health.service.ts:5-28`; `health-server.ts:19-36`); S3 probes additionally receive 1.5-second abort signals (`apps/api/src/main.ts:12,27-38`; `apps/worker/src/main.ts:8,40-51`), and DB connect/query/statement timeouts are 1.5 seconds (`packages/db/src/index.ts:4-15`). API and worker hanging-probe tests assert bounded minimal 503 responses (`apps/api/test/health.spec.ts:39-46`; `apps/worker/test/health.spec.ts:71-78`) and passed.
2. **RESOLVED — storage initialization did not bound a hanging sender.** `sendBeforeDeadline` races each SDK send against the shared deadline, passes an AbortSignal, aborts on expiry, and clears its timer (`apps/worker/src/storage-init.ts:72-99`). The hanging-send test verifies both bounded rejection and observed abort (`apps/worker/test/storage-init.spec.ts:106-122`) and passed.
3. **RESOLVED — clean/quarantine bucket aliasing.** Cross-field validation rejects equal names (`packages/config/src/env.ts:35-60`); the exact negative test (`packages/config/test/env.spec.ts:61-68`) passed.
4. **RESOLVED — runtime UID could write app files.** Runtime copies now remain root-owned before switching to UID/GID 10001 (`Dockerfile:46-56`); Compose adds a read-only root and least-privilege controls (`docker-compose.yml:19-27`), smoke enforces representative app files as non-writable (`scripts/container-smoke.sh:43-67`), and parent final-image/runtime evidence confirms root-owned 0644 files.

## Focused quality/security assessment

- Resource lifecycle is closed on startup failure and one-shot/idempotent SIGINT/SIGTERM shutdown; API/worker close listeners, destroy S3 clients, and end DB pools. Storage-init destroys its client in `finally` (`storage-init.ts:182-209`).
- Readiness failure bodies and liveness bodies are one-field contracts; probe exceptions are swallowed at the boundary. Startup/shutdown/storage-init top-level logs are generic and do not disclose endpoints, credentials, dependency errors, stacks, or versions.
- Compose exposes every host port on loopback, pins stateful images by digest, builds one app role only, and applies one immutable non-root app image to all roles. Resolved config confirmed the hardening anchor on every app role.
- Docker runtime excludes source/test/docs/VCS/local-env and package-manager tools; Tini is the sole init strategy. Parent pruning, ownership, vulnerability, secret-scan, and SBOM evidence is consistent with the current final image identity.
- Shell gates use `set -euo pipefail`, bounded fetches, exact minimal response assertions, service-health and one-shot-exit checks, runtime exclusions, non-writability, and HostConfig checks. ShellCheck was unavailable locally; Bash parsing passed and the parent smoke execution passed.
- No unresolved correctness, disclosure, privilege, timeout, abort, lifecycle, or supply-chain issue reaches MEDIUM severity.

## Authorization

APPROVED authorizes AW-007 completion and commit with the LOW residuals tracked for later hardening.

Verdict: APPROVED
