# AW-010A S6 Specification Review — xhigh

Status: PASS

## Findings

None.

## Hostile-input hardening revalidation

The one-time own-data snapshots preserve the frozen S6 behavior and close the accessor/proxy TOCTOU path without expanding authority or changing the journal contract.

- `append` snapshots caller input before authorization. Required top-level fields are read from own data descriptors; actor and intent use immutable local snapshots; payload is recursively copied from own enumerable data descriptors. Accessors, inherited actor fields, unexpected actor/intent keys or symbols, cyclic/non-JSON payload values, and reflection failures are rejected with the applicable fixed `CHANNEL_ACTOR_INVALID` or `CHANNEL_EVENT_INVALID` diagnostic rather than executing hostile getters or leaking their exceptions.
- Valid plain/null-prototype actor, intent, and JSON-compatible payload data remain accepted. The exact actor snapshot still permits only human/service principals or `system:channel-lifecycle`; only that exact system actor skips the principal query. Human/service authorization remains the first SQL operation, tenant-leading, and protected by `FOR SHARE`.
- Event construction still uses only the snapshotted tenant/channel/actor/intent plus exactly one generated event ID and one clock value. No caller envelope spread was introduced. Dummy and actual-sequence envelopes still pass exact `DurableEventV1`, and the returned timestamp remains the validated injected UTC value.

## Frozen behavior reconfirmation

- All four SQL constants are byte-for-byte unchanged: actor lookup, locked stream-state read, guarded update, and exact ten-column insert. They remain schema-qualified, parameterized, tenant-leading where required, and contain no transaction control, `Number`, `MAX()+1`, or standalone sequence.
- Sequence allocation still re-reads locked status only for the exact update shape `rowCount === 0 && rows.length === 0`. Missing, exhausted, and allocation-failed fallback mappings are exact. Every inconsistent or malformed update cardinality/identity fails directly with `CHANNEL_STREAM_ALLOCATION_FAILED`, with no hidden status query or insert.
- Missing/malformed initial state, bigint exhaustion, actual-sequence revalidation, insert cardinality/identity, fixed row-free errors, bigint result conversion, and actor→prevalidate→lock→update→insert ordering remain exact.
- The unit inventory is exactly 16 unique `AW010A-S6` names in the frozen order. The cumulative checker enforces the ordered-name oracle, hostile-input semantic evidence, exact three-export/two-import surface, four SQL constants, eight error codes, one-call generators, append ordering, package/config/importer shape, and forbidden dependencies/control paths.
- The six S6 card paths are the only implementation paths in scope. The checker’s five non-self byte oracles are current; the checker itself was independently hashed:
  - adapter: `092efa73c505ca965d0383dd944ce11e1bb819b0019eeb30b062dc0fdf76b769`
  - unit test: `d061bf7d24fa9547ef944e1a6042cb8d0049f0aac480d3b764cf84dbdcdfd792`
  - `147ef9b89bf811b87a81cedea929a78d107723c8e769d3703e42690fb012b636` — API package artifact
  - `8a1a5f3d17adccce60b04c2ae46f455a3fb10e24a263644c8eb0049da99c4037` — API Vitest config artifact
  - lockfile: `5bd040ec0beaf0533bd6289c48bb8a180890fe8240b3779398f3deeab6f6a226`
  - checker: `169aad474922c86e2d5f2ae2e7e1e43b4f49d794310f7efb8ce1e3b640e9d8d0`
- API scripts/config remain exact: the unit project selects only health plus S6, and the S6 integration command still fails closed with `No projects matched`. The lockfile importer adds only the `@agent-workspace/chat-core` workspace link; no `pg`, `@types/pg`, lifecycle policy, or resolution change is present.

## Verification evidence

- Focused S6: **16/16 passed**.
- API lint and typecheck: **passed**.
- API unit project: **20/20 passed** across the exact two files.
- `pnpm scaffold:check`: **passed** (`116 required files`, `9 workspace packages`, `19 root scripts`, `6 migration tables`).
- `git diff --check`: **passed**.
- API integration command at S6: expected **exit 1**, exact `No projects matched the filter "integration"` fail-closed result.
- All six SHA-256 values above were independently recomputed from the reviewed working tree; the five non-self values match the checker exactly.
- Parent regression evidence supplied for final re-review: DB integration **49/49 passed** and root CI **exit 0**.
