# Chat Core 품질 및 테스트 전략 (AW-004)

## 1. 목적과 범위

이 문서는 Agent 없이도 매일 사용할 수 있는 사람용 Chat Core의 **실행 가능한 품질 계약**을 정의한다. 기능 목록의 존재가 아니라 PostgreSQL 정본, 권한 경계, 재접속 수렴, 사용성 및 운영 복구를 실제 시험으로 입증하는 것이 목표다.

대상 범위:

- tenant/workspace/channel/DM 권한
- durable message create/history/edit/delete/thread/reaction
- read cursor와 unread/mention/thread count
- Socket.IO fan-out, reconnect/resume, backpressure
- PostgreSQL transactional outbox
- attachment, search, notification hint
- 반응형 Web UI, 접근성, 브라우저 E2E
- 부하, backup/restore, rolling deploy

Agent runtime, Shared Mind, 제품 Kanban, Orchestrator는 이 문서의 범위가 아니다. Chat Foundation의 모든 blocking gate가 통과하기 전에는 Agent 구현을 release 대상으로 승격하지 않는다.

## 2. 검증 원칙

1. **정본 우선:** HTTP 성공이나 Socket.IO ACK가 아니라 DB commit과 durable event를 판정 기준으로 삼는다. `message.accepted`는 message, outbox, audit가 같은 transaction으로 commit된 뒤에만 관측되어야 한다.
2. **관측 결과로 판정:** sleep 후 추정하지 않는다. event cursor, DB probe, API polling 또는 명시적 health/readiness 조건을 사용한다.
3. **모델 기반 검증:** unread/count/sync는 독립적인 in-memory reference model과 서버 결과를 비교한다.
4. **결함 주입:** process kill, PostgreSQL 중단, network partition/latency, duplicate delivery, stale cursor를 정상적인 acceptance fixture로 취급한다.
5. **deny-by-default:** tenant, channel, search, file 권한의 positive test마다 대응하는 negative test를 둔다. 응답뿐 아니라 event 유출, URL 재사용, timing-independent 결과도 확인한다.
6. **재현 가능성:** property/load test는 seed, build SHA, schema version, image digest, workload를 artifact로 저장한다. 실패 seed는 영구 regression fixture가 된다.
7. **retry로 통과시키지 않음:** blocking test의 자동 재실행 결과로 최초 실패를 숨기지 않는다. infrastructure failure만 별도 분류하며 제품 assertion 실패의 flaky retry 허용치는 0이다.
8. **수치화:** 모든 release 판정은 아래 exit gate의 분모, 기간, percentile을 포함한 측정값으로 한다.

## 3. Test pyramid와 실행 위치

| 층 | 목표 비중 | 실행 도구 | 실행 시점 | Blocking gate |
|---|---:|---|---|---|
| L0 정적 계약 | 약 10% | TypeScript strict, ESLint, dependency-cruiser, Zod/JSON Schema compatibility | local/PR | type/lint/contract 오류 0 |
| L1 unit/property/model | 약 55% | Vitest, fast-check, fake clock, reference reducer | local/PR | statement 90%, branch 85%; 핵심 reducer/authorization branch 95%; 실패 seed 0 |
| L2 component/integration | 약 25% | Vitest, Testcontainers(PostgreSQL, S3-compatible store), Supertest/Fastify inject, Socket.IO client, Toxiproxy | PR | 격리된 실제 DB에서 blocking scenario 100% 통과 |
| L3 browser/system/operations | 약 10% | Playwright, axe-core, k6, Docker Compose, `pg_dump`/PITR restore, deployment scripts | merge/nightly/release | 아래 correctness/reliability/product/operations gate 전부 통과 |

비중은 test case 개수 기준의 방향성이다. 보안 경계와 distributed failure는 느리더라도 하위 층 mock으로 대체하지 않는다.

### 표준 test commands

scaffold 구현 시 root scripts는 다음 이름을 제공해야 한다. 각 명령은 non-zero exit로 gate 실패를 표현하고 JUnit/JSON/HTML artifact를 생성한다.

```bash
pnpm lint
pnpm typecheck
pnpm test:unit                 # Vitest + fast-check
pnpm test:integration          # Testcontainers 기반 API/DB/WS/outbox
pnpm test:isolation            # HTTP/WS/search/file/admin 공격 행렬
pnpm test:e2e                  # Playwright Chromium/Firefox/WebKit
pnpm test:a11y                 # Playwright + axe + keyboard assertions
pnpm test:reliability          # Toxiproxy/process-kill/resume/slow client
pnpm test:load                 # k6 workload와 threshold
pnpm test:restore              # disposable environment 실제 restore
pnpm test:rolling-deploy       # N/N-1 live traffic rehearsal
pnpm test:quality-gate         # 위 결과를 단일 release manifest로 판정
```

CI lane:

- **PR:** lint, typecheck, unit/property, integration, isolation smoke, Chromium E2E.
- **merge:** 전체 isolation, Chromium/Firefox/WebKit E2E, accessibility, reliability.
- **nightly:** 30분 load, reconnect storm, slow-client soak, restore rehearsal.
- **release candidate:** immutable image로 전체 suite, 2시간 soak, backup/restore, N-1→N rolling deploy를 staging에서 실행한다.

## 4. 공통 harness와 판정 oracle

### 4.1 고정 fixture

- 최소 tenant `T-A`, `T-B`, 각 tenant의 owner/member/non-member/deactivated user.
- public/private channel, DM, archived channel 및 membership 변경 이력.
- device는 사용자당 최소 3개(`web-1`, `web-2`, `mobile-sim`)이며 각자 독립 cursor와 connection을 가진다.
- 모든 command에 `command_id`, `idempotency_key`, `aggregate_id`, `expected_version`를 명시한다.
- test clock은 freeze/advance 가능하되 DB ordering 판정은 `created_at`이 아니라 채널별 `seq`를 사용한다.
- Testcontainers는 test별 새 schema/database를 사용한다. 병렬 test 간 tenant나 outbox row를 공유하지 않는다.

### 4.2 관측 및 invariant

각 test run은 최소 다음을 수집한다.

- command submit/DB commit/accepted/fan-out timestamp
- `event_id`, `tenant_id`, `channel_id`, `seq`, event type
- client별 highest contiguous ACK와 resume cursor
- message/outbox/audit row의 transaction 상관관계
- queue depth, disconnect reason, reconnect/resume latency
- HTTP/WS error rate, PostgreSQL connections/locks/CPU, gateway CPU/RSS

공통 invariant:

```text
accepted(command) => exactly_one_committed_message(command.idempotency_key)
committed_message => exactly_one_logical_event (physical delivery may repeat)
per channel delivered seq after catch-up == durable seq in ascending order
read_cursor(new) >= read_cursor(old)
client projection after quiescence == server projection at same cursor
principal can observe object => same-tenant AND active membership AND object policy permits
```

`eventually` assertion의 기본 deadline은 integration 10초, browser 15초, operational test 60초이며 polling interval과 마지막 관측 상태를 실패 artifact에 남긴다.

## 5. Correctness 및 security acceptance

### 5.1 Tenant isolation

`T-A`의 credential/session/socket을 사용해 `T-B`의 모든 식별자를 path, query, body, header, cursor 및 event payload 위치에 대입한다.

실행 행렬:

- HTTP CRUD: workspace, public/private channel, DM, message, thread, reaction, cursor, admin/audit.
- 인증 session의 tenant를 header/body 변경만으로 전환 시도.
- WS connect, room subscribe, guessed channel ID, forged tenant/channel cursor, membership revoke 후 기존 socket 사용.
- search query와 pagination cursor에 다른 tenant/channel ID 삽입.
- quarantine object key, attachment metadata, expired/replayed presigned URL, 다른 사용자가 발급받은 URL 사용.
- invite reuse/expiry/wrong tenant 및 deactivated member.

**Exit gate:** 자동 생성된 최소 500개 cross-tenant 변형과 명시적 endpoint 전수 행렬에서 unauthorized data body/event/object byte **0건**, 잘못된 write **0건**, 성공(2xx/WS subscribe success) **0건**. 식별자 존재 여부를 숨기는 endpoint는 같은 형태의 404/403 계약을 유지한다. membership revoke 후 **1초 이내** 신규 command/subscription이 거부되고 기존 socket으로 이후 durable event가 전달되는 건수는 **0건**이다.

### 5.2 Durable acceptance, idempotency와 channel order

1. 동일 idempotency key를 직렬, 100-way 동시, timeout 후 retry로 총 1,000회 제출한다.
2. 같은 key+같은 payload는 모두 같은 message ID/result를 반환해야 한다.
3. 같은 key+다른 payload/aggregate는 명시적 conflict로 거부한다.
4. 50개 producer가 한 channel에 총 10,000개 command를 보내고 message/event `seq`를 비교한다.
5. 서로 다른 20개 channel에 동시 전송해 sequence가 channel-local임을 확인한다.
6. commit 직전/직후 API process와 PostgreSQL 연결을 끊어 accepted 시점 계약을 확인한다.

**Exit gate:** 1,000 retry당 committed message/message-created logical event **각 1개**, message ID 불일치 **0**, payload key collision의 silent reuse **0**. 한 channel의 committed durable event 10,000개에서 duplicate `seq`, missing committed `seq`, fan-out order inversion **각 0**. `accepted`였으나 restore/requery되지 않는 message **0**, rollback된 transaction에 대한 accepted **0**. p95 message commit은 release load 조건에서 **300ms 이하**다.

### 5.3 Cursor resume와 history pagination

- client를 임의 `seq`에서 끊고 disconnect 동안 create/edit/delete/reaction/thread 이벤트를 발생시킨 뒤 last contiguous cursor로 resume한다.
- event 수신 직후 ACK 전 kill, ACK 직후 kill, gateway restart, stale/unknown/future cursor를 각각 주입한다.
- history pagination 중 insert/edit/delete를 수행하고 snapshot/cursor 계약에 따라 reference set과 비교한다.
- 100회 reconnect cycle, cycle당 100개 event(총 10,000개)를 seeded random fault schedule로 실행한다.

**Exit gate:** durable event 대비 영구 누락 **0**, 적용 후 최종 projection 불일치 **0**, channel 내 order inversion **0**. 물리 duplicate delivery는 허용하지만 `event_id` 중복 적용은 **0**. future/forged cursor 성공 **0**. 100 cycles 모두 cursor에서 자동 복구하며 정상 네트워크에서 resume 완료 p95 **5초 이하**, p99 **10초 이하**다.

### 5.4 Unread, mention, thread count

fast-check state machine이 다음 operation을 섞는다: create, own message, mention, thread reply, edit로 mention 추가/제거, delete, cursor advance/rollback, membership join/leave, reconnect, concurrent device read.

- 독립 reference reducer가 unread/mention/thread count와 first unread seq를 계산한다.
- 단위 층에서 seed당 최대 500 operation, 최소 200 seed(총 100,000 operation)를 실행한다.
- integration 층에서 최소 100 seed, seed당 100 operation을 실제 PostgreSQL에 실행한다.
- logout/login, projection rebuild 및 device 추가 후 같은 cursor에서 결과를 재검증한다.

**Exit gate:** reference model과 API/UI badge 차이 **0**, negative count **0**, read cursor rollback 허용 **0**. projection rebuild와 재로그인 전후 count 차이 **0**. 모든 실패 counterexample은 shrink되어 seed와 함께 저장되어야 한다.

### 5.5 Multi-device convergence

동일 사용자 3개 device와 별도 사용자 2개 device에서 optimistic create/edit/delete/reaction/thread/read를 random interleave한다. 한 device는 offline, 한 device는 event duplicate/reorder transport를 거쳐 resume한다.

**Exit gate:** 100 seed × seed당 200 operation 후 모든 device가 동일 server cursor에 도달했을 때 message tombstone/version/reaction/thread/count projection 차이 **0**. optimistic temporary row 잔존 **0**, 같은 logical action 중복 표시 **0**. quiescence 후 convergence p95 **5초 이하**, p99 **10초 이하**다.

### 5.6 Transactional outbox duplicate delivery

relay의 `claim→publish→mark delivered` 각 경계에서 worker를 kill한다. claim lease 만료, 두 worker 동시 claim, publish timeout, gateway unavailable을 주입한다.

**Exit gate:** committed message 중 결국 publish되지 않은 logical event **0**, uncommitted message publish **0**. 강제 crash 1,000회에서 physical duplicate는 측정·허용하되 consumer projection의 duplicate apply와 사용자 중복 message는 **0**. relay 회복 후 backlog 10,000건을 **60초 이내** drain하고 poison event는 bounded retry 후 DLQ/failed 상태로 격리되어 뒤 event를 무기한 막지 않아야 한다.

### 5.7 Search 및 file authorization

Search:

- private/DM/archived/left channel의 고유 canary term을 tenant별로 삽입한다.
- membership을 검색 직전 및 page cursor 사용 사이에 revoke한다.
- stale index/document, guessed pagination cursor, snippets/highlights도 검사한다.

File:

- upload는 quarantine 상태에서 시작하고 MIME/size/scan 상태 전이를 검사한다.
- clean 판정 전 download, malware fixture(EICAR), metadata 위조, object-key 추측, tenant/channel membership revoke, expired URL 재사용, range request를 시험한다.

**Exit gate:** unauthorized search hit/snippet/count leakage **0**, membership revoke 후 다음 query부터 stale hit **0**. unauthorized download에서 object byte **0**, quarantine 또는 infected 파일 download 성공 **0**, EICAR release **0**. clean authorized file checksum은 원본과 **100% 일치**하고 presigned URL TTL은 설정값을 넘지 않으며 만료 후 성공 **0**이다.

### 5.8 Notification은 hint

push/email-ready outbox consumer 대신 deterministic fake provider를 두고 hint를 omit, duplicate, reorder, delay(최대 10분) 및 오래된 cursor로 전달한다. payload를 탭한 client는 hint 자체로 message/count를 확정하지 않고 인증된 delta API를 호출한다.

**Exit gate:** hint 유실·중복·역순 각각 1,000회에서 최종 timeline/count가 server projection과 다른 경우 **0**, hint만으로 phantom message가 생성되는 경우 **0**, duplicate notification의 동일 logical notification 중복 표시 **0**. hint를 받은 온라인 client는 정상 네트워크에서 delta fetch를 **5초 이내(p95)** 시작한다. notification payload에는 인증 token, presigned file URL 또는 전체 private message body가 포함되는 건수 **0**이다.

## 6. Realtime reliability acceptance

### 6.1 WebSocket reconnect storm

k6 또는 Node Socket.IO load client로 1,000개 인증 socket을 연결한다. 10초 window 안에 전부 강제 disconnect시키고 full-jitter exponential backoff가 적용된 재접속을 관찰한다. 동시에 100 msg/s를 유지하고 gateway 1개를 재시작한다.

**Exit gate:** 1,000/1,000 client가 자동 resume, **95%가 15초 이내**, **99%가 30초 이내**, 전부 **60초 이내** catch-up한다. accepted message 누락/순서 역전 **0**, reconnect 중 인증 우회 **0**, connection attempt peak가 steady-state 초당 연결률의 **5배 이하**, PostgreSQL connection pool exhaustion **0**, gateway OOM/crash **0**다.

### 6.2 Slow clients와 backpressure

한 client는 read를 중지하고 다른 client는 정상 소비한다. channel에 10,000개 event burst를 넣고 socket queue의 event-count/byte bound를 검사한다. half-open connection과 1/10/100 KB/s link도 Toxiproxy로 시험한다.

구현은 queue bound를 설정으로 명시해야 하며 release 기본값은 client당 **최대 1,000 events 또는 5 MiB 중 먼저 도달한 값**을 넘지 않는다.

**Exit gate:** slow client queue가 bound를 초과하는 sample **0**, process RSS가 slow client 수에 비례해 무제한 증가하지 않음(1,000 slow client, 15분 동안 steady-state 대비 증가 **500 MiB 이하**), bound 도달 client는 명시적 resumable reason으로 **5초 이내** close된다. 정상 client fan-out p95는 slow client 유무 간 **20% 초과 악화되지 않고 1초 이하**다. slow client resume 후 영구 누락/역전 **0**이다.

## 7. Browser E2E와 product completeness

### 7.1 Playwright matrix

Blocking project:

- Desktop: 최신 Chromium, Firefox, WebKit, viewport 1440×900.
- Responsive: Chromium 390×844 및 768×1024, touch/keyboard 각각.
- 실제 API, PostgreSQL, object store, worker를 사용하며 backend route를 mock하지 않는다. notification provider만 fake를 허용한다.

핵심 journey:

1. invite 수락→login→workspace/channel 진입→첫 message
2. public/private channel 생성과 member 초대/제거
3. DM, thread, reaction, edit, delete와 2-browser 실시간 수렴
4. unread separator, mention badge, jump-to-first-unread, 재로그인 count
5. offline compose→동일 idempotency key retry→중복 없는 accepted
6. socket 차단→메시지 발생→재연결/resume
7. attachment quarantine→scan→download 및 unauthorized browser
8. search와 membership revoke 후 결과 제거
9. mute/mention-only/quiet-hours와 notification hint→delta fetch
10. archived/deactivated 상태의 안전한 UI와 권한 거부

**Exit gate:** 모든 핵심 journey가 세 desktop engine에서 **100% 통과**, responsive 핵심 journey가 두 viewport에서 **100% 통과**, console uncaught error/unhandled rejection **0**, failed network request(의도한 negative test 제외) **0**. 20회 반복에서 제품 assertion 실패 **0**이며 retry로 green 처리하지 않는다. 초대 링크 진입부터 첫 accepted message까지 표준 사용자 rehearsal median **3분 이하**, 참가자 5명 중 **4명 이상**이 도움 없이 완료해야 한다.

### 7.2 Accessibility

WCAG 2.2 AA를 목표로 한다. axe 자동 검사와 수동 keyboard/screen-reader smoke를 모두 요구한다.

검증 흐름: login/invite, channel navigation, composer/send, timeline 탐색, thread open/reply/close, reaction menu, edit/delete dialog, search, file attach, unread jump, error/reconnect banner.

**Exit gate:** axe `critical`/`serious` violation **0**, 모든 핵심 action keyboard-only 완료율 **100%**, keyboard trap **0**, focus loss/unexpected focus reset **0**, visible focus 누락 **0**. dialog는 focus trap/restore를 지키고 새 message/reconnect 상태는 적절한 live region으로 전달한다. text/essential UI contrast는 **4.5:1 이상**(large text **3:1 이상**), 200% zoom과 320 CSS px width에서 정보/기능 손실 및 2축 scroll **0**, reduced-motion 설정에서 필수 정보를 animation에만 의존하는 경우 **0**. release마다 VoiceOver+WebKit과 NVDA+Firefox 중 최소 한 조합씩, 두 조합 모두 누적하여 확인한다.

## 8. Load 및 endurance gate

### 8.1 표준 workload

staging과 production 동형 topology에서 immutable release image를 사용한다.

- 100 tenants, tenant당 10 channels
- 1,000 concurrent sockets
- 20% active users, 총 100 `message.create` commands/s
- create 70%, reaction 10%, read cursor 10%, edit 5%, thread 5%
- message body p50 200 B, p95 4 KiB; 1% attachment metadata event
- ramp 10분, steady 30분(PR/nightly) 또는 2시간(release), cool-down 5분
- noisy tenant 한 곳이 전체 traffic의 30%를 생성

측정 정의:

- commit latency: command 수신부터 DB commit 후 accepted까지
- fan-out latency: DB commit부터 온라인 authorized client event 수신까지
- resume latency: reconnect 성공부터 highest durable cursor catch-up까지

**Exit gate:** commit p95 **300ms 이하**, p99 **750ms 이하**; fan-out p95 **1초 이하**, p99 **2초 이하**. HTTP/command unexpected error rate **0.1% 미만**, socket unexpected disconnect **0.5% 미만/시간**, accepted message 영구 유실과 unauthorized fan-out **각 0**. PostgreSQL/gateway CPU는 각 **80% 이하(p95)**, DB pool 사용률 **80% 이하(p95)**, outbox oldest age **5초 이하(p95)**. noisy tenant 때문에 나머지 tenant fan-out p95가 baseline 대비 **25% 초과 악화되면 실패**다. 2시간 soak의 gateway RSS 증가 추세는 마지막 60분 linear fit 기준 **50 MiB/시간 이하**이며 OOM/restart **0**이다.

수치 gate는 환경 크기를 숨기지 않는다. 결과 artifact에 instance/container resource, PostgreSQL 설정과 k6 summary를 포함한다.

## 9. Backup/restore와 rolling deploy

### 9.1 실제 backup/restore rehearsal

최소 1,000,000 messages, 100 tenants, attachment metadata와 object 10 GiB를 가진 staging snapshot을 사용한다. full backup과 연속 WAL/PITR을 별도 계정/버킷에 기록하고 새 disposable environment로 복원한다. 기존 환경을 재사용한 logical query만으로 restore 성공을 주장하지 않는다.

복원 후 검사:

- tenant/workspace/channel/message/event/outbox/audit row count 및 seeded checksum
- 마지막 accepted ID/seq와 PITR target 비교
- search index rebuild 후 authorized/unauthorized canary query
- attachment object checksum과 authorized download
- login, history, cursor resume, new message create

**Exit gate:** PITR 기준 **RPO 5분 이하**, restore 시작부터 readiness 및 smoke 완료까지 **RTO 60분 이하**. RPO window 이전 accepted message 유실 **0**, tenant 관계/checksum 오류 **0**, cross-tenant search/file 노출 **0**, corrupt/missing sampled object **0/1,000**. restore 후 새 message의 seq/id 충돌 **0**. nightly backup job 성공률은 최근 30회 중 **30/30**, restore rehearsal은 최소 월 1회 및 각 schema migration release마다 통과해야 한다.

### 9.2 Rolling deploy rehearsal

N-1 client/API/gateway/worker와 N release를 함께 띄운 뒤 1,000 sockets, 100 msg/s traffic을 유지하며 gateway→API→worker를 instance별 순차 교체한다. 각 instance는 readiness를 내린 뒤 drain하고, N-1/N event schema compatibility를 contract test로 먼저 확인한다. migration은 expand/contract 방식이며 destructive contract 단계는 N-1 process가 모두 제거된 뒤 별도 release에서만 허용한다.

**Exit gate:** rolling window의 accepted message 유실/중복 UI 적용/order inversion/unauthorized event **각 0**. sockets **99% 이상이 30초 이내**, 전부 **60초 이내** resume하고 수동 새로고침 필요 client **0**. unexpected 5xx/command error rate **0.1% 미만**, commit p95 **500ms 이하**, fan-out p95 **2초 이하**(deploy window 임시 상한), outbox oldest age **30초 미만**이며 종료 후 **60초 이내 5초 미만**으로 회복한다. readiness 이전 traffic 수신 및 termination grace 초과 강제 종료 **0**. rollback N으로 복귀하는 동일 rehearsal도 release마다 1회 통과해야 한다.

## 10. Release exit gates와 증거

### Gate A — Chat correctness/security (모두 blocking)

- idempotency 1,000 retry, 10,000 ordered event, cursor 100-cycle suite 통과
- unread/mention/thread property/model suite mismatch 0
- multi-device 최종 projection mismatch 0
- tenant HTTP/WS/search/file/admin leakage 0
- outbox crash injection에서 accepted loss 및 duplicate apply 0

### Gate B — Chat reliability (모두 blocking)

- 1,000 socket standard load의 latency/error threshold 통과
- reconnect storm과 slow-client bound 통과
- PostgreSQL/gateway restart 뒤 accepted message loss 0
- 2시간 release soak와 noisy-tenant isolation threshold 통과

### Gate C — Product completeness (모두 blocking)

- Playwright core journey 3 engines 및 responsive matrix 100% 통과
- notification hint fault suite에서 최종 수렴 mismatch 0
- accessibility 수치와 manual screen-reader/keyboard checklist 통과
- invite부터 첫 accepted message usability gate 통과

### Gate D — Operations (모두 blocking)

- RPO ≤ 5분, RTO ≤ 60분의 실제 restore evidence
- N-1→N rolling deploy와 rollback에서 loss/order/authorization 오류 0
- schema/event contract backward compatibility 통과

release manifest에는 다음 artifact를 링크한다.

- Git SHA, immutable image digest, migration/event schema version
- JUnit과 fast-check seed/counterexample
- Playwright trace/video/screenshot(실패 시 필수)
- axe report와 수동 접근성 checklist
- k6 raw summary, latency histogram, infrastructure metrics
- fault injection timeline과 client cursor reconciliation report
- backup ID, PITR target, restore timestamps/checksum report
- rolling deploy instance timeline과 N/N-1 compatibility report

**최종 판정 규칙:** Gate A–D 중 하나라도 실패하거나 evidence가 없으면 release 및 Agent 단계 진입은 **FAIL**이다. waiver는 보안 격리, accepted durability, message loss/order, backup restore에 허용하지 않는다. 그 외 waiver는 owner, 영향, 만료일(최대 14일), rollback/mitigation과 추적 issue가 있어야 하며 다음 release에서 자동 만료된다.

## 11. 구현 순서

1. contract/schema와 함께 reference reducer, tenant attack fixture, deterministic command factory부터 만든다.
2. feature 구현 전 해당 invariant의 failing unit/property/integration test를 추가한다.
3. durable message vertical slice에서 idempotency/order/accepted transaction gate를 먼저 통과시킨다.
4. realtime 구현과 동시에 cursor, duplicate outbox, kill/restart, slow-client harness를 연결한다.
5. search/file/notification UI는 authorization 및 hint fault test와 같은 PR에서 추가한다.
6. browser journey는 각 vertical slice가 합쳐질 때 누적하고, accessibility를 후행 일괄 작업으로 미루지 않는다.
7. staging topology가 준비되면 load baseline을 고정하고 restore/rolling rehearsal을 release 자동화에 연결한다.
