REQUEST_CHANGES

# AW-009 Plan UX, E2E/Isolation, and Executability Closure (xhigh)

**Reviewed:** the revised AW-009/AW-010A plans and task cards, `docs/execution-board.md`, and prior findings `UXE-01` through `UXE-12` in `docs/reviews/aw-009-plan-ux-test-review-xhigh.md`.

**Decision:** Ten findings are closed. `UXE-07` and `UXE-12` remain blocking. No implementation or test execution was reviewed or performed.

## Exact remaining blockers

### UXE-07 — OPEN: the promised route × ingress matrix is still not present

The revised plan freezes the 12 method/path inventory in AW-009 §10 and freezes the accepted-case accounting rules in §15, but it does not actually freeze the required route × ingress applicability matrix:

- `docs/plans/aw-009-tenant-workspace-channel-vertical-slice.md:228` only says that future `tests/isolation/aw009-route-matrix.ts` will mark cells `APPLICABLE` or reasoned `N/A`.
- `docs/plans/aw-009-task-cards.md:223-227` likewise leaves the matrix to the F3 implementer; “Red expected 12-route inventory and APPLICABLE/N-A matrix” is not the matrix.
- The table in AW-009 §10 is a route inventory/classification table, not the required 12 routes × `path/query/body/header/cookie/cursor` matrix. The applicability decisions and their N/A rationales therefore still require implementation-time invention.

The 500-case portion is otherwise corrected: the plan requires executed and accepted cases, frozen seed/replay path, retries zero, zero discards, route/ingress floors, balanced accounting, sentinel scans, and before/after write checks.

**Required to close:** put the literal 12-route × six-ingress matrix in the reviewed plan/task contract (or a pre-existing committed fixture referenced verbatim), with every cell fixed to `APPLICABLE` or a concrete `N/A` reason. Freeze how generated `HEAD` and any observed `OPTIONS` registrations map into the 12-row denominator, and freeze numeric per-route/per-ingress minimums so F3 implements a reviewed oracle rather than designing one.

### UXE-12 — OPEN: the task cards remain materially path- and command-inexact

The separate task-card document is a useful decomposition, but many cards still fail the prior executability requirements:

- Generic file families remain instead of exclusive exact paths, including F0 “root/API manifests,” A2 “contracts index/artifact generator/tests,” B1 “config env/tests,” B2 “DB schema tests and migration fixture tests,” C1-C3 module “source/tests,” D2-D5 adapter/controller “tests,” E1 and E3-E5 component/style/test families, F3 “API isolation specs, evidence writer,” F6 “root scripts, workflow ... boundary config,” and G1 “review/evidence docs and board.”
- Most cards say only “Red tests” or “Green focused/unit/integration” without an exact command, expected failing assertion/error, expected passing test count, and exact regression command. Only a minority, such as A1, provide even one focused command.
- Several “implement” steps remain design summaries rather than the minimum green edit. Card-local predecessor dependencies are not explicit even though AW-009 §17 permits disjoint cards to run concurrently after AW-010A.
- The header states the two-review policy, but most cards do not freeze a finding-resolution/re-review loop, and their broad file families cannot function as auditable exclusive commit path sets.

**Required to close:** for every F0/T0/A1-G1 card, enumerate exact create/modify/test paths; exact predecessor commits; one exact red command and expected failure; the minimum green edit; exact focused and regression commands with expected success/count; spec review followed by the named independent quality/security or UX/accessibility review; mandatory resolve-and-re-review loop; and an exclusive commit path set. No wildcard family such as “tests,” “config,” “components,” “root scripts,” or “review/evidence docs” may remain.

## Disposition of all prior findings

| Finding | Status | Closure basis |
|---|---|---|
| `UXE-01` | **CLOSED** | AW-009 §§1 and 13 make all 32 owner rows `NOT_RUN`, limit future full-row candidates to exactly `ONB-02`, `NAV-01`, `NAV-02`, `NAV-03`, `NAV-04`, `NAV-05`, and `NAV-12`, and explicitly refuse `NAV-11`, `ADM-01`, and `ADM-09` claims. §12 now freezes signed-out behavior and tenant/principal/workspace-scoped last location with reauthorization and clearing. |
| `UXE-02` | **CLOSED** | The goal and scope call this an authenticated-shell preview and state that production entry remains blocked on a separately reviewed issuer/OIDC card. AW-009 §12 defines the missing/invalid/expired/revoked/deactivated page with neutral copy, no fake sign-in control or private data, stable heading focus, and a safe retry/help action. |
| `UXE-03` | **CLOSED** | AW-009 §§11 and 14 now name the production/test app factory, deliberate `@agent-workspace/db/test-support` export, real PostgreSQL role-separated lifecycle, direct fixture seeding, production codec, API port `0`, built `next start`, runtime API destination, readiness, aggregate cleanup order, and route/import/bundle negative checks. F1/F2 name the principal support/config files. Remaining per-card command/path exactness is tracked solely under `UXE-12`. |
| `UXE-04` | **CLOSED** | AW-009 §§4, 6, and 14 require direct seeding of the real session row and minting through the production `SessionCredentialCodec`, prohibit an allow-all verifier/mint route, freeze rotation and strict cookie parsing, freeze neutral logout outcomes and clearing, and require replay, revocation, deactivation, mismatch, expiry, lock-race, production-import, route, and bundle checks. |
| `UXE-05` | **CLOSED** | AW-009 §§3 and 13 default authenticated trace/screenshot/video upload to off. T0 must generate a deliberately failing Playwright 1.62.1 canary trace, detect the raw leak, recursively scan the final candidate, prove any sanitized trace openable, and delete the raw trace. Failure to prove safety is an explicit abort for registry evidence: product work may continue only with traces off, no `AUTO-E2E` row claim, and a separately reviewed registry amendment. |
| `UXE-06` | **CLOSED** | AW-009 §11 replaces build-time rewrites with a runtime App Router proxy, validates a server-only runtime destination, forwards cookie/origin/body/query and `Set-Cookie`, strips unsafe forwarding headers, and freezes dynamic/no-store/no-revalidate behavior. §§5 and 14/F4 cover same-origin credentials, Origin rejection, production-mode Next, and session A → logout/revoke → session B in one Web process across navigation, prefetch/RSC, refresh, Back, and private-sentinel scans. |
| `UXE-07` | **OPEN** | The 12 routes and accepted-case arithmetic are now specified, but the literal route × ingress `APPLICABLE`/reasoned-`N/A` matrix and exact numeric floors are still deferred to F3. |
| `UXE-08` | **CLOSED** | AW-009 §§13 and 16 use the registry’s canonical `auto-e2e/results.json`, `auto-isolation/results.json`, and `auto-model/` locations and add a 32-row manifest with status, rationale, and links. All rows remain `NOT_RUN`, so no automated half is promoted to PASS and no manual artifact is falsely claimed. Future closure remains governed by the registry’s canonical `manual/ux.md` and `manual/security.md` requirements. |
| `UXE-09` | **CLOSED** | AW-009 §12 makes Playwright the sole interaction harness, enumerates the required focus/dialog/form/viewport/permission assertions, and disclaims a new DOM/axe stack and full AW-012 closure. §14 uses a real PostgreSQL lock for loading, real concurrent data for conflicts, and direct fixture DB mutation between render and submit for permission/session changes. |
| `UXE-10` | **CLOSED** | AW-009 §3 discloses exact Playwright/Chromium installation and hosted `playwright install --with-deps chromium` root/apt/network/mutable-runner impact, while freezing worker/retry/trace/screenshot/video policy and forbidding hidden lifecycle downloads. §§18-19 freeze hosted ordering and browser version/revision/hash evidence. |
| `UXE-11` | **CLOSED** | AW-009 §§1 and 17, AW-010A §§1 and 6, both task-card headers, and the board now enforce AW-010A approval/merge/DONE before any AW-009 code or dependency installation. The plans include F0/T0, cross-plan single-writer/path-lock rules, migration ordering, orchestrator-only plan/board ownership, and review-only review-doc ownership. AW-010A itself is serial. |
| `UXE-12` | **OPEN** | The cards are smaller, but many still omit exact paths, exact red/green/regression commands and expected results, minimum green edits, explicit predecessors, finding loops, and auditable exclusive commit sets. |

## Verdict

**REQUEST_CHANGES.** Do not approve AW-009 implementation until `UXE-07` and `UXE-12` are corrected in the reviewed plan/task contract. The other ten prior UX/E2E/isolation/executability findings are closed and should not be reopened absent a new regression.
