APPROVED

# AW-010A S2 Quality and Security Closure — xhigh

**Status:** APPROVED

**Base:** `bbe83cc`

## Findings

No quality or security findings at MEDIUM severity or higher. The three prior findings are closed.

## Reviewed scope

Reviewed the exact nine authorized implementation paths:

1. `.dependency-cruiser.cjs`
2. `apps/web/test/fixtures/forbidden-db-import.ts`
3. `packages/chat-core/package.json`
4. `packages/chat-core/src/index.ts`
5. `packages/chat-core/vitest.config.ts`
6. `packages/chat-core/test/fixtures/forbidden-db-import.ts`
7. `packages/chat-core/test/public-api.spec.ts`
8. `scripts/assert-boundary-fixture.mjs`
9. `scripts/assert-aw007-tree.mjs`

No implementation file was edited during this closure review.

## Prior-finding closure

- **Global unresolvable bypass — closed.** `no-unresolvable-dependencies` is unconditional. Fixture mode changes only the fixture-path exclusion expression, and each fixture subprocess cruises one exact literal fixture source. Temporary unresolved ordinary and alias-like imports are both rejected by exactly `no-unresolvable-dependencies`.
- **Incorrect resolved `unresolvedTo` semantics — closed.** The Web and chat-core fixtures use distinct relative requests that both resolve to `packages/db/src/index.ts`. The oracle pins each dependency's exact requested module and resolved target and pins dependency-cruiser's actual violation representation, where `unresolvedTo` equals the original requested specifier despite the resolved edge.
- **Missing subprocess status check — closed.** JSON is accepted only after `error` normalizes to `null`, `signal === null`, and `status === 0`. Parse and assertion failures retain actionable process output.

## Quality and security assessment

- Each resolved fixture is required to produce one exact source module, one exact dependency, and one exact error-severity dependency violation with the expected rule, source, requested specifier, common resolved target, and original-specifier `unresolvedTo` value. Both edges are pinned as followable and resolved.
- Adversarial probes cover an ordinary missing package, an alias-like missing package, and a resolved alias-like package. The unresolved probes fail only under the unresolvable rule; the resolved alias-like package is allowed and does not falsely match the anchored DB alias rule. The temporary root is removed in `finally`; a post-run residue check found zero probe directories.
- The harness uses a repository-local fixed executable, a fixed argv shape, no shell, literal fixture metadata, and controlled generated probe names. Diagnostics include status and subprocess output but do not dump the environment or credentials.
- The normal dependency scan excludes only the two literal deliberate fixture paths in addition to the pre-existing generated-output directories. All existing boundary rules remain present, including package-to-app and cross-package public-entry-point restrictions.
- The public API is one exact type-only export declaration for the five required journal types. Tests independently pin declaration count, names, order, source module, owning-type identity, the empty runtime namespace, and absence of additional exported declarations. Test and compiler selection are explicit.
- The scaffold checker preserves its prior exact manifests and adds the two S2 files, exact root source and Vitest config oracles, and SHA-256 byte oracles for the four hardened boundary artifacts. Independently recomputed hashes match. No subset/allow-extra path, broad glob, ignored-tree expansion, skipped-test escape, or future-card preallowance was introduced.
- Root package, lockfile, workspace policy, Turbo config, workflow, dependency declarations, and lifecycle/runtime configuration are unchanged. The chat-core manifest changes only the explicit compiler test list. `git diff --check bbe83cc --` is clean.

## Independent verification

All executed checks passed on the final tree:

- Focused public API: **1 file, 4/4 tests**.
- Chat-core unit suite: **2 files, 16/16 tests**.
- Chat-core typecheck, lint, and build: passed.
- `pnpm boundaries:check`: normal scan clean (**89 modules, 186 dependencies**); both resolved fixtures and all temporary adversarial assertions passed.
- `pnpm scaffold:check`: **108 required files, 9 workspace packages, 19 root scripts, 6 migration tables**.
- `TURBO_FORCE=true pnpm run ci`: passed end-to-end; every Turbo phase reported **0 cached tasks**.
- Independent SHA-256 recomputation matched all four frozen checker values.
- Temporary adversarial-probe residue: **0**.
