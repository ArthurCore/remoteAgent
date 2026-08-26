REQUEST_CHANGES

# AW-009 Plan UX, E2E/Isolation, and Executability Review (xhigh)

**Reviewed baseline:** `16385e5aa162dc69bf6e4e343ffd948c4b47e8eb` plus the uncommitted AW-009/AW-010A plans and execution-board update present in the workspace.

**Scope:** independent pre-implementation review of `docs/plans/aw-009-tenant-workspace-channel-vertical-slice.md`, the user-visible critical path, real Web→API→PostgreSQL proof, isolation accounting, UX-registry traceability, and worker/review sequencing.

**Decision:** AW-009 implementation must not begin from the current plan. The proposed product shape is directionally sound, and the plan correctly refuses to fake a composer or message history, but the test harness, evidence contract, registry claims, Next runtime behavior, and shared-file sequencing are not yet exact enough to execute without improvisation or overclaiming.

## Confirmed prerequisite correction

I re-read `docs/plans/aw-010a-channel-stream-foundation.md:55`. The corrected migration rule is acceptable: existing channels receive sequence state `0` only after proving `channel_membership_epochs` is empty, and any pre-stream membership row makes migration fail rather than legitimizing a synthetic marker. This finding is closed and is not a reason for the verdict.

## Blocking findings

### UXE-01 — The ten claimed UX IDs are not ten fully applicable, passable registry rows

**Evidence**

- AW-009 §10 names `ONB-02`, `NAV-01`, `NAV-02`, `NAV-03`, `NAV-04`, `NAV-05`, `NAV-11`, `NAV-12`, `ADM-01`, and `ADM-09` as target automated cases.
- The registry makes each ID atomic (`chat-ux-gate-registry.md:51-53`) and requires exact automated and manual artifacts (`:68-92`). A passing sub-clause is not a passing row.
- `NAV-11` also requires message links. Messages and message links are explicitly out of AW-009 scope, so a channel deep-link test cannot emit `AUTO-E2E::NAV-11 = PASS` or `AUTO-ISO::NAV-11 = PASS`.
- `ADM-01` requires an owner/admin-only capability separated from member UI and enforced by the server. This increment defines no owner/admin-only operation: channel creation is allowed to owner/admin/member, and workspace creation is allowed to every active tenant-bound human.
- `ADM-09` concerns administrative mutation errors and changed administrative permission. No administrative mutation is in scope, so ordinary channel-form behavior cannot be relabeled as this row.
- `NAV-02` additionally requires a sensible last location per workspace. The plan specifies a switcher and stable links but no storage/keying/invalidation behavior for last location.
- `ONB-02` is not executable until the signed-out/session-invalid UI and the exact pre-submit sign-in-prerequisite copy are specified. The current route section only defines the authenticated redirect.

**Required correction**

1. Remove `NAV-11`, `ADM-01`, and `ADM-09` from the increment's pass-target set. Channel deep-link, role-denial, and stale-authority tests should use AW-009 feature-test keys, not registry PASS keys.
2. Keep `ONB-02` and `NAV-02` as targets only after adding the missing signed-out/precondition and per-workspace-last-location contracts and tests.
3. Treat all 32 rows as `NOT_RUN` before evidence is actually produced. At closure, only rows with every required automated and manual artifact may change to PASS.
4. Add an exact 32-row manifest to the plan/evidence. The review disposition is:

| ID | Tier / mode | Current status | Increment disposition |
|---|---|---|---|
| ONB-01 | tracked / manual | `NOT_RUN` | Message/invite empty-state actions are absent; do not fake them. |
| ONB-02 | blocking / hybrid | `NOT_RUN` | Eligible only after signed-out/session-invalid and pre-submit prerequisite behavior is exact. |
| ONB-03 | tracked / manual | `NOT_RUN` | Optional onboarding resume/dismiss is absent. |
| ONB-04 | blocking / hybrid | `NOT_RUN` | Invitation creation is absent. |
| ONB-05 | non-waivable / hybrid | `NOT_RUN` | Invitation lifecycle is absent. |
| ONB-06 | non-waivable / hybrid | `NOT_RUN` | Invitation acceptance grants are absent. |
| ONB-07 | non-waivable / hybrid | `NOT_RUN` | Already-a-member invite flow is absent. |
| ONB-08 | non-waivable / hybrid | `NOT_RUN` | Invite idempotency/concealment is absent. |
| ONB-09 | non-waivable / hybrid | `NOT_RUN` | First-run shell alone cannot satisfy the atomic invite-page plus shell row. |
| ONB-10 | blocking / hybrid | `NOT_RUN` | Invite-link policy/copy is absent. |
| NAV-01 | blocking / hybrid | `NOT_RUN` | Planned full-row candidate. |
| NAV-02 | non-waivable / hybrid | `NOT_RUN` | Candidate only after last-location and cache/invalidation behavior is specified. |
| NAV-03 | non-waivable / hybrid | `NOT_RUN` | Planned full-row candidate. |
| NAV-04 | blocking / hybrid | `NOT_RUN` | Planned full-row candidate. |
| NAV-05 | non-waivable / hybrid | `NOT_RUN` | Planned full-row candidate. |
| NAV-06 | tracked / manual | `NOT_RUN` | Leave flow is absent. |
| NAV-07 | non-waivable / hybrid | `NOT_RUN` | Archive/restore is absent. |
| NAV-08 | blocking / hybrid | `NOT_RUN` | DM creation/reuse is absent. |
| NAV-09 | tracked / manual | `NOT_RUN` | DM/presence/deactivated-participant UI is absent. |
| NAV-10 | tracked / manual | `NOT_RUN` | DM, unread, and collapse behavior is absent; grouping channels alone is partial. |
| NAV-11 | non-waivable / hybrid | `NOT_RUN` | Channel-link subcase is testable, but message links are absent; no row PASS. |
| NAV-12 | non-waivable / hybrid | `NOT_RUN` | Planned full-row candidate. |
| ADM-01 | non-waivable / hybrid | `NOT_RUN` | No owner/admin-only UI or API capability exists in this increment. |
| ADM-02 | blocking / hybrid | `NOT_RUN` | Member administration is absent. |
| ADM-03 | blocking / hybrid | `NOT_RUN` | Role/last-owner changes are absent. |
| ADM-04 | non-waivable / hybrid | `NOT_RUN` | Deactivation administration is absent. Session TOCTOU testing is not this row. |
| ADM-05 | non-waivable / hybrid | `NOT_RUN` | Archive/restore administration is absent. |
| ADM-06 | non-waivable / hybrid | `NOT_RUN` | Retention administration is absent. |
| ADM-07 | tracked / manual | `NOT_RUN` | Audit view is absent. |
| ADM-08 | non-waivable / hybrid | `NOT_RUN` | Audit immutability/filter/export is absent. |
| ADM-09 | non-waivable / hybrid | `NOT_RUN` | No administrative mutation/error/permission-change path exists. |
| ADM-10 | tracked / manual | `NOT_RUN` | Deferred workspace-wide export remains absent. |

Count check: **32 rows = ONB 10 + NAV 12 + ADM 10 = 17 non-waivable + 8 release-blocking + 7 tracked-polish**. After revision, the plausible full-row candidates are seven rows: `ONB-02`, `NAV-01`, `NAV-02`, `NAV-03`, `NAV-04`, `NAV-05`, and `NAV-12`. Their required manual evidence is still mandatory.

### UXE-02 — The production user entrance is absent, so “first real user-visible product surface” overclaims the slice

**Evidence**

- Password login, production OIDC exchange, and any fake login endpoint are all out of scope.
- A signed, tenant-bound session row and cookie are required, but the plan defines no production component allowed to create the first legitimate session/cookie.
- `/` only describes behavior after an active session exists. Missing, invalid, expired, revoked, and deactivated browser states have no user-visible route contract.

**Impact**

The browser E2E can prove an authenticated shell using a test fixture, but a production human cannot enter that shell from the planned product. Calling it a production user-visible critical path is misleading, and `ONB-02` cannot be honestly exercised as written.

**Required correction**

Choose one explicitly:

- define this as an **authenticated-shell preview/vertical slice** whose production availability remains blocked on a separately reviewed issuer/OIDC card; or
- add the exact reviewed production session-issuance boundary and dependency to scope.

In either case, specify the signed-out/session-invalid page: neutral explanation, no fake sign-in button, no workspace/private data, stable focus target, and safe retry/return action. Keep fixture-only access visibly distinguished from production authentication.

### UXE-03 — The Web→API→PostgreSQL harness is a goal, not an executable process graph

**Evidence**

- The current API has only `main.ts` bootstrap plus `/health/live` and `/health/ready`; there is no exported application factory.
- Current `main.ts` constructs PostgreSQL and S3 dependencies directly. The plan says tests use a real API and PostgreSQL, but it does not freeze which readiness dependencies are real/injected or how the factory differs from production composition.
- The existing PostgreSQL harness is package-private at `packages/db/test/support/postgres.ts`, carries AW-008 labels/evidence names, and is not an importable public package surface. “A test-only public support path” is not an exact file/export/boundary.
- No exact Playwright config, global setup/teardown, process-start order, migration/seed procedure, readiness check, port handoff, or aggregate cleanup path is named.

**Required correction**

Add exact file paths and a deterministic sequence that can be copied into implementation:

1. start one locked-image PostgreSQL Testcontainer;
2. migrate through the migrator role and connect the API through the runtime role;
3. seed tenant/principal/session/workspace fixtures through a test-support module, never HTTP;
4. create the same Nest/Fastify application factory production uses, listen on port `0`, and read the bound address;
5. start an actual built Next server after its API destination is known;
6. wait on exact readiness endpoints, run Chromium with one worker/retries zero, then close browser → Web → API/pools → container in `finally`, aggregating cleanup failures;
7. statically and dynamically prove no `/test`, `/__e2e`, fixture, mint, or bootstrap route is registered or bundled.

Name every created/modified test/config/support file and the exact red/green command for it. Do not import `packages/db/test/**` across a package boundary; define and police a deliberate test-support export.

### UXE-04 — The session fixture can bypass the very credential behavior the E2E claims to prove

**Evidence**

AW-009 permits an injected “identity verifier/session fixture,” while Chromium E2E is also claimed to test a signed session. Injecting a verifier that accepts fixture identity would skip cookie signing, signature rotation, row lookup, expiry, revocation, and tenant binding.

There is also an unresolved logout contradiction: AW-009 says every revoked credential returns `401 SESSION_INVALID`, but repeated logout is neutral. The route inventory and E2E cannot be exact until missing cookie, tampered cookie, already-revoked signed cookie, and replay on another protected route have distinct frozen outcomes.

**Required correction**

- Inject only deterministic clock/ID/secret inputs; do not inject an allow-all identity result into E2E.
- Seed the real `identity_sessions` row directly and mint the browser cookie with the same production `SessionCredentialCodec`/signer implementation used by the guard. Put it into the context with `browserContext.addCookies`; expose no mint route.
- Cover current secret, previous secret, tamper, tenant/session mismatch, expiry, revocation, deactivation, and transaction-time recheck through the real guard/adapters.
- Freeze logout semantics for missing, malformed, revoked, and valid cookies, including cookie clearing and subsequent replay.
- Add a boundary test proving fixture helpers are absent from production imports and route inventory.

### UXE-05 — “Failure traces required” and “cookies never in traces” are currently incompatible

**Evidence**

- The UX registry requires Playwright traces for failures (`chat-ux-gate-registry.md:84`).
- AW-009 promises that raw cookies/tokens/signing keys never enter traces or artifacts.
- A normal Playwright trace of authenticated same-origin traffic can contain request headers, cookie/storage state, DOM snapshots, URLs, and response content. `HttpOnly` prevents page script access; it does not establish trace redaction.

**Required correction**

Before approving Playwright, provide one exact, version-pinned trace policy that satisfies both requirements. It must include a sentinel test that deliberately authenticates, fails, produces the final upload candidate, recursively inspects the trace archive and every attachment for the cookie name/value, signing secrets, DB URLs/passwords, `Cookie`/`Set-Cookie`/`Authorization`, and tenant-private sentinels, and fails closed on any hit. Also prove the sanitized trace remains openable if it is claimed as the registry trace. “Synthetic” or “disposable” does not make a bearer cookie permissible under the plan's absolute no-cookie rule.

If Playwright 1.62.1 cannot produce a verifiably sanitized failure trace, revise the evidence policy in the authoritative registry through a separate reviewed change; do not silently omit traces or upload raw ones.

### UXE-06 — Next rewrite, runtime port binding, and private-cache behavior are underspecified

**Evidence**

- Current `apps/web/next.config.ts` has no rewrite.
- The plan requires random API/Web loopback ports and an actual Next server, but a `rewrites()` destination derived from `INTERNAL_API_BASE_URL` may be materialized at Next build/config time. The plan's hosted order builds before E2E and never explains how the random API address reaches that built server.
- `cache: "no-store"` is necessary but not a complete App Router contract. The plan does not freeze server-component versus browser fetches, cookie forwarding, dynamic rendering, client router/prefetch cache invalidation, logout hard navigation/refresh, or back-navigation behavior.
- Same-origin mutation requests also need exact credential and Origin/CSRF behavior; a rewrite assertion alone does not prove cookie forwarding or `Set-Cookie` clearing.

**Required correction**

Specify and test:

- exact `/api/v1/:path*` destination construction and validation, with `INTERNAL_API_BASE_URL` remaining server-only and absent from client bundles/HTML;
- whether the E2E rebuilds Next after the API port is known or uses another reviewed runtime-safe transparent proxy design; `next dev` is not a substitute for the production-mode proof;
- distinct app environment versus `NODE_ENV`, so loopback E2E can use the explicitly non-production cookie while an actual production Next build runs;
- `cache: "no-store"` plus route-level dynamic/no-revalidate behavior for session/private data;
- cookie forwarding, `Set-Cookie` logout clearing, `credentials: "same-origin"`, Origin rejection, and no cross-origin API calls in the browser;
- session A → logout/revoke → session B in the same Web process, including client navigation, prefetch/RSC payload, refresh, and browser Back, with tenant-A/private sentinels absent from HTML, RSC, DOM, logs, screenshots, and final artifacts.

### UXE-07 — Route inventory and the “500+” isolation denominator are not countable as written

**Evidence**

The expected final API inventory from the plan is 12 method/path entries: two health routes plus ten `/api/v1` routes. The current registered API inventory is only the two health GETs; the Web also has a separate `GET /api/health`. Fastify can additionally expose generated `HEAD` routes, and future hook/plugin routes can appear. The plan neither freezes how these are represented nor proves that captured public/protected metadata comes from real registration.

The requirement that every protected route receive path/query/body/header/cookie/cursor tenant substitutions is literally impossible: several routes do not have all of those ingress dimensions, and workspace creation has no existing resource identifier to substitute. “500 mutations” also lacks distribution, accepted-run, discard, and per-route/per-ingress accounting. A single arbitrary could satisfy the number while missing routes.

**Required correction**

1. Capture inventory with a hook installed before Nest initialization, normalize method/path, account explicitly for generated `HEAD`/`OPTIONS`, and compare against a committed expected matrix. Health exemptions must be exactly named, not “health routes.” Unknown, unclassified, duplicate, or uncovered registration must fail.
2. Freeze these intended API entries in the matrix: `GET /health/live`, `GET /health/ready`, and the ten method/path rows in AW-009 §6. Keep `GET /api/health` in the separate Web inventory.
3. Give every route × ingress dimension an explicit `APPLICABLE` or reasoned `N/A`; do not invent meaningless mutations to fill cells.
4. Define the property denominator as at least 500 **executed, accepted cross-tenant mutation cases** with retries zero, frozen `seed` and replay `path`, zero filtered/discarded cases unless separately counted, and positive coverage floors for every applicable protected resource route and ingress class.
5. Record `registered`, `protected`, `public-exempt`, `covered`, `N/A`, mutation executions, positive controls, denials, zero-write checks, and sentinel-leak checks. Assert the arithmetic in code before writing evidence.
6. Define “zero unauthorized bytes” as a sentinel scan over response body/headers, serialized errors, API/Web logs, Playwright output, and evidence—not an unmeasurable slogan. Define zero-write using before/after row/event/sequence or transaction-ledger assertions.

### UXE-08 — Evidence paths and criterion results do not conform to the authoritative registry

**Evidence**

- The registry requires `artifacts/chat-ux/<release-id>/auto-e2e/results.json`, `auto-isolation/results.json`, and exact manual paths.
- AW-009 instead defines `artifacts/aw009/<run-id>/` and does not name the seven candidate rows' required signed manual files.
- “Evidence keys appear” is insufficient: the artifact must report result, release ID, Git SHA, environment, timestamp, and other catalog fields. Non-target owner rows must not disappear from the denominator.

**Required correction**

Use the canonical registry tree or change the registry in the same separately reviewed change. The AW-009 manifest must contain all 32 owner rows with explicit `PASS`, `FAIL`, or `NOT_RUN`, rationale, and artifact links. For the seven plausible targets, require exactly:

- `ONB-02`: `AUTO-E2E` + `MAN-UX`;
- `NAV-01`: `AUTO-E2E` + `MAN-UX`;
- `NAV-02`, `NAV-03`, `NAV-05`, `NAV-12`: `AUTO-E2E` + `AUTO-ISO` + `MAN-SEC`;
- `NAV-04`: `AUTO-E2E` + `MAN-UX`.

No row becomes PASS when only its automated half passes. Preserve 25 explicit `NOT_RUN` rows and keep AW-009 overall RUNNING after this increment.

### UXE-09 — Accessibility, loading, and changed-permission tests have no executable harness

**Evidence**

- Existing shared Vitest configuration uses `environment: "node"`; the UI package has no DOM test script or DOM/testing-library dependency.
- The dependency disclosure adds Playwright but no jsdom/happy-dom/testing-library/axe packages. “Fixture-driven rendering/interaction tests” therefore cannot be assumed to support DOM focus/dialog behavior.
- The plan requires deterministic loading, error, focus, and permission-change states but forbids backend route mocking and provides no non-route synchronization mechanism.

**Required correction**

- Either make browser E2E the sole interaction harness using the disclosed Playwright dependency, or disclose exact DOM-test dependencies before installation. Do not add an undeclared test stack during implementation.
- Freeze selectors and assertions for accessible names, field descriptions/errors, first-invalid focus, pending/duplicate submit, live-region announcement, dialog initial focus/trap/Escape/restore, visible focus, reduced motion, 320 px overflow, private icon names, guest control state, neutral concealed state, and safe focus after navigation/logout.
- Produce loading without a mocked response: use a documented test-process IPC/DI barrier or a deterministic database lock while the real request continues. Produce conflicts with real data. Produce permission/session changes by direct fixture DB mutation between render and submit. No production test route.
- Add manual keyboard and screen-reader evidence only for rows whose registry requires it; do not imply full AW-012 accessibility closure.

The no-fake-messaging requirement itself is good: keep AW-009 §9's prohibition on composer/timeline UI, and ensure empty-state copy offers only actions that really exist in this increment. It must not offer “write a message” or “invite people” yet.

### UXE-10 — Playwright installation/CI impact is incompletely disclosed

**Evidence**

The exact `@playwright/test@1.62.1` and Chromium download are disclosed, but the plan does not state how Linux browser system libraries are obtained. `playwright install chromium` downloads the browser but does not itself guarantee all `ubuntu-latest` OS dependencies. The current workflow has no browser install/cache step.

**Required correction**

Before dependency approval, choose and disclose one exact hosted strategy:

- `playwright install --with-deps chromium`, including root/apt/network/time/image impact; or
- a digest-pinned Playwright-compatible job/container whose browser and system-library versions are verified against 1.62.1.

Record the actual Chromium revision in evidence. Freeze worker count, retries, trace/screenshot/video policy, output paths, timeouts, and no hidden browser download in lifecycle scripts. If no DOM/axe packages are approved, state that all applicable accessibility assertions use Playwright plus manual artifacts.

### UXE-11 — Kanban dependencies permit shared-file races and contradict the board's BLOCKED state

**Evidence**

- `docs/execution-board.md` marks AW-009 `BLOCKED (AW-010A)`, while AW-009 says several implementation cards may proceed during AW-010A.
- AW-010A1 and AW-009C can both edit `packages/chat-core/src/index.ts` and potentially its manifest/config.
- AW-010A3/A4 and AW-009F0/F can edit API/root manifests, workflow, lockfile, boundary rules, and `scripts/assert-aw007-tree.mjs`.
- AW-009F0 is missing from the exact dependency graph.
- AW-0090 lists the AW-010A plan and execution board as files for the AW-009 worker even though workers are restricted to their own deliverable paths. Reviewers also need review-only ownership, not permission to alter implementation.

**Required correction**

- Reconcile the parent board with subcard status: either no AW-009 code starts until AW-010A DONE, or represent independently runnable AW-009 subcards and their dependencies explicitly.
- Add a path ownership/lock table. At minimum serialize chat-core exports/manifests after AW-010A1, and serialize root/API manifests, lockfile, workflow, boundary config, and exact-tree checker after the corresponding AW-010A changes. Put AW-009F0 in the graph.
- A worker may not edit the other card's plan or board unless assigned that exact deliverable. Review workers write only their own review document.
- Preserve the corrected AW-010A migration as a hard merge prerequisite for every membership/default-channel auto-join path.

### UXE-12 — The implementation cards are too coarse for TDD/review execution

**Evidence**

Cards A–F combine multiple packages and behaviors, use generic path labels such as “DB schema modules” and “Web routes/components/client/config/tests,” and provide no exact focused test path, red command/expected failure, minimal green step, green command/expected count, or card commit boundary. This does not meet the plan's own fresh-worker/two-review cadence and leaves substantial design to implementers.

**Required correction**

Break the plan into bite-sized, path-exact cards. Separate at least: contracts/artifact generation; environment/session codec; schema/migration; session use cases; workspace use cases; channel policy/use cases; PostgreSQL adapters; app factory/guard; each endpoint group; UI primitives; dynamic routing/cache; forms/permission states; route-inventory harness; isolation generator; E2E global setup/session fixture; browser journeys; evidence/CI. For every card provide:

1. exact create/modify/test paths;
2. one failing test/fixture and exact focused command with expected failure;
3. minimum implementation step;
4. exact focused and regression commands with expected success;
5. spec review, then independent quality/security or UX/accessibility review;
6. finding-resolution loop and an exclusive commit path set.

No worker may begin a later card merely because an earlier plan heading exists; dependencies are satisfied only by reviewed commits at the required head.

## Approval conditions

A revised plan can be approved when all twelve findings are closed in the plan itself, the seven honest candidate UX rows and 25 `NOT_RUN` rows are explicit, the trace/privacy conflict has a demonstrated technical resolution, the real-process harness is copy-executable without a production test route, the registered-route and 500-case arithmetic is code-checkable, and the shared-file dependency graph has no concurrent owner.
