# AW-009 Tenant/Workspace/Channel Authenticated-Shell Preview Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Deliver a polished PostgreSQL-backed authenticated-shell preview: tenant-bound revocable session verification, workspace/default-channel creation and navigation, public/private channel creation and membership, and real Web→API→PostgreSQL proof. Production human entry remains blocked on a separately reviewed OIDC/session-issuer card.

**Architecture:** AW-010A first owns channel-local sequence state and the canonical journal. After AW-010A is merged, AW-009 verifies a signed HttpOnly session, locks session/principal rows for linearizable mutation authorization, and derives the sole tenant/principal context from PostgreSQL. Chat-core owns policy/ports; the API composition layer owns PostgreSQL adapters and thin controllers; Next uses a runtime transparent proxy that preserves the public mobile-compatible contract.

**Tech Stack:** Node 24.15.0, pnpm 11.23.0, TypeScript 5.9.3, NestJS/Fastify 11.2.1/5.12.1, Next.js 16.3.2, React 19.2.8, PostgreSQL 17.11, Drizzle 0.45.2, Zod 4.4.3, Vitest 4.1.11, Testcontainers 12.1.0, fast-check 4.9.0, Playwright 1.62.1/Chromium.

---

## 1. Status, authority, and hard sequencing

- Baseline: merged AW-008 main `16385e5aa162dc69bf6e4e343ffd948c4b47e8eb`.
- Authority: sync contract → projection semantics → durable event payloads → Chat Core ADR → UX registry → AW-010A plan → this plan.
- **No AW-009 product code starts until AW-010A is independently approved, merged, and marked DONE.** This removes shared-file races and guarantees that membership writes cannot fabricate `joined_event_seq`.
- The only pre-AW-010A work allowed is docs/review. Even dependency installation and trace experimentation wait for approved AW-010A and this plan revision.
- The UX registry assigns exactly 32 rows to AW-009: ONB 10, NAV 12, ADM 10; 17 non-waivable, 8 release-blocking, 7 tracked-polish. Every row begins `NOT_RUN`. This preview does not mark AW-009 DONE.

## 2. Scope and non-goals

### In this preview

1. Signed-cookie verification; current-session and replay-neutral logout.
2. Tenant-leading `identity_sessions` plus principal deactivation state.
3. Workspace list/create with creator owner membership and atomic default public channel/join event.
4. Public/private channel list/create, public self-join, channel member list.
5. Strict `/api/v1` contracts, errors, bounded cursors, generated OpenAPI.
6. White/light Web shell, signed-out/access-changed states, workspace switcher, channel groups, create forms, stable channel links, scoped last-location behavior.
7. Real API integration, linearizable revocation/deactivation races, deterministic implemented-route isolation, and production-mode Chromium E2E.
8. Exact manifests, evidence, secret scan, CI, independent reviews, and final-head hosted proof.

### Out / `NOT_RUN`

- Production session issuance, password login, OIDC/JWT verification, refresh families, devices, multi-tenant chooser.
- Invite flow, private-channel invitation, DM, leave/revoke, realtime cache-purge control.
- Archive/restore, role administration, deactivation UI, retention, audit/export.
- Message timeline/composer/history, generic idempotency table, outbox, search/files, WebSocket, unread, notification.
- Agent/Connector, Shared Mind, product Kanban, Orchestrator, Redis/broker/microservices.

No fake login, `/test`, `/__e2e`, fixture, mint, or bootstrap HTTP route may be registered or bundled.

## 3. Dependency and tool disclosure

No installation occurs until the user sees this list again after plan approval.

| Exact item | Purpose | Exact installation | Impact |
|---|---|---|---|
| `@fastify/cookie@11.1.2` | Maintained cookie signer/parser | `pnpm --filter @agent-workspace/api add @fastify/cookie@11.1.2` | Small production graph (`cookie`, `fastify-plugin`); session secret boundary |
| `@playwright/test@1.62.1` | Production-mode Chromium E2E and trace-privacy spike | `pnpm add -Dw @playwright/test@1.62.1` | Dev/CI graph; package declares no lifecycle script |
| Chromium for Playwright 1.62.1 | Exact browser | Local: `pnpm exec playwright install chromium`; hosted: `pnpm exec playwright install --with-deps chromium` | Explicit browser download; hosted command invokes root/apt/network and installs mutable runner OS libraries; record browser version/revision and executable hash |
| Existing `fast-check@4.9.0` as API dev importer | 500+ deterministic isolation cases | `pnpm --filter @agent-workspace/api add -D fast-check@4.9.0` | Reuses approved exact graph; dev-only |

- Existing test support reuses pinned Testcontainers 12.1.0, PostgreSQL digest, `pg@8.23.0`, and `@types/pg@8.23.1`; no version change.
- Before install: inspect lock delta, package lifecycle metadata, and workspace build policy. No new optional build script is allowed without a separate purpose/impact review.
- `--with-deps` is CI-only. Local macOS does not run apt/root installation.
- Browser worker count `1`, retries `0`, video `off`, screenshots `off`, authenticated trace `off` until §13 trace gate is proven.

## 4. Session credential and rotation contract

### Codec

- Production cookie: `__Host-remoteagent_session`; test/development: `remoteagent_session`.
- Attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`; production requires `Secure`.
- Strict versioned payload contains exactly `{ v: 1, tenant_id, session_id }`. Decode occurs only after successful unsigning; malformed base64/JSON, unknown/duplicate fields, duplicate cookie-name occurrences, unsupported version, or noncanonical encoding fail.
- Current signing secret is required and signs all new/renewed cookies. Optional previous secret verifies only until `SESSION_COOKIE_PREVIOUS_VALID_UNTIL` and for at most the maximum eight-hour session TTL; successful previous-key verification renews under the current key.
- Each secret is canonical base64url that decodes to at least 32 random bytes. Current/previous must differ. Production rejects missing, weak, expired-but-configured, duplicate, and documented local values. Errors print field names only.
- Test fixtures generate a fresh high-entropy session ID and DB row; they never honor a browser-selected session ID. Pre-auth→auth fixation is not applicable because this increment has no production issuance flow.

### Logout

`DELETE /api/v1/session` is Origin-protected but replay-neutral:

- missing, malformed, expired, or already-revoked cookie: clear exact cookie attributes and return `204` without resource/session oracle;
- valid active cookie: lock/revoke exact session, clear cookie, return `204`;
- any subsequent protected-route replay returns `401 SESSION_INVALID`.

## 5. Exact mutation Origin/CSRF policy

- Config contains an explicit nonempty allowlist of canonical public Web origins. Each origin must be `https` in production; development/test may use exact loopback `http` origins. Credentials, wildcard, path other than `/`, query, fragment, `null`, and duplicates are rejected at startup.
- Cookie-authenticated `POST`, `PUT`, `PATCH`, and `DELETE` require exactly one syntactically valid `Origin` equal to the allowlist. Missing, multiple, malformed, `null`, or cross-site origins return `403 ORIGIN_NOT_ALLOWED` before use-case execution.
- `Sec-Fetch-Site`, when present, must be `same-origin`; conflicting values fail. Its absence does not bypass the mandatory Origin rule.
- `GET`/`HEAD` are read-only; no state-changing GET exists. Generated `HEAD` is inventory-classified with its GET. Unregistered `OPTIONS` is not granted by CORS.
- API CORS plugin is absent for this cookie flow. Browser requests are same-origin through the Next proxy. `trustProxy` remains false; Host and `X-Forwarded-*` never define the trusted origin.
- Future non-browser/mobile auth requires a separate non-cookie credential contract; missing Origin is not a hidden mobile bypass.
- Tests cover cross-site form/fetch, `Origin:null`, missing/multiple/malformed origins, forwarding-header spoofing, exact loopback allowlist, and zero writes.

## 6. Linearizable session/principal authorization

`identity_sessions` has PK `(tenant_id, session_id)`, tenant-leading FK to principals, `expires_at`, nullable `revoked_at`, `created_at`, and positive version. Principals receive nullable `deactivated_at`.

### Protected mutation protocol at PostgreSQL `READ COMMITTED`

All protected writes use one transaction and one fixed lock order:

1. Verify signed cookie and parse selector.
2. Lock the exact session row `FOR UPDATE`.
3. Lock its principal row `FOR UPDATE`.
4. Recheck expiry/revocation/deactivation/kind while locks are held.
5. Lock workspace/channel/membership rows in documented tenant-leading order.
6. Perform DML and hold all locks through commit.

Revocation locks the session row `FOR UPDATE`. Deactivation locks all affected session rows ordered by `session_id`, then the principal row, and updates/revokes while locks remain. This is compatible with the mutation order and avoids principal→session deadlocks.

Linearization rule:

- revocation/deactivation that acquires its conflicting lock first makes the mutation abort with zero protected write;
- a mutation that acquires/validates locks first may commit before the revoker, after which revocation commits;
- a late ordinary `SELECT` is never accepted as the protocol.

Barrier tests cover revocation and deactivation: before lock, while mutation holds lock, after final auth read/before DML, and after DML/before commit. They assert commit order, response, event/sequence/resource rows, and zero write whenever revocation/deactivation linearizes first.

Read-only protected requests validate current session/principal on each request but need not hold write locks after the query.

## 7. AW-009 forward-migration compatibility

AW-010A is already present. AW-009 migration is one atomic forward transaction.

- `tenants` and `principals` may be populated. Adding nullable `deactivated_at` is safe.
- Meaningful display names, creator identity, creation command IDs, and fingerprints cannot be reconstructed for pre-product `workspaces` or `channels`.
- Therefore the migration acquires locks in frozen order and **fails atomically if `workspaces`, `channels`, `workspace_memberships`, or `channel_membership_epochs` is nonempty**. It does not fabricate names/provenance/idempotency receipts.
- On an accepted preflight, it adds non-null name/name-key/provenance fields without placeholder defaults, creates `identity_sessions`, and proves all postconditions before commit.
- Tests start from populated `0000` databases for every rejected table combination, prove tenants/principals-only acceptance, rollback/no partial DDL, rerun, concurrent DML exclusion, concurrent migrator serialization, hash drift, and old-application rollback compatibility.
- Deployment order is migration, then new app. Old health-only app ignores additive schema if application rollback is needed. No down migration/history rewrite.

## 8. Resource-row idempotency and races

Generic idempotency tables remain AW-010-owned.

- All create/self-join commands require `Idempotency-Key`.
- Workspace/channel rows store session-derived creator, command ID, and canonical fingerprint with tenant/creator scoped uniqueness.
- Membership epoch stores self-join command/fingerprint. Server generates all resource/event/epoch IDs.
- Exact replay returns stable result and writes nothing; changed fingerprint returns `409 IDEMPOTENCY_KEY_REUSED`.
- PostgreSQL race tests cover same key/same payload, same key/different payload, different keys targeting one active join, creator auto-join concurrency, and cross-tenant key reuse.
- Conflict recovery is tenant-leading. Losers roll back journal allocation, event, epoch, and resource so exactly one result/event/sequence commits and no losing counter advance remains.

Name fields use Unicode display name plus deterministic application-normalized `name_key`, exact bounds, and scoped uniqueness. Purpose is bounded plain text; raw HTML is neither stored nor rendered.

## 9. Trusted event provenance

AW-009 uses the AW-010A constructor only with the active human session actor. Request bodies cannot supply envelope tenant/channel/sequence/ID/actor/time. In the same locked transaction it verifies actor principal, kind, workspace/channel authorization, target membership semantics, and payload/epoch agreement before append. Arbitrary system actors, cross-tenant actors, kind mismatch, and client envelope overrides are negative tests.

## 10. HTTP v1 inventory

Strict Zod ingress; unknown tenant/principal/actor/legacy/extra fields fail before use-case invocation. Responses are DTOs, not ORM rows.

| Method/path | Class | Result/authorization |
|---|---|---|
| `GET /health/live` | public exemption | minimal liveness |
| `GET /health/ready` | public exemption | bounded dependencies |
| `GET /api/v1/session` | protected read | current session |
| `DELETE /api/v1/session` | origin-protected neutral | §4 logout |
| `GET /api/v1/workspaces` | protected read | active memberships, opaque cursor |
| `POST /api/v1/workspaces` | protected mutation | workspace + owner + default public channel/join |
| `GET /api/v1/workspaces/{workspace_id}` | protected read | active workspace member |
| `GET /api/v1/workspaces/{workspace_id}/channels` | protected read | public + member-visible private |
| `POST /api/v1/workspaces/{workspace_id}/channels` | protected mutation | owner/admin/member; guest denied |
| `GET /api/v1/channels/{channel_id}` | protected read | public workspace member/private member |
| `PUT /api/v1/channels/{channel_id}/members/me` | protected mutation | public self-join owner/admin/member |
| `GET /api/v1/channels/{channel_id}/members` | protected read | public workspace member/private member |

Workspace creation atomically creates workspace, owner membership, default channel, AW-010A state, sequence-1 join event, and creator epoch.

Error envelope contains only `code`, `correlation_id`, `retryable`, optional `{field,code}` list. Cross-tenant/nonexistent/private-hidden share concealed `404 RESOURCE_NOT_FOUND` shape/size class. Known public role denial is `403`; validation `400`; conflict `409`; bounded dependency failure `503`. No SQL/stack/secret/private identifiers.

Initial authorization: any active tenant human may create a workspace/owner membership because no tenant-role table exists; owner/admin/member create channels and public self-join; guest is read-only; private visibility/member list requires active channel membership. This is an explicit reviewed policy, not an invented tenant role.

## 11. Module and exact runtime proxy ownership

- Contracts: `packages/contracts/src/http.ts`, `test/http.spec.ts`, generated `openapi-http-v1.json`, root exports/artifact generator.
- Chat-core: shared kernel; identity, tenancy, conversations ports/use cases; AW-010A journal port. No DB/Nest/Fastify/React/app imports.
- API: `createApplication(...)`, auth/origin guards, controllers, Postgres adapters. `main.ts` only parses env, owns S3/DB lifecycle, listens, shuts down.
- DB test support: deliberate `@agent-workspace/db/test-support` package export from `packages/db/test/support/index.ts`. Boundary tests allow it only from test/e2e paths and forbid every production `src` import.
- Web: contracts/UI only; never DB/API source.

Next uses `apps/web/app/api/v1/[...path]/route.ts` as a runtime transparent proxy, not a build-time rewrite. It forwards method/body/query, exact `Cookie` and browser `Origin`, and safe response status/body/`Set-Cookie`; strips hop-by-hop/forwarded headers and performs no schema transformation. `INTERNAL_API_BASE_URL` is validated server-only at runtime and absent from client JS/HTML/RSC.

Proxy/private routes export `dynamic = "force-dynamic"`, `fetchCache = "force-no-store"`, and `revalidate = 0`; server/browser fetches use no-store and same-origin credentials. Production build occurs before the random API port is known; the runtime env supplies the destination when Next starts.

## 12. Authenticated-shell UX

- `/`: valid session resolves first authorized stable location; missing/invalid/expired/revoked/deactivated shows a signed-out/session-invalid page with neutral explanation, no fake sign-in button, no private data, one stable heading focus target, and safe retry/help action.
- `/workspaces/{workspace_id}/channels/{channel_id}`: stable authenticated shell/deep link; unavailable target gives neutral access-changed state and safe return.
- White/light neutral UI; subtle borders/shadows; high contrast; no neon/glow/gradient, emoji icons, marketing hero, fake composer, or fake timeline.
- Workspace rail, active workspace/channel identity, public/private accessible SVG labels, channel purpose/member pane, real create/join actions only.
- Per-workspace last location is stored only in `sessionStorage` key namespaced by trusted tenant+principal+workspace. It contains stable channel ID only, is reauthorized before use, and is cleared on logout/session change/access denial. No messages/search/drafts/member content is stored.
- Forms retain data on authoritative error, associate field errors, focus first invalid, prevent duplicate submit, expose live-region result, and restore dialog focus.
- Browser assertions cover accessible names, descriptions/errors, initial/focus trap/Escape/restore, visible focus, reduced motion, 320px overflow, guest controls, permission changes, signed-out and neutral states.
- Interaction testing uses Playwright only; no undeclared jsdom/testing-library/axe stack. Full AW-012 accessibility remains later.

## 13. UX registry and trace privacy

All 32 AW-009 rows remain `NOT_RUN` until their entire atomic automated+manual requirement exists. Create `docs/quality/aw009-ux-coverage.json` containing every ONB-01..10, NAV-01..12, ADM-01..10 with tier/mode/status/rationale/artifact links.

Plausible future full-row candidates after this preview are only `ONB-02`, `NAV-01`, `NAV-02`, `NAV-03`, `NAV-04`, `NAV-05`, `NAV-12`; they still remain `NOT_RUN` until exact manual artifacts also pass. `NAV-11`, `ADM-01`, and `ADM-09` are not claimed. Engineering tests use `AW009-*` feature keys, never false registry PASS keys.

Authenticated Playwright trace/screenshot/video upload is forbidden by default. AW-009F0 performs a version-pinned trace privacy spike before any browser evidence claim:

1. mint a canary cookie/signing secret/DB URL/private sentinel;
2. produce a deliberate failing Playwright 1.62.1 trace;
3. attempt a reviewed sanitizer/export;
4. recursively unpack the final upload candidate and scan every file/archive/member for cookie name/value, signing secrets, DB credentials/URLs, `Cookie`, `Set-Cookie`, `Authorization`, and private sentinels;
5. verify any claimed sanitized trace still opens with the same Playwright version;
6. delete raw mode-`0600` trace in aggregate cleanup.

If a safe openable trace cannot be proved, product implementation may continue with authenticated trace `off`, but **no UX registry AUTO-E2E row is claimed** and the registry trace contract requires a separate reviewed amendment before row closure. Upload never runs after failed secret/canary scan.

## 14. Exact real-process E2E graph

Files are frozen in `docs/plans/aw-009-task-cards.md`. Process sequence:

1. `packages/db/test/support/index.ts` starts one digest-locked PostgreSQL container and role-separated harness.
2. Migrate with migrator URL; API uses runtime URL.
3. Seed tenant/principal/session/workspace through test support, never HTTP.
4. Mint cookie with the same production `SessionCredentialCodec`; inject with `browserContext.addCookies`. No allow-all verifier.
5. Create the same Nest/Fastify factory production uses; test composition injects real DB and an explicit no-op storage readiness probe because storage behavior is out of this E2E scope. Listen on loopback port `0` and read bound address.
6. Build Next once; start production `next start` on a bounded reserved random loopback port with runtime API URL and test app environment.
7. Wait exact Web/API readiness; run Chromium worker 1/retries 0.
8. Cleanup in `finally`: browser → Web → API/pools → container/temp, aggregate failures, verify residue zero and fixture helpers absent from production imports/routes/bundle.

Loading uses a real PostgreSQL row/advisory lock held by test support, not a mocked route. Conflicts use real concurrent data. Permission/session changes mutate fixture DB between render and submit.

## 15. Countable isolation matrix

Install an `onRoute` inventory hook before Nest initialization. Normalize method/path and explicitly classify generated HEAD/OPTIONS. Compare with the committed 12-row API matrix in §10; Web `/api/health` has a separate inventory. Unknown, duplicate, unclassified, uncovered, or unjustified exemption fails.

`tests/isolation/aw009-route-matrix.ts` implements this literal reviewed matrix. `A` means the named mutation class is required; `N/A — …` is the only accepted reason. A generated case belongs to exactly one `A` cell.

| Route | path | query | body | header | cookie | cursor |
|---|---|---|---|---|---|---|
| `GET /health/live` | N/A — no resource path | N/A — no query schema | N/A — safe GET | N/A — public exemption | N/A — public exemption | N/A — no page |
| `GET /health/ready` | N/A — no resource path | N/A — no query schema | N/A — safe GET | N/A — public exemption | N/A — public exemption | N/A — no page |
| `GET /api/v1/session` | N/A — no resource path | N/A — no query schema | N/A — safe GET | A — forged tenant/actor header | A — tampered/other-tenant session | N/A — no page |
| `DELETE /api/v1/session` | N/A — no resource path | N/A — no query schema | A — forbidden tenant/actor body | A — forged tenant/actor/origin header | A — missing/tampered/replayed session | N/A — no page |
| `GET /api/v1/workspaces` | N/A — collection path | A — forbidden tenant/principal query | N/A — safe GET | A — forged tenant/actor header | A — other-tenant session | A — other-tenant/tampered cursor |
| `POST /api/v1/workspaces` | N/A — collection path | N/A — no query schema | A — forbidden tenant/principal/creator body | A — forged tenant/actor/origin header | A — other-tenant session | N/A — no page |
| `GET /api/v1/workspaces/{workspace_id}` | A — other-tenant/missing workspace | N/A — no query schema | N/A — safe GET | A — forged tenant/actor header | A — other-tenant session | N/A — no page |
| `GET /api/v1/workspaces/{workspace_id}/channels` | A — other-tenant/missing workspace | A — forbidden tenant/principal query | N/A — safe GET | A — forged tenant/actor header | A — other-tenant session | A — other-tenant/tampered cursor |
| `POST /api/v1/workspaces/{workspace_id}/channels` | A — other-tenant/missing workspace | N/A — no query schema | A — forbidden tenant/principal/creator body | A — forged tenant/actor/origin header | A — other-tenant session | N/A — no page |
| `GET /api/v1/channels/{channel_id}` | A — other-tenant/missing/private channel | N/A — no query schema | N/A — safe GET | A — forged tenant/actor header | A — other-tenant session | N/A — no page |
| `PUT /api/v1/channels/{channel_id}/members/me` | A — other-tenant/missing/private channel | N/A — no query schema | A — forbidden tenant/principal/target body | A — forged tenant/actor/origin header | A — other-tenant session | N/A — no page |
| `GET /api/v1/channels/{channel_id}/members` | A — other-tenant/missing/private channel | A — forbidden tenant/principal query | N/A — safe GET | A — forged tenant/actor header | A — other-tenant session | A — other-tenant/tampered cursor |

Fastify-generated `HEAD` aliases are captured and must have the same public/protected classification and guards as their source GET, but are recorded as derived aliases and do not enlarge the 12-row denominator. The expected registered `OPTIONS` count is exactly zero; observing one fails inventory and requires plan review rather than an automatic exemption.

The generated denominator is exactly **592 accepted cases** with no discard/filter and one cell per case: 32 for each of six `A` path cells (192), 24 for each of three `A` query cells (72), 24 for each of four `A` body cells (96), 8 for each of ten `A` header cells (80), 8 for each of ten `A` cookie cells (80), and 24 for each of three `A` cursor cells (72). Ten same-tenant positive controls—one for each non-health route—run separately and are not counted in 592. Every cell floor and the sum are code assertions.

All 592 **executed and accepted generator cases** run with frozen seed `9009001`, recorded fast-check replay path, retries 0, and zero filtered/discarded cases. Record registered/protected/public-neutral/exempt/covered/N-A counts, mutation executions, positive controls, denials, zero-write checks, and sentinel scans; arithmetic must balance.

Unauthorized-byte zero means sentinel scan across body/headers/errors/API+Web logs/Playwright output/evidence. Unauthorized-write zero compares before/after domain rows, journal rows, and sequence state. Session/origin/cookie cases and existing-vs-missing concealed shapes are included.

## 16. Canonical evidence policy

Use registry paths:

- `artifacts/chat-ux/<release-id>/auto-e2e/results.json`
- `artifacts/chat-ux/<release-id>/auto-isolation/results.json`
- `artifacts/chat-ux/<release-id>/auto-model/`
- `artifacts/chat-ux/<release-id>/aw009-manifest.json`

Directory `0700`; files `0600`; exclusive/no-overwrite/symlink rejection. Manifest contains all 32 rows as PASS/FAIL/NOT_RUN, rationale and links. This preview initially preserves all 32 as NOT_RUN even when engineering automated tests pass.

Allowed upload paths/counts are exact and parsed before upload. Recursively unpack/scan every candidate archive. Never retain cookies, tokens, signing keys, auth headers, DB URLs/passwords, customer paths, raw private bytes, or unsanitized traces/screenshots/videos/logs. Canary gate must fail closed. Upload uses `if: always()` only after the secret gate and `if-no-files-found: error`; no derivative upload can mask an upstream failure.

## 17. Development execution and path locks

The authoritative bite-sized cards are `docs/plans/aw-009-task-cards.md`; no coarse heading authorizes implementation. AW-009F0 is in the graph and performs dependency/lifecycle/trace preflight before product code.

Shared paths are exclusive locks:

| Path set | Order/owner |
|---|---|
| chat-core index/manifest/config | AW-010A commits first; AW-009 cards serialize afterward |
| API manifest/config/app factory | AW-010A adapter card first; AW-009F0/D cards serialize |
| root manifest/lock/workspace policy | AW-009F0 only until committed; later changes require re-review |
| DB migration journal/snapshots/integrity | one DB card at a time; AW-010A before AW-009B |
| workflow, boundary config, exact-tree checker | final integration owner only after feature commits |
| plans/board | orchestrator only; reviewers write only their review docs |

No AW-009 cards run in parallel before AW-010A DONE. After that, only cards whose task document has disjoint path locks may run concurrently.

## 18. Verification gates

```bash
CI=true pnpm install --frozen-lockfile
pnpm --filter @agent-workspace/contracts contracts:check
pnpm --filter @agent-workspace/chat-core test:unit
pnpm --filter @agent-workspace/db test:unit
pnpm --filter @agent-workspace/db test:integration
pnpm --filter @agent-workspace/api test:unit
pnpm --filter @agent-workspace/api test:integration
pnpm test:isolation
pnpm test:e2e -- --project=chromium
pnpm db:check
pnpm boundaries:check
pnpm scaffold:check
TURBO_FORCE=true pnpm run ci
git diff --check
```

Hosted order: frozen install → uncached static/unit/build → real integration → isolation → `playwright install --with-deps chromium` → production-mode Chromium → secret/canary scan → fail-closed expected artifact upload. `pnpm run ci` alone is never called full AW-009 success. Record browser version/revision/executable hash and runner image.

## 19. Abort, escalation, and completion

**Abort:** fabricated membership sequence; request-selected tenant/actor; non-linearizable mutation auth; fake login/test route; raw credential artifact; old migration rewrite; skipped/todo/no-op/future test; generic message/outbox/idempotency/projection table in AW-009.

**Escalate/re-review:** OIDC/JWT/session issuance; invite/DM/admin/deactivation UI; RLS; role privilege redesign/SECURITY DEFINER; safe-trace registry amendment; new lifecycle/build script; browser strategy/version; UX ownership/denominator change.

This authenticated-shell preview completes only after AW-010A DONE, every bite-sized card passes spec then quality/UX review, real hosted gates pass at final head, and evidence is credential-free. It is not a production login path, complete chat, or AW-009 registry closure. AW-009 remains RUNNING; next is production identity/onboarding and remaining conversation scope, then AW-010 messages/history and AW-011 realtime—not Agent product work.
