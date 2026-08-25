# AW-008A1 Contract Core Quality/Security Review — xhigh

## Scope and evidence

- Reviewed only `packages/contracts/{src/{primitives,events}.ts,test/{primitives,events}.spec.ts,vitest.config.ts}` at baseline `73ed140`; the specification review is PASS and was not reopened.
- Live focused run: 2 files, 73/73 tests passed. Supplied evidence also records the independent 10/10 stateful-boundary probe plus typecheck/build/lint/Prettier/diff PASS and cleaned `dist`.
- Additional Zod 4.4.3 runtime probe rejected eleven malformed/wrong-type `EventSeqV1` inputs without throwing, but accepted `2026-08-25T12:34Z`.

## BLOCKER findings

None.

## HIGH findings

None.

## MEDIUM findings

### M1 — UTC timestamp accepts a non-RFC-3339 minute-only form

- **Location:** `packages/contracts/src/primitives.ts:18`; missing regression case at `packages/contracts/test/primitives.spec.ts:68-76`.
- Zod 4.4.3 `datetime({ offset: false })` defaults to optional seconds. Consequently `UtcTimestampV1.safeParse("2026-08-25T12:34Z")` succeeds even though RFC 3339 `full-time` requires `time-second`.
- This is a concrete wire-boundary false acceptance. It can create producer/consumer disagreement and invalid generated/audit timestamps; current offset/malformed tests do not detect it.
- **Fix:** retain Zod's calendar/time validation and compose an anchored lexical check requiring `T<HH>:<MM>:<SS>(.<digits>)?Z`; add rejection of minute-only input plus invalid calendar/time and lowercase-`z` cases while retaining both current valid examples.

## LOW findings

### L1 — Negative tests can pass for the wrong rejection reason

- **Location:** `packages/contracts/test/events.spec.ts:277-284`.
- Every canonical negative asserts only `success === false`; an unrelated envelope failure would keep the row green after its intended invariant regressed. The length assertion at lines 278-280 counts rows but does not strengthen the oracle.
- **Fix:** add each fixture's expected issue path (and stable issue code/custom message identifier), then assert that issue exists; avoid snapshotting complete Zod prose.

### L2 — Several high-value branch/ordering edges are not pinned

- **Location:** `packages/contracts/test/events.spec.ts:49-137,286-313`.
- The suite does not positively pin a non-null `thread_root_id`, order-insensitive mention-set equality with different array order, or the `service` actor mismatch branch. Empty mention arrays and the `system` exception are covered.
- **Fix:** add one valid non-null root fixture, one reordered-but-equal mapping, and a rejected mismatched `service` reaction actor.

### L3 — Refinement input shape is manually duplicated

- **Location:** `packages/contracts/src/events.ts:28-31,77-96`.
- `MentionPayload` repeats the two schema fields instead of deriving them from one shared schema/shape. It is correct now and TypeScript checks callback compatibility, but future field/type edits can create avoidable drift.
- **Fix:** define one reusable strict mention-mapping shape/schema and infer the refinement input from it before extending it for created/edited payloads.

## Quality and security assessment

- `EventSeqV1` is noncoercing, bounded to 19 digits before `BigInt`, and guards the conversion on malformed strings (`primitives.ts:3-16`): no throw, precision loss, or practical regex/BigInt amplification found.
- Mention validation (`events.ts:33-75`) is `O(P + I)` expected time and memory. It makes repeated maps/sets, but has no quadratic scan; invalid structural inputs stop before refinement. Consolidating into one pass would reduce allocation, not change asymptotics.
- Mention arrays and authority-defined free strings have no schema size cap. Thus schema parsing is linear but not a byte/resource budget; enforce request/frame size, nesting-depth, and decoding limits at ingress rather than inventing A1 wire limits. No parser-local DoS blocker was found.
- Zod 4 refinement composition is sound here: strict payload refinements remain usable inside the discriminated union, and the union test exercises the reaction refinement. Custom issue paths are deterministic, though array-level mention paths are intentionally coarse.
- Envelope, actor, concrete payload, and mention-item objects are closed. The broad base payload is the authority's `record<string, unknown>` and is not the production durable union.
- There are no coercions, defaults, catches, shared mutable defaults, or stateful/history checks. Parsed values are not frozen; callers must not mistake validation for runtime immutability. Inferred union branches remain discriminated and contain no `any` escape.
- `vitest.config.ts:4-10` deterministically includes exactly the two focused suites and refuses an empty run.

## Ownership boundary

- Root `src/index.ts` exports, sync integration, generated/schema artifacts, manifests/lockfiles, and artifact checks are A2-owned staged work. Their absence is not an A1 finding and this review requests no changes to them.
- A1 must fix M1 and its regression test before merge; L1-L3 are non-security hardening/maintainability follow-ups and may be addressed in the same patch.

Verdict: REQUEST_CHANGES
