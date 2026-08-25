PASS

# AW-010A S2 Final Specification Re-review — xhigh

**Base:** `bbe83cc`

## Findings

No specification-blocking findings.

## Scope

The working tree has exactly the nine authorized S2 implementation paths, plus the two required S2 review artifacts:

1. `.dependency-cruiser.cjs`
2. `apps/web/test/fixtures/forbidden-db-import.ts`
3. `packages/chat-core/src/index.ts`
4. `packages/chat-core/test/public-api.spec.ts`
5. `packages/chat-core/test/fixtures/forbidden-db-import.ts`
6. `packages/chat-core/vitest.config.ts`
7. `packages/chat-core/package.json`
8. `scripts/assert-boundary-fixture.mjs`
9. `scripts/assert-aw007-tree.mjs`

There is no unrelated implementation change. `pnpm-lock.yaml` and the root `package.json` are unchanged; the chat-core manifest changes only the explicit compiler test selection, with dependency declarations unchanged. `git diff --check bbe83cc --` is clean, and no changed test has an `only`, `skip`, or `todo` control marker.

## Specification assessment

- **Exact type-only public API:** `packages/chat-core/src/index.ts` contains one type-only export declaration with exactly `TrustedChannelActor`, `ChannelEventIntent`, `AppendChannelEventInput`, `AppendChannelEventResult`, and `ChannelEventTransaction`, from the owning journal module. It creates no runtime export. The four S2 tests independently check exact export syntax/names/source, type identity, an empty runtime namespace, and absence of any additional exported declaration. The exact scaffold oracle also freezes the root source.
- **Exact test cardinality and selection:** `test/public-api.spec.ts` has exactly four named `AW010A-S2` tests. The focused run passes 4/4; the package unit run passes 16/16 across the two explicit files. Vitest selects exactly the existing journal test and the S2 public-API test by package-relative names, and `typecheck:test` explicitly compiler-checks both files without shell glob dependence.
- **Resolved distinct fixture requests:** the Web fixture requests `../../../../packages/db/src/index.js`; the chat-core fixture requests `../../../db/src/index.js`; dependency-cruiser resolves each to `packages/db/src/index.ts`. The harness requires one source module, one dependency, the exact distinct request, common resolved target, `followable: true`, `couldNotResolve: false`, the exact single error-severity rule violation, and dependency-cruiser's actual resolved-edge `unresolvedTo` representation equal to the original request.
- **Fail-closed execution semantics:** the harness pins `status === 0`, `error === null`, and `signal === null` before accepting JSON. It includes the two fixtures only in fixture mode while `no-unresolvable-dependencies` remains active in every mode. Normal mode excludes only the two literal deliberate fixtures in addition to the pre-existing generated-output directories.
- **Adversarial coverage and cleanup:** temporary generic-unresolved and alias-like-unresolved probes must fail only under `no-unresolvable-dependencies`; a resolved alias-like package must remain allowed and must not falsely match the DB alias rule. Their exact dependency/violation representations are asserted, and the temporary root is removed in `finally`.
- **Boundary continuity:** the existing rules remain present. The chat-core restriction retains its resolved workspace-package policy and adds the exact anchored `@agent-workspace/db(?:/|$)` form, avoiding alias-like prefix false positives. The normal scan remains clean, while fixture scans reject Web only by `web-must-not-import-db` and chat-core only by `chat-core-dependencies-are-restricted`.
- **Exact checker / anti-weakening:** the current implementation manifest adds only the two S2-created files; the canonical chat-core source, Vitest selection, package scripts, dependency manifests, workflow, migration, tree, and forbidden-test-marker checks remain exact. The four hardened boundary artifacts are byte-frozen at their current SHA-256 values, which were independently recomputed and match the checker. No broad glob, subset comparison, allow-extra branch, ignore expansion, future-card allowance, dependency drift, or lock drift was introduced.

## Verification

All re-review commands passed:

- focused S2 Vitest: **1 file, 4/4 tests**;
- chat-core unit suite: **2 files, 16/16 tests**;
- chat-core typecheck, lint, and build;
- `pnpm boundaries:check`: normal scan clean (**89 modules, 186 dependencies**) and all resolved/adversarial fixture assertions passed;
- `pnpm scaffold:check`: **108 required files, 9 packages, 19 root scripts, 6 migration tables**;
- all four checker SHA-256 values matched current files;
- `git diff --check bbe83cc --`.

Parent final-gate evidence additionally reports frozen install, uncached CI with cache count zero, and residue count zero passing on this candidate.
