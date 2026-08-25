# AW-008A2a Sync Runtime Quality/Security Review — xhigh

## Scope and evidence

- Reviewed only `packages/contracts/src/sync.ts` (`C`) and `packages/contracts/test/sync.spec.ts` (`T`) on baseline `ede92d6`; the spec review and closure are PASS and are not reopened.
- Fresh runs: isolated `T` **99/99 PASS**, primitives/events/sync **181/181 PASS**, focused ESLint/typecheck/Prettier/diff-whitespace PASS. The configured **82/82 PASS** run excludes `T` at the disclosed A2b boundary.
- Reviewer probes covered Zod 4.4.3 refinement composition, malformed and near-BIGINT-limit sequences, generic transform typing, 500-item cost, over-limit traversal, and issue amplification.

## BLOCKER findings

None.

## HIGH findings

### H1 — The 500-item limit does not bound parser work or error allocation

- **Location:** `packages/contracts/src/sync.ts:43,48-127`; missing adversarial regression at `packages/contracts/test/sync.spec.ts:366-386`.
- `z.array(SyncItemV1).max(500)` checks length only after recursively parsing every element, and its `too_big` issue is continuable, so `DeltaResponseV1.superRefine` still scans an oversized structurally valid array.
- Probe results demonstrate attacker-controlled amplification: 5,000 semantically inconsistent items created 20,000 issues; 20,000 created 80,000 issues. Work and retained error objects remain unbounded despite the protocol cap, allowing CPU/heap exhaustion at an untrusted response/request boundary.
- **Fix:** preflight `items` before child parsing, e.g. a `z.unknown().refine(v => !Array.isArray(v) || v.length <= 500, ...)` piped into `z.array(SyncItemV1).max(500)`, so an oversized array terminates at `items`; add a large semantically invalid over-limit fixture asserting one array-level issue and no descendant issues, without a timing threshold.

## MEDIUM findings

None.

## LOW findings

### L1 — Several negatives can pass for the wrong rejection reason

- **Location:** `packages/contracts/test/sync.spec.ts:240-325,556-573,622-645`.
- Alias fixtures delete the required canonical field; transport/result wrong-shape fixtures omit the required valid-branch field. They can stay green because something required is missing even if the forbidden alias or opposite-branch member becomes accepted.
- **Fix:** start from each complete valid value, add the forbidden field while retaining all required fields, and assert the stable `unrecognized_keys`/custom issue (including the rejected key) rather than only `success === false`.

### L2 — Sequence-order tests do not pin arbitrary-precision comparison

- **Location:** `packages/contracts/src/sync.ts:106-117`; omission at `packages/contracts/test/sync.spec.ts:456-475`.
- Equal/descending tests use only `1` and `2`; they would not catch a regression from `BigInt` to lossy `Number` comparison above `Number.MAX_SAFE_INTEGER`.
- **Fix:** add accepted `9007199254740992 -> 9007199254740993` (or BIGINT-max-adjacent) and rejected reverse-order fixtures with the exact event-sequence issue path.

### L3 — Generic snapshot input/output typing is not regression-tested

- **Location:** `packages/contracts/src/sync.ts:23-34`; omission at `packages/contracts/test/sync.spec.ts:327-339`.
- The implementation preserves a caller schema's input/output types (a virtual `z.string().transform(...number)` compile probe passed), but the suite tests only runtime object strictness and cannot detect future generic erasure.
- **Fix:** add a compile-checked `expectTypeOf` fixture asserting `z.input<typeof Snapshot>["state"]` is the transform input and `z.output<typeof Snapshot>["state"]` is its output, plus one runtime transform assertion.

### L4 — Adjacent sequence comparison redundantly reparses validated values

- **Location:** `packages/contracts/src/sync.ts:101-112`.
- A 500-item page performs 998 extra `EventSeqV1.safeParse` calls after `DurableEventV1` has already validated every sequence. Zod 4 skips the enclosing refinement for malformed child sequences; probes showed canonical error paths and no throw. The subsequent `BigInt` calls are safe because successful `EventSeqV1` output is a bounded 1–19 digit canonical decimal.
- **Fix:** after the H1 preflight, carry the prior parsed `bigint` and convert each validated `event_seq` once per item; retain malformed-input composition tests rather than reparsing defensively in the hot loop.

## Quality/security assessment

- A valid 500-item page parsed in about 4 ms in the reviewer probe. A maximally inconsistent in-limit page can emit 1,999 custom issues; that is bounded once H1 is fixed, though fail-fast/capped diagnostics would further reduce allocation.
- Custom invariant tests at `T:357-363,388-498,539-550` use otherwise valid candidates and assert exact paths/messages, so their Zod refinement oracles are sound. Strict result/error schemas at `C:244-274` are closed and correctly discriminated; L1 concerns regression-test construction, not current runtime acceptance.
- Cursor handling at `C:14,49,57,65,91,120` is byte equality/inequality only: no cursor is parsed, sorted, incremented, or treated as an event sequence. Delta checks cover parser-local continuity/context/order while correctly leaving request echoes, range authorization, barrier history, and event identity to stateful layers.
- No coercion, catch/default fallback, mutable shared state, dynamic execution, precision loss, or `BigInt` throw path was found. Snapshot state closure remains caller-owned by design.

## A2b ownership and merge decision

- Final Vitest include/config, root exports, artifacts/generated schemas, manifests, DB, plan, and board integration are A2b-owned. Their staged absence and the configured 82-test result are not A2a findings and do not mask H1 or L1-L4 in the A2a-owned source/test files.
- **Counts:** BLOCKER 0; HIGH 1; MEDIUM 0; LOW 4. H1 requires an A2a source fix and regression test; A2a may not merge unchanged.

Verdict: REQUEST_CHANGES
