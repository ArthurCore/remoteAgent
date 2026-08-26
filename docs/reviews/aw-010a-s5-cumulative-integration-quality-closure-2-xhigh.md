APPROVED

# AW-010A S5 Cumulative Integration Quality/Security Closure 2 (xhigh)

**Verdict:** **APPROVED.** The revised S5 card closes every blocker from `aw-010a-s5-cumulative-integration-quality-xhigh.md` without weakening a predecessor oracle or opening an additional unconditional implementation path. I found no new blocking quality or security path.

## Closure findings

1. **Six non-checker files are byte-frozen.** `docs/plans/aw-010a-task-cards.md:132-138` now defines exactly seven base paths and requires the checker to add exact SHA-256 oracles for all six S5-owned non-checker files while preserving every prior oracle. The checker remains correctly excluded from self-hashing; no glob, replacement hash map, or S6/S7 pre-allowance is authorized.
2. **Catalog grants and trigger behavior are no longer conflated.** The role-suite instruction preserves all ten tests, advances ownership/grants to the cumulative eight-table surface, and separately requires direct journal update/delete rejection as trigger-enforced behavior. Read with the frozen parent disclosures at `docs/plans/aw-010a-channel-stream-foundation.md:77,88`, it also keeps direct journal insert and raw sequence-state access—including direct state update/delete—visible as residual raw-SQL runtime-role risk rather than falsely reporting permission denial. No grant, group-role, or routine redesign is authorized, and the predecessor role/DDL/ledger/default-privilege denials remain in the preserved ten-test surface.
3. **Harness security and cleanup invariants are explicit and change scope is minimal.** The harness may change only the imported/recorded retained-evidence migration hash. The card explicitly preserves generated credentials, secret-free serialization/scans, `0600` evidence mode, no-overwrite creation, cleanup/residue verification, dead-owner-only running-container cleanup, stopped-container convergence, and all stale-container safety. The new exact file hash freezes the reviewed result; unrelated evidence-path, pool/container/volume, retained/temporary evidence, or cleanup-failure behavior cannot be changed under this card.
4. **Tenant/channel binding has its own negative.** Frozen test (15) is an explicit same-tenant/different-channel rejection, separate from test (14)'s wrong-tenant case. It uses the S5 typed-reference surface and closes the parent contract's tenant-and-channel isolation requirement without increasing the 24-test total or adding a path.
5. **RED is deterministic and honest.** Named test (1) asserts the exact four-file integration registration itself. The predecessor broad glob selects the new focused file, so that assertion—not file non-selection or a fabricated SQL failure—must produce the focused red. The full existing-suite semantic baseline remains separately recorded, and infrastructure retries, skips, and todos are expressly disallowed as acceptance.

## Scope and regression check

- The unconditional implementation set remains exactly seven paths: six non-checker S5 files plus `scripts/assert-aw007-tree.mjs`.
- The five reviewed S4 migration/integrity paths remain evidence-gated and require both S4 reviews to rerun if changed.
- No package manifest, lockfile, TypeScript configuration, role-bootstrap, workflow, schema-source, application, or additional test path is needed.
- `pnpm --filter @agent-workspace/db exec vitest list --config vitest.config.ts --project integration` still discovers the predecessor 5 migration, 10 constraints, and 10 roles tests; `pnpm scaffold:check` passes with 113 required files, 9 packages, 19 root scripts, and the preserved six-table predecessor boundary; `git diff --check` passes.

S5 is quality/security-approved for dispatch under the revised card. This approval covers the plan closure only; the eventual S5 implementation still requires its named independent specification and quality/security reviews.
