# Chat-first 제품 방향 재검토 v2

## Normative foundation contracts

구현과 release 판정에서 아래 문서가 이 방향 문서보다 우선한다.

- `docs/contracts/sync-contract-v1.md` — event envelope, cursor, snapshot/barrier/live sync
- `docs/contracts/chat-projection-semantics-v1.md` — unread, mention, thread, edit/delete, membership projection
- `docs/quality/release-profile-registry.md` — M1/M2 blocking profile과 evidence
- `docs/product/chat-ux-gate-registry.md` — 179개 UX criterion의 tier/evidence/owner
- `docs/security/source-and-provenance-policy.md` — 제품 소스와 고객 repository 소스 경계

## 결론

기존 청사진은 보안·운영 원칙은 유효하지만, 사용자가 중요하게 생각하지 않는 Shared Mind 계열의 Task/Handoff/Decision/Evidence와 오케스트레이션을 너무 일찍 중심에 두었다. 또한 Rocket.Chat CE를 파일럿 Conversation Plane으로 두고 별도 Agent Control Plane을 운영하면 빠른 데모에는 유리하지만, 장기 제품으로는 UX·데이터·권한·운영이 이중화된다.

수정된 방향은 다음과 같다.

> **자체 Chat Core를 먼저 완성도 높게 만들고, Agent는 Chat Core가 정의한 일반 Service Principal과 Connector Protocol을 통해 붙인다. 오케스트레이터·제품 칸반·Shared Mind는 고객 요구가 검증될 때까지 제외한다.**

## 기존 계획의 주요 문제

### P0 — 제품 우선순위가 뒤집혀 있었다

기존 문서는 Agent Control Plane, Task/Handoff, Evidence, Approval, Orchestrator를 Chat Core와 동시에 설계했다. 이 구조는 첫 버전이 채팅 제품인지 Agent 운영 제품인지 흐리게 한다.

수정:

- Milestone 1: 사람용 채팅만으로 사용할 수 있어야 한다.
- Milestone 2: 하나의 로컬 Agent가 사람과 같은 채널에 들어온다.
- Milestone 3: 여러 Agent와 모바일을 확장한다.
- Orchestrator·제품 Kanban은 Milestone 3 이후 별도 실험으로 둔다.

### P0 — Rocket.Chat fork와 자체 Control Plane이 장기적으로 이중 제품이 된다

예상 문제:

- Rocket.Chat의 사용자·채널·메시지 ID와 자체 tenant·agent ID 동기화
- Rocket.Chat MongoDB와 Agent PostgreSQL의 두 정본
- 권한 정책과 감사 로그 이중화
- WebSocket event와 Agent run event의 순서·재시도 차이
- 모바일 UI에서 Agent-specific card를 깊게 표현하기 위한 upstream core 수정
- upstream 보안 패치와 장기 merge 비용
- 제품 UX와 브랜드가 foundation 제약에 묶임

수정:

- Rocket.Chat·Zulip·Mattermost는 **행동과 테스트 케이스 벤치마크**로 사용한다.
- 상용 제품은 clean-room Chat Core로 만든다.
- 외부 소스는 라이선스가 허용하는 알고리즘·schema pattern만 명시적으로 추적해 도입한다.
- 일정 위험이 확인되면 Rocket.Chat CE는 fallback pilot로만 사용한다.

### P0 — “완성도 높은 채팅”의 합격 기준이 없었다

기존 기능 목록만으로는 완성도를 판단할 수 없다. 다음이 품질 계약이 되어야 한다.

- 메시지 영구 저장 후에만 `accepted` 반환
- client idempotency key로 재전송 중복 방지
- 채널별 단조 증가 `seq`
- reconnect 시 cursor 이후 delta 복구
- 모든 unread/mention/thread count가 재로그인 후 동일
- edit/delete/reaction/thread event가 모든 device에서 수렴
- 느린 client에 대한 backpressure
- offline에서 작성한 메시지 재시도 정책
- 파일 upload quarantine·검사·authorized download
- 검색 결과의 tenant/channel 권한 재검증
- mobile push는 힌트이며 앱이 서버에서 정본을 다시 fetch
- tenant 간 접근 negative test
- rolling deploy 중 WebSocket reconnect/resume

추가 검토에서 `seq`를 메시지 생성에만 부여하면 edit/delete/reaction/thread/membership mutation을 완전히 복구할 수 없다는 문제가 확인됐다. 따라서 채널에는 **모든 사용자 가시 mutation을 포함하는 `event_seq`**를 부여한다.

초기 동기화 계약은 다음과 같다.

```text
snapshot 조회
→ snapshot.high_watermark 획득
→ high_watermark 이후 delta 구독·적용
→ cursor가 retention 범위 밖이면 resync_required
```

Client는 duplicate와 out-of-order event를 안전하게 적용해야 한다. 권한이 회수되면 WebSocket subscription을 종료하고 이후 history/search/file 접근을 거부하며 local cache purge를 지시한다.

### P1 — 모바일을 너무 늦게 고려했다

모바일 앱 출시는 3단계지만, sync protocol과 API는 처음부터 mobile-compatible해야 한다.

수정:

- 채널별 cursor delta sync
- device/session/push token 모델
- 짧은 access token과 rotating refresh token
- deep link 안정 ID
- paginated history
- attachment resumable upload
- background push 이후 delta fetch

웹 UI 완성 뒤 API를 모바일에 맞춰 다시 설계하지 않는다.

### P1 — Agent onboarding이 실행 엔진 기능까지 한꺼번에 담았다

첫 Agent 목표는 “채널에 쉽게 들어와 안전하게 답한다”다. diff, deployment approval, multi-agent orchestration은 후속이다.

Agent v1 최소 계약:

1. Agent 생성
2. 6자리 single-use pairing
3. Connector의 device key 등록
4. 허용 workspace/channel 선택
5. Local command로 managed session 시작
6. `@agent` 메시지 수신
7. streaming reply
8. cancel
9. reconnect/catch-up
10. revoke

온보딩은 progressive disclosure를 사용한다. 처음부터 이름·역할·여러 채널·tool 권한을 모두 묻지 않는다.

```text
현재 채널에서 Add local agent → Claude Code
→ secret이 포함되지 않은 고정 installer 실행
→ Connector가 로그인된 브라우저를 열어 device 승인
→ Claude Code 설치·로그인 상태 자동 진단
→ 로컬 folder picker로 repository 선택
→ 기본 read/respond-only preset
→ mention/stream/cancel/reconnect 연결 시험
→ online
```

짧은 숫자 코드는 사용자 확인용이고 실제 보안은 고엔트로피 device credential과 로컬 생성 key의 possession proof가 담당한다. Cloud에는 raw filesystem path 대신 opaque repository ID와 표시 이름만 저장한다.

### P1 — 관리형 서비스 선택이 이식성을 침해할 수 있었다

수정:

- PostgreSQL, S3-compatible object storage, OIDC, standard WebSocket을 중심으로 둔다.
- Render/AWS는 배포 target일 뿐 domain architecture가 아니다.
- Docker와 환경변수로 실행한다.
- Redis 없이도 단일 gateway가 동작해야 한다.
- queue abstraction은 PostgreSQL outbox에서 시작하고 규모가 필요할 때 SQS로 교체한다.

## 수정된 제품 범위

### Milestone 1 — Commercial-quality Chat Core

필수:

- organization/workspace
- membership/invite
- public/private channel
- channel membership
- 1:1 DM
- message/thread/reaction/edit/delete
- mentions
- unread/read cursor
- realtime reconnect/resume
- attachments
- search
- notification preferences
- basic admin/audit
- responsive web

제외:

- Agent 실행
- Shared Mind
- 제품 Kanban
- Orchestrator
- 음성/영상
- federation
- E2EE
- plugin marketplace

### Milestone 2 — One-click Personal Agent

필수:

- Agent service principal
- Local Connector
- pairing/revoke
- channel allowlist
- online/offline/busy
- mention routing
- streaming response
- cancel/reconnect
- local secret retention
- agent message badge

제외:

- Agent-to-Agent 자유 토론
- 위험 tool 자동 실행
- 배포 승인
- 장기 기억
- task decomposition

### Milestone 3 — Multi-Agent and Mobile

- iOS/Android
- push/deep link/offline cache
- multiple adapters: Claude, Codex, Gemini/OpenCode
- directed Agent-to-Agent message
- hard hop/token/time limit
- optional coordinator experiment

## 기술 결정

### 저장소

pnpm/Turborepo monorepo:

```text
apps/web             Next.js
apps/api             NestJS/Fastify modular monolith
apps/worker          outbox and async jobs
apps/connector       local Agent connector
apps/mobile          Expo, Milestone 3
packages/contracts   OpenAPI/JSON Schema/Zod event contracts
packages/db          Drizzle schema/migrations
packages/ui          shared design system
packages/config      lint/tsconfig/env
```

### 서버

- TypeScript
- PostgreSQL system of record
- Drizzle ORM
- Socket.IO transport with product-owned durable event contract
- PostgreSQL transactional outbox
- S3-compatible object storage
- PostgreSQL full-text search initially
- Redis only after horizontal gateway scaling is measured

전체 event sourcing은 도입하지 않는다. 현재 상태 table과 작고 명확한 conversation mutation journal을 함께 사용한다.

### Chat event contract

Transport와 domain event를 분리한다.

```text
Client command:
- command_id
- idempotency_key
- command_type
- aggregate_id
- expected_version
- payload

Server event:
- event_id
- tenant_id
- channel_id
- event_seq
- event_type
- actor
- payload
- created_at
```

Socket.IO ACK는 transport 수신 확인일 뿐 durable commit 확인이 아니다. `message.accepted`는 DB commit 이후에만 보낸다.

Agent streaming delta는 best-effort ephemeral event로 전송하고, 정상 종료 시 최종 메시지 하나만 durable commit한다. 중단되면 하나의 `interrupted` 최종 상태를 저장한다.

## 품질 게이트

### Gate A — Chat correctness

- 중복 create retry 1,000회에서 중복 message 0
- reconnect/resume 후 누락·순서 역전 0
- unread/mention/thread count property test 통과
- edit/delete/reaction multi-device convergence
- cross-tenant API/WS/file/search 접근 전부 거부

### Gate B — Chat reliability

- M1 blocking profile은 단일 gateway·1,000 concurrent socket에서 p95 message commit 300ms 이하
- 2,500 socket은 같은 resource envelope에서 수집하는 non-blocking capacity evidence
- online fan-out p95 1초 이하
- 단일 gateway controlled restart에서 client 자동 복구; M1은 HA나 multi-instance rolling을 주장하지 않음
- PostgreSQL restart 후 accepted message 유실 0
- slow-client backpressure 시험 통과
- 1분 내 1,000 client reconnect storm에서 자동 수렴
- snapshot과 incremental sync 상태 checksum 불일치 0
- 1,000 event catch-up p95 5초 이하

### Gate C — Product completeness

- 새 사용자가 초대부터 첫 메시지까지 3분 이내
- 채널 생성·초대·thread·검색·파일·알림 end-to-end
- 키보드와 screen-reader 핵심 흐름
- responsive mobile web
- 운영자 audit·ban/deactivate·export 최소 기능

### Gate D — Agent attachment

- 새 Agent가 설치 시작부터 online까지 5분 이내
- 토큰을 수동 복사하지 않음
- inbound port를 열지 않음
- Connector 재시작 후 동일 Agent identity로 복구
- revoke 즉시 새 command 차단
- Claude vendor adapter 실패가 Chat Core에 영향을 주지 않음
- 도움 없는 attach 성공률 80% 이상, 안내 포함 95% 이상
- signed/notarized installer와 자동 health check
- static install command에 enrollment secret 0
- member enrollment은 workspace policy로 통제하며 무조건 관리자 작업으로 만들지 않음

## 상용 출시 순서

1. Chat correctness test harness
2. Identity/tenant/workspace/channel
3. Durable message core
4. Realtime sync/reconnect
5. thread/reaction/edit/delete/read cursor
6. search/file/notifications/admin
7. responsive polish and reliability test
8. Agent identity and Connector pairing
9. one Agent mention/stream/cancel
10. mobile app
11. multi-Agent
12. 필요가 검증된 경우에만 Orchestrator·제품 Kanban

## 최종 판단

기존 보안 원칙 중 tenant isolation, durable commit, outbox, connector outbound-only, local secrets는 유지한다. 반면 Shared Mind, Task/Handoff/Evidence 중심 모델, early Orchestrator, Rocket.Chat 장기 fork는 초기 핵심에서 제거한다.

이 제품의 첫 번째 성공 기준은 **Agent가 없어도 팀이 매일 쓸 수 있는 채팅**이다. 두 번째 성공 기준은 **그 채팅에 개인 Agent를 5분 안에 안전하게 붙일 수 있는 것**이다.
