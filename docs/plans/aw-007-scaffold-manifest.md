# AW-007 — Frozen Scaffold Manifest

- **Status:** Normative and implementation-blocking
- **Card:** AW-007
- **Reasoning baseline:** xhigh
- **Purpose:** Freeze the exact repository scaffold before coding begins
- **Supersedes:** Any older AW-007 package, Compose, script, or `pnpm ci` list

## 1. Scope

AW-007 creates a real, buildable, testable monorepo skeleton. It does not implement identity, tenancy, messaging, synchronization, database domain schemas, or release tests owned by later cards.

No passing no-op command, empty test runner, ignored failure, or placeholder script may impersonate a future gate. A command is added only when its owning card provides real assertions.

Normative domain references:

- `docs/contracts/sync-contract-v1.md`
- `docs/contracts/chat-projection-semantics-v1.md`
- `docs/quality/release-profile-registry.md`
- `docs/product/chat-ux-gate-registry.md`
- `docs/security/source-and-provenance-policy.md`

## 2. Toolchain pins

The lockfile is authoritative. Root `package.json` pins exact direct versions rather than ranges.

| Tool/package | Frozen version |
|---|---:|
| Node.js | `24.15.0` |
| pnpm | `11.23.0` |
| Turborepo | `2.10.11` |
| TypeScript | `5.9.3` |
| ESLint | `9.39.5` |
| typescript-eslint parser/plugin | `8.67.0` |
| Prettier | `3.9.6` |
| Next.js | `16.3.2` |
| React / React DOM | `19.2.8` |
| `@types/react` | `19.2.18` |
| `@types/react-dom` | `19.2.5` |
| `@types/node` | `24.13.3` |
| NestJS common/core/platform-fastify | `11.2.1` |
| Fastify | `5.12.1` |
| Socket.IO / client | `4.8.3` |
| PostgreSQL driver `pg` | `8.23.0` |
| `@types/pg` | `8.23.1` |
| Zod | `4.4.3` |
| Drizzle ORM / Kit | `0.45.2` / `0.31.10` |
| Vitest / coverage-v8 | `4.1.11` |
| `tsx` | `4.23.12` |
| dependency-cruiser | `18.2.0` |

Container images verified on the current arm64 Docker runtime:

- `node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d`
- `postgres:17.11-bookworm@sha256:84560e3b9c6874893fc4e2854f5dc3e7c1a37bc9d1dfd7a8c641310ae22ba5ad`
- `rustfs/rustfs:1.0.0-rc.3@sha256:800cf3f352a0a27e3275ca854a51f0027975d7acc7a0d52089a35bcc9fcbf0b5`

MinIO Community is not used: its upstream repository is archived and cannot be the new-project development baseline. RustFS `1.0.0-rc.3` is a pre-release used only as the local S3-compatible test implementation; it is not approved for production. Production remains a managed S3-compatible service selected by `M1-OPS` procurement. Digests are also recorded in `docs/operations/container-image-lock.md`; tags alone are not release evidence.

## 3. Exact repository tree

AW-007 creates exactly this implementation surface in addition to existing documentation:

```text
.
├── .dockerignore
├── .editorconfig
├── .env.example
├── .gitignore
├── .node-version
├── .nvmrc
├── .prettierignore
├── Dockerfile
├── docker-compose.yml
├── eslint.config.mjs
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── prettier.config.mjs
├── tsconfig.base.json
├── turbo.json
├── apps
│   ├── api
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── src
│   │   │   ├── app.module.ts
│   │   │   ├── main.ts
│   │   │   └── platform
│   │   │       ├── health.controller.ts
│   │   │       └── health.service.ts
│   │   └── test
│   │       └── health.spec.ts
│   ├── web
│   │   ├── next-env.d.ts
│   │   ├── next.config.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── app
│   │   │   ├── api/health/route.ts
│   │   │   ├── globals.css
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   └── test
│   │       └── health.spec.ts
│   └── worker
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── src
│       │   ├── health-server.ts
│       │   └── main.ts
│       └── test
│           └── health.spec.ts
├── packages
│   ├── chat-core
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── config
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/env.ts
│   │   └── test/env.spec.ts
│   ├── contracts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── db
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── ui
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   └── test-config
│       ├── package.json
│       └── src/vitest.ts
├── scripts
│   ├── assert-aw007-tree.mjs
│   ├── compose.sh
│   ├── container-smoke.sh
│   └── wait-for-url.mjs
└── docs/operations/container-image-lock.md
```

`packages/*/src/index.ts` establishes a package boundary and contains only truthful exports used by the scaffold. It must not claim to implement contracts, repositories, migrations, UI components, or domain behavior. Empty passing tests are forbidden.

## 4. Package and module boundaries

Workspace package names:

```text
@agent-workspace/api
@agent-workspace/web
@agent-workspace/worker
@agent-workspace/chat-core
@agent-workspace/config
@agent-workspace/contracts
@agent-workspace/db
@agent-workspace/ui
@agent-workspace/test-config
```

AW-007 dependencies:

- apps may import public package entry points;
- `chat-core` may import only `contracts` and `config` types approved by the boundary rule;
- `contracts` may import only Zod;
- `db` may import config, `pg`, and Drizzle, but AW-007 creates no domain table or migration;
- `ui` may import React but not server packages;
- no package imports another package's `src/**`, ORM table file, private path, or app;
- `apps/web` never imports `db` or server-only config;
- future vendor-Agent SDK imports are forbidden in AW-007.

`dependency-cruiser` includes at least one intentionally invalid fixture under its own test fixture directory and the real boundary command must prove the fixture is rejected. The invalid fixture is not compiled into product output.

## 5. Root script namespace

AW-007 root `package.json` contains only commands with real implementation and assertions:

```json
{
  "scripts": {
    "dev": "turbo run dev --parallel",
    "build": "turbo run build",
    "clean": "turbo run clean",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "boundaries:check": "depcruise --config .dependency-cruiser.cjs apps packages && node scripts/assert-boundary-fixture.mjs",
    "test:unit": "turbo run test:unit",
    "scaffold:check": "node scripts/assert-aw007-tree.mjs",
    "compose:up": "scripts/compose.sh up -d --build --wait",
    "compose:down": "scripts/compose.sh down --remove-orphans",
    "compose:reset": "scripts/compose.sh down --volumes --remove-orphans",
    "container:smoke": "scripts/container-smoke.sh",
    "ci": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm boundaries:check && pnpm test:unit && pnpm scaffold:check && pnpm build"
  }
}
```

The tree above also requires `scripts/assert-boundary-fixture.mjs` and `.dependency-cruiser.cjs`; these are included in the scaffold even though omitted from the condensed tree diagram and are checked by `assert-aw007-tree.mjs`.

AW-007 `pnpm ci` does **not** invoke:

- `contracts:check`
- `test:integration`
- `test:isolation`
- `test:correctness`
- `test:reliability`
- `test:e2e`
- `test:a11y`
- `test:load`
- `test:restore`
- `test:quality-gate`
- DB migration commands

Those scripts must not exist as green placeholders.

## 6. Card-to-script ownership

| Script/capability | First owning card | Becomes mandatory when |
|---|---|---|
| `format:check`, `lint`, `typecheck`, `boundaries:check`, `test:unit`, `scaffold:check`, `build`, AW-007 `ci` | AW-007 | AW-007 implementation |
| `contracts:check`, generated JSON Schema/OpenAPI conformance | AW-008 | Contract implementation lands |
| `db:migrate`, `db:migrate:check`, `db:migrate:test-empty`, `db:schema:assert-clean`, `test:integration` | AW-008 | First schema/migration lands |
| `test:isolation`, tenant/workspace/channel browser/API smoke | AW-009 | Identity/tenancy/channel vertical slice lands |
| `test:correctness`, message/outbox/idempotency model | AW-010 | Durable messaging lands |
| `test:reliability`, `test:ws-resume` | AW-011 | Realtime sync lands |
| `test:e2e`, `test:a11y`, `test:load`, `test:restore`, `test:quality-gate` | AW-012 | Integrated M1 candidate and evidence harness land |
| `test:rolling-deploy` | Later HA profile, not M1 | Multi-instance topology is separately approved |
| `test:agent*` | M2 Agent cards | Single-Agent implementation lands after all M1 entry gates |

When a later script lands, the owning card also updates `pnpm ci` or the release aggregator only if that script belongs to the appropriate PR/merge/release lane. Missing future scripts remain `NOT_RUN`; no-op placeholders are invalid evidence.

## 7. Environment contract

`.env.example` contains non-secret local defaults and comments only:

```text
APP_ENV=development
APP_VERSION=dev
API_PORT=3001
WORKER_HEALTH_PORT=3002
WEB_PORT=3000
PUBLIC_BASE_URL=http://localhost:3000
DATABASE_URL=postgresql://agent_workspace:local_only_change_me@postgres:5432/agent_workspace
S3_ENDPOINT=http://rustfs:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=agentworkspace-local
S3_SECRET_KEY=local-only-development-secret
S3_FORCE_PATH_STYLE=true
S3_QUARANTINE_BUCKET=chat-quarantine
S3_CLEAN_BUCKET=chat-clean
```

These are synthetic local credentials. Production rejects them. `.env.local`, private overrides, credentials, and customer material are ignored by Git and Docker build context.

The config package validates environment at process startup. AW-007 validates required values and development/production mode constraints but does not implement product policy.

## 8. Compose contract

`scripts/compose.sh` is the only repository command that directly selects Compose:

```bash
#!/usr/bin/env bash
set -euo pipefail
if docker compose version >/dev/null 2>&1; then
  exec docker compose "$@"
elif command -v docker-compose >/dev/null 2>&1; then
  exec docker-compose "$@"
else
  echo "Docker Compose v2 is required" >&2
  exit 127
fi
```

`docker-compose.yml` defines:

| Service | Image/command | Required behavior |
|---|---|---|
| `postgres` | `postgres:17.11-bookworm` | named volume; `pg_isready`; loopback-exposed dev port only |
| `rustfs` | `rustfs/rustfs:v1.0.0` | S3-compatible local storage; named volume; dev ports 9000/9001 |
| `storage-init` | AW-007 runtime image | idempotently waits for S3 and creates quarantine/clean buckets via AWS SDK; exits 0 only when both are visible |
| `api` | AW-007 image, API role | `/health/live` and `/health/ready`; port 3001 |
| `worker` | same image, worker role | `/health/live` and `/health/ready`; internal port 3002 |
| `web` | same image, web role | `/api/health`; port 3000 |

All app roles use the same multi-stage Dockerfile and non-root runtime user. Health checks contain no secrets or tenant data.

Health semantics:

- `/health/live`: process/event loop is alive; it does not fail solely because a dependency is temporarily unavailable.
- `/health/ready`: startup config is valid and required dependencies for new work are reachable.
- Web `/api/health`: web server readiness only; it does not proxy private API diagnostics.

`storage-init` is a real script, not a sleep-only placeholder. It retries with a bounded deadline and uses `HeadBucket/CreateBucket` against the configured endpoint. Bucket initialization failure keeps app readiness false.

## 9. Dockerfile contract

One multi-stage Dockerfile provides targets or role commands for web, API, and worker. Requirements:

- base `node:24.15.0-bookworm-slim`;
- Corepack with `pnpm@11.23.0`;
- frozen lockfile install;
- build stage may contain source and dev dependencies;
- runtime stage contains production output/dependencies only;
- `.git`, documentation research caches, tests, local env files, package-manager cache, customer data, and credentials are absent;
- non-root UID/GID;
- init and signal handling permit graceful shutdown;
- role is selected by command, not separate source copies;
- OCI labels include revision supplied as build argument;
- runtime image passes Trivy and Syft in later release evidence; AW-007 verifies it can be built and run.

## 10. Real AW-007 tests

AW-007 unit tests must assert real scaffold behavior:

- config accepts the documented development environment and rejects missing/malformed required values;
- API liveness is 200 and contains only a stable minimal shape;
- API readiness is false when a required dependency probe fails and true when probes pass;
- worker health server has equivalent semantics;
- web health route is 200;
- boundary checker rejects the invalid fixture and accepts the real graph;
- tree checker rejects a missing required file/package/script;
- no test is skipped or marked todo.

No test may assert only `true`, package identity, or existence without semantic behavior, except `scaffold:check`, whose purpose is exact manifest existence.

## 11. Executable verification

The coder must run all of these and report actual output:

```bash
cd /Users/khkim/Projects/agent-workspace

node --version                         # v24.15.0
corepack pnpm --version                # 11.23.0
pnpm install --frozen-lockfile
pnpm ci

gitleaks detect --no-banner --redact --exit-code 1

scripts/compose.sh up -d --build --wait
scripts/compose.sh ps
curl --fail --silent http://127.0.0.1:3001/health/live
curl --fail --silent http://127.0.0.1:3001/health/ready
curl --fail --silent http://127.0.0.1:3002/health/live
curl --fail --silent http://127.0.0.1:3002/health/ready
curl --fail --silent http://127.0.0.1:3000/api/health
pnpm container:smoke
scripts/compose.sh down --remove-orphans

docker build --build-arg VCS_REF="$(git rev-parse HEAD)" -t agent-workspace:aw-007 .
docker inspect agent-workspace:aw-007 --format '{{.Config.User}}'
trivy image --exit-code 1 --severity CRITICAL --ignore-unfixed agent-workspace:aw-007
syft agent-workspace:aw-007 -o cyclonedx-json > /tmp/agent-workspace-aw007-sbom.json
```

Expected invariants:

- all commands exit 0;
- `git diff --check` is clean;
- `pnpm ci` invokes only AW-007 real checks;
- all six Compose services reach their intended terminal state (`storage-init` successful exit, others healthy/running);
- app health endpoints return 200 and no secret/version/internal stack details;
- runtime user is non-root and non-empty;
- Trivy reports no blocking fixable Critical finding under the current policy;
- SBOM file is non-empty and parseable;
- after Compose down, no project container remains running;
- source tree is clean except intentional AW-007 changes.

If a registry/network outage prevents an image or package fetch, the task is blocked with exact evidence; the worker must not substitute an unverified tag or loosen the frozen lockfile.

## 12. AW-007 completion checklist

- [ ] Exact tree and package names exist.
- [ ] Toolchain and direct dependencies are pinned; `pnpm-lock.yaml` is committed.
- [ ] Root script namespace matches this manifest exactly.
- [ ] `pnpm ci` contains only real AW-007 assertions.
- [ ] Boundary invalid fixture proves enforcement.
- [ ] Compose wrapper works with either plugin or standalone v2.
- [ ] PostgreSQL, RustFS, storage-init, API, worker, and web complete the smoke path.
- [ ] Docker runtime image is non-root and contains no source/secret/local artifacts forbidden above.
- [ ] Gitleaks, Trivy, and Syft checks run with retained summaries.
- [ ] No Shared Mind, product Kanban, Orchestrator, Agent SDK, task model, messaging domain schema, fake contract, or future release test is implemented.
- [ ] Actual command outputs and any blockers are included in the worker completion report.

AW-007 remains blocked until the xhigh integration reviewer approves this manifest together with AW-006A/B/C/E/F and the aligned controlling documents.
