# ADR AW-001: Clean-room Chat Core architecture

- **Status:** Accepted for Chat Foundation
- **Date:** 2026-08-24
- **Owners:** Architecture
- **Decision scope:** Milestone 1 Chat Core and the boundary required for Milestone 2 personal Agent attachment
- **Supersedes:** Rocket.Chat-as-product-core and early Agent Control Plane assumptions

### Normative subordinate contracts

The implementation MUST use `docs/contracts/sync-contract-v1.md` for public field names (`event_seq`, `event_type`, `occurred_at`), opaque cursors, application checkpoints, transport ACKs, and the snapshot/subscription/barrier handshake. It MUST use `docs/contracts/chat-projection-semantics-v1.md` for unread, mention, thread, edit/delete, membership, private read state, and cache-purge semantics. `docs/quality/release-profile-registry.md` controls release thresholds when this ADR contains an older illustrative number or gate label.

## 1. Context and decision drivers

The product must succeed in this order:

1. polished, dependable human chat that a team can use every day without an Agent;
2. attachment of one personal Agent in under five minutes;
3. native mobile clients and multiple Agent adapters.

Shared Mind, product Kanban, an Orchestrator, long-term Agent memory, and autonomous multi-Agent fan-out are explicitly deferred. The architecture must not smuggle those concepts into the Chat Core data model.

The primary drivers are:

- durable, convergent chat across reconnects and multiple devices;
- strict tenant and channel isolation;
- a mobile-compatible contract from the first release, even though native mobile ships later;
- a product-owned UX, schema, authorization model, and event contract;
- a small team’s ability to build, test, deploy, and change the system;
- PostgreSQL/S3/OIDC/WebSocket portability rather than dependence on one hosting vendor;
- an explicit boundary through which a future Agent can act without becoming a second identity or conversation system.

## 2. Decision summary

Build a **clean-room TypeScript modular monolith** in a pnpm/Turborepo monorepo. PostgreSQL is the sole transactional system of record for identity bindings, tenancy, conversations, messages, cursors, audit records, and durable events. S3-compatible storage holds attachment bytes; PostgreSQL holds attachment metadata and authorization state.

Commands use versioned HTTP APIs. A successful command response is returned only after the database transaction commits. Durable changes are appended to a per-channel event stream in that same transaction and are fanned out over Socket.IO/WebSocket through a transactional outbox. WebSocket delivery is an optimization, not the source of truth: clients recover from a channel cursor using the HTTP delta API. PostgreSQL `LISTEN/NOTIFY` may wake gateways, but it is only a hint; correctness never depends on notification delivery.

The deployable API and worker are two process roles of one codebase and one domain model, not independently owned services. Module APIs and ownership rules are enforced in code and tests so a module can be extracted later only when measured operational pressure justifies it.

Human and future Agent actors share a narrow `Principal` abstraction. Agents remain distinct service principals with separate credentials, scopes, membership, audit identity, and revocation. The Chat Core does not know or store model-vendor execution details.

## 3. Architectural invariants

These rules are stronger than framework choices:

1. **Commit before acceptance.** `2xx` command success and `message.accepted` semantics mean the message, durable event, audit record, and outbox row committed atomically.
2. **One transactional truth.** No MongoDB, event broker, search index, WebSocket node, or client cache is a second source of truth.
3. **At-least-once delivery, idempotent application.** Outbox dispatch and WebSocket delivery may duplicate; stable IDs and sequences make duplicates harmless.
4. **Per-channel order only.** Every durable conversation event has a monotonically increasing channel `event_seq`. There is no global ordering promise across channels.
5. **Recovery does not depend on a live socket.** A client can discard its socket state and reconstruct from authenticated snapshots plus delta feeds.
6. **Authorization at every boundary.** HTTP commands, delta/history reads, socket subscriptions, search results, and attachment downloads independently verify tenant and channel access.
7. **Tenant is derived from authentication.** A body, path, query, or untrusted header cannot switch tenant context.
8. **Durable and ephemeral traffic are separate.** Messages, edits, deletes, reactions, thread changes, and read cursors are durable. Typing and presence are best-effort TTL state and never enter the durable channel sequence.
9. **Transport is replaceable.** Domain event schemas are product-owned and do not expose Socket.IO packet formats.
10. **Agents never impersonate humans.** Actor kind and principal ID are immutable server-derived message/audit attributes.

## 4. System shape

```text
Web / future Mobile / future Connector
        |  HTTPS commands, queries, delta
        |  short-lived authenticated Socket.IO connection
        v
apps/api — composition root, auth, HTTP, WS gateway
        |
        v
packages/chat-core — domain + application modules and ports
        |
        +--> packages/db / PostgreSQL
        +--> object-storage port / S3-compatible store
        +--> outbox rows
                  |
                  v
apps/worker — outbox relay and asynchronous jobs
                  |
          NOTIFY/event ingress hint
                  v
         API gateway fan-out
```

`apps/api` and `apps/worker` may initially run in one deployment or as separate processes. Both import the same application modules. Splitting process roles does not create network-owned domain boundaries.

## 5. Module boundaries

Each module owns its domain rules, application use cases, tables, repository interfaces, and emitted event types. Other modules call its public application port or consume a documented event; they do not query or mutate its tables directly.

| Module | Owns | Public responsibilities | Must not own |
|---|---|---|---|
| `identity` | users, OIDC identities, devices, sessions, refresh-token families, principals | authenticate, rotate/revoke sessions, resolve authenticated principal and tenant context | workspace/channel authorization |
| `tenancy` | organizations/tenants, workspaces, tenant/workspace memberships, invites, roles | membership lifecycle and tenant/workspace role decisions | channel content or messages |
| `conversations` | channels, channel members, DM participant sets, channel lifecycle | public/private channel and DM creation, membership, archive, subscription authorization | message bodies or unread projections |
| `messaging` | channel sequence state, messages, immutable message versions, threads, mentions, reactions, read cursors | message commands, history, delta stream, unread/mention/thread projections | sockets, push providers, attachment bytes |
| `realtime` | socket tickets, connection/subscription state, bounded delivery queues, gateway checkpoints | authorize subscriptions, fan out durable envelopes, backpressure, resume coordination, ephemeral typing/presence | durable chat truth |
| `files` | attachment metadata, upload sessions, quarantine/scan state, object keys | resumable/presigned upload flow and authorized download | raw bytes in PostgreSQL |
| `search` | search query/application policy; initially PostgreSQL FTS projections | permission-filtered search and result reauthorization | canonical message content |
| `notifications` | preferences, quiet hours, notification delivery jobs/tokens | derive and send email/push hints from committed events | unread truth or client sync truth |
| `administration` | audit log, retention configuration, export/deactivation workflows | append/query audit, policy administration | bypasses around module authorization |
| `agent-access` (Milestone 2 only) | Agent metadata, connector devices, pairing grants, service credentials, channel allowlist/status | pair, authenticate, scope, revoke, and route future service principals | model runtime, prompts, memory, tools, orchestration |

### Dependency rules

- Domain code imports only its own domain types and a very small shared kernel (`PrincipalId`, `TenantId`, `ChannelId`, `EventId`, clock, transaction context, error/result types).
- Modules never import another module’s repository or Drizzle table definition. Cross-module reads go through an application query port; cross-module reactions use committed events.
- `realtime`, `search`, and `notifications` depend on product-owned contracts, not on internal ORM entities.
- Transport controllers contain no domain decisions. They validate a contract, establish authenticated context, call one use case, and map the result.
- Database transactions may coordinate multiple modules only through an application-level unit of work. The command-owning module controls the transaction; participating modules expose explicit ports.
- Circular imports and table access outside the owning module fail an ESLint/dependency-cruiser architecture test.

The modular monolith intentionally permits one atomic PostgreSQL transaction for a message, mentions, audit, event, and outbox. Preserving this correctness is more valuable than premature service autonomy.

## 6. Monorepo layout

```text
apps/
  web/                  Next.js responsive web client
  api/                  NestJS/Fastify HTTP composition root + WS gateway
  worker/               outbox relay, notification/file/retention jobs
  connector/            Milestone 2 local Agent connector; absent from M1 runtime
  mobile/               Expo client in Milestone 3; absent from M1 runtime
packages/
  chat-core/
    src/modules/         identity, tenancy, conversations, messaging, ...
    src/shared-kernel/   IDs, clock, transaction and error primitives only
  contracts/             versioned OpenAPI, JSON Schema/Zod, durable event schemas
  db/
    schema/              one schema file/subpath per owning module
    migrations/          forward migrations and migration test support
    runtime/             pool, transaction, tenant context, health
  ui/                    accessible shared design tokens/components
  config/                shared TypeScript, lint, test, environment configuration
```

`packages/chat-core` is one package with folder-level module boundaries at first; creating a package for every module would add release and dependency overhead without isolation benefit. `packages/db` centralizes migration ordering and connection mechanics, but table ownership remains with the named module and is lint-enforced. Application code imports only the schema subpath it owns.

`packages/contracts` contains public wire contracts and generated artifacts, not ORM models or business logic. The web, future mobile app, and future Connector use generated clients/types from it. API and event changes follow additive evolution within `/v1`; breaking changes require `/v2` or a new event schema version with an explicit compatibility window.

## 7. PostgreSQL data and transaction model

### 7.1 Identity and tenancy

Every tenant-owned table has a non-null `tenant_id`. Tenant-scoped foreign keys are composite, for example `(tenant_id, channel_id)`, so an application bug cannot create cross-tenant references. The runtime database role is not the table owner. PostgreSQL row-level security is defense in depth where practical, not a substitute for application authorization and negative tests.

A `principal` is the durable actor identity. In Milestone 1 every active human user maps to a human principal. The schema reserves a discriminator (`human` or `service`) but no Agent runtime tables or behavior ship in Milestone 1.

A DM uses the same channel/message/event machinery as other conversations, with channel kind `dm` and a uniqueness rule over its tenant and canonical participant set. This avoids a parallel sync model.

### 7.2 Per-channel sequence

Each channel owns its next sequence counter. A durable channel-changing command locks/updates that channel’s counter inside the same transaction and assigns the resulting `BIGINT` to one durable `channel_event`. Committed events are therefore strictly ordered and unique per channel. Aborted transactions do not publish events; clients must tolerate a sequence gap if operational repair or future allocation strategy ever introduces one, and use `next_cursor` rather than assuming `seq + 1` exists.

Ordering is by `(channel_id, seq)`, never by timestamp. The event ID is globally unique and is used for deduplication; the sequence is used for ordering and resume.

### 7.3 Atomic command transaction

For a representative `message.create`, one transaction:

1. resolves the tenant from the authenticated session and rechecks active principal/workspace/channel membership;
2. claims `(tenant_id, principal_id, idempotency_key)` under a unique constraint;
3. validates limits and creates the message, mentions, and initial version;
4. allocates the channel sequence and appends a `message.created` row to `channel_events`;
5. appends the audit record;
6. appends an outbox row containing the durable event ID, not a second independently generated payload;
7. stores the stable command result and commits.

Only then does HTTP return success. Repeating the same key and semantically identical command returns the stored result and creates no new message/event. Reusing the key with a different command fingerprint returns `409 IDEMPOTENCY_KEY_REUSED`.

External work—object transfer, malware scanning, email/push, export generation—never occurs inside the transaction.

## 8. Outbox, WebSocket, and recovery model

### 8.1 Transactional outbox

`outbox` is written atomically with `channel_events`. A worker claims rows using a lease and `FOR UPDATE SKIP LOCKED`, publishes an event hint/envelope, and records attempt/dispatch state. A crashed lease expires and is retried. Dispatch is at least once; consumers deduplicate by `event_id`.

Initially, PostgreSQL `LISTEN/NOTIFY` can wake every API gateway with an outbox/event identifier. The payload itself is always re-read from PostgreSQL, and gateways also poll with a durable checkpoint, so a lost notification, worker restart, or gateway restart cannot lose accepted data. This supports one gateway without Redis. When measured horizontal scale requires a broker, the outbox publisher port can target an appropriate fan-out bus; the channel-event and client contracts do not change. A competing-consumer queue alone is not sufficient for gateway broadcast.

Outbox lag is observable and alertable. Outbox retention is longer than the maximum dispatch/recovery window and cleanup occurs only after confirmed publication age thresholds.

### 8.2 Live delivery

Socket.IO is a transport implementation. Connections use a short-lived, single-purpose socket ticket or an authenticated secure cookie; long-lived refresh tokens are never sent as socket query parameters. Every channel subscription rechecks current membership and tenant context. Membership revocation closes or removes the subscription promptly and is rechecked on delta reads.

A durable envelope is:

```json
{
  "schema_version": 1,
  "event_id": "opaque-id",
  "tenant_id": "opaque-id",
  "channel_id": "opaque-id",
  "event_seq": "1842",
  "event_type": "message.created",
  "actor": { "principal_id": "opaque-id", "kind": "human" },
  "occurred_at": "2026-08-24T12:34:56.789Z",
  "payload": {}
}
```

`event_seq` is a decimal string on the wire because JavaScript and mobile runtimes cannot safely represent every PostgreSQL `BIGINT`. IDs are opaque strings and timestamps are RFC 3339 UTC.

Gateways preserve per-channel order in each connection’s bounded queue. They do not promise inter-channel order. The client deduplicates by `event_id` and advances `last_applied_cursor` only in the same local transaction that applies the reducer result. Transport ACK does not advance this checkpoint. On a gap, queue overflow, authorization change, server `resync_required`, or reconnect, it pauses live application and performs delta recovery.

Slow clients receive a bounded warning and are disconnected with a resumable reason before unbounded memory growth. They recover from PostgreSQL; the server does not retain an unbounded per-socket replay buffer.

### 8.3 Resume and delta

The authoritative endpoint is conceptually:

```http
GET /api/v1/channels/{channel_id}/sync/events?after={opaque_cursor}&through={barrier_cursor}&limit=200
```

It returns events in ascending channel order through the fixed `barrier_cursor`, with `next_cursor` and `reached_barrier`. The cursor is opaque and channel-bound; clients must not construct or compare it. The exact snapshot→buffering subscription→barrier→fixed delta→buffer flush→live handshake, overflow behavior, and revocation behavior are defined only by `docs/contracts/sync-contract-v1.md`.

Event retention must be at least the declared offline-sync window. If a cursor predates retained events, the API returns `410 CURSOR_EXPIRED` with a machine-readable instruction to fetch a fresh snapshot/history. Message history retention and event-log retention are separate policies.

Socket ACK means only that transport data reached the peer; it is not command acceptance and does not delete canonical events. Push notifications are hints containing stable deep-link IDs; after a push, clients fetch authenticated state/delta from the server.

## 9. Mobile-compatible API contract

The first web client uses the same public contract intended for mobile. There is no web-only private database-shaped API.

### Commands

- Versioned HTTPS endpoints under `/api/v1`.
- Every mutating request includes `Idempotency-Key` and an optional `If-Match`/`expected_version` where lost-update detection matters.
- A command envelope/result carries `command_id`, stable resource IDs, resulting version, and the committed event cursor/sequence when applicable.
- Retries after timeouts are safe. `202` is reserved for genuinely asynchronous jobs; durable message creation returns a committed result, not speculative acceptance.
- Errors use stable machine codes, correlation ID, field details, and an explicit retryability classification.

### Queries and sync

- History and delta use cursor pagination with stable ordering; never offset pagination.
- Limits have server-enforced bounds and responses expose `next_cursor`/`has_more` explicitly.
- Deleted messages appear as tombstones so replicas converge; edits carry monotonically increasing message versions.
- Initial sync is paged and resumable. Large workspaces do not require loading all history.
- ETags/versions support conditional refresh of channel lists, preferences, and other non-stream state.
- Deep links use stable workspace/channel/message/thread IDs, never mutable names.

### Authentication and devices

- OIDC-compatible authorization with short-lived access tokens and rotating, reuse-detected refresh-token families.
- Refresh tokens are stored only in platform-secure storage and are scoped to a device/session record.
- Device/session and push-token records are independently revocable. Push payloads contain no sensitive message body by default and are not trusted as state.
- Logout/revocation invalidates refresh capability; each command and socket subscription checks current principal/session status.

### Attachments

- Create an upload session, upload chunks directly to quarantined S3-compatible storage using short-lived signed URLs, finalize, scan/validate, then attach the authorized object.
- Upload sessions are resumable and idempotent. A message references attachment metadata only after allowed state transitions.
- Downloads use short-lived authorization checked against current tenant/channel membership; possession of an object key is not authorization.

## 10. Future Agent service-principal boundary

Agent attachment begins only after the Chat Foundation exit gate passes.

A future Agent is a `service` principal, never a synthetic human user. It receives normal channel membership plus an Agent-specific channel allowlist and narrow scopes. Effective permission is the intersection of tenant policy, channel membership, allowlist, credential scope, and current revocation state. Agent-authored messages use the same idempotent messaging command and durable event stream as human messages; the server derives and permanently exposes `actor.kind = service` so clients can render an Agent badge and audits cannot be confused.

The `agent-access` module will provide:

- six-digit, short-lived, single-use pairing grants;
- connector device-key registration and proof of possession;
- short-lived rotating connector credentials retained locally;
- outbound-only Connector sessions—no inbound port on the user’s machine;
- explicit channel selection, status, quotas/rate limits, cancel routing, reconnect/catch-up, and immediate revoke checks;
- a vendor-neutral Connector envelope and conformance suite.

The Chat Core exposes authorized mentions/events and accepts normal chat commands. It does **not** import Claude/Codex/Gemini SDKs, prompts, model sessions, tool execution, memory, task planning, or orchestration. Vendor adapters remain behind the Connector protocol. Adapter failure or disconnection can affect that Agent’s status/run, but cannot block human messaging, outbox progress, or gateway recovery.

Streaming output must not turn partial transport chunks into ambiguous canonical chat. Milestone 2 must define a separate versioned draft/stream protocol; only finalized message state uses ordinary durable message semantics. Cancellation is scoped to an Agent run and cannot cancel or roll back committed human chat events.

Revocation is checked during connector authentication, subscription, and every command transaction. Revoking a device or Agent prevents new commands immediately; existing content remains attributed and auditable.

## 11. Security and operational boundaries

- Authorization decisions use server-resolved tenant/principal context and are covered by HTTP, WebSocket, search, file, admin, and worker cross-tenant negative tests.
- Secrets and refresh tokens are never logged. Audit records contain actor, action, target, tenant, outcome, timestamp, and correlation identifiers without message secrets beyond policy.
- Search initially uses PostgreSQL full-text search so result filtering is transactional and permission-aware. Any later external index is a rebuildable projection and every result is reauthorized.
- Attachment uploads enter quarantine, have size/type limits, and cannot be downloaded as normal attachments until validation/scan policy passes.
- Presence/typing may use in-memory TTL state initially. Losing it during deployment is acceptable; losing accepted messages is not.
- Backups include PostgreSQL and object metadata; restore rehearsals verify event cursors and object references. Rolling deployment compatibility spans at least the current and previous contract version.
- Metrics include command commit latency, duplicate/idempotency conflicts, channel sequence allocation latency, outbox age/attempts, gateway fan-out latency, reconnect/delta volume, slow-client disconnects, authorization denials, and cursor-expiry rate.

## 12. Rejected alternatives

### 12.1 Rocket.Chat fork as the product core

**Rejected for the commercial core.** It offers a fast pilot and a rich behavior benchmark, but creates a long-lived fork/merge burden and binds product UX to upstream assumptions. Its MongoDB identity/message truth plus a separate PostgreSQL Agent plane would duplicate users, IDs, permissions, audit, ordering, and operations. Deep Agent-specific mobile UX would require invasive upstream changes. Rocket.Chat CE remains a time-boxed fallback pilot only, not a migration foundation or second production truth.

### 12.2 Zulip as the product core

**Rejected.** Zulip is a useful benchmark for keyboard UX, unread behavior, topic/thread-like organization, notifications, and tests. Its stream/topic conversation model is materially different from the intended channel plus one-level thread model, and adapting its Python/Django stack and UX would make upstream integration and product differentiation expensive. We will reproduce behavior only through clean-room requirements and license-reviewed adoption, not source copying.

### 12.3 Matrix as the primary protocol/data model

**Rejected for the initial product.** Matrix is appropriate when open federation, protocol interoperability, or independently operated homeservers are core requirements. None are initial goals. Its room-state DAG/event semantics, federation security surface, eventual state resolution, and E2EE expectations add complexity beyond the required tenant-hosted ordered channel model. A future interoperability bridge can translate at the edge without making Matrix the Chat Core truth.

### 12.4 Microservices from day one

**Rejected.** Identity, membership, message, mention, audit, sequence, and outbox changes need tight transactional correctness. Splitting them would introduce distributed transactions, broker operations, schema/version coordination, more failure modes, and slower product iteration before independent scale or team ownership exists. The modular monolith has explicit ports, events, table ownership, and architecture tests so extraction remains possible. Extraction requires measured load, availability, security, or organizational need plus a migration plan; a module name alone is not justification.

### 12.5 WebSocket-only commands or replay

**Rejected.** Mobile networks, background suspension, proxies, and reconnect races make sockets a poor sole command/recovery path. HTTPS idempotent commands and paged delta queries give observable commit semantics and straightforward retries. WebSocket remains the low-latency delivery path.

### 12.6 Redis/broker as an initial source of ordering

**Rejected.** Introducing Redis or a broker does not remove the need for PostgreSQL commit truth and resume queries, and can create dual-write failure. PostgreSQL event/outbox state provides initial durability; `NOTIFY` is only a wakeup hint. A broker may later carry fan-out after commit, never define whether a chat command was accepted.

## 13. Risks and mitigations

| Risk | Consequence | Mitigation / trigger |
|---|---|---|
| Per-channel counter is a hot row in unusually busy channels | commit latency and lock contention | load-test hot channels; batch only if semantics remain explicit; shard/allocate ranges only after measured threshold and preserve cursor rules |
| PostgreSQL outbox polling/NOTIFY reaches fan-out limits | lag during high event or gateway counts | measure outbox age and fan-out latency; replace publisher port with a fan-out bus while retaining DB event truth and delta recovery |
| Event log grows quickly | storage and query cost | partition/index by tenant/channel/time as measured, enforce documented retention, test cursor-expiry snapshot recovery |
| Modular boundaries erode because all code shares a database | accidental coupling blocks later change | module-owned schema subpaths, architecture tests, code ownership/review, no foreign repository imports |
| Client race between HTTP result and socket event | duplicate optimistic messages or wrong order | stable command/event/message IDs, reconcile optimistic state by command ID, event deduplication and cursor order |
| Authorization changes race with queued socket events | data disclosed after membership removal | reauthorize subscriptions, promptly evict on committed membership events, bounded queues, authorize all history/delta/download requests |
| Contract evolution strands old mobile versions | broken sync after server rollout | additive v1 rules, current/previous compatibility window, schema conformance fixtures, minimum-version policy and explicit resync errors |
| Clean-room implementation takes longer than adapting an existing chat server | schedule slip | narrow milestone, benchmark behavior/tests, vertical slices, fallback pilot decision point without contaminating core data ownership |
| Agent abstraction pollutes human chat too early | delayed or compromised Chat Foundation | reserve only principal discriminator/actor envelope in M1; forbid Agent runtime/module activation until exit gate |
| External search/object systems leak tenant data | security incident | PostgreSQL FTS initially, result reauthorization, opaque object keys, short-lived authorized downloads, cross-tenant suites |

## 14. Non-goals

The following are not part of this ADR’s implementation scope or Milestone 1:

- Shared Mind, Fact/Decision/Evidence stores, or a knowledge canonicalization layer;
- product Kanban, task/handoff workflow, or an Orchestrator;
- Agent runtime, model adapter, long-term memory, tool execution, or autonomous Agent-to-Agent discussion;
- native iOS/Android implementation (the API must nevertheless be compatible);
- voice/video, federation, Matrix compatibility, E2EE, plugin marketplace, or arbitrary bots;
- global total ordering across channels or exactly-once network delivery;
- a general event-sourced reconstruction of every domain table—the event stream is the durable sync/audit integration record, while PostgreSQL domain tables remain canonical state;
- premature independent deployment or database ownership per module;
- analytics/data warehouse architecture or a general workflow engine.

## 15. Concrete acceptance criteria

AW-001 and downstream implementation conform to this decision when all of the following are demonstrably true.

### Architecture and repository

- [ ] The monorepo contains buildable `web`, `api`, and `worker` apps plus `chat-core`, `contracts`, `db`, `ui`, and `config` packages; Connector/mobile code is not required for Milestone 1.
- [ ] An automated boundary test has a failing fixture proving that circular module imports and access to another module’s repository/schema are rejected.
- [ ] OpenAPI and durable event schemas are versioned, generated/validated in CI, and consumed by the web client without importing server ORM types.
- [ ] One API/worker codebase runs locally with PostgreSQL and S3-compatible storage; Redis and an external broker are not required.

### Durable chat correctness

- [ ] Repeating one `message.create` command 1,000 times with the same tenant, principal, and idempotency key yields exactly one message ID, one durable creation event, and one logical audit result; conflicting key reuse returns `409`.
- [ ] A success response is never observable before its message, event, audit, and outbox records are committed; forced rollback creates none of them.
- [ ] Concurrent commands in one channel produce unique, strictly increasing event sequences, and no test assumes cross-channel order.
- [ ] History/delta pagination under concurrent insert, edit, and delete produces no duplicate application, skipped retained event, or order inversion.
- [ ] Edit, tombstone delete, reaction, one-level thread, mention, and monotonic read-cursor state converge across two devices after logout/relogin.
- [ ] PostgreSQL restart after a command success loses zero accepted messages.

### Realtime and mobile sync

- [ ] Killing/restarting the worker or gateway, dropping a notification, duplicating outbox dispatch, and reconnecting sockets all converge through delta recovery with zero missing retained events.
- [ ] Socket events carry opaque IDs, RFC 3339 UTC timestamps, decimal-string sequences, schema version, actor kind, and stable event IDs.
- [ ] A socket transport ACK is never surfaced as durable command acceptance.
- [ ] A slow client cannot grow an unbounded server queue; after resumable disconnect it catches up from its cursor.
- [ ] An expired cursor returns a machine-readable snapshot/resync path, and the client completes that path.
- [ ] A mobile-shaped test client can use short access tokens, rotating refresh tokens, idempotent HTTPS retry, cursor pagination, background push-as-hint, deep links, and resumable attachment upload without a web-only endpoint.
- [ ] At 1,000 concurrent sockets, p95 message commit is at most 300 ms and online fan-out p95 is at most 1 second in the agreed test environment; rolling gateway deployment completes with automatic resume.

### Isolation and future Agent boundary

- [ ] Cross-tenant and unauthorized-channel attempts over HTTP, socket subscribe/resume, search, attachment download, admin, and worker paths are denied by automated negative tests.
- [ ] Tenant context cannot be changed by modifying request bodies, paths, queries, or untrusted headers.
- [ ] Human actor identity/kind is server-derived and immutable; the schema can add a `service` principal without treating it as a human session.
- [ ] Before Milestone 2, no Chat Core module imports an Agent vendor SDK or contains orchestration, memory, prompt, or tool-execution behavior.
- [ ] The Milestone 2 design can enforce membership ∩ allowlist ∩ scope, outbound-only pairing, proof of possession, per-command revocation, and immutable Agent message attribution through the documented principal/Connector boundary.
- [ ] Failure of a future vendor adapter cannot block human command commits, outbox dispatch, or chat recovery.

## 16. Consequences

This decision spends early engineering effort on idempotency, event ordering, authorization, recovery, and contract tests rather than on Agent features. It accepts at-least-once delivery and client reconciliation in exchange for a simple, durable truth model. It also accepts that a very hot channel or very large gateway fleet may eventually require specialized infrastructure, but makes that an observable substitution behind stable ports rather than a precondition for product development.

The immediate implementation order is identity/tenancy/conversations, durable messaging and its correctness harness, realtime resume, complete human chat, and commercial-readiness gates. Only after those gates pass may the service-principal and Connector work begin.
