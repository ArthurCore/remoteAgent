# AW-008A1 Contract Core Specification Review — xhigh

## Scope and authority

- Audited the five current A1 files only at baseline `73ed140`: `src/{primitives,events}.ts`, `test/{primitives,events}.spec.ts`, and `vitest.config.ts` under `packages/contracts/`.
- Authority: `durable-event-payloads-v1.md` §§2–6, 8–9 and `sync-contract-v1.md` lines 105–164, 353–373. `R` means required; `OID` means opaque string length 1–255.
- Current status contains exactly those five uncommitted A1 files before this review; the tracked root index still contains only the existing health types. Root exports, sync wiring, generated artifacts, and persistence are correctly deferred.

## Primitive contract matrix

| Primitive | Exact authority | Implementation and focused evidence | Result |
|---|---|---|---|
| `OpaqueIdV1` | JSON string, length 1–255, no shape semantics | Noncoercing `z.string().min(1).max(255)`; inclusive bounds and wrong-type negatives tested | PASS |
| `CursorV1` | Branded nonempty string, maximum 4096 | Exact string bounds plus `ChannelCursorV1` brand; bounds/wrong types tested | PASS |
| `EventSeqV1` | Canonical decimal string `1..9223372036854775807`; never via `Number` | Anchored syntax gate plus `BigInt` range only after syntax validity; limits and malformed forms tested; independent 12-case malformed-string probe rejected all without throwing | PASS |
| `UtcTimestampV1` | RFC 3339 UTC timestamp ending `Z` | `datetime({ offset:false })`; `Z` with/without fraction accepted, offsets/local/date/malformed rejected | PASS |
| `EventTypeV1` | Lowercase dotted registered-name syntax for the broad base | Exact anchored dotted-name regex; valid and malformed families tested | PASS |
| `ActorV1` | Strict `{principal_id: OID, kind: human\|service\|system}`, both R | Exact fields/enumeration with `.strict()`; every kind, missing/invalid/unknown cases tested | PASS |
| `ResolvedMentionItemV1` | Strict `{principal_id: OID, mention_item_id: OID}`, both R | Exact strict object; positive and unknown-field cases tested; enclosing event checks both-column uniqueness | PASS |
| `VersionAfterCreateV1` | Safe JSON integer `2..9007199254740991` | `number().int().min(2).max(MAX_SAFE_INTEGER)`; both bounds, fractional, overflow, and string cases tested | PASS |

## Nine-field base-envelope matrix

| Field (all R) | Exact authority | Implementation | Result |
|---|---|---|---|
| `schema_version` | JSON number literal `1` | `z.literal(1)` | PASS |
| `event_id` | `OID` | `OpaqueIdV1` | PASS |
| `tenant_id` | `OID` | `OpaqueIdV1` | PASS |
| `channel_id` | `OID` | `OpaqueIdV1` | PASS |
| `event_seq` | `EventSeqV1`; channel-local ordering only | Exact primitive; no history/order claim | PASS |
| `event_type` | Broad syntactically valid event name in base | `EventTypeV1`; concrete schemas replace it with literals | PASS |
| `actor` | Strict `ActorV1` | Exact strict primitive | PASS |
| `occurred_at` | UTC `Z` audit/display time, not ordering | Exact timestamp primitive; no ordering claim | PASS |
| `payload` | Broad JSON object in base; concrete strict object in events | `z.record(z.string(), z.unknown())`; arrays/null rejected; replaced per event | PASS |
| Envelope closure | Exactly the nine fields; no aliases/unknowns | `.strict()`; canonical key set and extra-field rejection tested | PASS |

## Seven-event exact payload and ownership matrix

Every payload and nested mention item is strict; every field shown below is required. No alias, extension map, or nullable value exists except `thread_root_id`.

| Discriminant | Exact payload and parser-owned invariant | Correctly stateful-only invariant | Result |
|---|---|---|---|
| `message.created` | `message_id:OID`; `thread_root_id:OID\|null`; `version:1`; principal `OID[]` unique; strict item array with both columns unique and exact principal-set equality | New identity; root exists/top-level/same channel; author derivation; cross-history mention identity | PASS |
| `message.edited` | `message_id:OID`; safe `version:2..MAX_SAFE`; unique principal `OID[]`; strict unique items with exact principal-set equality | Existing live same-channel target; prior version + 1; authorization; mention identity stability | PASS |
| `message.deleted` | `message_id:OID`; safe `version:2..MAX_SAFE` | Existing live same-channel target; prior + 1; distinct second delete | PASS |
| `reaction.changed` | `message_id:OID`; `reactor_principal_id:OID`; `reaction_key:string`; `present:boolean`; human/service actor must equal reactor | Target existence/liveness/channel; authorization of differing system actor | PASS |
| `channel.member_joined` | `principal_id:OID`; `membership_epoch:OID`; `history_mode:full\|since_join` | Prior inactivity; fresh sole epoch; baseline/visibility behavior | PASS |
| `channel.member_left` | `principal_id:OID`; `membership_epoch:OID`; nonempty `reason_code:string` | Exact active epoch; voluntary-exit access/purge behavior | PASS |
| `channel.member_revoked` | `principal_id:OID`; `membership_epoch:OID`; nonempty `reason_code:string` | Exact active epoch; administrative access/purge behavior | PASS |

## Boundary, union, and focused-test validation

- `DurableEventV1` is a discriminated union listing exactly the seven literals; broad/unknown base events parse only as `EventEnvelopeV1` and are rejected by the production union.
- Parser refinements stop at same-event mention uniqueness/set equality and non-system actor/reactor equality. They do not claim roots, liveness, prior versions, membership state, event-ID semantic reuse, mapping stability, authorization, projection, or delivery.
- Four representative stateful-history cases are explicitly asserted parser-valid in the focused suite; an independent probe instantiated all ten authority §8 stateful rows and found **10/10 parser-valid**.
- Current focused run: **2 files, 73/73 tests passed**. It covers all seven canonical positives, strict envelope/payload closure for each event, all eleven canonical parse negatives, system reaction exception, scalar bounds, and malformed `event_seq` behavior.
- `vitest.config.ts` targets exactly the two A1 specs with `passWithNoTests:false`; scan found no skip/todo/only markers or empty tests.
- Current contracts typecheck, explicit five-file ESLint, five-file Prettier check, and `git diff --check`: **PASS**. The delegation transcript also records build PASS followed by clean; live scan finds no `dist` artifact.

## Severity-classified gaps

| Severity | Gap |
|---|---|
| Critical | None |
| Major | None |
| Minor | None |

A1 is authority-complete within its staged scope and may proceed unchanged to code-quality review.

Verdict: PASS
