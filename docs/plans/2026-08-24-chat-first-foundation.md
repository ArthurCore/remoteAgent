# Chat-first Foundation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Agent 없이도 팀이 사용할 수 있는 상용 품질의 채팅 기반을 만들고, 후속 Local Agent 연결이 가능한 안정적인 principal·event 경계를 확보한다.

**Architecture:** 자체 TypeScript modular monolith와 PostgreSQL을 정본으로 사용한다. HTTP command와 WebSocket event를 분리하고, 채널별 sequence와 cursor resume로 웹·모바일 동기화를 보장한다. Agent, Shared Mind, 제품 Kanban, Orchestrator는 Chat Foundation 합격 후에만 추가한다.

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

### Task 2.1: Message schema and per-channel sequence

**Objective:** message, version, mention, reaction, read cursor schema와 channel sequence allocation을 구현한다.

**Acceptance:** concurrent inserts have unique contiguous ordering semantics; no cross-channel sequence assumption.

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

**Objective:** channel `seq` 순서로 event를 전송하고 highest contiguous ACK를 처리한다.

### Task 3.4: Resume and catch-up

**Objective:** reconnect cursor 이후 delta를 DB에서 복구한다.

**Acceptance:** gateway kill/restart 중 message 누락·순서 역전 0.

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

**Objective:** 1,000 sockets, reconnect storm, slow client, noisy tenant를 시험한다.

### Task 5.4: Backup/restore and rolling deploy rehearsal

**Objective:** 실제 restore와 live socket resume를 실행해 RPO/RTO를 기록한다.

### Task 5.5: Accessibility and responsive review

**Objective:** keyboard, focus, screen reader labels, reduced motion, mobile viewport를 검증한다.

**Milestone 1 Exit Gate:** Chat correctness/reliability/product completeness gate가 모두 통과해야 Agent 작업을 시작한다.

---

## Epic 6 — Easy personal Agent attachment

### Task 6.1: Service principal

**Objective:** Human과 구분되는 Agent principal, channel membership, badge, status를 구현한다.

### Task 6.2: Pairing protocol

**Objective:** single-use code, local device key, proof-of-possession, short-lived credential, revoke를 구현한다.

### Task 6.3: Connector protocol and SDK

**Objective:** vendor-neutral connector envelope과 conformance test kit을 구현한다.

### Task 6.4: Claude managed-session adapter

**Objective:** `@agent` 입력을 받아 streaming response를 채널에 게시하고 cancel/reconnect를 처리한다.

### Task 6.5: Five-minute onboarding

**Objective:** Agent 생성→설치→pair→channel 선택→online 흐름을 5분 안에 완료하는 UI/CLI를 구현한다.

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
