# AW-009 Bite-Sized Execution Cards

> **For Hermes:** Execute only after AW-010A is merged DONE and this revised plan is independently PASS/APPROVED. Use a fresh xhigh implementer per card.

## Mandatory serial and review protocol

Cards run strictly `F0 → T0 → A1 → A2 → B1 → B2 → B3 → C1 → C2 → C3 → D1 → D2 → D3 → D4 → D5 → E1 → E2 → E3 → E4 → E5 → F1 → F2 → F3 → F4 → F5 → F6 → G1`. Each predecessor is a reviewed commit at the worker's HEAD; there is no parallel implementation in this preview.

For every card: write the named failing test/oracle; run the exact red command; make only the listed minimum edit; run focused and regression commands; then dispatch fresh spec and named independent quality/security, supply-chain, or UX/accessibility reviewers to the two literal review paths printed in that card. Findings return to the implementer, who edits only the card's exclusive paths; both reviewers rerun until `PASS`/`APPROVED`. The literal exclusive-path list plus those two literal review paths is the complete `git add` set; globs and incidental files are forbidden. Zero skip/todo/only/retry weakening.

## F0 — Dependency and lifecycle bootstrap

**Predecessor:** AW-010A merged DONE + approved AW-009 plan commit.

**Exclusive paths:** modify root `package.json`, `apps/api/package.json`, `pnpm-lock.yaml`; create `scripts/assert-aw009-dependencies.mjs`.

**Red:** create an oracle that requires exact `@playwright/test@1.62.1` root dev, `@fastify/cookie@11.1.2` API prod, `fast-check@4.9.0` API dev, and forbids any other direct addition. Run `node scripts/assert-aw009-dependencies.mjs`; expect exit 1 with all three exact missing pins, no secret values.

**Minimum green:** after re-showing the user §3, run the three approved `pnpm add` commands. Inspect every lock addition/lifecycle field; approve no optional script beyond existing denials.

**Green:** oracle → 1/1 PASS; `CI=true pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck` → exit 0.

**Review/commit:** `docs/reviews/aw-009-f0-spec-xhigh.md`, then `docs/reviews/aw-009-f0-supply-chain-xhigh.md`; resolve/re-review. `git add package.json apps/api/package.json pnpm-lock.yaml scripts/assert-aw009-dependencies.mjs docs/reviews/aw-009-f0-spec-xhigh.md docs/reviews/aw-009-f0-supply-chain-xhigh.md`; commit `chore: bootstrap AW-009 dependencies`.

## T0 — Playwright trace/privacy spike

**Predecessor:** reviewed F0 commit.

**Exclusive paths:** create `tests/spikes/playwright-trace-privacy.spec.ts`, `scripts/check-browser-artifacts.mjs`, `docs/reviews/aw-009-trace-privacy-spike.md`.

**Red:** run `pnpm exec playwright install chromium`, record browser version/revision/hash without a credential, then `pnpm exec vitest run tests/spikes/playwright-trace-privacy.spec.ts`. Expected: 1/3 passes and 2/3 fail because raw trace contains canary cookie/key/DB/private sentinel and no safe export is yet proved.

**Minimum green:** implement recursive ZIP/member scanner and one reviewed sanitizer/export attempt. Raw candidate must be rejected. Sanitized candidate must scan zero and open with Playwright 1.62.1; otherwise write explicit ABORT, retain trace-off/no-registry-claim policy, delete throwaway sanitizer.

**Green:** either 3/3 PASS plus openability proof, or documented ABORT with 2 expected safety tests PASS and no product work that depends on trace upload. `node scripts/check-browser-artifacts.mjs /tmp/remoteagent-aw009-trace-spike/sanitized-trace.zip` exits 0 only for the safe candidate; cleanup removes `/tmp/remoteagent-aw009-trace-spike`.

**Review/commit:** `docs/reviews/aw-009-t0-spec-xhigh.md`, then `docs/reviews/aw-009-t0-quality-security-xhigh.md`; fix/re-review. Add exactly the three paths and review docs; commit `test: prove AW-009 browser artifact policy` or stop for registry revision.

## A1 — Strict HTTP primitives and error envelope

**Predecessor:** reviewed T0 commit.

**Exclusive paths:** create `packages/contracts/src/http.ts`, `packages/contracts/test/http.spec.ts`; modify `packages/contracts/package.json`.

**Red:** write 24 `AW009-A1` cases for strict IDs, limits, cursors, error/session DTOs, and rejected tenant/principal/actor/extra ingress. Run `pnpm --filter @agent-workspace/contracts exec vitest run test/http.spec.ts`; expect exit 1, module unresolved.

**Minimum green:** implement only primitives/schemas; add `test/http.spec.ts` to `test:unit`.

**Green:** `pnpm --filter @agent-workspace/contracts exec vitest run test/http.spec.ts` → 24 passed; `pnpm --filter @agent-workspace/contracts test:unit` → prior 190 + 24 = 214 passed.

**Review/commit:** `docs/reviews/aw-009-a1-spec-xhigh.md`, then `docs/reviews/aw-009-a1-quality-security-xhigh.md`; resolve/re-review. Add exact three paths + reviews; commit `feat: define AW-009 HTTP primitives`.

## A2 — Endpoint DTOs, exports, and OpenAPI

**Predecessor:** reviewed A1 commit.

**Exclusive paths:** modify `packages/contracts/src/http.ts`, `packages/contracts/src/index.ts`, `packages/contracts/src/artifacts.ts`, `packages/contracts/scripts/generate-artifacts.ts`, `packages/contracts/test/http.spec.ts`, `packages/contracts/test/artifacts.spec.ts`; create `packages/contracts/generated/openapi-http-v1.json`.

**Red:** add 12 `AW009-A2` endpoint/export/ref/strictness/byte-parity cases. Run `pnpm --filter @agent-workspace/contracts contracts:check`; expect exit 1 because HTTP artifact/export is absent.

**Minimum green:** define the ten `/api/v1` route DTOs from A1 schemas, export exact approved symbols, generate one deterministic OpenAPI artifact from the registry.

**Green:** `pnpm --filter @agent-workspace/contracts contracts:check` → existing 81 + 12 = 93 artifact tests; `pnpm --filter @agent-workspace/contracts test:unit` → 214 passed; rerun `pnpm --filter @agent-workspace/contracts contracts:generate && git diff --exit-code -- packages/contracts/generated` → exit 0.

**Review/commit:** `docs/reviews/aw-009-a2-spec-xhigh.md`, then `docs/reviews/aw-009-a2-quality-security-xhigh.md`; resolve/re-review. Add exact seven paths + reviews; commit `feat: generate AW-009 HTTP contract artifact`.

## B1 — Environment and production session codec

**Predecessor:** reviewed A2 commit.

**Exclusive paths:** modify `packages/config/src/env.ts`, `packages/config/test/env.spec.ts`; create `apps/api/src/auth/session-credential-codec.ts`, `apps/api/test/session-credential-codec.spec.ts`.

**Red:** add 18 `AW009-B1` selected cases for current/previous key, expiry, strict payload, duplicate cookie, renewal, production/test attributes, and redacted errors. Run `pnpm --filter @agent-workspace/api exec vitest run test/session-credential-codec.spec.ts`; expect exit 1, module unresolved.

**Minimum green:** add exact §4 env schemas and codec only; no issuer/route. Config tests use synthetic base64url secrets.

**Green:** `pnpm --filter @agent-workspace/api exec vitest run test/session-credential-codec.spec.ts` → 18 passed; `pnpm --filter @agent-workspace/config test:unit && pnpm --filter @agent-workspace/api test:unit && pnpm --filter @agent-workspace/api lint && pnpm --filter @agent-workspace/api typecheck` → exit 0, no secret output.

**Review/commit:** `docs/reviews/aw-009-b1-spec-xhigh.md`, then `docs/reviews/aw-009-b1-quality-security-xhigh.md`; resolve/re-review. Add exact four paths + reviews; commit `feat: add tenant session credential codec`.

## B2 — Freeze the AW-009 storage contract and populated-data matrix

**Predecessor:** reviewed B1 commit.

**Exclusive paths:** create `docs/contracts/aw009-storage-contract.md`, `scripts/assert-aw009-storage-contract.mjs`, `packages/db/test/fixtures/aw009-populated.ts`.

**Red:** create the oracle first with 20 `AW009-B2` required headings/columns/constraint/preflight cases, then run `node scripts/assert-aw009-storage-contract.mjs`; expect exit 1 because `docs/contracts/aw009-storage-contract.md` is absent.

**Minimum green:** write the exact B3 columns, SQL names, lock order, nonempty-table rejection matrix, tenants/principals-only acceptance, rollback/postconditions, and typed fixture cases. The fixture exports only deterministic seed descriptors and contains no credential.

**Green:** `node scripts/assert-aw009-storage-contract.mjs` → 20/20 passed; `pnpm --filter @agent-workspace/db test:unit && pnpm --filter @agent-workspace/db db:check` → exit 0 with the prior green baseline unchanged.

**Review/commit:** `docs/reviews/aw-009-b2-spec-xhigh.md`, then `docs/reviews/aw-009-b2-quality-security-xhigh.md`; resolve/re-review. Add exactly the three exclusive paths and those two reviews; commit `docs: freeze AW-009 storage contract`.

## B3 — Forward AW-009 schema/migration

**Predecessor:** reviewed green B2 commit.

**Exclusive paths:** modify `packages/db/src/schema/foundation.ts`, `packages/db/src/schema/index.ts`, `packages/db/src/migration-integrity.ts`, `packages/db/drizzle/meta/_journal.json`, `packages/db/package.json`; create `packages/db/src/schema/identity.ts`, `packages/db/drizzle/0002_aw009_identity_tenancy.sql`, `packages/db/drizzle/meta/0002_snapshot.json`, `packages/db/test/aw009-schema.spec.ts`, `packages/db/test/aw009-migration.spec.ts`.

**Frozen additions:** principals `deactivated_at`; workspaces/channels `name`, `name_key`, `created_by_principal_id`, `creation_command_id`, `creation_fingerprint`; channels nullable `purpose`; epochs `join_command_id`, `join_fingerprint`; `identity_sessions`. Exact names: `identity_sessions_pk`, `identity_sessions_principal_fk`, `identity_sessions_expiry_ck`, `workspaces_creator_fk`, `workspaces_tenant_name_key_uq`, `workspaces_creation_command_uq`, `channels_creator_fk`, `channels_workspace_name_key_uq`, `channels_creation_command_uq`, `channel_membership_epochs_join_command_uq`. Migration locks/fails on populated product tables per parent §7 and B2 contract.

**Red:** write 20 `AW009-B3` tests using `packages/db/test/fixtures/aw009-populated.ts`; run `pnpm --filter @agent-workspace/db exec vitest run test/aw009-schema.spec.ts test/aw009-migration.spec.ts`; expect exit 1 because identity schema and `0002` are absent.

**Minimum green:** update current declarations; run `pnpm --filter @agent-workspace/db exec drizzle-kit generate --config drizzle.config.ts --name aw009_identity_tenancy`; implement atomic preflight/locks/postconditions, add both files to `test:unit`, and freeze all prior hashes unchanged. No placeholder defaults/backfill.

**Green:** the exact red command → 20 passed; `node scripts/assert-aw009-storage-contract.mjs && pnpm --filter @agent-workspace/db test:unit && pnpm --filter @agent-workspace/db db:check && pnpm --filter @agent-workspace/db test:integration` → exit 0, fresh first/second/concurrent/populated/rollback cases pass.

**Review/commit:** `docs/reviews/aw-009-b3-spec-xhigh.md`, then `docs/reviews/aw-009-b3-quality-security-xhigh.md`; resolve/re-review. Add exactly the ten exclusive paths and those two reviews; commit `feat: add AW-009 identity and metadata migration`.

## C1 — Identity session use cases

**Predecessor:** reviewed B3 commit.

**Exclusive paths:** create `packages/chat-core/src/shared-kernel/application.ts`, `packages/chat-core/src/modules/identity/session.ts`, `packages/chat-core/test/identity-session.spec.ts`; modify `packages/chat-core/src/index.ts`.

**Red:** 16 `AW009-C1` resolve/logout/lock-protocol/result tests; `pnpm --filter @agent-workspace/chat-core exec vitest run test/identity-session.spec.ts` → exit 1, module unresolved.

**Minimum green:** pure ports/use cases with transaction/clock interfaces; no DB/framework.

**Green:** `pnpm --filter @agent-workspace/chat-core exec vitest run test/identity-session.spec.ts` → 16 passed; `pnpm --filter @agent-workspace/chat-core test:unit` → prior 16 + 16 = 32 passed.

**Review/commit:** `docs/reviews/aw-009-c1-spec-xhigh.md`, then `docs/reviews/aw-009-c1-quality-security-xhigh.md`; resolve/re-review. Add four paths + reviews; commit `feat: add identity session use cases`.

## C2 — Workspace policy/use cases

**Predecessor:** reviewed C1 commit.

**Exclusive paths:** create `packages/chat-core/src/modules/tenancy/workspaces.ts`, `packages/chat-core/test/workspaces.spec.ts`; modify `packages/chat-core/src/index.ts`.

**Red:** 18 `AW009-C2` list/create/owner/receipt/concealment cases; `pnpm --filter @agent-workspace/chat-core exec vitest run test/workspaces.spec.ts` → exit 1, module unresolved.

**Minimum green:** implement active-human create policy and atomic command/repository port only.

**Green:** the exact red command → 18 passed; `pnpm --filter @agent-workspace/chat-core test:unit` → 50 passed.

**Review/commit:** `docs/reviews/aw-009-c2-spec-xhigh.md`, then `docs/reviews/aw-009-c2-quality-security-xhigh.md`; resolve/re-review. Add three paths + reviews; commit `feat: add workspace use cases`.

## C3 — Channel policy/use cases

**Predecessor:** reviewed C2 commit.

**Exclusive paths:** create `packages/chat-core/src/modules/conversations/channels.ts`, `packages/chat-core/test/channels.spec.ts`; modify `packages/chat-core/src/index.ts`.

**Red:** 24 `AW009-C3` role/private/list/create/join/member/idempotency/event-atomicity cases; `pnpm --filter @agent-workspace/chat-core exec vitest run test/channels.spec.ts` → exit 1, module unresolved.

**Minimum green:** implement pure policy/ports through AW-010A journal; no fabricated event marker.

**Green:** the exact red command → 24 passed; `pnpm --filter @agent-workspace/chat-core test:unit` → 74 passed.

**Review/commit:** `docs/reviews/aw-009-c3-spec-xhigh.md`, then `docs/reviews/aw-009-c3-quality-security-xhigh.md`; resolve/re-review. Add three paths + reviews; commit `feat: add channel use cases`.

## D1 — Shared production/test application factory

**Predecessor:** reviewed C3 commit.

**Exclusive paths:** create `apps/api/src/create-application.ts`, `apps/api/test/application-factory.spec.ts`; modify `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `apps/api/vitest.config.ts`.

**Red:** 8 `AW009-D1` factory/lifecycle/pre-init-route-hook/no-test-route cases; `pnpm --filter @agent-workspace/api exec vitest run --config vitest.config.ts test/application-factory.spec.ts` → exit 1, factory unresolved.

**Minimum green:** one factory used by main/tests; inject readiness probes/DB ownership; install `onRoute` before Nest init. Main alone parses env/listens/shuts down.

**Green:** the exact red command → 8 passed; `pnpm --filter @agent-workspace/api test:unit && pnpm --filter @agent-workspace/api lint && pnpm --filter @agent-workspace/api typecheck && pnpm --filter @agent-workspace/api build` → exit 0.

**Review/commit:** `docs/reviews/aw-009-d1-spec-xhigh.md`, then `docs/reviews/aw-009-d1-quality-security-xhigh.md`; resolve/re-review. Add five paths + reviews; commit `refactor: expose API application factory`.

## D2 — Origin/session guards and session HTTP

**Predecessor:** reviewed D1 commit.

**Exclusive paths:** create `apps/api/src/auth/origin.guard.ts`, `apps/api/src/auth/session.guard.ts`, `apps/api/src/auth/session-context.ts`, `apps/api/src/modules/identity/session.controller.ts`, `apps/api/test/origin-session-http.spec.ts`; modify `apps/api/src/app.module.ts`.

**Red:** 20 `AW009-D2` exact Origin/Fetch-Metadata/forwarding/cookie/context/logout cases; `pnpm --filter @agent-workspace/api exec vitest run --config vitest.config.ts test/origin-session-http.spec.ts` → exit 1, guard/controller unresolved.

**Minimum green:** implement §4–6 guards/context/neutral logout mapping using injected codec/ports; no allow-all test verifier.

**Green:** the exact red command → 20 passed; `pnpm --filter @agent-workspace/api test:unit` → exit 0, all prior tests plus 20 pass.

**Review/commit:** `docs/reviews/aw-009-d2-spec-xhigh.md`, then `docs/reviews/aw-009-d2-quality-security-xhigh.md`; resolve/re-review. Add six paths + reviews; commit `feat: enforce AW-009 session and origin guards`.

## D3 — Session PostgreSQL adapter and lock races

**Predecessor:** reviewed D2 commit.

**Exclusive paths:** create `apps/api/src/adapters/postgres/session.adapter.ts`, `apps/api/test/session.integration.spec.ts`; modify `apps/api/src/app.module.ts`, `apps/api/vitest.config.ts`.

**Red:** 12 `AW009-D3` real tests covering session→principal order plus four revoke and four deactivate interleavings; `pnpm --filter @agent-workspace/api exec vitest run --config vitest.config.ts --project integration --no-file-parallelism test/session.integration.spec.ts` → exit 1, adapter unresolved.

**Minimum green:** implement tenant-leading adapter/lock protocol and register it; no ordinary late SELECT.

**Green:** the exact red command → 12 passed; `pnpm --filter @agent-workspace/api test:unit && pnpm --filter @agent-workspace/api test:integration` → exit 0, zero writes for revoker-first cases/residue.

**Review/commit:** `docs/reviews/aw-009-d3-spec-xhigh.md`, then `docs/reviews/aw-009-d3-quality-security-xhigh.md`; resolve/re-review. Add four paths + reviews; commit `feat: implement linearizable session authorization`.

## D4 — Workspace PostgreSQL/API slice

**Predecessor:** reviewed D3 commit.

**Exclusive paths:** create `apps/api/src/adapters/postgres/workspace.adapter.ts`, `apps/api/src/modules/tenancy/workspace.controller.ts`, `apps/api/test/workspace.integration.spec.ts`; modify `apps/api/src/app.module.ts`.

**Red:** 16 `AW009-D4` list/create/same-key/different-key/cross-tenant/concealment tests; `pnpm --filter @agent-workspace/api exec vitest run --config vitest.config.ts --project integration --no-file-parallelism test/workspace.integration.spec.ts` → exit 1, modules unresolved.

**Minimum green:** thin controller plus one locked adapter transaction producing workspace/owner/default-channel/join via AW-010A.

**Green:** the exact red command → 16 passed; `pnpm --filter @agent-workspace/api test:unit && pnpm --filter @agent-workspace/api test:integration` → exit 0, exact one resource/event/sequence on races.

**Review/commit:** `docs/reviews/aw-009-d4-spec-xhigh.md`, then `docs/reviews/aw-009-d4-quality-security-xhigh.md`; resolve/re-review. Add four paths + reviews; commit `feat: add workspace API slice`.

## D5 — Channel PostgreSQL/API slice

**Predecessor:** reviewed D4 commit.

**Exclusive paths:** create `apps/api/src/adapters/postgres/channel.adapter.ts`, `apps/api/src/modules/conversations/channel.controller.ts`, `apps/api/test/channel.integration.spec.ts`; modify `apps/api/src/app.module.ts`.

**Red:** 20 `AW009-D5` role/private/list/create/join/member/race tests; `pnpm --filter @agent-workspace/api exec vitest run --config vitest.config.ts --project integration --no-file-parallelism test/channel.integration.spec.ts` → exit 1, modules unresolved.

**Minimum green:** thin controller and tenant-leading adapter; one transaction for channel/journal/epoch; conflict loser rolls back allocation.

**Green:** the exact red command → 20 passed; `pnpm --filter @agent-workspace/api test:unit && pnpm --filter @agent-workspace/api test:integration` → exit 0, exact sequence/event/epoch invariants/residue.

**Review/commit:** `docs/reviews/aw-009-d5-spec-xhigh.md`, then `docs/reviews/aw-009-d5-quality-security-xhigh.md`; resolve/re-review. Add four paths + reviews; commit `feat: add channel API slice`.

## E1 — Shared light UI primitives

**Predecessor:** reviewed D5 commit.

**Exclusive paths:** create `packages/ui/src/tokens.css`, `packages/ui/src/button.tsx`, `packages/ui/src/field.tsx`, `packages/ui/src/dialog.tsx`, `packages/ui/src/badge.tsx`, `packages/ui/test/primitives.spec.tsx`, `packages/ui/vitest.config.ts`; modify `packages/ui/src/index.ts`, `packages/ui/package.json`, `packages/ui/tsconfig.json`.

**Red:** 14 `AW009-E1` React-element/export/token assertions; `pnpm exec vitest run packages/ui/test/primitives.spec.tsx --config packages/ui/vitest.config.ts` → exit 1, modules unresolved.

**Minimum green:** add neutral tokens and semantic React primitives; enable TSX/test config with existing React/Vitest pins, no new external package.

**Green:** the exact red command → 14 passed; `pnpm --filter @agent-workspace/ui lint && pnpm --filter @agent-workspace/ui typecheck && pnpm --filter @agent-workspace/ui build` → exit 0.

**Review/commit:** `docs/reviews/aw-009-e1-spec-xhigh.md`, then `docs/reviews/aw-009-e1-ux-accessibility-xhigh.md`; resolve/re-review. Add exact ten paths + reviews; commit `feat: add light chat UI primitives`.

## E2 — Runtime same-origin API proxy

**Predecessor:** reviewed E1 commit.

**Exclusive paths:** create `apps/web/app/api/v1/[...path]/route.ts`, `apps/web/app/api/v1/proxy.ts`, `apps/web/test/api-proxy.spec.ts`; modify `apps/web/vitest.config.ts`.

**Red:** 12 `AW009-E2` method/body/query/Cookie/Origin/Set-Cookie/hop-header/runtime-env/no-store cases; `pnpm --filter @agent-workspace/web exec vitest run --config vitest.config.ts test/api-proxy.spec.ts` → exit 1, proxy unresolved.

**Minimum green:** implement transparent server-only proxy with dynamic/force-no-store/revalidate0 and validated runtime destination; no schema transform/client env.

**Green:** `pnpm --filter @agent-workspace/web exec vitest run --config vitest.config.ts test/api-proxy.spec.ts` → 12 passed; `pnpm --filter @agent-workspace/web test:unit && pnpm --filter @agent-workspace/web typecheck && pnpm --filter @agent-workspace/web build` → exit 0.

**Review/commit:** `docs/reviews/aw-009-e2-spec-xhigh.md`, then `docs/reviews/aw-009-e2-quality-security-xhigh.md`; resolve/re-review. Add four paths + reviews; commit `feat: add runtime AW-009 API proxy`.

## E3 — Signed-out/access-changed and stable routes

**Predecessor:** reviewed E2 commit.

**Exclusive paths:** modify `apps/web/app/page.tsx`; create `apps/web/app/workspaces/[workspaceId]/channels/[channelId]/page.tsx`, `apps/web/app/session-state.tsx`, `apps/web/app/api-client.ts`, `apps/web/test/routing.spec.ts`.

**Red:** 10 `AW009-E3` signed-out/invalid/deep-link/neutral/no-private-payload tests; `pnpm --filter @agent-workspace/web exec vitest run --config vitest.config.ts test/routing.spec.ts` → exit 1, route/helper unresolved.

**Minimum green:** implement server-rendered dynamic/no-store routes, neutral copy, heading focus target and safe retry/help; no fake sign-in.

**Green:** the exact red command → 10 passed; `pnpm --filter @agent-workspace/web test:unit && pnpm --filter @agent-workspace/web typecheck && pnpm --filter @agent-workspace/web build` → exit 0.

**Review/commit:** `docs/reviews/aw-009-e3-spec-xhigh.md`, then `docs/reviews/aw-009-e3-ux-accessibility-xhigh.md`; resolve/re-review. Add five paths + reviews; commit `feat: add authenticated shell routing states`.

## E4 — Shell/switcher/scoped last location

**Predecessor:** reviewed E3 commit.

**Exclusive paths:** create `apps/web/app/workspace-shell.tsx`, `apps/web/app/channel-sidebar.tsx`, `apps/web/app/last-location.ts`, `apps/web/test/workspace-shell.spec.ts`; modify `apps/web/app/globals.css`.

**Red:** 12 `AW009-E4` active identity/group labels/sessionStorage namespace/clear/reauthorize/no-composer cases; `pnpm --filter @agent-workspace/web exec vitest run --config vitest.config.ts test/workspace-shell.spec.ts` → exit 1, modules unresolved.

**Minimum green:** implement white/light shell, accessible SVG labels and trusted tenant+principal+workspace key containing channel ID only.

**Green:** `pnpm --filter @agent-workspace/web exec vitest run --config vitest.config.ts test/workspace-shell.spec.ts` → 12 passed; `pnpm --filter @agent-workspace/web test:unit && pnpm --filter @agent-workspace/web typecheck && pnpm --filter @agent-workspace/web build` → exit 0.

**Review/commit:** `docs/reviews/aw-009-e4-spec-xhigh.md`, then `docs/reviews/aw-009-e4-ux-accessibility-xhigh.md`; resolve/re-review. Add five paths + reviews; commit `feat: add workspace channel shell`.

## E5 — Create/join forms and permission states

**Predecessor:** reviewed E4 commit.

**Exclusive paths:** create `apps/web/app/workspace-form.tsx`, `apps/web/app/channel-form.tsx`, `apps/web/app/join-channel-button.tsx`, `apps/web/test/forms.spec.ts`; modify `apps/web/app/workspace-shell.tsx`.

**Red:** 14 `AW009-E5` field association/invalid focus/pending/idempotency/live-region/conflict/guest/changed-permission cases; `pnpm --filter @agent-workspace/web exec vitest run --config vitest.config.ts test/forms.spec.ts` → exit 1, forms unresolved.

**Minimum green:** real same-origin API actions only; retain inputs/errors and accessible dialog/focus behavior; no mock route.

**Green:** the exact red command → 14 passed; `pnpm --filter @agent-workspace/web test:unit && pnpm --filter @agent-workspace/web typecheck && pnpm --filter @agent-workspace/web build` → exit 0.

**Review/commit:** `docs/reviews/aw-009-e5-spec-xhigh.md`, then `docs/reviews/aw-009-e5-ux-accessibility-xhigh.md`; resolve/re-review. Add five paths + reviews; commit `feat: add workspace and channel actions`.

## F1 — Deliberate DB test-support export

**Predecessor:** reviewed E5 commit.

**Exclusive paths:** create `packages/db/test/support/index.ts`, `packages/db/test/fixtures/forbidden-production-test-support-import.ts`; modify `packages/db/package.json`, `.dependency-cruiser.cjs`, `scripts/assert-boundary-fixture.mjs`.

**Red:** 6 `AW009-F1` export/boundary assertions; `pnpm boundaries:check` must exit 1 after `scripts/assert-boundary-fixture.mjs` copies `packages/db/test/fixtures/forbidden-production-test-support-import.ts` to an ignored temporary `apps/api/src/__aw009_boundary_fixture.ts`, invokes dependency-cruiser, and deletes it in `finally`; the allowed test import control must pass.

**Minimum green:** export only credential-safe harness/seed helpers at `@agent-workspace/db/test-support`; rule forbids any production `src` importer and assertion script verifies forbidden+allowed controls.

**Green:** `pnpm boundaries:check && pnpm --filter @agent-workspace/db test:unit && pnpm --filter @agent-workspace/db test:integration` → exit 0; 6/6 boundary assertions and no temporary fixture/credential artifact.

**Review/commit:** `docs/reviews/aw-009-f1-spec-xhigh.md`, then `docs/reviews/aw-009-f1-quality-security-xhigh.md`; resolve/re-review. Add five paths + reviews; commit `test: expose bounded DB test support`.

## F2 — Real E2E process stack

**Predecessor:** reviewed F1 commit.

**Exclusive paths:** create `playwright.config.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/global-teardown.ts`, `tests/e2e/support/stack.ts`, `tests/e2e/support/session-fixture.ts`, `tests/e2e/stack.spec.ts`.

**Red:** 8 `AW009-F2` process/codec/readiness/cleanup/no-route/no-bundle tests; `pnpm exec playwright test tests/e2e/stack.spec.ts --project=chromium --workers=1 --retries=0` → stack helpers unresolved.

**Minimum green:** implement parent §14 sequence: digest PG, migration/runtime roles, direct seed, production codec, API port0, built Next/runtime proxy, aggregate cleanup. Use T0 trace policy.

**Green:** `pnpm exec playwright test tests/e2e/stack.spec.ts --project=chromium --workers=1 --retries=0` → 8 passed; `node scripts/check-browser-artifacts.mjs /tmp/remoteagent-aw009-e2e/upload-candidate.zip` → exit 0, Docker residue zero, and cleanup removes `/tmp/remoteagent-aw009-e2e`.

**Review/commit:** `docs/reviews/aw-009-f2-spec-xhigh.md`, then `docs/reviews/aw-009-f2-quality-security-xhigh.md`; resolve/re-review. Add exact six paths + reviews; commit `test: build real AW-009 E2E stack`.

## F3 — Literal route matrix and isolation generator

**Predecessor:** reviewed F2 commit.

**Exclusive paths:** create `tests/isolation/aw009-route-matrix.ts`, `tests/isolation/aw009-route-matrix.spec.ts`, `apps/api/test/isolation.integration.spec.ts`, `scripts/write-aw009-isolation-evidence.mjs`; modify `package.json`, `apps/api/vitest.config.ts`.

**Red:** implement 80 matrix/oracle assertions directly from parent §15. Run `pnpm exec vitest run tests/isolation/aw009-route-matrix.spec.ts`; expect exit 1, matrix module absent. Then run `pnpm --filter @agent-workspace/api exec vitest run --config vitest.config.ts --project integration --no-file-parallelism test/isolation.integration.spec.ts`; expect exit 1 with zero covered matrix cells before generator implementation.

**Minimum green:** encode all 72 cells, HEAD alias/zero OPTIONS policy, seed `9009001`, exact 592 cell-owned accepted cases and ten separate positives; sentinel and before/after write checks.

**Green:** matrix → 80 passed; `pnpm test:isolation` → 592/592 accepted, 10/10 positives, zero discard/retry/leak/write/residue; arithmetic hash/evidence exact.

**Review/commit:** `docs/reviews/aw-009-f3-spec-xhigh.md`, then `docs/reviews/aw-009-f3-quality-security-xhigh.md`; resolve/re-review. Add six paths + reviews; commit `test: enforce AW-009 isolation matrix`.

## F4 — Production-mode browser journeys

**Predecessor:** reviewed F3 commit.

**Exclusive paths:** create `tests/e2e/aw009-shell.spec.ts`, `tests/e2e/selectors.ts`; modify `playwright.config.ts`, `tests/e2e/support/stack.ts`, `tests/e2e/support/session-fixture.ts`.

**Red:** 18 `AW009-F4` journeys for signed session/workspace/channel/private/switch/deep-link/logout/revoke/session-A→B/navigation/prefetch/RSC/Back/loading-lock/conflict/focus/320px; `pnpm exec playwright test tests/e2e/aw009-shell.spec.ts --project=chromium --workers=1 --retries=0` → exit 1 at the first unmet named product assertion.

**Minimum green:** the F4 worker edits only its five listed test/harness paths. Any product failure reopens exactly one originating card and its frozen exclusive paths: auth/origin/session HTTP → D2; DB session locking → D3; workspace API → D4; channel API → D5; proxy/cache → E2; signed-out/routing → E3; shell/last-location → E4; forms/permissions → E5. The originating implementer adds a correction commit using only that card's path set, and both original reviewers reapprove before F4 reruns. No route mock or unassigned product edit.

**Green:** `pnpm exec playwright test tests/e2e/aw009-shell.spec.ts --project=chromium --workers=1 --retries=0` → 18 passed; scanner/residue zero.

**Review/commit:** `docs/reviews/aw-009-f4-spec-xhigh.md`, then `docs/reviews/aw-009-f4-ux-security-xhigh.md`; all correction cards re-run their originating reviews, then F4 reviewers rerun. Add only five paths + reviews; commit `test: verify AW-009 browser journeys`.

## F5 — Canonical 32-row manifest/evidence

**Predecessor:** reviewed F4 commit.

**Exclusive paths:** create `docs/quality/aw009-ux-coverage.json`, `scripts/write-aw009-evidence.mjs`, `scripts/check-aw009-evidence.mjs`, `tests/evidence/aw009-evidence.spec.ts`; modify `.gitignore`.

**Red:** 40 `AW009-F5` denominator/path/mode/exact-count/canary/archive assertions; `pnpm exec vitest run tests/evidence/aw009-evidence.spec.ts` → exit 1, writer/checker unresolved.

**Minimum green:** encode ONB01-10/NAV01-12/ADM01-10 all NOT_RUN; write engineering results only to canonical paths, mode 0600/no-overwrite/no-symlink; recursively scan allowed exact files.

**Green:** `pnpm exec vitest run tests/evidence/aw009-evidence.spec.ts` → 40 passed; `node scripts/check-aw009-evidence.mjs /tmp/remoteagent-aw009-evidence/safe` exits 0 and the same command against each named canary directory exits nonzero; cleanup removes `/tmp/remoteagent-aw009-evidence`, and generated artifacts remain ignored.

**Review/commit:** `docs/reviews/aw-009-f5-spec-xhigh.md`, then `docs/reviews/aw-009-f5-quality-security-xhigh.md`; resolve/re-review. Add five paths + reviews; commit `test: freeze AW-009 UX evidence denominator`.

## F6 — Hosted CI and exact-tree integration

**Predecessor:** reviewed F5 commit.

**Exclusive paths:** modify `package.json`, `.github/workflows/ci.yml`, `scripts/assert-aw007-tree.mjs`, `.dependency-cruiser.cjs`, `.gitignore`; create `scripts/assert-aw009-workflow.mjs`.

**Red:** create exact route/script/dependency/browser/order/upload oracle; `node scripts/assert-aw009-workflow.mjs && pnpm scaffold:check` → exit 1 until hosted workflow/root scripts/checker match F0–F5.

**Minimum green:** wire frozen install→uncached CI→DB/API integration→isolation→`playwright install --with-deps chromium`→E2E→canary scan→exact upload; preserve action SHAs/read-only permission and nonmasking failure.

**Green:** workflow oracle 1/1 PASS; `TURBO_FORCE=true pnpm run ci && pnpm test:integration && pnpm --filter @agent-workspace/api test:integration && pnpm test:isolation && pnpm test:e2e -- --project=chromium && git diff --check` → all exit 0, zero cache/retry/residue/leak.

**Review/commit:** `docs/reviews/aw-009-f6-spec-xhigh.md`, then `docs/reviews/aw-009-f6-supply-chain-security-xhigh.md`; resolve/re-review. Add six paths + reviews; commit `ci: gate AW-009 authenticated shell`.

## G1 — Final evidence, reviews, and PR

**Predecessor:** reviewed F6 commit.

**Exclusive paths:** create `docs/reviews/aw-009-full-evidence-handoff-xhigh.md`, `docs/reviews/aw-009-final-spec-closure-xhigh.md`, `docs/reviews/aw-009-final-quality-security-closure-xhigh.md`, `docs/reviews/aw-009-final-ux-closure-xhigh.md`; `docs/execution-board.md` is not in the G1 commit and may be modified only by the orchestrator after final-head hosted proof.

**Red gate:** evidence handoff begins `PENDING`; `node scripts/check-aw009-evidence.mjs "artifacts/chat-ux/aw009-$(git rev-parse HEAD)"` must fail until exact final-head artifacts exist.

**Minimum green:** record exact commits/counts/seed 9009001/592 arithmetic/migrations/browser identity/residue/scans and 32 NOT_RUN rows, without credentials. Independent final reviewers write the three closure docs.

**Green:** all local/hosted F6 commands pass at the same PR head; evidence checker exit 0; final spec PASS, quality/security APPROVED, UX APPROVED; public PR final-head workflow SUCCESS.

**Review/commit:** reviewers own only their named docs; orchestrator resolves any finding through the originating card and reruns affected reviews. Add exactly four review docs; commit `docs: close AW-009 authenticated shell evidence`. After hosted success, orchestrator separately updates only board status to keep AW-009 overall RUNNING while marking this preview complete.
