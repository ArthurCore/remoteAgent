APPROVED

# AW-009 / AW-010A Plan Quality and Security Closure Review — xhigh

## Scope

This closure review compares only the prior quality/security findings `H1`–`H6` and `M1`–`M5` in `docs/reviews/aw-009-plan-quality-security-review-xhigh.md` against the revised AW-009/AW-010A plans and task cards. It does not validate implementation and does not supersede separate specification or UX/test reviews.

No prior quality/security finding remains open.

## High findings

### H1 — CLOSED: mutation authorization now has a linearizable lock protocol

AW-009 freezes one transaction and the fixed `identity_sessions` row → principal row lock order, revalidates while both locks are held, and holds them through DML and commit (`aw-009-tenant-workspace-channel-vertical-slice.md:89-110`). Revocation and deactivation use compatible conflicting acquisition order, including ordered session locking before the principal. The four required revocation and four required deactivation barriers, commit-order assertions, and zero-write rule are explicit (`:112`; `aw-009-task-cards.md:131-137`). A late ordinary `SELECT` is expressly rejected.

### H2 — CLOSED: the mutation Origin rule is exact and fail-closed

AW-009 now defines validated canonical public-origin configuration, production HTTPS and exact loopback exceptions, and startup rejection of wildcard/credential/path/query/fragment/`null`/duplicate entries (`aw-009-tenant-workspace-channel-vertical-slice.md:79-87`). Every cookie-authenticated mutation requires exactly one syntactically valid allowlisted `Origin`; missing, multiple, malformed, `null`, and cross-site values fail before use-case execution. Fetch Metadata cannot bypass Origin, state-changing `GET` is prohibited, CORS is absent for this flow, `trustProxy` is false, forwarding headers are untrusted, non-browser auth is deferred to a separate contract, and the required browser/API negatives are assigned to tests.

### H3 — CLOSED: AW-010A migration/cutover excludes concurrent legacy DML

AW-010A freezes a single migration transaction with `ACCESS EXCLUSIVE` locks, in order, on `channels` and `channel_membership_epochs`; it checks empty membership, creates the stream objects/triggers/FKs, backfills channel state, and rechecks empty membership plus exactly one state row per channel before commit (`aw-010a-channel-stream-foundation.md:79-84`). Channel creation receives state from an `AFTER INSERT` trigger (`:54`). Concurrent direct channel and membership DML, post-migration behavior, route inventory, deployment order, and forward-migration/application-rollback compatibility are all explicit (`:82-84`, `:138`; `aw-010a-task-cards.md:62-78`).

### H4 — CLOSED: populated AW-008 compatibility is fail-atomic rather than fabricated

AW-009 permits populated tenants/principals but locks and fails atomically if any workspace, channel, workspace-membership, or channel-membership row exists; it forbids placeholder defaults and fabricated provenance (`aw-009-tenant-workspace-channel-vertical-slice.md:116-125`). The plan requires every rejected populated-`0000` combination, tenants/principals-only acceptance, no partial DDL, rerun, concurrent DML/migrator exclusion, hash drift, and old-application rollback coverage. The corresponding schema and migration cards repeat the populated matrix and locked preflight (`aw-009-task-cards.md:66-83`).

### H5 — CLOSED: actor, intent, and envelope provenance have trusted ownership

AW-010A replaces the broad event input with a correlated discriminated `ChannelEventIntent` and a closed `TrustedChannelActor` union whose sole current system identity is `system:channel-lifecycle` (`aw-010a-channel-stream-foundation.md:87-114`). Client input cannot own any envelope field; trusted command context supplies tenant/channel/actor/intent, while the journal service supplies schema, sequence, event ID, and time. Human/service tenant and kind checks occur in the caller transaction, adding system IDs requires review, and AW-009 joins are restricted to the active human session actor (`:114-125`; `aw-009-tenant-workspace-channel-vertical-slice.md:140-143`). Negative tests cover arbitrary system IDs, cross-tenant/kind mismatches, client envelope overrides, and mismatched discriminant/payload pairs (`aw-010a-channel-stream-foundation.md:127-138`; `aw-010a-task-cards.md:12-23,88-100`).

### H6 — CLOSED: authenticated artifact handling is fail-closed

Authenticated trace/screenshot/video upload is forbidden by default. The mandatory pre-product spike uses canary cookie/key/DB/private values, deliberately creates a trace, recursively unpacks and scans the final upload candidate, requires any sanitized trace to remain openable, and otherwise leaves authenticated tracing off with no UX registry claim (`aw-009-tenant-workspace-channel-vertical-slice.md:192-207`; `aw-009-task-cards.md:25-37`). All 32 registry rows start and remain `NOT_RUN` until their complete evidence exists (`aw-009-tenant-workspace-channel-vertical-slice.md:19,194-196,243`). The canonical evidence policy freezes allowed paths/counts, recursive archive scanning, a fail-closed canary, and upload ordering that cannot run after a failed scan or mask an upstream failure (`:234-245`).

## Medium findings

### M1 — CLOSED: the generic runtime-role residual is named without overclaiming

AW-010A explicitly accepts that the current raw-SQL runtime role can attempt direct sequence-state update/delete and direct journal insert; the trigger, FKs, constraints, and ports are not described as a complete compromised-role boundary (`aw-010a-channel-stream-foundation.md:73-85`). The role tests cover allowed adapter append/select, rejected journal mutation, restricted DDL/ledger access, and an accepted residual matrix (`:127-138`; `aw-010a-task-cards.md:98-103`). Stronger group-role/`SECURITY DEFINER` design remains a separately reviewed change with the required ownership, `search_path`, qualification, `PUBLIC` revocation, grant, and adversarial controls.

### M2 — CLOSED: key rotation, strict decoding, fixation scope, and logout replay are frozen

AW-009 specifies canonical base64url secrets decoding to at least 32 random bytes, distinct current/previous keys, current-key signing, a bounded previous-key verification window no longer than the eight-hour session TTL, current-key renewal, and decode-after-unsign of an exact versioned payload with duplicate/unknown/noncanonical input rejected (`aw-009-tenant-workspace-channel-vertical-slice.md:60-69`). It states why pre-auth fixation is inapplicable and requires fresh high-entropy fixture sessions. Logout always clears the exact issuance cookie attributes and returns neutral `204` for missing/malformed/expired/revoked credentials, while replay on a protected route returns `401` (`:71-77`). The codec/session cards assign the required rotation, duplicate-cookie, renewal, clear/replay, and real-session tests.

### M3 — CLOSED: ambiguous sequence `version` was removed and the MAX protocol is exact

`channel_event_sequences` no longer has a `version` column. AW-010A freezes the sole counter, requires `last_event_seq < 9223372036854775807`, performs one guarded increment, maps zero rows distinctly to missing versus exhausted stream, and forbids `MAX(event_seq)+1`, standalone allocation, and JavaScript `Number` conversion (`aw-010a-channel-stream-foundation.md:43-56`). `MAX-1`, `MAX`, exhaustion, concurrent boundary contenders, and insert/validation/unique rollback are required (`:127-138`; `aw-010a-task-cards.md:88-103`).

### M4 — CLOSED: idempotency and active-self-join races have explicit PostgreSQL proofs

AW-009 freezes resource-row/session-derived receipts, stable exact replay, changed-fingerprint conflict, tenant-leading conflict recovery, and rollback of losing resource/epoch/event/allocation work (`aw-009-tenant-workspace-channel-vertical-slice.md:127-136`). Real races cover same key/same payload, same key/different payload, different keys for one active self-join, concurrent creator auto-join, and cross-tenant key reuse, with exactly one committed result/event/sequence and no loser counter advance (`aw-009-task-cards.md:142-155`).

### M5 — CLOSED: the hosted browser lane discloses dependencies and records browser identity

The dependency table now selects hosted `playwright install --with-deps chromium` and discloses root/apt/network access, mutable runner libraries, CI-only scope, and browser version/revision/executable hash recording (`aw-009-tenant-workspace-channel-vertical-slice.md:44-58`). Hosted ordering keeps real integration, isolation, Chromium, secret/canary scan, and fail-closed upload as explicit gates; `pnpm run ci` alone is expressly not full AW-009 success, and the runner image is recorded (`:264-283`).

## Decision

All eleven prior quality/security findings are closed at plan level. The AW-009/AW-010A quality/security plan gate is **APPROVED**, subject to the plans' independent specification, UX/test, implementation, and final hosted-evidence gates.
