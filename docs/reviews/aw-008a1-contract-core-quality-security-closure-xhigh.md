# AW-008A1 Contract Core Quality/Security Closure — xhigh

## Scope and verification

- Reviewed only A1 corrections to M1/L1/L2/L3 from `aw-008a1-contract-core-quality-security-review-xhigh.md` at baseline `73ed140`; the existing specification PASS and prior non-findings remain closed.
- Live focused verification passed: 2 files, **82/82 tests**; contracts typecheck, exact five-file ESLint, and exact five-file Prettier check also passed.
- Supplied regression evidence records the required red minute-only case before the fix, then 82/82 green, build/lint/typecheck/Prettier/diff PASS, and cleaned `dist`.

## Finding closure

### M1 — RESOLVED

- `packages/contracts/src/primitives.ts:5,19` composes Zod datetime validation with an anchored, seconds-required, uppercase-`Z` lexical regex; calendar/time semantics remain Zod-validated.
- `packages/contracts/test/primitives.spec.ts:62-82` retains seconds/fraction positives and rejects minute-only, lowercase `z`, invalid date/hour/minute/second, offsets, local datetime, date-only, and malformed text.
- This closes the concrete RFC 3339 false acceptance without replacing the parser with regex-only validation.

### L1 — RESOLVED

- All eleven canonical negatives at `packages/contracts/test/events.spec.ts:180-305` carry `expectedIssue.code` and `expectedIssue.path`; custom rows also pin stable messages at lines 210-214, 225-229, 242-246, and 273-277.
- `packages/contracts/test/events.spec.ts:307-326` pins the fixture count at eleven and requires a matching issue via `arrayContaining(objectContaining(expectedIssue))`, so unrelated rejection cannot satisfy the oracle.

### L2 — RESOLVED

- Positive non-null root: `packages/contracts/test/events.spec.ts:328-338`.
- Reordered equal mention mapping: `packages/contracts/test/events.spec.ts:340-352`.
- Rejected mismatched service actor with exact custom issue: `packages/contracts/test/events.spec.ts:354-381`.

### L3 — RESOLVED

- One strict `MentionMappingV1` owns both fields at `packages/contracts/src/events.ts:28-33`; `z.infer` derives refinement input at lines 35-37.
- Its shape is spread into strict created/edited schemas and the same refinement at `packages/contracts/src/events.ts:81-98`, eliminating the manual type/schema duplication without widening either payload.

## Regression, security, and performance

- No new parser/stateful issue: 82/82 passes, the L2 parser-boundary cases behave as intended, and corrections add no history lookup, mutation, coercion, default, catch, or stateful acceptance rule.
- No new performance issue: the timestamp regex at `primitives.ts:5` is anchored and linear; mention validation at `events.ts:37-79` retains expected `O(P + I)` time/memory with no quadratic scan.
- Prior residual note remains informational: schemas are linear validators, not request byte/depth budgets; ingress must enforce resource limits.

## Remaining severities and A2 boundary

- **BLOCKER: 0; HIGH: 0; MEDIUM: 0; LOW: 0.** M1 and L1-L3 are resolved; no new finding was introduced.
- A2 owns root `src/index.ts` exports, sync integration, generated/schema artifacts and checks, manifests/lockfiles, and related staging. Their absence is not an A1 defect and this closure requests no A1 change.
- A1 may merge unchanged.

Verdict: APPROVED
