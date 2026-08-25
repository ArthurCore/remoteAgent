# AW-008A2b Snapshot Artifact Decision — xhigh

## Scope and authority gap

- Decision-only review on clean `2058ba0`; it authorizes an A2b artifact strategy, not a projection/API implementation or a plan/board/manifest change.
- The plan requires complete D1 runtime contracts, one-registry deterministic JSON Schema/OpenAPI artifacts, byte parity, and the exact committed artifact paths (`docs/plans/aw-008-contracts-db-foundation.md:26,33-61,90-103`), while explicitly excluding AW-009 HTTP/Web behavior, AW-010 message behavior, and reducers/projections/read state (`docs/plans/aw-008-contracts-db-foundation.md:9-12`).
- Runtime authority intentionally defines `snapshotResponseV1(state)` as a generic wrapper over a caller-owned Zod state (`docs/contracts/sync-contract-v1.md:174-185`); A2a approved that closure and its generic typing (`docs/reviews/aw-008a2a-sync-runtime-spec-review-xhigh.md:13-15`; `docs/reviews/aw-008a2a-sync-runtime-quality-security-closure-xhigh.md:26-28`).
- Artifact authority is stricter: a generated OpenAPI snapshot MUST replace `ChannelReplicaStateV1` with a concrete strict projection schema (`docs/contracts/sync-contract-v1.md:416-418`); the shown open object is expressly only a placeholder (`docs/contracts/sync-contract-v1.md:540-555`).
- Projection authority does not close that gap: it excludes the snapshot/live barrier (`docs/contracts/chat-projection-semantics-v1.md:23-26`), defines an internal reducer `ReferenceState` containing `Map`, `Set`, and `bigint` (`docs/contracts/chat-projection-semantics-v1.md:597-665`), and separately defines a viewer `ProjectionOutput` (`docs/contracts/chat-projection-semantics-v1.md:744-797`). Neither is named or specified as the complete JSON snapshot replica state; message content/attachment fields remain deliberately open (`docs/contracts/chat-projection-semantics-v1.md:663-665`).
- Therefore A2b has authority for the generic wrapper and concrete core contracts, but no authority to invent, expose, or version `ChannelReplicaStateV1`.

## Options and tradeoffs

| Option | Compatibility | Security / scope | Decision |
|---|---|---|---|
| Generic builders plus a committed concrete-core bundle; add the snapshot only when a strict caller schema is supplied | Keeps stable builders/artifact paths now and gives AW-009/10 a non-breaking completion path | Honest omission is fail-closed; no data shape is guessed | **APPROVE** |
| Defer both committed artifacts or all artifact work | Avoids a premature snapshot | Breaks the plan's exact tree, generation, and parity gates | Reject; needs plan amendment |
| Emit broad `{}` / `additionalProperties:true` state | Superficially consumable | Advertises validation that does not exist and can hide overexposure | Reject |
| Emit a dangling `$ref`, `false` snapshot response, or unusable snapshot operation | Fail-closed at validation | Breaks OpenAPI tooling/clients and falsely publishes an impossible endpoint | Reject |
| Define a narrow channel/message state in A2b | Produces a complete-looking document | Crosses AW-009/10 ownership and risks incompatible privacy/cache/version semantics | Reject |

## APPROVED exact A2b strategy

1. Preserve and root-export the complete approved runtime surface, including generic `snapshotResponseV1(state)`; do not create a concrete runtime `ChannelReplicaStateV1`.
2. In `src/artifacts.ts`, maintain one ordered registry for every concrete primitive, durable event, and sync schema. Mark abstract bases and top-level production wire schemas explicitly; record `snapshotResponseV1` only as generic-factory metadata, never as a fabricated Zod schema.
3. Export deterministic `buildSyncJsonSchemaV1` and `buildSyncOpenApiV1` builders with a discriminated input: `{ mode: "core" } | { mode: "full"; snapshotState: StrictJsonObjectSchema }`. Full mode requires a JSON-Schema-representable strict Zod object, fixes its component name to `ChannelReplicaStateV1`, rejects open objects/name collisions/unsupported conversion, and derives `SnapshotResponseV1` by calling the runtime factory.
4. `{ mode: "core" }` produces the **concrete-core** mode used for committed A2b artifacts. Both artifacts carry `x-agent-workspace-artifact-scope: sync-v1-concrete-core` and generic-factory metadata stating that the snapshot operation requires follow-up authority.
5. `sync-v1.schema.json` is not an accept-anything catalog: `$defs` contains every concrete registry schema and its root references a generated `SyncWireMessageV1` `anyOf` of production top-level wire contracts. It contains no `ChannelReplicaStateV1` or `SnapshotResponseV1` in core mode.
6. `openapi-sync-v1.json` is valid OpenAPI 3.1 for the concrete sync core. Components reference `./sync-v1.schema.json#/$defs/<Name>`; the delta operation and concrete errors are present, while the snapshot path and both snapshot components are absent in core mode. The omission metadata names the blocked `getChannelSyncSnapshotV1`; no placeholder, dangling reference, or fake success response is allowed.
7. With a strict authoritative `snapshotState`, both builders add the same generated state definition, wrapper, and `/api/v1/channels/{channel_id}/sync/snapshot` operation. This mode is exercised only with a test-local fixture in A2b and produces no extra committed fixture artifact.
8. Generation uses stable registry order, recursive key sorting, UTF-8 JSON with two-space indentation and one trailing newline; no timestamp, absolute path, locale order, or environment value may affect bytes. `--check` regenerates into a temporary directory and byte-compares both committed files.

## Intended A2b tree

```text
A packages/contracts/src/artifacts.ts
A packages/contracts/scripts/generate-artifacts.ts
A packages/contracts/generated/sync-v1.schema.json
A packages/contracts/generated/openapi-sync-v1.json
A packages/contracts/test/artifacts.spec.ts
M packages/contracts/src/index.ts
M packages/contracts/vitest.config.ts
```

No additional A2b file is authorized by this decision.

## Required tests and gates

- Assert the registry/export set exactly covers all approved concrete runtime schemas, classifies abstract versus production roots, and lists the generic snapshot factory separately.
- Assert two generations are byte-identical; `--check` detects either-file drift; every internal/external `$ref` resolves; OpenAPI components point to the JSON Schema bundle.
- Assert core artifacts have the scope/omission metadata, concrete delta path, strict object closure, production root union, and **no** snapshot path/component, `additionalProperties:true` projection, `{}` state, or unresolved reference.
- Build full mode from a test-local strict state and assert exact state/wrapper/path refs plus rejection of unknown state fields; assert open state, unsupported conversion, component collision, and requested snapshot generation without state fail before writes.
- Include `{primitives,events,sync,artifacts}.spec.ts` in final Vitest config; run package unit tests, typecheck, lint, format check, generation check, and `git diff --check` with no fake/skip/todo tests.

## Follow-up authority and completion

- **Owner: AW-009 API contract owner.** Before implementing or publishing the snapshot endpoint, that owner must open a focused prerequisite authority card, with AW-010 projection owner as required co-author/reviewer, to freeze the exact strict/versioned viewer-safe `ChannelReplicaStateV1` (messages, tombstones, content/attachment exposure, ordering/paging, purge semantics) and regenerate both artifacts in full mode.
- Until that card is approved, snapshot runtime composition remains available to callers, but the committed public artifacts must continue to declare concrete-core scope and omit the snapshot operation.

Verdict: APPROVED
