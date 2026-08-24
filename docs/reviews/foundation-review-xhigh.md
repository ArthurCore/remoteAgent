# AW-006 — Independent Foundation Integration Review (xhigh)

## Verdict

**REQUEST_CHANGES**

The foundation is directionally strong: it consistently prioritizes polished human chat, keeps PostgreSQL as the transactional truth, treats realtime delivery as recoverable, and defers Shared Mind/product Kanban/Orchestrator. It is not yet safe to dispatch AW-007, however. The documents currently define incompatible wire contracts, an incompletely closed snapshot/live handoff, underspecified unread/thread mutation semantics, and mutually inconsistent release profiles. AW-007 also has no single authoritative scaffold-and-script contract.

This is a documentation-integration failure, not a rejection of the architecture. The blocking corrections below can be made without implementation.

## Review basis and severity

Reviewed in full:

- `README.md`
- `docs/product-direction-v2.md`
- `docs/plans/2026-08-24-chat-first-foundation.md`
- `docs/execution-board.md`
- `docs/architecture/chat-core-adr.md`
- `docs/product/chat-ux-acceptance.md`
- `docs/research/source-adoption-matrix.md`
- `docs/quality/chat-test-strategy.md`
- `docs/operations/platform-plan.md`

Severity means:

- **Critical:** an unresolved contradiction can produce incompatible schemas/clients, silent correctness loss, or an impossible release decision. Blocks AW-007.
- **Important:** materially over/under-scoped or not operationally implementable as written. Must be resolved in the foundation, but it does not by itself imply the architecture is wrong.
- **Minor:** wording or traceability issue that should be corrected but is not independently release-blocking.

## Required-check summary

| Required check | Result | Severity / disposition |
|---|---|---|
| `event_seq` versus `seq` | Inconsistent across the product direction, plan, ADR, and test oracle; cursor and ACK terms are also blurred | **Critical** |
| 1,000 versus 2,500 sockets | Two different Milestone-1 blocking workloads, with no tier or common environment | **Critical** |
| One-API pilot versus HA/rolling claims | Recoverability is designed; HA is not. Mandatory N/N-1 rolling evidence is not reconciled with the one-gateway pilot | **Critical** as part of release-profile conflict |
| Snapshot high-watermark/live-subscription race | ADR points toward the right buffering order, but no normative handshake/barrier or boundary-race test exists | **Critical** |
| Unread/thread/edit/delete semantics | Tests demand a reference model that no document actually defines | **Critical** |
| Promised scripts before scaffold | Script names, ownership cards, and when they may enter `pnpm ci` conflict | **Critical** for AW-007 |
| Source-code-local policy | Introduced as a hard constraint by AW-005 without a product/security decision elsewhere | **Important** |
| “183 release-blocking UX criteria” | The denominator is not reproducible; 153 unique IDs are present and unnumbered prose is also made blocking. The resulting all-or-exception gate is not executable | **Important** |
| Full deferral of Shared Mind/product Kanban/Orchestrator | Consistently deferred; no implementation leakage found | **Pass**, with one minor wording cleanup |

## Critical findings

### C-01 — There is no canonical sequence, cursor, or live-handoff contract

**References**

- `docs/product-direction-v2.md` → `### P0 — “완성도 높은 채팅”의 합격 기준이 없었다` (lines 43–72), especially the change from message `seq` to all-mutation `event_seq` and the snapshot/high-watermark sketch.
- `docs/product-direction-v2.md` → `### Chat event contract` (lines 227–253), whose wire envelope uses `event_seq`, `event_type`, and `created_at`.
- `docs/plans/2026-08-24-chat-first-foundation.md` → plan header (line 7), `### Task 0.4: Snapshot and delta sync contract` (lines 55–59), `### Task 2.1` (lines 93–97), and `### Task 3.3` (lines 141–149). The same plan changes from `event_seq` to `seq` and asks for a “highest contiguous ACK.”
- `docs/architecture/chat-core-adr.md` → `§3 Architectural invariants`, invariant 4 (line 46), `§8.2 Live delivery` (lines 176–200), and `§8.3 Resume and delta` (lines 202–214). Its wire envelope instead uses `seq`, `type`, and `occurred_at`, and calls the snapshot boundary `snapshot_cursor`.
- `docs/quality/chat-test-strategy.md` → `§4.1 고정 fixture` and `§4.2 관측 및 invariant` (lines 70–101), which use `seq` and “highest contiguous ACK” as test observables.

**Problem**

1. `event_seq` and `seq` are both presented as public contract fields rather than an explicitly documented storage-to-wire mapping. The event type and timestamp field names drift too. AW-008 cannot create one Zod/JSON Schema contract that conforms to all documents.
2. `cursor`, `snapshot.high_watermark`, `snapshot_cursor`, event sequence, Socket.IO transport ACK, and an application-applied contiguous checkpoint are not clearly separated. A transport ACK must not become a durability or projection checkpoint.
3. The product-direction ordering—fetch snapshot, obtain high watermark, then subscribe—has a race unless subscribing “after H” has replay/barrier semantics. The ADR improves this by saying to subscribe/resume, drain delta, and then apply buffered live events, but it does not define when server buffering starts, the barrier acknowledged by the subscription, buffer overflow behavior, or the atomic transition to live mode. `Task 0.4` asks for a race-free protocol without supplying one, and `chat-test-strategy §5.3` does not inject events at every snapshot/subscribe/drain boundary.

**Impact**

An implementation can permanently miss a committed event between snapshot and subscription while still passing ordinary reconnect tests. Different workers can also emit incompatible event schemas while believing they followed an accepted document.

**Required correction**

Publish one normative contract before scaffold work begins. A minimal choice is:

- one public field name (`event_seq` is already the revised product-direction term), encoded as a decimal string on the wire;
- one durable envelope (`schema_version`, `event_id`, `tenant_id`, `channel_id`, `event_seq`, `event_type`, `actor`, `occurred_at`, `payload`);
- an opaque, channel-bound `cursor` that may encode an event sequence but is never constructed by clients or used as a synonym for it;
- explicit terms for transport ACK versus `last_applied_cursor`/application checkpoint;
- a normative race-free handshake, for example: obtain snapshot at H; establish a subscription that guarantees replay/buffering strictly after H and returns a barrier B; drain authenticated delta `(H, B]`; deduplicate/apply buffered events after B; then enter live mode. Define overflow, revoke, expired cursor, and retry behavior;
- a deterministic contract test that commits events before snapshot, between snapshot and subscribe, between subscribe and barrier, during every delta page, and at the catch-up/live transition, with duplicate and out-of-order delivery.

### C-02 — Unread, mention, thread, edit, and delete behavior has no implementable state model

**References**

- `docs/plans/2026-08-24-chat-first-foundation.md` → `### Task 2.1` and `### Task 2.6` (lines 93–127).
- `docs/architecture/chat-core-adr.md` → `§3 Architectural invariants`, invariant 8 (line 50), and `§5 Module boundaries`, `messaging` row (line 89). These make read cursors durable and place them with the shared channel event machinery.
- `docs/product/chat-ux-acceptance.md` → `§8 Threads`, especially `THR-04`, `THR-07`, and `THR-08` (lines 184–194); `§10 Edit and delete`, especially `EDT-03`, `EDT-06`, and `EDT-07` (lines 205–215); and `§11 Unread, read state, and mentions`, especially `URD-01`, `URD-03`, `URD-06`, `URD-09`, and `URD-10` (lines 217–228).
- `docs/quality/chat-test-strategy.md` → `§5.4 Unread, mention, thread count` (lines 140–149) and `§5.5 Multi-device convergence` (lines 151–155). The tests explicitly mix edit-added/removed mentions, delete, thread replies, membership changes, and concurrent device reads.

**Problem**

The documents require a model-based oracle but do not define the model:

- If a monotonic read cursor points into the all-mutation event stream, it is unspecified which events create ordinary unread work. Reactions, edits, deletes, read-cursor events, and membership events must not accidentally behave like new messages merely because they have a later event sequence.
- `URD-03` requires “mark unread” while `URD-01` forbids rolling back the durable read cursor. No separate attention-marker state is defined.
- `THR-08` requires distinct, cross-device thread read state, but the plan and ADR specify only generic read cursors and do not state the thread-keyed cursor/baseline or its relationship to channel unread.
- The test strategy requires edits that add/remove mentions and deletes to update counts, but the product contract does not decide whether an old message edited to add a mention creates a new mention item/notification, whether deleting an unread message decrements ordinary unread, or how deleted replies affect thread unread versus reply count.
- Membership changes are promised in the channel order by `Task 2.1`, but the initial event list in `Task 0.3` has no membership event. Join baselines/history visibility and revocation delivery are undefined.
- A durable per-user read-cursor event in a shared channel stream could disclose reading behavior even though the UX does not promise read receipts. Event visibility/scope is unspecified.

**Impact**

The database schema, reducers, indexes, event visibility, and UI badges can each be internally reasonable yet disagree. The property tests cannot be written independently because the supposed reference oracle has no normative truth table.

**Required correction**

Add a small normative projection specification before schema work. At minimum it must define, per event type:

- whether it enters the durable channel event order;
- who may receive/read it;
- whether it increments ordinary unread, mention, and/or thread unread;
- how it affects first-unread and mention-inbox identity;
- edit-add/edit-remove mention behavior;
- tombstone and deleted-parent/reply behavior;
- membership join baseline, history visibility, leave/revoke behavior;
- channel read cursor, thread read cursor, and a separate non-monotonic “mark unread” attention marker;
- multi-device merge rules and the exact reference-reducer inputs/outputs.

The cache-purge/access-revoked control message should also be distinguished from an authorized durable channel event sent after access has already been removed.

### C-03 — The release gate has multiple incompatible definitions

**References**

- `docs/product-direction-v2.md` → `## 품질 게이트`: Gate B requires **2,500** concurrent sockets (lines 255–275), and Gate D means **Agent attachment** (lines 284–295).
- `docs/plans/2026-08-24-chat-first-foundation.md` → `### Task 5.3` requires **2,500** sockets (lines 199–201), while the Milestone 1 exit gate names correctness/reliability/product completeness but not operations (line 211).
- `docs/architecture/chat-core-adr.md` → `§15 Concrete acceptance criteria / Realtime and mobile sync` requires **1,000** concurrent sockets (lines 356–365).
- `docs/quality/chat-test-strategy.md` → `§8.1 표준 workload` requires **1,000** sockets (lines 233–255); `§9.1` requires RPO ≤5 minutes and RTO ≤60 minutes (lines 259–271); and `§10` uses Gate D for **Operations**, makes A–D blocking, and forbids Agent progression without all evidence (lines 279–320).
- `docs/operations/platform-plan.md` → `§1 Outcomes and principles`, item 3, specifies one API gateway in the pilot (line 21); `§5.1 Recommendation` acknowledges a brief socket disconnect and possible maintenance during deploy (lines 228–252); `§10.1 Pilot SLOs` targets 99.9% availability (lines 464–483); and `§11.1 Policy` gives pilot PostgreSQL RPO ≤15 minutes/RTO ≤4 hours, reserving 5 minutes/1 hour for AWS growth (lines 509–529).
- `docs/operations/platform-plan.md` → `§14 Self-hosted portability` correctly warns not to claim HA for a single-host Compose deployment (lines 645–672).

**Problem**

- A “Gate D” pass can mean Agent attachment in one document and operations in another.
- The same Milestone-1 latency threshold is attached to 1,000 and 2,500 sockets. No document declares one a pilot gate and the other a capacity/stretch gate, and the message rates/topologies differ.
- Quality makes 5-minute/60-minute recovery blocking, while the selected pilot operations plan accepts 15 minutes/4 hours.
- Quality mandates an N-1→N simultaneous rolling rehearsal with 1,000 sockets; operations deliberately runs one gateway and does not introduce measured cross-instance fan-out until the AWS growth phase. A single gateway can prove restart/reconnect recovery, but it is not HA and cannot prove a zero-interruption multi-instance deployment unless temporary overlap and cross-instance fan-out behavior are explicitly supported.
- The implementation plan's Milestone-1 exit sentence omits the Operations gate that the test strategy says is mandatory before Agent work.

**Impact**

A release can simultaneously pass and fail depending on which document is used. Procurement and topology decisions cannot be validated, and AW-007 does not know which load tooling/script contract is authoritative.

**Required correction**

Create one release-profile registry and reference it from all documents. Each gate needs a unique stable ID, milestone, environment/topology/resource envelope, workload, threshold, evidence artifact/command, and waiver policy. Minimally:

- separate `M1-OPS` from `M2-AGENT`; do not reuse “Gate D”;
- select one M1 socket target. For the documented 10–50-person one-gateway pilot, **1,000 blocking / 2,500 non-blocking capacity evidence** is the smallest coherent change, unless the platform plan is upgraded to support 2,500 as the blocking profile;
- select one M1 RPO/RTO and make platform procurement, test data, and launch checklist match it;
- label the pilot “single-instance recoverable, not HA”; define whether rolling compatibility is tested with temporary two-instance staging or whether M1 proves controlled restart/resume instead;
- state whether Operations evidence is required before Agent work (the quality strategy currently says yes) and copy that rule into the implementation plan.

### C-04 — AW-007 has no single scaffold or script acceptance contract

**References**

- `docs/execution-board.md` → Board row `AW-007` and `## Card rules` (lines 17–38): the deliverable is a build/lint/test-capable pnpm API/Web/DB scaffold.
- `docs/plans/2026-08-24-chat-first-foundation.md` → `### Task 0.1: Monorepo scaffold` (lines 15–37): omits `packages/chat-core`, `packages/config`, a lockfile, Dockerfile, `.dockerignore`, and `.env.example`, and verifies only PostgreSQL health.
- `docs/architecture/chat-core-adr.md` → `§6 Monorepo layout` (lines 108–132) and `§15 / Architecture and repository` (lines 336–345): require `packages/chat-core` and `packages/config` and a local PostgreSQL/S3-compatible run.
- `docs/quality/chat-test-strategy.md` → `§3 / 표준 test commands` (lines 42–66): says the scaffold must expose the full lint/type/unit/integration/isolation/E2E/a11y/reliability/load/restore/rolling/quality-gate script set.
- `docs/operations/platform-plan.md` → `§3.1 Compose contract` (lines 43–100), `§4.2 Required pipeline gates` (lines 144–202), and `§16 Ownership and first implementation tasks` (lines 701–710). These require a substantially broader Compose/image/env scaffold, but also correctly say later scripts arrive “as their corresponding product capabilities land.”

**Problem**

1. The immediate file/package list disagrees with the accepted ADR and operations plan.
2. `docker-compose.yml` is variously a PostgreSQL health check, a PostgreSQL+MinIO contract, or a fully containerized web/API/worker smoke environment.
3. Script names conflict (`test:isolation` versus `test:tenant-isolation`; `test:reliability` versus `test:realtime`; generic `pnpm test` versus tiered scripts).
4. Quality says every script exists at scaffold time, while operations says migration and product-capability scripts do not exist yet or land later. This invites one of two bad outcomes: AW-007 either implements features outside its card or creates green no-op placeholders that falsely satisfy release gates.
5. The operations `pnpm ci` sequence invokes contracts, integration, migration, E2E, and tenant-isolation capabilities that AW-007 cannot honestly implement from a scaffold alone.

**Impact**

Two coders could deliver materially different repositories and both cite a controlling document. A no-op script could become false release evidence.

**Required correction**

Freeze an AW-007 manifest before dispatch:

- exact directories/files, including the accepted `chat-core`/`config` package decision, `pnpm-lock.yaml`, version pinning, Dockerfile/`.dockerignore`, `.env.example`, and the intended Compose services;
- one canonical root-script namespace;
- a card-to-script ownership table (AW-007 scaffold checks, AW-008 contract/DB checks, later vertical slices and quality cards);
- an AW-007 `pnpm ci` that runs only real scaffold gates;
- a hard rule that unimplemented release tests are neither invoked nor represented by passing no-op placeholders. A future gate becomes mandatory when its owning capability lands.

## Important findings

### I-01 — The UX release gate is both over-scoped and non-auditable

**References**

- `docs/product/chat-ux-acceptance.md` → `§1.1 Scope labels` (lines 14–21): every criterion not marked Deferred is release blocking.
- The uniquely identified criteria span `§4` through `§21` (`ONB-01` through `POL-07`, lines 126–372).
- `§2 Release-level outcomes` and `§3 Primary end-to-end journeys` (lines 42–125) add unnumbered obligations.
- `§23 Milestone 1 UX exit gate` (lines 397–408) requires every MVP criterion or a formally approved exception.
- `docs/quality/chat-test-strategy.md` → `§7 Browser E2E와 product completeness` (lines 200–231) and `§10 Gate C` (lines 296–301).

**Problem**

The stated “183” release-blocking count cannot be reproduced from the document's identifiers. A mechanical count yields **153 unique criterion IDs**, while §1.1 also makes unnumbered principles, outcomes, journey steps/acceptances, and state-contract prose blocking. The document therefore has neither a stable denominator of 153 nor an auditable denominator of 183.

Even accepting 183 as the intended total, making all of them release-blocking is not feasible for the stated small-team, one-organization pilot without a traceability/evidence plan. Several obligations are intentionally qualitative or conditional (“when practical,” “where available in MVP,” “sensible,” “as soon as practical,” and “applicable”), yet §23 expects a binary pass or exception. The combined scope includes advanced admin/export states, three desktop engines, narrow responsive admin, multiple screen-reader pairings over time, browser notifications, quiet hours, presence/typing, every error/empty/loading state, and commercial-polish details. These are valuable requirements, but treating every sentence as an equal release blocker makes exceptions the de facto planning system and obscures the truly non-waivable correctness, isolation, delivery-state, and accessibility paths.

The broader quality plan compounds this with a 20-repeat browser matrix, million-message/10-GiB restore fixture, and a “last 30 nightly jobs = 30/30” prerequisite (`chat-test-strategy.md §7.1`, `§9.1`), without a first-release bootstrap rule.

**Required correction**

Keep the specification, but add a machine-countable registry and tier it. Each criterion should have one ID, M1 tier (`non-waivable`, `release-blocking`, or `tracked commercial polish`), evidence mode, owning card, and test/manual artifact. Remove the blanket “all prose blocks” rule. Define a first-release bootstrap for evidence that inherently needs 30 historical runs. Do not downgrade tenant privacy, durable send-state truth, core keyboard/screen-reader journeys, or reconnect convergence.

### I-02 — “Source must remain local” is an unapproved architecture constraint

**References**

- `docs/operations/platform-plan.md` → document header / `Operating constraint` (line 5), `§4.1 Source-local CI` (lines 117–142), and `§4.3 Artifact publication and promotion` (lines 204–226).
- `docs/product-direction-v2.md` → `### P1 — 관리형 서비스 선택이 이식성을 침해할 수 있었다` (lines 122–130), which requires portability but does not prohibit private hosted source/CI.
- `docs/architecture/chat-core-adr.md` → `§1 Context and decision drivers` and `§2 Decision summary` (lines 9–38), which contain no source-local constraint.
- `docs/execution-board.md` → `## Card rules` (lines 32–38), which also contains no such policy.

**Problem**

AW-005 promotes a plausible security preference into a hard foundation constraint, then derives dedicated-runner, clean-checkout, image-publication, source-map, and hosted-CI prohibitions from it. No reviewed product/security decision in the supplied foundation establishes that requirement. This is over-scope if it was an assumption; it is under-documented if it is real.

**Required correction**

Obtain an explicit owner/security decision. If approved, record its threat model, allowed remote services/artifacts, backup/recovery implications, and owner in a dedicated policy/ADR referenced by the product and execution documents. If not approved, retain provider-neutral `pnpm ci` and image-reproducibility requirements but make the source-local runner an optional deployment profile rather than AW-007's architecture.

### I-03 — OSS dependency compliance and copied-source intake need separate gates

**References**

- `docs/research/source-adoption-matrix.md` → `§3.2 permissive code intake 절차` (lines 133–155), which is appropriately about directly copied/adapted upstream files.
- `docs/research/source-adoption-matrix.md` → `§4 NOTICE·provenance 운영 계약` (lines 171–188), whose “dependency/SBOM and intake ledger orphan 0” wording can be read as requiring every transitive dependency to have a source-to-local copy ledger.
- `docs/research/source-adoption-matrix.md` → `§6 최종 채택 우선순위` (lines 204–210), which correctly sets M1 code donors to zero by default.

**Problem**

AW-007 necessarily introduces normal npm/container dependencies. A manual upstream file/line ledger is appropriate for copied/adapted source, but not as the inventory model for every package in an SBOM. The current gate can become either infeasible or silently ignored.

**Required correction**

Define two auditable lanes: dependency/SBOM/license-policy scanning for package/container dependencies, and exact source-to-local provenance for copied/adapted files/assets/tests. Keep restricted-source fingerprint and counsel gates separate. This preserves the source matrix's strong clean-room posture without blocking ordinary scaffold dependencies on an undefined manual ledger.

## Minor findings

### M-01 — Deferral wording should not imply automatic eligibility after the Chat gate

**References**

- `docs/plans/2026-08-24-chat-first-foundation.md` → plan header (line 7) says Agent, Shared Mind, product Kanban, and Orchestrator are added only after Chat Foundation acceptance.
- The same plan's `## Deferred explicitly` (lines 249–260) more precisely requires Chat and single-Agent usage data plus a separate PRD.
- `docs/product-direction-v2.md` → `### Milestone 3 — Multi-Agent and Mobile` and `## 상용 출시 순서` (lines 187–195 and 297–310) mention only a future optional coordinator experiment and validation-triggered orchestration/Kanban.

The detailed deferral section is the correct controlling rule, but the header can be read as making all deferred products automatically eligible immediately after M1. Change it to say they **remain deferred after M1** and require a separate approved PRD based on usage evidence.

## Passed integration checks

### Full deferral of Shared Mind, product Kanban, and Orchestrator — PASS

No current implementation scope leaks these products into Chat Foundation:

- `README.md` → `## 제품 우선순위` excludes Shared Mind, a canonical knowledge product, and general Kanban (lines 5–12).
- `docs/product-direction-v2.md` → `## 수정된 제품 범위 / Milestone 1` explicitly excludes Shared Mind, product Kanban, and Orchestrator (lines 132–163).
- `docs/execution-board.md` → `## Explicitly deferred` and `## Card rules` prohibit them (lines 7–13 and 32–38).
- `docs/architecture/chat-core-adr.md` → `§1 Context and decision drivers` and `§14 Non-goals` prohibit smuggling them into the data model (lines 9–27 and 322–334).
- `docs/product/chat-ux-acceptance.md` → `§22 Explicitly deferred scope` and `§23`, item 8, keep them out of M1 (lines 374–408).
- `docs/research/source-adoption-matrix.md` → `§6 최종 채택 우선순위` keeps task/memory/arbiter/autonomous fan-out out of the current schema (lines 204–210).
- `docs/quality/chat-test-strategy.md` → `§1 목적과 범위` excludes them from release scope (lines 3–18).

The ADR's generic `Principal` discriminator and future `agent-access` boundary are appropriate M2 seam reservations, not Shared Mind or orchestration implementation. The future “optional coordinator experiment” is also not a current product commitment, provided the separate-PRD rule is retained.

## Minimal correction list blocking AW-007

AW-007 should remain blocked until the following **six document corrections** are complete and cross-referenced. No production code is needed to clear them.

1. **Freeze the public sync contract:** choose canonical event field names; separate event sequence, opaque cursor, application checkpoint, and transport ACK; specify and test the race-free snapshot/subscription/barrier handoff.
2. **Publish the chat projection semantics table:** define unread/mention/thread/edit/delete/membership behavior, channel/thread cursors, mark-unread attention state, event visibility, and the reference reducer contract.
3. **Publish one release-profile/gate registry:** resolve Gate-D naming, 1,000 versus 2,500 sockets, pilot RPO/RTO, M1 Operations applicability, and one-gateway recoverability versus temporary multi-instance rolling/HA evidence.
4. **Freeze the AW-007 scaffold manifest:** exact packages/files/Compose services, canonical scripts, card ownership, and an honest incremental `pnpm ci` with no passing placeholders for unimplemented gates.
5. **Resolve the source-local policy:** approve and document it as a real security constraint or demote it to an optional runner profile; keep ordinary dependency compliance separate from copied-source provenance.
6. **Make the UX gate countable and tiered:** establish the authoritative denominator/IDs, evidence ownership, and a feasible non-waivable versus blocking versus tracked-polish split, including first-release bootstrap rules for historical operational evidence.

Once those six corrections are incorporated consistently into the controlling documents, AW-007 can proceed without choosing architecture and release policy by guesswork.
