APPROVED

# AW-010A S3 Quality and Security Review — xhigh

## Severity-ranked findings

**None.** I found no critical, high, medium, or low-severity defect in the six-path S3 candidate and no missing database constraint within the frozen S3 contract.

## Verdict

**APPROVED** for pre-commit. The declarations are sound under the pinned Drizzle toolchain, the tests are independent metadata/source oracles rather than assertions over reconstructed implementation constants, the public surface adds no executable write API, and the checker preserves the pre-S3 foundation and migration boundary. No implementation edit or commit was made by this reviewer.

## Exact scope reviewed

1. `packages/db/src/schema/channel-stream.ts`
2. `packages/db/src/schema/index.ts`
3. `packages/db/test/channel-stream-schema.spec.ts`
4. `packages/db/test/schema.spec.ts`
5. `packages/db/package.json`
6. `scripts/assert-aw007-tree.mjs`

The working tree contains exactly those six implementation paths plus the two required review documents. `pnpm-lock.yaml`, root lifecycle/configuration, migration artifacts, and all dependency objects are unchanged.

## Quality and security assessment

- **Drizzle declarations and S4 generation:** both sequence columns use `bigint(..., { mode: "bigint" })`; `schema_version` is `integer NOT NULL` with no default; both discriminants are `text NOT NULL` with finite-set checks; payload is typed as an object and stored as `jsonb NOT NULL` with an independent object-shape check; timestamps are `timestamptz(6)`, with `now()` only on the two `created_at` columns. An isolated generation probe against committed `0000` produced exactly two new tables, all expected scalar declarations/defaults/checks, the global event-ID unique constraint, and both tenant-leading `ON DELETE RESTRICT ON UPDATE RESTRICT` foreign keys. It produced no enum or index. This is a stable input to S4's required inspected/replaced migration; S4 still owns triggers, membership-event FKs, locking/backfill/postconditions, metadata, and hashes.
- **Keys and tenant isolation:** primary-key order is exact. Both channel FKs lead with `(tenant_id, channel_id)`, reference the matching composite channel key, and explicitly restrict update and delete. `channel_events_event_id_key` is a true global unique constraint on `event_id`, not a tenant-scoped or nullable approximation.
- **SQL literal safety:** every SQL fragment is static and composed only from Drizzle column references plus reviewed literals; no user-controlled interpolation is present. The finite literal sets exactly match the seven authoritative `DurableEventV1` discriminants and the canonical three actor kinds.
- **Checks and oracle rigor:** the focused tests read actual Drizzle table configuration and compiled SQL, reject parameterized check expressions, normalize only qualification/quoting/whitespace/case, and compare the entire named predicate surface. Expected predicates and literal lists are explicit test oracles, not imported or derived from `channel-stream.ts`. The candidate has exactly six uniquely named `AW010A-S3` tests and 18 `expect(...)` calls, with no skip/todo/only or conditional test marker. Exact column order/types/nullability/defaults, keys, actions, uniqueness, checks, literal sets, enum surface, table/export surface, and absent indexes are covered.
- **Contract drift risk:** the database test intentionally duplicates the frozen seven-literal contract rather than adding a forbidden DB-to-contracts dependency. Independent extraction confirmed an exact set/cardinality match with `packages/contracts/src/events.ts`. Subsequent contract changes must therefore update the named DB check through a reviewed migration rather than silently widening storage; the byte-exact test/checker gates make accidental one-sided S3 drift fail closed.
- **No future-object leakage:** only `channel_event_sequences` and `channel_events` are added. There is no message/version/mention/reaction/outbox/idempotency/projection/read-state table, event/actor enum, index, trigger, function, view, or S4 migration artifact.
- **Public export boundary:** schema index/root DB exports add only the two table declarations. No query helper, mutation service, credential, grant, controller, or executable public write method is added. These exports are not represented as an authorization boundary; existing dependency rules continue to reject DB imports from web and chat-core.
- **Existing schema-test preservation:** the `schema.spec.ts` diff is exactly two added expectation lines—`channelEventSequences` and `channelEvents`. Every AW-008 foundation and role-bootstrap line remains byte-identical.
- **Checker strength and maintainability:** the checker diff is limited to two implementation-manifest entries, the explicit DB unit selection, five current S3 SHA-256 file oracles, and their enforcement loop. The hashes match the reviewed files. Exact-list comparison, real-file/symlink checks, forbidden test-marker scan, S2 hashes, package/dependency/export oracles, and workflow/boundary controls remain intact. The committed migration SQL, snapshot, and journal still describe exactly the six AW-008 tables and sole `0000_aw008_foundation` history entry. Exact hashes intentionally require reviewed updates when later cards modify shared files; the checker does not pretend to self-authenticate its own source.
- **Manifest/lifecycle drift:** `packages/db/package.json` changes only `test:unit`, appending the focused file by explicit path. Dependencies, dev dependencies, exports, package identity, and all other scripts are unchanged; no install/preinstall/postinstall/prepare hook or lockfile change appears.

## Missing-constraint and overclaim check

No additional S3 database constraint is required. Child tenant/channel nonemptiness is inherited through the checked composite channel FK; actor-principal existence/kind agreement cannot be represented by a blanket principal FK because system actors are canonical; event-type/payload correlation remains the strict application-boundary invariant; and append-only triggers plus membership-event references deliberately belong to S4.

This approval does **not** claim that exported Drizzle tables or current generic runtime grants are a privilege boundary, that raw SQL cannot forge an otherwise structurally valid event or mutate sequence state, or that the S3 declarations alone are append-only. The parent plan already discloses those residual risks and assigns the relevant trigger/migration work to S4 and stronger role separation to a separate reviewed card.

## Independent verification

- Focused S3 Vitest: **1 file, 6/6 tests passed**.
- DB lint and typecheck: **exit 0**.
- DB unit suite: **3 files, 70/70 tests passed**, with no skipped/todo result.
- DB check: **exit 0**; Drizzle Kit reported `Everything's fine`, and migration-integrity verification passed.
- Scaffold checker: **exit 0**, reporting **110 required files**, **9 packages**, **19 root scripts**, and the preserved **6 migrated AW-008 tables**.
- Uncached root CI (`TURBO_FORCE=true pnpm run ci`): **exit 0**, with **0 cached tasks** in lint, typecheck, unit, and build phases; formatting, boundaries, contracts, DB checks, scaffold, and builds all passed.
- Isolated Drizzle generation probe: **exit 0**; generated exactly `channel_event_sequences` and `channel_events`, zero `CREATE TYPE`, zero new index, and left the repository working tree unchanged.
- `git diff --check`: **exit 0**.
