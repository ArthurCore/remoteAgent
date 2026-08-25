# Agent Workspace — Execution Board

## Goal

완성도 높은 사람용 Chat Core를 먼저 만들고, Chat Foundation 품질 게이트 통과 후 개인 Agent를 5분 안에 연결할 수 있는 Connector를 추가한다.

## Explicitly deferred

- Shared Mind
- 제품 Kanban
- Orchestrator 제품 기능
- 장기 기억
- 자율 multi-Agent fan-out

## Board

| ID | Card | Assignee | Depends on | Deliverable | Status |
|---|---|---|---|---|---|
| AW-001 | Chat Core ADR과 모듈 경계 | architect | - | `docs/architecture/chat-core-adr.md` | DONE |
| AW-002 | 사람용 Chat UX·완성도 acceptance spec | ux-writer | - | `docs/product/chat-ux-acceptance.md` | DONE |
| AW-003 | 소스·라이선스·벤치마크 채택표 | researcher | - | `docs/research/source-adoption-matrix.md` | DONE |
| AW-004 | correctness/realtime/security test strategy | tester | - | `docs/quality/chat-test-strategy.md` | DONE |
| AW-005 | local/staging/production 운영 설계 | devops | - | `docs/operations/platform-plan.md` | DONE |
| AW-006 | v2 방향과 5개 설계 문서 통합 검토 | reviewer | AW-001..005 | `docs/reviews/foundation-approval-xhigh.md` | DONE |
| AW-006A | Canonical sync contract v1 | architect | AW-006 | `docs/contracts/sync-contract-v1.md` | DONE |
| AW-006B | Projection/reference-reducer semantics | architect,tester | AW-006 | `docs/contracts/chat-projection-semantics-v1.md` | DONE |
| AW-006C | Release profile/gate registry | tester,devops | AW-006 | `docs/quality/release-profile-registry.md` | DONE |
| AW-006D | Frozen AW-007 scaffold manifest | architect,coder | AW-006 | `docs/plans/aw-007-scaffold-manifest.md` | DONE |
| AW-006E | Source and provenance policy | researcher,devops | AW-006 | `docs/security/source-and-provenance-policy.md` | DONE |
| AW-006F | Tiered UX gate registry | ux-writer,tester | AW-006 | `docs/product/chat-ux-gate-registry.md` | DONE |
| AW-007 | pnpm monorepo·API/Web/DB scaffold | coder | AW-001, AW-004, AW-005, AW-006A..F, AW-006 re-review approval | 빌드·lint·test 가능한 코드 | DONE |
| AW-008 | contracts·DB foundation 구현 | coder | AW-007 | Zod contracts, Drizzle schema, migrations, tests | RUNNING |
| AW-009 | tenant/workspace/channel vertical slice | coder | AW-008 | API+Web E2E | TODO |
| AW-010 | durable message create/history vertical slice | coder | AW-008, AW-009 | idempotency+seq+outbox tests | TODO |
| AW-011 | WebSocket fan-out/reconnect/resume | coder | AW-010 | gateway restart test | TODO |
| AW-012 | Phase-1 integration and quality gate | reviewer,tester | AW-009..011 | verified gate report | TODO |

## Card rules

- 각 worker는 자신의 deliverable path만 수정한다.
- 구현 전에 failing test 또는 검증 fixture를 만든다.
- 완료 보고에는 변경 경로, 실행한 명령, 실제 결과를 포함한다.
- Shared Mind, 제품 Kanban, Orchestrator 기능을 새 scope로 끌어오지 않는다.
- Chat Foundation gate가 통과하기 전 Agent runtime 구현을 시작하지 않는다.
