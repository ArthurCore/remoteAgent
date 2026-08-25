# AW-008A2b Final Integration Quality/Security Lock Closure — xhigh

## Scope and severity

- Reviewed only L2 from `aw-008a2b-final-integration-quality-security-final-closure-xhigh.md` against `2c3515d` plus current final A2b2; M1/M2/L1 remain resolved.
- Remaining BLOCKER: 0; HIGH: 0; MEDIUM: 0; LOW: 0.

## L2 — RESOLVED (remaining severity: none)

- Enumerated auxiliary disappearance is now benign: each path's `lstat`/owner read is inside the per-entry `try`, and `ENOENT` continues without aborting acquisition (`packages/contracts/scripts/generate-artifacts.ts:99-117`). This closes the reproduced candidate publish/cleanup scan race.
- Quarantine publication now names the move `${lockQuarantinePrefix}${Date.now()}-${uuid}` (`:180-186`); recovery parses and validates that name timestamp, uses it for the 15-second abandonment age, and does not use inherited directory `mtime` for quarantine freshness (`:119-135`). A fresh moved stale/dead lock therefore sets `quarantinePresent` and gates acquisition.
- That gate is checked before publication, inside candidate publication, and after publication; a post-publication hit token-validates release before retry (`:231-250,259-270`).
- `restoreQuarantine` now retries `EEXIST`, `ENOTEMPTY`, `EACCES`, and `EPERM` directly, independent of a later `pathExists(lockDirectory)` result; other errors retain the path check and the retry remains bounded (`:156-177`). This closes the destination-release TOCTOU.
- Preserved invariants remain exact: token+PID release (`:92-97`), complete private candidate plus one-rename publication (`:224-256`), and moved dev/ino plus exact owner validation before delete/restore (`:145-204`).

## Tests and probes

- Ownerless and dead-owner two-contender tests each run eight iterations; every pair asserts both rc0 and no fixed/candidate/quarantine prefix residue, the dead owner uses lock `mtime` `2020-01-01`, and the final generated tree is exact (`packages/contracts/test/artifacts.spec.ts:267-297,1374-1428`).
- `pnpm exec vitest run test/artifacts.spec.ts --reporter=verbose`: PASS, 81/81.
- Independent sequential stress, four complete focused runs: PASS, 4 × 81/81; this exercised 64 additional ownerless/dead two-contender recovery pairs with no recurrence of the prior 3/12 and 4/12 failures.
- `pnpm exec tsc -p tsconfig.json --noEmit --strict`: PASS (rc0).
- Exact source inspection plus reproducible focused/stress probes leave no L2 availability, serialization, or security defect; final A2 can commit unchanged.

Verdict: APPROVED
