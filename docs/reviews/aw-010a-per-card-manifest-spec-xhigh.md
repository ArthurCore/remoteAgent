REQUEST_CHANGES

# AW-010A per-card exact-manifest ownership review

## Scope

Reviewed only `docs/plans/aw-010a-task-cards.md` S1–S8 and the manifest behavior in `scripts/assert-aw007-tree.mjs`.

## What is correct

- Every S1–S7 card now literally owns `scripts/assert-aw007-tree.mjs` (S1 line 20, S2 line 47, S3 line 72, S4 line 100, S5 line 126, S6 line 154, S7 line 179).
- The fixed implementation-path counts are correct: S1 = 6, S2 = 6, S3 = 4, S4 = 7, and S6 = 6. S5 and S7 correctly avoid a fixed staged-path count because their earlier-card corrections are conditional.
- Ownership is serialized by the mandatory `S1 → … → S8` order and reviewed-predecessor requirement. Shared paths (`scripts/assert-aw007-tree.mjs`, `pnpm-lock.yaml`, Vitest configs, and the conditional S4/S6 correction paths) therefore do not create concurrent ownership conflicts.
- The per-card checker literals consistently say to add only that card's current surface to the current exact manifest. That does not pre-allow files from later cards. This matches checker behavior: it recursively enumerates `apps`, `packages`, and `scripts` and exact-compares both files and derived directories (checker lines 443–496), so either an unlisted current file or a prematurely listed missing file fails.

## Blocking findings

### 1. S1–S7 never verify the checker they modify

Every card changes the exact checker, but none of the S1–S7 Green/regression command sets runs `pnpm scaffold:check`. The checker rejects both missing and extra files and also carries exact package/script/workflow/migration assertions, so the focused package tests cannot establish that the card's intermediate commit is scaffold-green. Ownership removes the previous guaranteed failure, but without executing the checker the plan still permits an unverified—and potentially known-red—reviewed commit.

**Required change:** add `pnpm scaffold:check` as a mandatory Green/regression command in every S1–S7 card, after that card's manifest update and before review/commit. Require exit 0. This directly verifies that only the current card was admitted and all inherited AW-008/AW-010A exact oracles still hold.

### 2. S8's Red/Minimum-green text contradicts per-card ownership

S8 line 209 says to “first add” the two-table/SQL/hash/script/workflow oracles and expects failure until the manifest includes S1–S7. At the reviewed S7 predecessor, however, S1–S7 have already been required to add those current files and semantic expectations: schema in S3, migration/artifact/hash in S4, integration project in S5, API script/importer in S6, and API integration project/file in S7. Re-assigning them to S8 makes the ownership model ambiguous and the stated Red reason impossible if S1–S7 were followed.

**Required change:** rewrite S8 as final integration only. Its Red should cover only the S8 delta (root integration script and hosted workflow/final full-surface oracle), with the expected failure tied to those not-yet-applied S8 changes—not to S1–S7 being absent. State that S8 audits/preserves the already-current S1–S7 exact manifest rather than first introducing it.

### 3. S3's test count is not internally exact

S3 line 74 requires 18 assertions, while line 84 requires Vitest to report `18 passed`. Vitest's passed count is a test count, not an assertion count; 18 assertions can legally be grouped into fewer tests.

**Required change:** require 18 named `AW010A-S3` tests if `18 passed` is the intended acceptance result, or change the Green count to the actual number of tests while retaining 18 assertions.

## Re-review gate

PASS once (1) every S1–S7 card runs `pnpm scaffold:check` successfully, (2) S8 is described solely as final integration over the already-current exact manifest, and (3) the S3 assertion/test count is made consistent.
