# Chat-first Foundation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Agent 없이도 팀이 사용할 수 있는 상용 품질의 채팅 기반을 만들고, 후속 Local Agent 연결이 가능한 안정적인 principal·event 경계를 확보한다.

**Architecture:** 자체 TypeScript modular monolith와 PostgreSQL을 정본으로 사용한다. HTTP command와 WebSocket event를 분리하고, 채널의 모든 사용자 가시 mutation을 포괄하는 `event_seq`, snapshot high-watermark, cursor resume로 웹·모바일 동기화를 보장한다. Agent는 Chat Foundation과 Operations gate가 통과된 뒤 별도 단계로 시작한다. Shared Mind, 제품 Kanban, Orchestrator는 M1 이후에도 계속 deferred이며, 실제 사용 근거와 별도 승인 PRD 없이는 시작하지 않는다.

**Tech Stack:** pnpm, Turborepo, TypeScript, Next.js, NestJS/Fastify, PostgreSQL, Drizzle, Socket.IO, Vitest, Testcontainers, Playwright, Docker Compose.

---

## Epic 0 — Repository and architecture contracts

### Task 0.1: Monorepo scaffold

**Objective:** 웹, API, worker, contracts, DB, UI 패키지를 독립적으로 빌드·테스트할 수 있는 monorepo를 만든다.

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `apps/web/`
- Create: `apps/api/`
- Create: `apps/worker/`
- Create: `packages/contracts/`
- Create: `packages/db/`
- Create: `packages/ui/`
- Create: `docker-compose.yml`

**Verification:**
- `pnpm install`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- Docker PostgreSQL health check

### Task 0.2: Architecture dependency test

**Objective:** module 간 table 직접 접근과 circular dependency를 방지한다.

**Deliverable:** dependency-cruiser 또는 ESLint boundary rule, 실패 fixture, CI command.

### Task 0.3: Versioned event contract

**Objective:** command와 durable event schema를 Zod/JSON Schema로 정의한다.

**Initial commands:** `message.create`, `message.edit`, `message.delete`, `reaction.set`, `read_cursor.advance`.

**Initial events:** `message.created`, `message.edited`, `message.deleted`, `reaction.changed`, `read_cursor.advanced`.

**Verification:** invalid version, oversized payload, missing idempotency key, unknown event rejection tests.

### Task 0.4: Snapshot and delta sync contract

**Objective:** snapshot의 `high_watermark`와 그 이후 mutation journal delta 사이에 race가 없는 protocol을 정의한다.

**Acceptance:** duplicate/out-of-order delta 적용, stale cursor의 `resync_required`, membership revoke의 subscription 종료와 cache purge event를 contract test로 검증한다.

---

## Epic 1 — Identity, tenant, workspace, channel

### Task 1.1: Tenant-aware database foundation

**Objective:** tenant, user, membership, workspace, channel, channel member schema와 migration을 만든다.

**Acceptance:** 모든 tenant table에 non-null `tenant_id`; composite foreign key; runtime role은 table owner가 아님.

### Task 1.2: Authentication session

**Objective:** OIDC-compatible login abstraction과 tenant-bound session을 만든다.

**Acceptance:** request body/header만 바꿔 tenant를 전환할 수 없음; session revocation test.

### Task 1.3: Workspace/channel APIs

**Objective:** workspace, public/private channel 생성과 membership API를 구현한다.

**Acceptance:** role과 channel membership matrix test, cross-tenant negative test.

### Task 1.4: Invite flow

**Objective:** single-use, expiring invite와 membership activation을 구현한다.

**Acceptance:** reuse/expiry/wrong-tenant rejection.

---

## Epic 2 — Durable message core

### Task 2.1: Message schema and per-channel event sequence

**Objective:** message, version, mention, reaction, read cursor, conversation mutation journal과 channel `event_seq` allocation을 구현한다.

**Acceptance:** create/edit/delete/reaction/thread/membership mutation이 하나의 채널 event order에 들어가며 concurrent inserts는 unique ordering을 갖는다. 채널 간 global order는 약속하지 않는다.

### Task 2.2: Idempotent message creation

**Objective:** client idempotency key와 message/outbox/audit atomic transaction을 구현한다.

**Acceptance:** same command 1,000 retries returns one message ID.

### Task 2.3: History API

**Objective:** cursor pagination과 stable ordering을 구현한다.

**Acceptance:** insert/edit/delete 중 pagination duplicate/skip 없음.

### Task 2.4: Edit/delete/version history

**Objective:** edit와 soft-delete tombstone, immutable prior version을 구현한다.

**Acceptance:** unauthorized edit/delete 거부; version chronology test.

### Task 2.5: Threads and reactions

**Objective:** one-level thread semantics, thread reply count, reaction unique constraint를 구현한다.

**Acceptance:** duplicate reaction idempotent; deleted parent thread behavior 명시·테스트.

### Task 2.6: Read cursors and unread projections

**Objective:** monotonic read cursor, unread/mention/thread count를 구현한다.

**Acceptance:** cursor rollback 거부; property-based count tests.

---

## Epic 3 — Realtime sync

### Task 3.1: WebSocket authentication and subscription

**Objective:** short-lived ticket/cookie로 socket을 인증하고 channel subscription을 매번 authorize한다.

### Task 3.2: Transactional outbox relay

**Objective:** committed outbox를 claim·publish·retry하며 duplicate consumer를 허용한다.

### Task 3.3: Ordered fan-out

**Objective:** channel `event_seq` 순서로 event를 전송한다. Client는 reducer 적용 후 opaque `last_applied_cursor`를 원자적으로 저장하며, Socket.IO transport ACK는 application checkpoint로 사용하지 않는다.

### Task 3.4: Resume and catch-up

**Objective:** snapshot high-watermark 또는 reconnect cursor 이후 모든 mutation delta를 DB에서 복구한다.

**Acceptance:** gateway kill/restart 중 event 누락·순서 역전 0, fresh snapshot과 incremental state checksum이 동일하다.

### Task 3.5: Backpressure and presence

**Objective:** bounded socket queue, ephemeral typing/presence TTL, slow-client close/resume를 구현한다.

---

## Epic 4 — Complete chat experience

### Task 4.1: Chat shell and design system

**Objective:** workspace/channel sidebar, message timeline, composer, member panel을 접근 가능하고 반응형으로 구현한다.

### Task 4.2: Thread/reaction/edit/delete UI

**Objective:** optimistic UI가 서버 event와 수렴하도록 구현한다.

### Task 4.3: Unread/mention UX

**Objective:** unread separator, badge, jump-to-first-unread, mention inbox를 구현한다.

### Task 4.4: Attachments

**Objective:** presigned quarantine upload, validation/scan state, authorized download를 구현한다.

### Task 4.5: Search

**Objective:** tenant/channel authorization을 재확인하는 PostgreSQL FTS 검색을 구현한다.

### Task 4.6: Notification preferences

**Objective:** user/channel mute, mention-only, quiet hours, email/push-ready outbox를 구현한다.

### Task 4.7: Admin basics

**Objective:** member deactivate, channel archive, retention setting, audit view/export를 구현한다.

---

## Epic 5 — Quality and commercial readiness

### Task 5.1: End-to-end chat suite

**Scenarios:** signup/invite, channel, DM, thread, edit/delete, reactions, files, search, unread, reconnect.

### Task 5.2: Tenant isolation suite

**Objective:** HTTP, WS, object download, search, admin 경로의 cross-tenant 공격을 자동화한다.

### Task 5.3: Realtime load suite

**Objective:** `docs/quality/release-profile-registry.md`에 따라 단일 gateway·1,000 sockets를 M1 blocking profile로 시험한다. 같은 resource envelope의 2,500 sockets는 non-blocking capacity profile로 별도 기록한다.

### Task 5.4: Backup/restore and controlled restart rehearsal

**Objective:** 실제 restore와 단일 gateway controlled restart/resume를 실행해 RPO≤5분, RTO≤60분, accepted-message RPO=0을 검증한다. Multi-instance rolling/HA는 M1 범위가 아니다.

### Task 5.5: Accessibility and responsive review

**Objective:** keyboard, focus, screen reader labels, reduced motion, mobile viewport를 검증한다.

**Milestone 1 Exit Gate:** `M1-CORRECTNESS`, `M1-SECURITY`, `M1-UX`, `M1-OPS`, blocking `M1-CAPACITY`가 release registry 규칙대로 유효해야 Agent 작업을 시작한다.

---

## Epic 6 — Easy personal Agent attachment

### Task 6.1: Service principal

**Objective:** Human과 구분되는 Agent principal, channel membership, badge, status를 구현한다.

### Task 6.2: Pairing protocol

**Objective:** secret 없는 static installer, 브라우저 device approval, single-use human code, local device key, proof-of-possession, short-lived credential, revoke를 구현한다.

### Task 6.3: Connector protocol and SDK

**Objective:** vendor-neutral connector envelope과 conformance test kit을 구현한다.

### Task 6.4: Claude managed-session adapter

**Objective:** `@agent` 입력을 받아 streaming response를 채널에 게시하고 cancel/reconnect를 처리한다.

**Acceptance:** streaming delta는 ephemeral이고 최종 또는 interrupted 메시지 하나만 durable commit한다. Vendor session ID와 raw event는 adapter 밖의 authorization/routing/UI 계약에 사용하지 않는다.

### Task 6.5: Five-minute onboarding

**Objective:** 현재 채널에서 Agent 추가→signed installer→브라우저 device 승인→Claude 자동 진단→로컬 folder picker→read/respond-only preset→연결 시험→online 흐름을 5분 안에 완료한다.

**Acceptance:** install command와 shell history에 enrollment secret이 없고, cloud에는 raw filesystem path가 없으며, 도움 없는 성공률 80% 이상·안내 포함 95% 이상을 usability test로 검증한다.

### Task 6.6: Connector security test

**Objective:** replay, revoked device, wrong tenant/channel, stale credential, oversized stream, disconnect recovery를 검증한다.

**Milestone 2 Exit Gate:** 신규 사용자가 비밀 토큰을 복사하거나 inbound port를 열지 않고 5분 내 Agent를 online으로 만들고 대화·취소·재접속할 수 있어야 한다.

---

## Deferred explicitly

- Shared Mind
- Fact/Decision knowledge store
- Product Kanban
- Orchestrator
- autonomous multi-Agent fan-out
- deployment automation through Agent
- long-term memory
- mobile native app implementation

이 항목은 Chat과 Single-Agent attachment의 실제 고객 사용 데이터 후 별도 PRD로 시작한다.
