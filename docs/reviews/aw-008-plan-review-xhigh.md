# AW-008 Plan Closure Review — xhigh

## Basis and gate

- Re-reviewed only prior OPEN corrections 3 and 7 and the four findings from the prior review L35–43 against the current plan at baseline `0b4fc0a4459f042b22f09d0b9a794453c9143cb8`.
- The exact dev pins remain user-approved and are recorded at plan L7/L14–21; no installation or implementation is part of this closure.

## Re-evaluation of the four remaining findings

| Finding | Status | Exact current-plan evidence |
|---|---|---|
| Literal DDL | **RESOLVED** | Plan L104–140 freezes all six tables. L108–137 gives every column type/null/default, each explicit PK list, named CHECK/FK/index definitions and expressions, literal referenced columns, and `ON UPDATE RESTRICT ON DELETE RESTRICT`; L140 disallows implicit indexes. The L142 no-write sequence fence remains intact. |
| Executable dependency/test card graph | **RESOLVED** | L209–215 makes A/B depend on F0. L217–223 assigns C the migration unit/seam spec and two literal failing fixtures, leaves real-PostgreSQL integration exclusively to D, and starts D after B/C. L229–232 makes F the exclusive manifest/lock owner, with F0 dependency/script bootstrap before A/B and F1 reconciliation after E. L238 freezes `F0 → A ∥ B → C → D → E → F1 → G`. |
| Exact root CI and literal fixtures | **RESOLVED** | L81–83 names `0000_valid_then_fail.sql` and `meta/_journal.json`; L181–192 freezes package command bodies; L194 requires exact tree/scripts; L196 freezes the complete final root `ci` value, including real `db:check`. |
| Testcontainers digest/network evidence | **RESOLVED** | L164 supplies the full `postgres:17.11-bookworm@sha256:84560e3b9c6874893fc4e2854f5dc3e7c1a37bc9d1dfd7a8c641310ae22ba5ad` pin, uses portable `getHost()` plus random `getMappedPort()`, expressly makes no loopback-only claim, defines the accepted short-lived CI/developer-host exposure boundary, and requires Docker's actual `HostIp` evidence. L165–167 adds cleanup/resource metadata and the blocking PR lane. |

## Previously closed corrections

- **UNAFFECTED / RESOLVED:** Corrections 1, 2, 4, 5, 6, and 8 remain closed. Their controlling anchors are unchanged at L26/L89–102 (contract and artifact authority), L7/L14–21/L28 (approved dependency disclosure and Testcontainers policy), L29/L144–150 (migration integrity), L152–160 (role separation), and L225–238 (D-before-E closure). No current-plan change reopens them.

## Final D1–D6 decisions

| Decision | Result | Closure rationale |
|---|---|---|
| D1 complete contract surface | **APPROVE** | L26/L89–102/L209–211 is exact, strict, parity-checked, and gated by payload review before runtime code. |
| D2 six-table/AW-010 boundary | **APPROVE** | L104–142 now supplies executable literal DDL while preserving the legitimate-sequence no-write fence and excluding message/event/outbox scope. |
| D3 Testcontainers policy | **APPROVE** | L162–168 now has a full image digest, portable host/mapped-port semantics, actual `HostIp` evidence, cleanup, resource records, and blocking PR execution. |
| D4 standard Drizzle ledger | **APPROVE** | L144–150 precisely preserves lock, ledger bootstrap, transaction, integrity, path, concurrency, and cleanup boundaries. |
| D5 opaque IDs/composite tenant keys | **APPROVE** | L104–140 makes ID limits, PostgreSQL bigint markers, tenant-leading keys/FKs/indexes, and exact checks literal. |
| D6 human/service groundwork | **APPROVE** | L105–140/L152–160 persists only human/service principals, keeps `system` envelope-only, and enforces the runtime privilege boundary. |

## Closure

- All four remaining findings are resolved; none of the six previously closed corrections was reopened.
- With the three exact pins already user-approved, implementation may begin only at F0: F installs those pins, freezes scripts, and owns the initial lockfile before A/B; subsequent work must follow L238 and all embedded review gates.

Verdict: APPROVED
