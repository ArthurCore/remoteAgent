# AW-008F1 Workspace/PR Integration Specification Implementation Closure — xhigh

## Scope and authority

- Closure review only for M1/M2 in `docs/reviews/aw-008f1-workspace-pr-integration-spec-review-xhigh.md`, against HEAD `4f2f4f9` plus the current F1 correction.
- The approved AW-008 plan §§4 and 9–13 remains authoritative. Prior passing determinations are not reopened; B1 remains an external acceptance prerequisite.
- No implementation, prior review, plan, manifest, lockfile, workspace policy, workflow, or commit was edited by this closure review.

## Closure determinations

| ID | Prior severity | Determination | Result |
|---|---|---|---|
| M1 | MAJOR | The approved checker path and canonical root pointer are restored without an add/delete rename, while the AW-008 assertions and messages remain. | **RESOLVED** |
| M2 | MAJOR | Root and every workspace manifest now fail closed on all four non-approved dependency fields, with negative proof and unchanged exact approved dependency maps. | **RESOLVED** |

## M1 correction evidence

- `scripts/assert-aw007-tree.mjs` is again the sole approved checker path; its exact implementation-file list includes itself, and its canonical root script is `scaffold:check: "node scripts/assert-aw007-tree.mjs"`.
- Root `package.json` contains that same canonical command. The current correction has no checker-path add/delete pair or rename; AW-008 checks and diagnostics remain in the restored file.
- The positive tree rerun passed with exactly **102 required files, 9 workspace packages, 19 root scripts, and 6 migration tables**. The prior self-authorization concern is therefore removed.

## M2 correction and negative proof

- For each of the nine workspace manifests and for root, the checker rejects `optionalDependencies`, `peerDependencies`, `bundledDependencies`, and the `bundleDependencies` alias.
- Root `dependencies` remains exactly empty and root `devDependencies` remains the approved exact map; the correction does not alter either map.
- A temporary root `optionalDependencies` injection was rejected with `Root package must not define optionalDependencies in AW-008`; after restoration, a separate `bundleDependencies` injection was rejected with the corresponding exact generic field message.
- The original manifest was restored after each negative run, and the final positive checker rerun passed. The two tested escape classes do not depend on package names or values, so the common four-field loop closes the full namespace at root and in every workspace manifest.

## Regression evidence

- Boundaries passed at **84 modules / 173 dependencies**, and the negative fixture still requires the sole exact web→DB violation.
- `CI=true pnpm install --frozen-lockfile` passed with no lockfile change.
- `TURBO_FORCE=true pnpm run ci` passed with **cached 0**, including format, lint, typecheck, unit (184), DB (64), artifact (81), `db:check`, tree, and build coverage.

## Remaining B1 blocker

- B1 is unchanged: this checkout has no Git remote, no `gh`/authentication path, and no actual PR or GitHub Actions result. Local evidence cannot waive plan §11's successful blocking PR-workflow requirement.
- **Exact unblock:** configure a GitHub remote and authentication, commit and push the exact candidate, open a PR, and record a successful run of the pinned workflow for that candidate digest, including the retained artifact upload. Until then F1 cannot pass or hand off to G.

Remaining severity: **BLOCKER 1; CRITICAL 0; MAJOR 0; MINOR 0.**

Verdict: REQUEST_CHANGES
