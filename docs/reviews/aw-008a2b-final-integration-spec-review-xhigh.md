# AW-008A2b Final Integration Spec Review — xhigh

## Scope and authority

- Reviewed `2c3515d` plus exactly seven A2b2 paths: `packages/contracts/src/artifacts.ts`, `src/index.ts`, `test/artifacts.spec.ts`, `vitest.config.ts`, `scripts/generate-artifacts.ts`, `generated/sync-v1.schema.json`, and `generated/openapi-sync-v1.json` (all paths after the first are under `packages/contracts/`).
- No manifest, lockfile, plan, board, DB, or other implementation path is in the A2b2 change set.
- Controlling authority is the approved artifact decision (`docs/reviews/aw-008a2b-snapshot-artifact-decision-xhigh.md:22-58`), the exact manifest/gates (`docs/plans/aw-008-contracts-db-foundation.md:90-103,170-204`), and normative Sync v1 (`docs/contracts/sync-contract-v1.md:28-35,375-418`).

## Exact verification matrix

| Surface | Exact recovered/current evidence | Result |
|---|---|---|
| Changed-path fence | Seven intended paths; no manifest/lock/plan/board path | PASS |
| Root exports | Exactly 35 runtime exports, including all approved primitive/event/sync symbols and the three public artifact exports | PASS |
| Package unit suite | `pnpm test:unit`: 3 files, 184 tests | PASS |
| Artifact suite/check | `pnpm contracts:check`: both files `ok`; 1 file, 59 tests | PASS |
| Default package suite | `pnpm exec vitest run`: 4 files, 243 tests; no skip/todo/only markers | PASS |
| Static gates | Package typecheck and lint exit 0; `git diff --check` clean | PASS |
| Formatting | Prettier check passes all seven paths; core/full schema and OpenAPI renderings are byte-equal to Prettier output | PASS |
| Committed bytes | Schema SHA-256 `5660df23f0b6957d929fef9848e3707e942ab20f8b00d526df841142dcea7882`; OpenAPI SHA-256 `2440117a06ecea804b2fd8ad5c8a1b13967096300d3b86eeec48b274ac335f4f` | PASS |
| Schema/OpenAPI structure | 34 `$defs`, 13 production roots, core scope/blocked snapshot metadata, no core snapshot, all refs resolve, no secret/time/absolute-path residue | PASS |
| CLI check failures | Baseline rc0/no write; both drift and both missing accumulate then rc1/no write; invalid args rc2/no write | PASS |
| CLI generation | From repository root: rc0, exactly two files, repeat-identical bytes, no stage/backup residue | PASS |
| Redocly minimal lint | Exit 0, but three warnings: absent servers plus `operation-security-defined` and `security-defined` | BLOCKED by finding H1 |

## Findings

### H1 — The published sync operations omit normative session security

- Normative Sync v1 requires every delta to be authenticated and independently authorized (`sync-contract-v1.md:33-35`) and requires its `Authorization` header to carry a session credential (`:393-400`). Snapshot has the same requirement (`:377-384`).
- The generated delta GET at `packages/contracts/generated/openapi-sync-v1.json:136-198` has no `security`; its `components` at `:2-129` has no `securitySchemes`. The 401/403 responses at `:185-190` describe failures but do not declare how a client authenticates.
- The source confirms the omission: `deltaOperation()` at `packages/contracts/src/artifacts.ts:1078-1119` and `snapshotOperation()` at `:1057-1075` have no `security`; `buildSyncOpenApiV1()` components at `:1156-1171` have no `securitySchemes`.
- Therefore `operation-security-defined` is a concrete contract/security defect, not cosmetic. The `security-defined` warning is the same root cause, not an unused-scheme exception: no scheme exists to use.
- Exact fix: at `src/artifacts.ts:1156-1171`, add a named scheme that faithfully models the currently authorized syntax, e.g. `SessionAuth: { type: "apiKey", in: "header", name: "Authorization" }`; do not invent `http/bearer` unless authority separately freezes a Bearer credential format. Add `security: [{ SessionAuth: [] }]` to both GET objects at `:1059-1074` and `:1080-1118`.
- At `test/artifacts.spec.ts:409-440`, assert the core delta scheme and exact operation requirement; at `:478-512`, assert the full snapshot requirement too. Regenerate `generated/openapi-sync-v1.json` and rerun the existing byte/ref/Redocly gates.

### Redocly `no-empty-servers` — non-finding

- OpenAPI 3.1 permits an omitted root `servers` array (relative `/` default), and no authority freezes a deployment host. This committed package contract is intentionally environment-neutral.
- No required change. If a warning-zero policy is later imposed, add only environment-neutral `servers: [{ url: "/" }]` near `src/artifacts.ts:1138-1155` plus an exact test; do not publish a guessed host.

## Decision

All artifact, export, deterministic-byte, and CLI acceptance evidence passes, but the generated API currently advertises an unauthenticated delta despite normative session authorization. A2b2 cannot proceed unchanged to quality/security review.

Verdict: REQUEST_CHANGES