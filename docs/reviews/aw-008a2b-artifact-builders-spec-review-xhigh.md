# AW-008A2b Artifact Builders Spec Review — xhigh

## Scope and authority

- Reviewed only A2b1 `packages/contracts/src/artifacts.ts` and `packages/contracts/test/artifacts.spec.ts` at `1182bb6` against the approved snapshot-artifact decision.
- A2b2 script/generated/root-index/Vitest wiring and committed byte-drift behavior are intentionally out of scope; their staged absence is not an A2b1 defect.

## Findings

### HIGH — Full mode accepts an implicitly open nested state object

`convertStrictSnapshotState` checks `type` and `additionalProperties === false` only on the root input/output documents (`artifacts.ts:368-379`), then publishes the input document (`artifacts.ts:382-401`). Consequently, this input is accepted:

```ts
z.object({ nested: z.object({ value: z.string() }) }).strict()
```

Its emitted `nested` schema omits `additionalProperties` (therefore permits unknown keys), and a generated-schema probe accepted `{ nested: { value: "ok", unknown: true } }`. This violates the full-mode strict-state/open-object requirement and makes the current nested-unknown test fixture misleadingly narrow: its nested member object is already `.strict()` (`artifacts.spec.ts:62-74,353-385`), while negative cases cover only an open/loose root (`artifacts.spec.ts:387-419`).

**Required:** reject implicitly open/loose fixed-shape object nodes throughout the emitted input state graph (without conflating explicitly modeled typed maps with open objects), and add outer-strict/nested-open and nested-loose rejection tests plus a generated-schema nested-unknown assertion.

### MEDIUM — Generic nested-definition/ref handling lacks a positive test

Full-mode ref resolution is exercised only with an inline fixture that creates no named nested `$defs` (`artifacts.spec.ts:62-74,317-351`). The collision test proves a named nested definition is noticed, but no positive fixture proves a non-colliding named/recursive nested definition is hoisted and still resolves through both documents (`artifacts.ts:382-433`). Add a strict named nested fixture and resolve all resulting internal/external refs.

### LOW — Concrete `io: "output"` safety is not regression-locked

For the exact current registry, `io: "output"` (`artifacts.ts:285-321`) is semantically justified: all fixed object inputs are strict; there are no concrete transforms/defaults; `SyncErrorV1.retry_after_ms` remains optional; and output direction is needed to expose the non-transforming `DeltaItemsV1` pipe as an array with `maxItems: 500` (input direction is unconstrained). Thus no current input contract is narrowed or transformed by this choice. However, identity-only registry tests would not catch a later default/coercion/transform changing input/output semantics. Add an explicit conversion-direction invariant or documented per-schema exception guard.

## Exact requirement matrix

| Requirement | Evidence | Result |
|---|---|---|
| Ordered concrete catalog and identities | 33 ordered registry entries plus generated `SyncWireMessageV1` = exact 34 core `$defs`; test compares names/modules/roles/schema object identities (`artifacts.ts:70-199,443-476`; `artifacts.spec.ts:79-113,218-230,245-263`) | PASS |
| Module/role matrix | 6 primitives, 11 events, 16 sync; roles are 6 primitive, 13 component, 1 abstract base, 13 production roots | PASS |
| Abstract/root classification | Only `EventEnvelopeV1` is abstract; roots are `DurableEventV1`, `DeltaResponseV1`, `SyncSubscribeV1`, `SyncBarrierAppliedV1`, `SyncDeliveryV1`, `TransportAckV1`, `SyncLiveV1`, `SyncResyncRequiredV1`, `SyncRevokedV1`, `SyncErrorV1`, `SubscribeResultV1`, `BarrierAppliedResultV1`, `SyncUnsubscribeV1` | PASS |
| Generic factory honesty | `snapshotResponseV1` is absent from registry and separately records exact blocked operation/authority flag (`artifacts.ts:201-207`; `artifacts.spec.ts:232-241`) | PASS |
| Core JSON Schema | Exact definitions/root union, core scope, no state/wrapper, strict registered objects, and Delta `maxItems: 500` (`artifacts.spec.ts:244-274`) | PASS |
| Core OpenAPI paths/errors/blocking | Exact delta path/query bounds and 200/400/401/403/410/503 responses; snapshot absent; blocked metadata names `getChannelSyncSnapshotV1`; components externally reference the bundle (`artifacts.ts:514-608`; `artifacts.spec.ts:276-314`) | PASS |
| Full input semantics/runtime factory | State and wrapper convert with `io: "input"`; wrapper calls `snapshotResponseV1`; defaults remain input-optional in a probe (`artifacts.ts:342-431`) | PASS |
| Full strict-state enforcement | Root open/loose, unsupported values/transforms, missing state, names, and collisions fail; nested implicit openness remains accepted | **FAIL (HIGH)** |
| Full root/path/component semantics | Adds state, runtime wrapper, snapshot root member/path/components, removes blocked operation, and resolves fixture refs (`artifacts.spec.ts:317-351`) | PASS |
| Collision/ref coverage | Core/full fixture refs resolve and reserved collision rejects; positive named nested `$defs` path is untested | PARTIAL (MEDIUM) |
| Deterministic rendering | Recursive ordinal key sort, array-order preservation, two-space JSON, UTF-8-safe string, one newline, and repeated core/full byte equality (`artifacts.ts:611-639`; `artifacts.spec.ts:428-452`) | PASS |
| No fake snapshot | Core has neither snapshot path/components nor `{}`/open projection state; full derives the wrapper from the runtime factory | PASS |

## Verification

- Focused artifact suite: 17/17 passed (run with default include via `--config package.json`, because A2b2 owns Vitest wiring).
- All contract suites: 201/201 passed; package typecheck, focused ESLint, Prettier check, and `git diff --check` passed.
- Passing tests do not cover the demonstrated nested-open state counterexample, so A2b1 must change before quality review.

Verdict: REQUEST_CHANGES
