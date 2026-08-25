# AW-008A2a Sync Runtime Spec Review — xhigh

## Scope and authority

- Reviewed only uncommitted `packages/contracts/src/sync.ts` (`C`) and `packages/contracts/test/sync.spec.ts` (`T`) on clean baseline `ede92d6`.
- Authority: `docs/contracts/sync-contract-v1.md` (`S`) §4 (`S:166-350`), production event union (`S:353-373`), fixed delta rules (`S:400-414`), cursor/application rules (`S:53-65,811-853`), and unsubscribe (`S:605-611`).
- No root export, Vitest config, generated artifact, manifest, DB, plan, or board change is assessed as A2a-owned.

## Exact 17-export audit

| # | Export | Exact fields / enum / composition and strictness | Result |
|---:|---|---|---|
| 1 | `SyncItemV1` | strict `{before_cursor: CursorV1,cursor: CursorV1,event: DurableEventV1}` | PASS |
| 2 | `snapshotResponseV1(state)` | strict v1 `{tenant_id,channel_id,snapshot_id,snapshot_cursor,generated_at,state}`; state closure correctly remains caller-supplied | PASS |
| 3 | `DeltaResponseV1` | strict v1 `{tenant_id,channel_id,from_cursor,through_cursor,items[≤500],next_cursor,reached_barrier}` | **FAIL H-01** |
| 4 | `SyncLimitsV1` | strict four positive integers: buffered events/bytes and catch-up/gap timeouts | PASS |
| 5 | `SyncSubscribeV1` | strict v1 `{request_id,channel_id,after_cursor}` | PASS |
| 6 | `SyncSubscriptionReadyV1` | strict v1 request/subscription/tenant/channel IDs, after/barrier cursors, UTC lease, strict limits | PASS |
| 7 | `SyncBarrierAppliedV1` | strict v1 subscription/channel IDs and both cursors | PASS |
| 8 | `SyncDeliveryV1` | strict v1 `{subscription_id,delivery_id,phase:"buffered"|"live",item:SyncItemV1}` | PASS |
| 9 | `TransportAckV1` | strict v1 subscription/delivery IDs and `status:"received"` only | PASS |
| 10 | `SyncLiveV1` | strict v1 subscription/channel IDs and `live_cursor` | PASS |
| 11 | `SyncResyncRequiredV1` | strict four-code enum, `action:"resume"`, nonnegative integer retry delay | PASS |
| 12 | `SyncRevokedV1` | strict IDs, `code:"ACCESS_REVOKED"`, `purge:true`, UTC occurrence | PASS |
| 13 | `SyncErrorCodeV1` | exact nine-code scalar enum (`S:308-318`) | PASS |
| 14 | `SyncErrorV1` | strict v1 code, exact five-action enum, boolean retryable, correlation ID, optional nonnegative integer delay | PASS |
| 15 | `SubscribeResultV1` | strict `ok` union; strict ready value or strict sync error | PASS |
| 16 | `BarrierAppliedResultV1` | strict `ok` union; strict `{schema_version,subscription_id,state:"flushing"}` or strict sync error | PASS |
| 17 | `SyncUnsubscribeV1` | strict v1 `{subscription_id,channel_id}` and nothing else, matching `S:605-611` | PASS |

## Cross-field invariant matrix

| Invariant | Audit result |
|---|---|
| `SyncItemV1.before_cursor !== cursor` | PASS. A returned event advances a boundary; an authorized no-op returns no item (`S:414`). |
| `reached_barrier => next_cursor === through_cursor` | PASS (`C:49-55`; `S:409`). |
| Partial page `next_cursor !== from_cursor` | PASS as the only client-side opaque-cursor progress check; no ordering/decoding is attempted (`C:57-63`; `S:57,410`). |
| Item event tenant/channel equal response tenant/channel | PASS (`C:65-80`); this closes context-free response binding. |
| First item `before_cursor === from_cursor` | PASS (`C:82-90`; `S:404,407`). |
| Later item `before_cursor === previous item.cursor` | PASS, including authorized no-op semantics as resolved below (`C:93-100`; `S:61,407,823-836`). |
| Ascending returned channel order and nonempty `(from,through]` range | **FAIL H-01.** `C:48-102` accepts descending `event_seq` and accepts an item when `from_cursor === through_cursor`, contrary to `S:406`. |
| Request echo, resolved range containment, post-barrier exclusion, stable `event_id` meaning | Correctly require request/server/stateful context (`S:404-412`); do not numerically compare opaque cursors in Zod. |

## Authorized no-op cursor resolution

- Exact later-item chaining is correct, not over-restrictive. Within a lease every subsequent boundary is byte-exact (`S:61`), and the reducer can apply item B only when `B.before_cursor` equals the checkpoint produced by item A (`S:823-836`). An unrelated inter-item no-op cursor would provide no wire action that advances the client to B and would therefore be a protocol gap.
- Hidden positions between visible items must be accounted into the preceding returned boundary so the next `before_cursor` still equals that preceding item’s `cursor`. A trailing no-op is represented by `next_cursor` after all items (`S:414,851-853`), including an empty page.
- Reviewer probes confirm the parser accepts both one-item and empty trailing no-op pages and rejects an inter-item discontinuity. No cursor was parsed, sorted, incremented, or numerically compared.

## Tests, staged config, and verification

- `T` exercises all 17 exports, top-level strictness, aliases, production `DurableEventV1`, limits/enums/results, the six added refinements, and opaque-cursor non-ordering: recorded focused **94 PASS**.
- **M-01:** `T:366-476` has no descending/equal-`event_seq` or empty-range negative and no explicit one-item/empty trailing-no-op positive. The 94-pass result therefore cannot detect H-01 or freeze the critical no-op boundary.
- Current `packages/contracts/vitest.config.ts` includes only primitives/events; direct configured execution produced **82 PASS**, while a direct sync filter found no tests. This is the disclosed A2a/A2b staging boundary, not an A2a defect: A2b owns final include/artifact config, and temporary-config evidence records focused 94/all 176 PASS.
- Fresh non-mutating checks: ESLint, typecheck, Prettier, and diff whitespace PASS. The supplied A2a record also reports build/lint/typecheck/Prettier/diff PASS.

## Severity and required changes

- **BLOCKER 0; HIGH 1; MEDIUM 1; LOW 0.**
- **H-01:** reject descending or repeated `event_seq` within a delta page using canonical decimal/`BigInt` event-sequence comparison, and reject any item when `from_cursor === through_cursor`; do not order opaque cursors.
- **M-01:** add corresponding negatives plus explicit accepted trailing no-op pages with zero and one returned item. Preserve exact later-item chaining unchanged.
- A2a may not proceed unchanged to quality review because its runtime parser currently accepts fixed-range pages forbidden by `S:406`.

Verdict: REQUEST_CHANGES
