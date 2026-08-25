# AW-008F1 Workspace/PR Integration Specification Review — xhigh

## Scope and verdict

- Reviewed only AW-008F1 at HEAD `4f2f4f9` plus the uncommitted changes to `.dependency-cruiser.cjs`, `.gitignore`, root `package.json`, both tree/boundary checkers, and `.github/workflows/ci.yml`.
- Authority: approved AW-008 plan §§4, 9–13, including F1's frozen/uncached **local and PR** gates. A–E implementation, prior reviews, D's separately committed correction, and G execution are out of scope.
- No implementation, prior review, plan, manifest other than this review target, lockfile, workspace policy, workflow, or commit was edited by this review.
- **Verdict: REQUEST_CHANGES.** The implementation is locally strong, but two enforcement gaps and the mandatory missing PR result block F1 closure.

## Conformance matrix

| ID | Requirement | Determination | Severity / blocker | Result |
|---|---|---|---|---|
| S1 | F1 path/ownership boundary; no dependency or lock drift | Changed implementation paths are F-owned and no package manifest, lockfile, workspace policy, or turbo change is present. | — | PASS |
| S2 | Exact A–E tree, 9 packages, 19 root scripts, 6 tables | New checker reports 102 required files / 9 / 19 / 6 and rejects the old 18-extra tree, but it self-authorizes an unapproved checker rename and root-script rewrite. See M1. | MAJOR; implementation blocker | FAIL |
| S3 | Exact direct pins and pnpm build policy | Current manifests and literal policy/denials match; frozen install reportedly leaves lock/policy unchanged. Root dependency-field closure is not enforced. See M2. | MAJOR; implementation blocker | FAIL |
| S4 | Exact contract/DB scripts and final root `ci` | Bodies match the approved literals, including DB unit reachability and `db:check`. | — | PASS |
| S5 | Boundaries/public entrypoints/unresolved normal deps/negative fixture | Reported run is clean at 84 modules/173 dependencies; the fixture requires the sole exact web→DB violation. Current source graph conforms. | — | PASS |
| S6 | No AW-010/future surface or disabled tests | Exact source tree/scripts/tables and current test corpus contain no future, skipped, conditional, todo, or only test marker. Build outputs alone are skipped; symlinks are rejected before directory skipping. | — | PASS |
| S7 | Exact blocking workflow and immutable actions | Text matches plan: `pull_request`, `contents: read`, Node 24.15.0, pnpm 11.23.0, frozen install, no cache, `TURBO_FORCE=true`, integration env/path, and all three full SHAs. The three SHA commit pages resolve in their named action repositories. | — | PASS |
| S8 | Retained evidence and failure behavior | `artifacts/` is ignored; integration writes to `${{ github.workspace }}/artifacts/testcontainers`; `if: always()` preserves/upload evidence after an integration failure, while `if-no-files-found: error` fails closed when none exists. | — | PASS |
| S9 | Frozen/uncached local gate | Recorded evidence: frozen install PASS without lock changes; uncached root CI PASS with cached 0; integration 25/25; exactly two mode-0600 secret-free JSON files; cleanup 0; YAML/Prettier/diff PASS. | — | PASS |
| S10 | Successful blocking PR workflow | No remote and no `gh` are available, so no real PR or GitHub Actions run exists. Plan §11 expressly rejects a manual substitute. | BLOCKER; external prerequisite and acceptance evidence | FAIL |

## Blocking findings and exact unblock

### M1 — MAJOR — frozen tree/script authority is changed by the checker it is meant to police

Plan §4 freezes `M scripts/assert-aw007-tree.mjs`, and §10 says that checker changes its AW-008 messages/constants; it does not authorize delete/add rename. F1 instead deletes that path, adds `scripts/assert-aw008-tree.mjs`, and rewrites `scaffold:check`. The new checker then names itself in both its file manifest and canonical script, so its PASS is self-referential rather than proof against the approved manifest.

**Unblock:** restore the approved `scripts/assert-aw007-tree.mjs` path and root script pointer while retaining the AW-008 assertions, or obtain a separate approved plan correction before treating the rename as canonical; then rerun the local gates.

### M2 — MAJOR — root direct-dependency namespace is not closed

`scripts/assert-aw008-tree.mjs` exactly compares root `dependencies` and `devDependencies`, but—unlike each workspace manifest—does not reject root `optionalDependencies`, `peerDependencies`, `bundledDependencies`, or the `bundleDependencies` alias. A new root direct dependency can therefore evade the exact-pin gate while `scaffold:check` stays green.

**Unblock:** reject every non-approved root dependency field (including both bundled-dependency spellings), add a negative proof for the escape, and rerun frozen install plus uncached CI.

### B1 — BLOCKER — required PR execution is absent

This is not a workflow-code defect and local Testcontainers/Colima evidence does not waive it. F1 itself promises local **and PR** gates; G depends on merged F.

**Unblock:** after M1/M2 are corrected, configure a GitHub remote, commit and push the exact candidate, open a PR, and record a successful run of this pinned workflow for that candidate digest, including the retained artifact upload. Only then can F1 be PASS and hand off to G.

Remaining severity: **BLOCKER 1; CRITICAL 0; MAJOR 2; MINOR 0.**

Verdict: REQUEST_CHANGES
