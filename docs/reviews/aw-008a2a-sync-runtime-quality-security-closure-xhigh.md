# AW-008A2a Sync Runtime Quality/Security Closure — xhigh

## Scope and evidence

- Closure review only for H1/L1-L4 from `docs/reviews/aw-008a2a-sync-runtime-quality-security-review-xhigh.md` (`R`) on baseline `ede92d6` plus the current uncommitted A2a corrections.
- Evidence aliases: `C` = `packages/contracts/src/sync.ts`; `T` = `packages/contracts/test/sync.spec.ts`.
- The prior spec findings remain closed by the PASS closure at `docs/reviews/aw-008a2a-sync-runtime-spec-closure-xhigh.md:10-37`; they are not reopened here.

## Finding closure

### H1 — RESOLVED

- `C:36-43` refines raw `unknown` length with `abort: true` before piping to `z.array(SyncItemV1).max(500)`, so oversized arrays stop before child parsing and `DeltaResponseV1.superRefine`.
- Against the old red evidence of 5,000 malformed items producing 20,000 issues (`R:15-20`), `T:442-460` now feeds 5,000 semantically invalid items and requires exactly one custom issue at `items`, with no descendant issues. Over-limit item-derived allocation is therefore bounded to one; fixed envelope errors cannot amplify with item count.
- `C:42-43` deliberately retains `.max(500)` after the guard; a fresh `z.toJSONSchema(DeltaResponseV1)` probe emitted `properties.items.maxItems: 500`, preserving the A2b JSON Schema handoff.

### L1 — RESOLVED

- `T:178-184,261-365` retains each valid canonical field while adding the forbidden alias; `T:203-220` asserts `code: "unrecognized_keys"`, exact `keys`, and exact `path`.
- ACK separation at `T:646-655` retains valid ACK/barrier values and adds forbidden fields. Result tests accept both canonical branches at `T:703-705,716-718`, then add opposite-branch/nested extras and assert keys/paths at `T:706-713,719-732`.

### L2 — RESOLVED

- `C:82-85,120-127` compares canonical sequence strings as arbitrary-precision `bigint`. `T:463-473` accepts `9007199254740992 -> 9007199254740993`; `T:554-566,583-588` rejects the reverse at exact path `["items", 1, "event", "event_seq"]`.

### L3 — RESOLVED

- The generic factory remains at `C:23-34`. `T:381-389` compile-checks snapshot state input as `string`, output as `number`, and proves the runtime transform by parsing `"message"` to `7`; a standalone strict `tsc --noEmit` run over `T` passed.

### L4 — RESOLVED

- `C:82-85` carries the prior `bigint` and converts each already-validated `event_seq` exactly once; `C:111,120-127` stores, compares, and advances it without any defensive `safeParse` hot-loop calls.

## Boundaries, verification, and ownership

- Parser-local context/progress/continuity/order checks remain at `C:57-137`. Request echo, authorized resolved-range containment, barrier history/post-barrier exclusion, and stable event identity remain stateful-layer concerns, as bounded in `R:56`.
- Cursor operations are byte equality/inequality only at `C:14,58,66,74,104,129`; `BigInt` touches only validated `event_seq` at `C:85,120`. Opaque-cursor positives at `T:590-626` prevent lexical-order assumptions; no cursor is decoded, sorted, incremented, or used as an event sequence.
- Fresh runs passed: focused sync **102/102**, primitives/events/sync **184/184**, staged config **82/82**, source typecheck, strict compile-check of `T`, package build, focused ESLint, Prettier, and diff-whitespace. Temporary config and generated `dist` were removed.
- The bounded A2a allocation is only `C`/`T`. Final Vitest include/config (`packages/contracts/vitest.config.ts:8`), root export (`packages/contracts/src/index.ts:1-3`), artifacts/generated schemas, manifests, DB, plan, and board remain unchanged and A2b-owned.

## Remaining severities and merge decision

- **BLOCKER 0; HIGH 0; MEDIUM 0; LOW 0.** H1 and L1-L4 are closed with no new in-scope findings.
- A2a may merge unchanged; A2b still owns final integration and artifact generation.

Verdict: APPROVED
