# AW-006 — Final Foundation Re-review (xhigh)

- **Reviewed revision:** `0c5852d`
- **Review type:** narrow final gate against the six-item minimal correction list in `foundation-review-xhigh.md`
- **Verdict:** **REQUEST_CHANGES**
- **Dispatch decision:** AW-007 remains blocked.

The sync, projection, release-profile, source-policy, and UX-denominator work is substantially resolved. This review does not reopen non-blocking design preferences. Two implementation-blocking document inconsistencies remain: the AW-007 manifest is not yet an exact scaffold contract, and the two normative first-release backup bootstraps disagree.

## Six prior blockers

| # | Correction | Status | Final-gate finding |
|---:|---|---|---|
| 1 | Freeze the public sync contract | **RESOLVED** | AW-006A defines the exact nine-field envelope, decimal-string `event_seq`, opaque cursor, atomic `last_applied_cursor`, transport ACK separation, buffer-before-barrier handshake, durable `(B,F]` reconciliation, bounded failure behavior, and deterministic boundary-race suite. Controlling docs defer to it. |
| 2 | Publish projection semantics | **RESOLVED** | AW-006B supplies the complete event/effect matrix, root/thread cursors, non-monotonic attention register, mention generations, edit/delete/membership/visibility rules, private principal state, exact reducer state/output, vectors, and algebraic properties. |
| 3 | Publish one release-profile registry | **RESOLVED** | AW-006C retires lettered gates; separates `M1-OPS` and `M2-AGENT`; makes one-gateway/1,000 sockets blocking and 2,500 informational; defines accepted-message RPO 0 plus disaster RPO ≤5 minutes/RTO ≤60 minutes; and replaces M1 rolling/HA with controlled sole-gateway restart/resume. |
| 4 | Freeze the AW-007 scaffold manifest | **OPEN** | AW-006D has a useful root script namespace and correctly forbids future green placeholders, but its supposedly exact tree omits required implementation paths, its script ownership table is incomplete, and its RustFS references conflict. Details below. |
| 5 | Resolve source-local policy | **RESOLVED** | AW-006E permits approved private hosted product Git/CI, makes source-local product CI optional, preserves customer-repository local-by-default controls, and separates dependency/SBOM/license evidence from exact copied/adapted-source provenance. Controlling operations text defers to it. |
| 6 | Make the UX gate countable and tiered | **OPEN** | The mechanical registry itself passes: source and registry each contain 179 unique IDs, with exact tiers 91/54/34, one owner card per row, evidence modes, risk floors, and no placeholder evidence. However, AW-006F requires three full bootstrap restores while AW-006C §12 requires two isolated restores and calls its substitution complete; one release candidate can therefore receive different blocking answers. |

## AW-007 scaffold-manifest audit

| Required property | Result | Evidence |
|---|---|---|
| Exact tree/files | **FAIL** | §3 says the tree is exact, but §5 later adds `.dependency-cruiser.cjs` and `scripts/assert-boundary-fixture.mjs` outside that tree. The required invalid boundary fixture has no exact path, and the real `storage-init` implementation has no frozen source/script path. |
| Exact scripts | **PARTIAL** | The 15 root script names and AW-007 `ci` chain are enumerated. Future release scripts are correctly absent. Exactness still fails because seven root scripts lack explicit first-card ownership. |
| Card ownership | **FAIL** | `dev`, `clean`, `format`, `compose:up`, `compose:down`, `compose:reset`, and `container:smoke` are absent from the card-to-script ownership table. |
| Exact Compose inputs | **FAIL** | The verified pin is `rustfs/rustfs:1.0.0-rc.3@sha256:800cf3f352a0a27e3275ca854a51f0027975d7acc7a0d52089a35bcc9fcbf0b5`, while the Compose table specifies `rustfs/rustfs:v1.0.0`. AW-007 must not choose between them by guesswork. |
| No no-op placeholders | **PASS** | `contracts:check`, integration/release suites, migration commands, rolling/HA, and Agent tests are absent until their owning cards. AW-007 tests require semantic health/config/boundary assertions and forbid skipped/todo/trivial-true tests. |

## Deferred-scope verification

**VERIFIED.** Product direction, implementation plan, ADR, UX specification, quality strategy, release registry, execution board, and AW-007 manifest continue to exclude Shared Mind, product Kanban, and Orchestrator. Reserved principal/service seams and the later single-Agent profile do not authorize those products. The plan requires actual usage evidence and a separate approved PRD before deferred work begins, and AW-007 explicitly forbids their code, Agent SDKs, and task models.

## Minimal corrections still required

1. Replace the condensed AW-007 tree with one genuinely exact tree containing every required config, assertion script, invalid fixture, and `storage-init` implementation path.
2. Assign every canonical root script to its first owning card and make the RustFS Compose reference identical to the verified immutable pin.
3. Choose one first-release backup-bootstrap contract and make AW-006C and AW-006F identical on restore count, backup-ID/date selection, fixture depth, and activation/expiry rules.

After those narrow document fixes, rerun this final gate. Until then, **AW-007 may not start**.
