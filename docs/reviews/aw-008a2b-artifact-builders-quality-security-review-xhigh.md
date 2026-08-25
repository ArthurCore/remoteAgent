# AW-008A2b Artifact Builders Quality/Security Review — xhigh

## Scope

- Reviewed only A2b1 `packages/contracts/src/artifacts.ts` and `packages/contracts/test/artifacts.spec.ts` at baseline `1182bb6` plus the current uncommitted A2b1.
- Recovered the completed adversarial probes from the prior reviewer transcript; no A2b2 source, generated artifact, wiring, or write/check implementation was reviewed.

## Findings

### HIGH — Global/caller Zod metadata can inject structural JSON Schema

**Evidence:** the core path creates a local registry but passes the original exported schemas to Zod (`packages/contracts/src/artifacts.ts:293-304`). Normalization strips only a top-level `$schema`/`$id` and rewrites only the exact `$ref: "#"` case; it preserves other root and all nested structural metadata (`packages/contracts/src/artifacts.ts:253-282`). Full-state and wrapper conversion likewise consume caller schemas directly (`packages/contracts/src/artifacts.ts:537-624`). A probe that first ran `z.globalRegistry.add(OpaqueIdV1, { description: "poisoned", $ref: "https://evil.example/core" })` made the authoritative `OpaqueIdV1` definition contain both attacker fields despite the local registry. Root/child `.meta()` probes also emitted external `$ref`, `$id`, and `$anchor` keywords.

**Impact:** process-local code able to register metadata, or a caller supplying full state, can redirect resolution or change the base URI/identity of a published contract. The artifact is not isolated from ambient mutable global state.

**Required fix:** generate authoritative schemas from metadata-isolated schema instances/a truly private registry; do not clear or mutate `z.globalRegistry` as a workaround. Recursively enforce an explicit metadata policy and reject unexpected `$id`, `$anchor`, `$dynamicAnchor`, `$ref`, and `$dynamicRef`; validate every permitted ref against an existing intended internal target.

**Required tests:** poison a core schema in `z.globalRegistry` under `try/finally` and require rejection or clean output; reject structural metadata at full-state root, child, and named child; prove permitted descriptive annotations cannot alter refs or identifiers. Existing normal core/full/ref tests (`packages/contracts/test/artifacts.spec.ts:311-418,454-482`) do not cover this trust boundary.

### HIGH — Named definitions can produce dangling refs and prototype-sensitive maps

**Evidence:** `definitionRef` escapes JSON Pointer tokens (`packages/contracts/src/artifacts.ts:245-250`), but normalization does not canonicalize Zod-emitted named refs other than `$ref: "#"` (`packages/contracts/src/artifacts.ts:253-282`). Named `$defs` are copied into ordinary `{}` maps by attacker-controlled keys (`packages/contracts/src/artifacts.ts:585-595,660-668`), and OpenAPI components repeat ordinary keyed assignment (`packages/contracts/src/artifacts.ts:772-775`). For id `a/b~c`, the definition key was literally `a/b~c` while its ref was `#/$defs/a/b~c`, which resolves as path segments and dangles. `constructor`, `toString`, and `prototype` were rejected only incidentally through inherited properties; a `__proto__` probe lost/corrupted the own property while leaving suspicious `required` output.

**Impact:** accepted caller names can publish invalid contracts; prototype setters/inherited keys make collision and insertion behavior non-own-property-safe and non-deterministic.

**Required fix:** either reject metadata ids outside a documented safe component-name grammar (including `__proto__`) or canonicalize every generated internal ref with `pointerToken`. Build all attacker-keyed dictionaries with `Object.create(null)`, use `Object.hasOwn` for collisions, and serialize into own-property-only JSON objects.

**Required tests:** require `a/b~c` to be safely escaped and resolvable or explicitly rejected; deterministically reject/handle `__proto__`, `constructor`, `prototype`, and `toString`; assert own keys, unchanged prototypes, and resolution in both JSON Schema and OpenAPI. The current resolver (`packages/contracts/test/artifacts.spec.ts:138-200`) is useful but its fixtures use only safe ids (`packages/contracts/test/artifacts.spec.ts:77-90,454-482`).

### MEDIUM — Exported registries are runtime-mutable configuration

**Evidence:** `as const`/`readonly` is compile-time only; neither exported array nor its entries is frozen (`packages/contracts/src/artifacts.ts:70-207`). Generation consumes mutable `schema`/`role` fields (`packages/contracts/src/artifacts.ts:293-312,646-653`) and factory metadata consumes mutable entries (`packages/contracts/src/artifacts.ts:285-290`). Probes changed the first entry's schema and role, altering its definition and adding `OpaqueIdV1` to the production root; the generic factory array/entry was equally mutable. The suite itself mutates and restores a registry entry (`packages/contracts/test/artifacts.spec.ts:293-307`).

**Required fix/tests:** freeze each entry and then each exported array (or export defensive immutable projections). Assert `Object.isFrozen` for arrays and every entry, mutation throws in ESM, and attempted mutation cannot change repeated core/full bytes. Keep the direction-exception freeze pattern at `packages/contracts/src/artifacts.ts:209-215`.

### MEDIUM — Untrusted schema size/depth has no resource budget

**Evidence:** one full build performs input/output and wrapper conversion plus recursive normalization/strictness walks without a size/depth guard (`packages/contracts/src/artifacts.ts:253-282,471-535,537-636,656-670`). A 25,000-field state reached about 582 MB RSS; depth 1,200 took about 225 ms, and depth 2,000+ hit a caught stack overflow. Legitimate recursive root/named Zod schemas terminated and resolved, so graph recursion itself need not be prohibited.

**Required fix/tests:** define and enforce pre-conversion unique-node/property and nesting budgets while permitting visited back-edges; for genuinely untrusted plugins, isolate conversion in a worker/process with heap/time limits. Test just-below/above each budget, a wide rejection without large RSS growth, stable non-`RangeError` errors, and legitimate recursive root/named refs.

### LOW — Public deterministic renderer crashes opaquely on cyclic runtime input

**Evidence:** recursive sorting has no active-object/cycle guard (`packages/contracts/src/artifacts.ts:814-833`); `renderJsonArtifact(cyclicObject)` raised `RangeError: Maximum call stack size exceeded`. Types exclude cycles, and A2b2's intended builder outputs are acyclic, reducing severity but not the public runtime failure.

**Required fix/tests:** track the active recursion path (allow shared acyclic objects), throw a stable path-bearing `TypeError` for self/mutual cycles, and cover self-cycle, mutual-cycle, shared DAG, and excessive depth.

## Test robustness, A2b2 boundary, and disposition

- Recovered gates pass: focused 28/28, all contracts 212/212, typecheck, focused lint, and format. They omit every adversarial case above, so passing gates do not close the findings.
- A2b2 still owns generator execution, committed bytes, atomic write behavior, no-write check/drift mode, exports/root-index integration, and Vitest wiring (`docs/reviews/aw-008a2b-artifact-builders-spec-closure-xhigh.md:5-6,32-40`). It should prove failed builds write nothing, but A2b2 must not normalize or bless poisoned/dangling A2b1 output.
- Remaining open: BLOCKER 0, HIGH 2, MEDIUM 2, LOW 1.

Verdict: REQUEST_CHANGES
