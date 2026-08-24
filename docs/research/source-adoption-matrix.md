# AW-003 — Source Adoption Matrix

> 조사 기준일: 2026-08-24. 아래 내용은 제품·엔지니어링용 오픈소스 리스크 분류이며 법률 의견이나 법적 확답이 아니다. 실제 도입 전에는 고정 commit, 배포 형태(SaaS/온프레미스/모바일), 수정·링크 경계, 의존성 SBOM을 기준으로 오픈소스 전문 변호사의 검토를 받아야 한다.

## 1. 결정 요약

Agent Workspace의 기본값은 **자체 Chat Core + 행동 벤치마크**다. Rocket.Chat, Zulip, Mattermost, Matrix/Element의 구현을 제품 기반으로 fork하지 않고, 공개 제품에서 관찰되는 행동을 독립 acceptance test로 다시 작성한다. permissive 소스의 선택적 재사용도 “편리하므로 복사”가 아니라 아래 intake 절차를 통과한 작은 단위로 제한한다.

| 등급 | 기본 posture | 허용되는 일 | 금지/보류되는 일 |
|---|---|---|---|
| **B — behavior only** | 기본값 | 공개 UI/API/문서에서 행동을 관찰하고, 요구사항과 테스트를 자체 문장·fixture로 작성 | 원본 코드·테스트·문구·아이콘·레이아웃 복사 |
| **P — permissive intake** | MIT/Apache-2.0 소스에 한해 예외 승인 | 고정 commit과 정확한 파일/라인을 등록하고, license/NOTICE/의존성 검토 후 작은 코드 단위 재사용 | 저장소 전체를 무심사 vendor하거나 license 경계가 섞인 디렉터리 복사 |
| **C — copyleft/commercial gate** | AGPL/GPL/상용 이중 라이선스 | 블랙박스 행동 벤치마크, 공개 표준 구현, 별도 상용 계약 후 승인된 범위 | 폐쇄형 제품 코드에 원본 구현을 복사·링크·수정·배포 |
| **X — blocked/unclear** | 권리·출처 불명확 | counsel 또는 권리자의 서면 확인 이후 재분류 | 코드, 테스트, 문서, 이미지, 디자인 asset 도입 |

MIT는 일반적으로 상업적 사용·수정·배포를 허용하지만 저작권 고지와 permission notice를 copies 또는 substantial portions에 유지하도록 요구한다.[1][14][17]

Apache-2.0은 재배포 시 license 제공, 수정 파일 표시, 관련 고지 보존, upstream `NOTICE`가 있으면 그 attribution 전달을 요구하며 명시적 patent grant와 patent-litigation termination 조항도 둔다.[9][11]

이 요약만으로 특정 사용이 준수된다고 결론 내리지 않는다.

## 2. 소스별 채택표

### 2.1 Rocket.Chat

| 항목 | 결정 |
|---|---|
| 기준 소스 | `RocketChat/Rocket.Chat@2a7de457074cbb4d4373fbd9a4e5bea292c9c764`. Root license는 `apps/meteor/ee/`와 `ee/` 밖을 MIT로, 그 디렉터리와 제3자 구성요소를 별도 조건으로 분리한다.[1] |
| 벤치마크할 행동 | conventional workspace/channel/DM/thread 흐름, unread/mention 배지, edit/delete/reaction의 multi-device 수렴, reconnect 후 catch-up, 파일·검색 권한, 관리자 lifecycle, push/deep-link. MongoDB와 Meteor 내부/외부 service 분리는 구현안이 아니라 장애·확장 benchmark로만 본다.[3] |
| 재사용 가능한 코드 / posture | **P, 단 예외 승인.** 정확한 파일이 두 EE 디렉터리 밖이고 해당 파일 header·generated origin·dependency가 permissive임을 양방향 확인한 뒤 MIT로 작은 utility/schema/test helper를 재사용할 수 있다. 제품 기본안은 코드 재사용 0이며 behavior-only다. |
| 복사하지 않을 것 | `apps/meteor/ee/**`, `ee/**`, EE에서 생성되거나 이동된 산출물, proprietary feature flag/entitlement 코드. EE license는 production 사용을 유효한 subscription에 묶고 일반적인 복사·배포를 제한한다.[2] Rocket.Chat의 UI 문구, 로고, 아이콘, screenshots와 Slack 유사 pixel layout도 복사하지 않는다. Mongo/Meteor data model과 DDP contract를 Chat Core로 이식하지 않는다. |
| provenance / NOTICE | 채택 파일마다 upstream repo+commit+path+line range, 원 저작권, MIT 전문, local modification을 등록한다. Root에 별도 `NOTICE`가 없다는 사실은 제3자 고지 의무가 없다는 뜻이 아니므로 lockfile·package asset을 별도 scan한다. 배포 notice bundle에 Rocket.Chat MIT notice와 직접 포함한 제3자 license를 싣는다. |
| clean-room / counsel gate | EE 경로를 checkout/검색 대상에서 제외한 mirror를 쓰고, CI에서 `(^|/)ee/`와 provenance 없는 Rocket.Chat fragment를 차단한다. **Counsel gate RC-1:** client-side 산출물에 관한 EE license 예외의 범위, 과거 파일 이동/혼합 이력, 상용 SaaS 및 온프레미스 배포, trademark/rebranding을 서면 승인받기 전 source intake 금지. |

### 2.2 Zulip

| 항목 | 결정 |
|---|---|
| 기준 소스 | `zulip/zulip@49904c2035c7872cbd2d5ca0c202673b08bd5ea4`. 프로젝트는 Apache-2.0으로 배포되며, upstream도 외부 저작물을 `docs/THIRDPARTY`에 기록하도록 요구한다.[4] Root `NOTICE`는 Dropbox/Kandra Labs/contributors attribution과 제3자 license 목록 위치를 명시한다.[5] |
| 벤치마크할 행동 | realm(tenant) 격리, channel→topic의 durable conversation 구조, 좁은 topic 이동/rename semantics, unread/topic cursor, long-poll event queue와 reconnect, 대규모 organization UX, bot/API behavior. Django가 write path, Tornado가 event delivery, PostgreSQL이 durable data를 맡는 분리는 책임 경계 benchmark다.[6] |
| 재사용 가능한 코드 / posture | **P.** Apache-2.0 code·test·schema를 정확한 provenance와 함께 선택적으로 포팅할 수 있다. 그러나 Python/Django 구현을 TypeScript/PostgreSQL 제품에 직역하기보다, topic/unread/event semantics를 자체 contract와 property test로 재구현하는 **B**가 기본이다. |
| 복사하지 않을 것 | Zulip 고유 topic-first information architecture를 사용자 검증 없이 제품 전체 UX로 복제하지 않는다. HTML/CSS, copy, emoji/sound/image, fixtures의 실제 사용자 데이터, deployment scripts를 wholesale 복사하지 않는다. `docs/THIRDPARTY`의 별도 license가 불명확한 파일은 Apache로 추정하지 않는다. |
| provenance / NOTICE | 배포 시 Apache-2.0 전문, 변경 파일의 prominent modification notice, 관련 copyright/patent/trademark/attribution, upstream `NOTICE`와 채택 파일에 해당하는 `docs/THIRDPARTY` 항목을 보존한다.[5][9] 내부 manifest에 upstream file→local file mapping과 변경 날짜를 둔다. |
| clean-room / counsel gate | Apache code를 직접 쓰는 lane과 behavior spec lane을 PR label로 분리한다. **Counsel gate Z-1:** NOTICE/THIRDPARTY 축약 가능 범위, Apache patent grant/termination, bundled assets·translations·fonts의 개별 license, 모바일 배포 고지를 출시 전 승인. |

### 2.3 Mattermost

| 항목 | 결정 |
|---|---|
| 기준 소스 | `mattermost/mattermost@9091791efe39d9ac8007d25c57184e2dbdb0389b`. License policy는 Mattermost가 만든 compiled platform은 MIT, 수정 소스로 만든 build는 AGPLv3 또는 commercial, 그리고 명시한 admin/config 경로(`server/templates/`, `server/i18n/`, `server/public/`, `webapp/`)는 Apache-2.0이라고 구분한다.[7] |
| 벤치마크할 행동 | team/channel/DM/thread navigation, post lifecycle, WebSocket reconnect, unread/mentions, plugin/webhook API, admin/audit, mobile offline/push. 특히 channel membership 변경과 unread/read cursor 경계, production upgrade behavior를 black-box conformance 대상으로 둔다. |
| 재사용 가능한 코드 / posture | **B가 기본.** 공식 unmodified binary를 비교 환경에서 실행하는 것은 code reuse와 분리한다. **P 예외:** license policy가 명시한 Apache 경로 또는 별도 Apache mobile repo의 파일만 exact-path review 후 가능. 서버 source의 closed-product 재사용은 **C**이며 commercial license 또는 AGPL 준수안에 대한 counsel 승인 없이는 금지한다. |
| 복사하지 않을 것 | AGPL server source, server tests/schema/migrations, 내부 API 구현, Enterprise source, build 결과를 폐쇄형 Chat Core에 복사하지 않는다. “공식 binary가 MIT”라는 사실을 source code MIT 허가로 확장 해석하지 않는다. 상표·제품명·UI assets도 제외한다. |
| provenance / NOTICE | Apache 예외 파일을 채택할 경우 Apache 전문, 변경 표시, 원 고지와 적용 가능한 `NOTICE.txt`를 전달한다.[7][8] 공식 binary를 pilot에 포함하면 binary 동봉 license/third-party notices를 원형 보존한다. source build 여부와 build producer를 release manifest에 기록한다. |
| clean-room / counsel gate | Mattermost source를 본 benchmark 연구자가 behavior spec을 쓰고, 구현자는 spec과 공개 API traces만 받는 2인 clean-room을 적용한다. **Counsel gate MM-1:** AGPL의 combined/linked work 및 network-use 경계, plugin/sidecar/API separation, 공식 binary 수정·재배포, Apache path 예외, mobile rebrand/push gateway를 서면 판단받는다. |

### 2.4 Matrix / Element

| 항목 | 결정 |
|---|---|
| 기준 소스 | `matrix-org/matrix-spec@bdba86a0c73b48e285cf6edca8a788228418bcd9`와 `matrix-rust-sdk@7d19b2fb46722b9f1200d486c1b2556d383b5147`는 Apache-2.0이다.[9][11] Matrix는 rooms/events, client-server sync, federation, application services를 정의하는 공개 표준이며 event body를 untrusted로 취급하라고 명시한다.[10] 비교 대상 Element 구현은 `synapse@3db77e80a5a9bea0d36830906661f568314d04d0`, `element-web@6b3a7808bc9d88b2f89f08955af47fdf5cd6e92c`; 현재 repositories는 AGPL/commercial posture이므로 구현과 표준을 동일 라이선스로 취급하지 않는다.[12][13] |
| 벤치마크할 행동 | opaque sync token 기반 incremental `/sync`, device/session revoke, event IDs와 typed extensible events, state-event authorization, room membership/history visibility, redaction, eventual consistency, appservice namespace, E2EE/federation 실패 시나리오. 우리 M1에는 federation/E2EE를 넣지 않고 reconnect/catch-up 및 untrusted event validation만 benchmark한다.[10] |
| 재사용 가능한 코드 / posture | **P:** Matrix spec의 Apache-2.0 protocol definitions 또는 Matrix Rust SDK를 별도 adapter/service에서 사용할 수 있다(license/NOTICE/dependency review 전제). **C:** Synapse·Element Web·Element X source는 commercial terms 또는 AGPL release plan 없이 폐쇄형 제품에 복사하지 않는다. 공개 spec에 맞춘 독립 구현은 Element code reuse와 분리한다. |
| 복사하지 않을 것 | Synapse storage/federation code, Element React components/CSS/copy/icons, Element X mobile UI, tests/snapshots를 closed core에 복사하지 않는다. Matrix room DAG를 단일-tenant channel `seq` 모델에 억지로 이식하거나, federation complexity를 미래 가능성만으로 선반영하지 않는다. Matrix/Element trademarks를 product naming에 사용하지 않는다. |
| provenance / NOTICE | spec 문구·schema 또는 SDK code를 배포하면 Apache 전문, modified-file notices, 관련 upstream attributions 및 존재하는 NOTICE를 전달한다. Element commercial artifact를 구매한 경우 계약상 고지는 OSS notice와 별도로 추적한다. protocol conformance 문서에는 spec version과 endpoint version을 고정한다. |
| clean-room / counsel gate | 구현팀은 Matrix spec/API traces만 사용하고 Element source 접근을 금지한다. source 열람자는 독립 behavior test description만 전달하며 원 test 이름·fixture·UI text를 전달하지 않는다. **Counsel gate MX-1:** spec text/schema의 제품 내 복제, SDK static/dynamic linking, AGPL client/server network·distribution 의무, app-store 배포, commercial Element 계약과 trademark를 결정한다. |

### 2.5 CC-Group-Chat

| 항목 | 결정 |
|---|---|
| 기준 소스 | `KARPED1EM/CC-Group-Chat@fa50466c72eb2caf8343a248ef7de87018f1605b`, MIT.[14] Strict Zod JSON-RPC envelope와 method schemas는 adapter 입력 validation의 좋은 source-level reference다.[15] SQLite schema에는 per-room immutable message IDs, normalized mentions, membership history, reconnect tokens, per-agent read pointer가 분리되어 있다.[16] |
| 벤치마크할 행동 | strict unknown-field rejection, bounded payload/frame, join/reconnect/name collision, durable room history, normalized mention delivery, per-principal catch-up cursor, token rotation/revoke, local broker auto-rendezvous. Agent 작업은 M2 전까지 구현하지 않고 contracts backlog와 conformance fixtures만 남긴다. |
| 재사용 가능한 코드 / posture | **P 가능, B 기본.** MIT protocol schemas, branded ID validators, SQLite test helpers를 작은 단위로 포팅할 수 있다. TypeScript가 맞아도 tenant/auth/event contract가 다르므로 product-owned Zod schemas를 우선하고, 직접 복사 시 exact source mapping을 요구한다. |
| 복사하지 않을 것 | LAN password/mDNS discovery를 cloud identity로 사용하지 않는다. machine UUID를 tenant principal로, per-room integer를 global ordering으로, Claude Channels/MCP를 durable domain protocol로 사용하지 않는다. bundled binaries, generated files, prompts, logos는 별도 출처 확인 없이 복사하지 않는다. |
| provenance / NOTICE | 포함한 코드 또는 substantial portion과 함께 MIT copyright/permission notice를 유지한다.[14] dependency lockfile, bundled `bin/` 산출물, generated source의 원본과 license를 별도 확인한다. |
| clean-room / counsel gate | permissive intake는 clean-room 대신 traceable-copy lane을 쓴다. source-derived PR에는 `Upstream-Source`, commit, path, lines, license, modifications를 적는다. **Counsel gate CCGC-1:** bundled artifacts와 Anthropic Claude Channels/plugin terms, Claude 상표·API 계약은 MIT와 별개이므로 adapter 배포 전에 검토한다. |

### 2.6 Open Agent Room

| 항목 | 결정 |
|---|---|
| 기준 소스 | `cch123/open-agent-room@3cac309595c96bfb086c9de59317689cc112852a`, MIT.[17] Protocol은 `actor`, `scope`, `payload`, correlation/causation trace를 가진 appendable/replayable/routable envelope를 기술한다.[18] 현재 store는 단일 JSON state를 저장하고 messages 500/events 120으로 trim하므로 production durability donor가 아니다.[19] |
| 벤치마크할 행동 | human/agent/daemon/system principal 구분, channel/DM/server scope, correlation/causation tracing, local daemon capability handshake, agent status, streaming/cancel/reconnect 상태, explicit handoff/final semantics. M1에서는 generic actor/event vocabulary만 검토하고 task lane·memory·orchestration은 deferred scope다. |
| 재사용 가능한 코드 / posture | **P 가능.** MIT event type constants, envelope types, ID helpers를 exact-source review 후 재사용할 수 있다. 다만 product command/event contract는 tenant/channel `seq`, version, idempotency, durable commit을 포함해 독립 설계한다. |
| 복사하지 않을 것 | JSON whole-file store, fixed retention trims, default/dev token, embedded UI, task/Kanban/memory model, arbiter/autonomous fan-out를 복사하지 않는다. “appendable/replayable” 문서 표현을 현재 store의 보장으로 오인하지 않는다. |
| provenance / NOTICE | MIT notice를 source distribution와 substantial copied portions에 유지하고, adopted event names가 source-derived인지 independent인지 manifest에 표시한다.[17] Go dependencies, embedded assets/fonts는 별도 scan한다. |
| clean-room / counsel gate | 구현이 유사하더라도 event 이름·필드 단위 provenance를 남겨 우연/직접 도입을 구분한다. **Counsel gate OAR-1:** event vocabulary/schema의 substantial-copy 판단, embedded web assets와 dependency licenses, contributor provenance가 불충분한 파일의 도입 여부를 확인한다. |

### 2.7 agentchattr

| 항목 | 결정 |
|---|---|
| 기준 소스 | `bcurts/agentchattr@c24f605c9b24fb7a98003f7930e2d5e7a7f7d297`, MIT.[20] Router는 채널별 hop counter, pause, human reset, explicit mention routing을 구현한다.[21] |
| 벤치마크할 행동 | mention-driven wake-up, online/offline presence, channel-scoped loop guard와 human `/continue`, multi-agent role/rule UX, job/thread context, summaries, scheduled messages, structured phase/turn UI. 이 중 M1은 human chat UX만, M2는 one-agent mention/stream/cancel만; autonomous multi-agent와 jobs/sessions는 deferred benchmark다. |
| 재사용 가능한 코드 / posture | **P 가능하지만 낮은 우선순위.** MIT mention parser/loop-guard algorithm 또는 small validators를 포팅할 수 있다. 제품 core에는 동일 기능을 immutable principal IDs, hard budget/deadline/cancel, server authorization으로 독립 구현하는 **B**를 권장한다. |
| 복사하지 않을 것 | JSON/JSONL stores, single-process callbacks, tmux/console keystroke injection, auto-approve launchers, unencrypted LAN mode, prompt-only roles/rules, terminal scraping을 production runtime으로 복사하지 않는다. UI copy, logo, screenshots, session templates도 별도 review 없이 가져오지 않는다. |
| provenance / NOTICE | MIT copyright/permission notice를 보존한다.[20] template/prompt/content files도 “code가 아니므로 자유”라고 가정하지 말고 별도 copyright provenance를 기록한다. Python/npm dependencies와 included images를 SBOM/asset inventory에 포함한다. |
| clean-room / counsel gate | deferred feature를 현재 domain schema로 끌어오지 않는 scope gate를 CI/ADR review에 둔다. **Counsel gate AC-1:** session templates/prompts/assets 재사용, terminal automation 관련 vendor terms, contributor provenance, commercial distribution notice를 검토한다. |

### 2.8 claude-chat

| 항목 | 결정 |
|---|---|
| 기준 소스 | 이 문서의 `claude-chat`은 **`vikrantjain/claude-chat@79d47297d072a1de212e6fcc2f0fc330f71f3c38`**로 고정한다. 동명/유사명 `claude-code-chat`과 혼동하지 않는다. 해당 repository는 MIT다.[22] |
| 벤치마크할 행동 | tiny MCP stdio↔WebSocket edge adapter, correlated participant-list request, stable process ID reconnect/name takeover, exponential reconnect, direct/broadcast routing, broker frame→`notifications/claude/channel` mapping.[23][24] |
| 재사용 가능한 코드 / posture | **P 가능.** MIT adapter glue 또는 request-correlation utility를 M2 vendor adapter에서 선택적으로 재사용할 수 있다. M1 Chat Core에는 도입하지 않는다. Claude-specific notification을 domain event가 아니라 edge translation으로 유지한다. |
| 복사하지 않을 것 | in-memory broker, unauthenticated `0.0.0.0` WebSocket, display-name addressing, permissive `any` parsing, delivery ACK 없이 반환하는 “sent”, no-history/no-idempotency semantics를 제품 core로 복사하지 않는다.[24] |
| provenance / NOTICE | MIT notice를 유지한다.[22] MCP SDK, Bun/runtime, Claude Channels API의 별도 licenses/terms/version을 dependency manifest에 기록한다. copied adapter code에는 upstream commit/path와 local hardening changes를 기록한다. |
| clean-room / counsel gate | 이름이 비슷한 repositories를 URL+commit으로 identity-lock하고 자동 source scan에서 `andrepimenta/claude-code-chat` 계열 유입을 block한다. **Counsel gate CL-1:** experimental Claude Channels 사용권·배포 조건·상표, MCP SDK dependency terms, vendor API 변경/지원 posture를 출시 전에 검토한다. |

### 2.9 group-chat-mcp

| 항목 | 결정 |
|---|---|
| 기준 소스 | `azarconsulting/group-chat-mcp@4967fdc45a36f27c09c0ece2f40cccbfe7c3bb39`, MIT.[25] Store는 room별 message counter, per-peer cursor, cold join, waiter wake-up, charter snapshot, human/agent kind를 구현한다.[26] README는 local single-user, no isolation posture와 charter가 enforcement가 아님을 명시한다.[27] |
| 벤치마크할 행동 | cold join 시 현재 이후부터 읽기, per-peer exactly-once-in-context cursor UX, explicit catch-up/skip, long-poll wake/timeout, room charter snapshot/versioning, authenticated connection path에서 principal kind 유도, auto-spawn/health/grace-exit local DX. |
| 재사용 가능한 코드 / posture | **P 가능.** MIT types, cursor drain algorithm, lifecycle test helper를 local connector prototype에 사용할 수 있다. production에서는 DB cursor transaction, durable accepted state, tenant/channel auth로 다시 구현한다. |
| 복사하지 않을 것 | in-memory room source of truth, no-auth HTTP mutation, transport만으로 human/agent 권한 결정, broad room deletion/kick, auto-GC history loss, prompt charter를 authorization으로 사용, localhost assumptions를 cloud service로 복사하지 않는다.[26][27] |
| provenance / NOTICE | MIT copyright/permission notice를 포함한다.[25] charter examples, UI, screenshots와 any bundled asset을 코드 license에 자동 포함된 것으로 가정하지 않고 확인한다. copied tests는 코드와 동일하게 provenance를 요구한다. |
| clean-room / counsel gate | local connector에서 재사용하더라도 cloud core package dependency가 되지 않도록 adapter boundary와 dependency test를 둔다. **Counsel gate GCM-1:** MCP SDK/Claude terms, UI assets, generated/vibe-coded contributor provenance, production distribution notice를 검토한다. |

## 3. 횡단 채택 규칙

### 3.1 행동 벤치마크는 이렇게 만든다

1. 연구자는 고정 release/commit과 stock deployment에서 입력, 권한, 네트워크 중단, 재로그인 조건과 관찰 결과를 기록한다.
2. 연구자는 원 repository test 이름·함수명·fixture·오류 문구를 복사하지 않고 제품 언어로 **behavior card**를 작성한다.
3. 구현자는 behavior card만 보고 failing acceptance/property test를 새로 작성한다.
4. benchmark와 우리 제품 요구가 다르면 “호환”을 목표로 하지 말고 차이를 ADR에 명시한다.
5. UI benchmark는 task completion, keyboard/focus, unread recovery, latency처럼 측정 가능한 행동으로 표현하고 pixel, copy, icon, animation을 복제하지 않는다.

### 3.2 permissive code intake 절차

직접 코드가 행동 재구현보다 명백히 유리할 때만 다음을 모두 충족한다.

- source identity: repository, full commit SHA, path, line range, tag/release;
- rights: file header, root/subdirectory license, git history의 license 이동, generated/vendor 여부;
- contents: code, tests, schema, docs, prompt, image/font 각각의 권리;
- dependencies: direct/transitive SBOM, optional/build-time dependencies, bundled binary;
- destination: local path, 수정 내역/날짜, source/object/SaaS/mobile/on-prem 배포 형태;
- notices: `THIRD_PARTY_NOTICES` entry와 배포 artifact에 license/NOTICE 포함 검증;
- review: engineer + designated OSS reviewer; 아래 counsel gate이면 counsel approval ID;
- security/fit: copied code도 first-party와 같은 tests, threat model, tenant isolation review.

권장 PR trailer:

```text
Upstream-Source: https://github.com/<owner>/<repo>
Upstream-Commit: <40-char SHA>
Upstream-Path: <path>:<lines>
Upstream-License: MIT | Apache-2.0 | <other>
Local-Modifications: <summary and date>
OSS-Review: <ticket/approval>
```

### 3.3 restricted/mixed-source clean-room 규칙

Mattermost AGPL source와 Element/Synapse/Element clients, Rocket.Chat EE, 권리 불명확 소스에는 다음을 적용한다.

- **역할 분리:** observer/spec author와 implementer를 분리한다. 동일인이 이미 source를 보았다면 그 사실을 기록하고 다른 reviewer를 둔다.
- **허용 입력:** 공개 사용자 문서, public API/spec, black-box request/response traces, 자체 작성 behavior cards.
- **금지 입력:** source snippets, 원 test/fixture, 내부 symbol/table/event names(공개 API가 아닌 것), comments, generated schemas, screenshots/assets, pixel measurements.
- **독립 산출 증거:** dated behavior card, design notes, first-party failing test, commit history와 reviewer attestation을 보존한다.
- **유사성 검사:** restricted repository와 local source의 긴 token sequence, distinctive identifiers/error strings를 release 전에 scan하고 match를 조사한다.
- **격리:** restricted source checkout은 제품 repository·AI coding context·vector index에 넣지 않는다. pasted snippets가 issue/chat에 들어오면 provenance quarantine 처리한다.
- **중단 조건:** license 경계가 불명확하거나 source-derived인지 독립 구현인지 설명할 수 없으면 merge하지 않고 **X**로 재분류한다.

Clean-room은 infringement 여부를 자동으로 해결하거나 법적 안전을 보장하지 않는다. 사실관계와 독립 개발 증거를 개선하는 engineering control일 뿐이다.

## 4. NOTICE·provenance 운영 계약

제품 repository에는 구현 단계에서 다음 두 정본을 둔다(본 카드에서는 파일을 만들지 않는다).

1. `docs/research/upstream-intake-ledger.*`: source→local mapping, commit, license, reviewer/counsel decision.
2. release에 포함되는 `THIRD_PARTY_NOTICES`: 실제 ship된 direct/transitive code·assets의 license와 required attribution.

CI/release gate:

- dependency/SBOM과 intake ledger 간 orphan 0;
- copied or adapted 파일 중 `Upstream-Source` 없는 파일 0;
- Apache modified-file marker 누락 0, 적용 가능한 NOTICE 누락 0;
- MIT copyright+permission notice 누락 0;
- forbidden source/path fingerprints(Rocket.Chat EE, Mattermost server, Element/Synapse) 0;
- mobile/web/server/connector artifact별 notice bundle 실제 open/read smoke test;
- release commit 기준 license scan 결과와 counsel approval IDs 보관.

SaaS에서 client bundle, downloadable connector/CLI, mobile app, on-prem image는 서로 다른 전달·배포 사실을 만들 수 있으므로 notice를 하나의 server 문서로만 처리하지 않는다.

## 5. 필수 counsel gates

다음 중 하나라도 해당하면 구현·vendor·출시 전에 오픈소스 전문 변호사의 서면 결정을 받는다.

1. **배포 모델:** SaaS network use, 고객 온프레미스 image/source 제공, downloadable desktop/connector, App Store/Play Store 중 실제 모델별 의무.
2. **Copyleft boundary:** Mattermost AGPL source/plugin/sidecar/API 관계, Synapse·Element Web·Element X와 proprietary 서비스의 결합 또는 수정.
3. **Mixed repository:** Rocket.Chat CE/EE 파일·generated client bundle·history 이동·제3자 component의 정확한 license 경계.
4. **Permissive compliance:** Apache NOTICE/THIRDPARTY와 modified-file notices, MIT substantial portion 판단, source/object notice 전달 방식.
5. **Patent:** Apache patent grant/termination, protocol 또는 SDK 관련 patent assertions, 방어적 patent 정책과의 충돌.
6. **Assets and product identity:** logos, icons, fonts, screenshots, translations, sample data, UI trade dress, project/vendor trademarks와 rebranding.
7. **Vendor contracts:** Claude Channels, MCP/vendor SDK, plugin marketplace, model/provider terms는 repository OSS license와 별개의 계약 gate다.
8. **Provenance:** generated/bundled code, contributor ownership, AI-generated contribution, 불명확한 copied snippet 또는 license change history.
9. **Launch opinion:** 선택한 exact commits와 SBOM, notice bundle, clean-room 기록, source-offer/attribution UI를 묶은 최종 release review.

## 6. 최종 채택 우선순위

- **지금(M1):** Rocket.Chat/Zulip/Mattermost/Matrix의 human-chat 행동만 B로 benchmark한다. 코드 donor는 원칙적으로 0이다.
- **Chat correctness design:** CC-Group-Chat의 strict validation, durable identity/mention/read-pointer 패턴과 Matrix의 untrusted event/sync-token 패턴을 독립 contract/test로 재구현한다.
- **M2 준비:** Open Agent Room의 actor/scope/trace, claude-chat의 edge adapter, group-chat-mcp의 local cursor/DX를 benchmark한다. permissive source intake는 필요성이 입증된 작은 adapter에만 허용한다.
- **Deferred:** agentchattr의 multi-agent loop/session/jobs, Open Agent Room의 task/memory/arbiter, autonomous fan-out은 현재 schema나 roadmap으로 끌어오지 않는다.
- **금지 기본값:** Rocket.Chat EE, Mattermost AGPL server source, Synapse/Element implementation은 commercial/counsel gate 전까지 source reuse 0, restricted-source clean-room 적용.

## Sources

[1] https://github.com/RocketChat/Rocket.Chat/blob/2a7de457074cbb4d4373fbd9a4e5bea292c9c764/LICENSE
[2] https://github.com/RocketChat/Rocket.Chat/blob/2a7de457074cbb4d4373fbd9a4e5bea292c9c764/apps/meteor/ee/LICENSE
[3] https://developer.rocket.chat/docs/server-architecture
[4] https://github.com/zulip/zulip/blob/49904c2035c7872cbd2d5ca0c202673b08bd5ea4/docs/contributing/licensing.md
[5] https://github.com/zulip/zulip/blob/49904c2035c7872cbd2d5ca0c202673b08bd5ea4/NOTICE
[6] https://github.com/zulip/zulip/blob/49904c2035c7872cbd2d5ca0c202673b08bd5ea4/docs/overview/architecture-overview.md
[7] https://github.com/mattermost/mattermost/blob/9091791efe39d9ac8007d25c57184e2dbdb0389b/LICENSE.txt
[8] https://github.com/mattermost/mattermost/blob/9091791efe39d9ac8007d25c57184e2dbdb0389b/NOTICE.txt
[9] https://github.com/matrix-org/matrix-spec/blob/bdba86a0c73b48e285cf6edca8a788228418bcd9/LICENSE
[10] https://spec.matrix.org/latest
[11] https://github.com/matrix-org/matrix-rust-sdk/blob/7d19b2fb46722b9f1200d486c1b2556d383b5147/LICENSE
[12] https://github.com/element-hq/synapse/blob/3db77e80a5a9bea0d36830906661f568314d04d0/LICENSE-AGPL-3.0
[13] https://github.com/element-hq/element-web/blob/6b3a7808bc9d88b2f89f08955af47fdf5cd6e92c/LICENSE-AGPL-3.0
[14] https://github.com/KARPED1EM/CC-Group-Chat/blob/fa50466c72eb2caf8343a248ef7de87018f1605b/LICENSE
[15] https://github.com/KARPED1EM/CC-Group-Chat/blob/fa50466c72eb2caf8343a248ef7de87018f1605b/packages/shared/src/protocol.ts
[16] https://github.com/KARPED1EM/CC-Group-Chat/blob/fa50466c72eb2caf8343a248ef7de87018f1605b/packages/broker/src/storage/schema.ts
[17] https://github.com/cch123/open-agent-room/blob/3cac309595c96bfb086c9de59317689cc112852a/LICENSE
[18] https://github.com/cch123/open-agent-room/blob/3cac309595c96bfb086c9de59317689cc112852a/docs/protocol.md
[19] https://github.com/cch123/open-agent-room/blob/3cac309595c96bfb086c9de59317689cc112852a/internal/store/store.go
[20] https://github.com/bcurts/agentchattr/blob/c24f605c9b24fb7a98003f7930e2d5e7a7f7d297/LICENSE
[21] https://github.com/bcurts/agentchattr/blob/c24f605c9b24fb7a98003f7930e2d5e7a7f7d297/router.py
[22] https://github.com/vikrantjain/claude-chat/blob/79d47297d072a1de212e6fcc2f0fc330f71f3c38/LICENSE
[23] https://github.com/vikrantjain/claude-chat/blob/79d47297d072a1de212e6fcc2f0fc330f71f3c38/client.ts
[24] https://github.com/vikrantjain/claude-chat/blob/79d47297d072a1de212e6fcc2f0fc330f71f3c38/broker/broker.ts
[25] https://github.com/azarconsulting/group-chat-mcp/blob/4967fdc45a36f27c09c0ece2f40cccbfe7c3bb39/LICENSE
[26] https://github.com/azarconsulting/group-chat-mcp/blob/4967fdc45a36f27c09c0ece2f40cccbfe7c3bb39/src/broker/store.ts
[27] https://github.com/azarconsulting/group-chat-mcp/blob/4967fdc45a36f27c09c0ece2f40cccbfe7c3bb39/README.md
