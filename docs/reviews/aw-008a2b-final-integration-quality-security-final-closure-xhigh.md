# AW-008A2b Final Integration Quality/Security Final Closure — xhigh

## Scope and remaining severity

- Reviewed only the previously OPEN L2 against `2c3515dcb619` plus final A2b2; M1/M2/L1 remain resolved.
- BLOCKER: 0; HIGH: 0; MEDIUM: 0; LOW: 1.

## L2 — OPEN (LOW)

- The original crash gap is fixed: `publishCandidate` creates a private candidate, writes `owner.json` with `wx`, then publishes the complete directory by one rename (`packages/contracts/scripts/generate-artifacts.ts:196-206`). Token release remains exact (`:92-97`), and stale takeover validates moved dev/ino plus exact PID/token before deleting (`:155-176`).
- However, auxiliary recovery snapshots mutable candidate/quarantine names with `readdir`, then unconditionally `lstat`s and reads each path (`:99-110`). A concurrent publish removes its candidate name at `:205-206` (and cleanup can remove one at `:225-226`); the resulting expected `ENOENT` is not caught and aborts acquisition.
- Exact focused run `pnpm exec vitest run test/artifacts.spec.ts --reporter=verbose`: **79 passed, 2 failed (81)**. Both required two-contender cases failed because one process returned rc1: ownerless fixed lock (`test/artifacts.spec.ts:1364-1385`) and dead-owner fixed lock (`:1387-1413`).
- Immediate exact-code rerun of only normal/ownerless/dead concurrent cases again failed ownerless recovery: **2 passed, 1 failed**, with one contender rc1 at the rc0 assertion (`test/artifacts.spec.ts:1376`). Thus the claimed focused 81/81 result is nondeterministic and not reproducible.
- Diagnostic-only sandbox copies (unchanged lock logic; catch only logged the swallowed exception) reproduced **3/12 ownerless** and **4/12 dead-owner** pair failures. Every captured cause was `ENOENT` from `lstat` at `generate-artifacts.ts:110`, reached from the pre/post-publish scans at `:203` or `:219`.
- Quarantine freshness is also not represented independently: recovery computes age from the moved directory's inherited `mtime` (`:110-113`), while quarantine publication is only a rename (`:155-158`). A same-volume probe preserved mtime, dev, and ino across rename (`mtime=1577804400` before and after), so an old dead lock can look immediately 15-second-abandoned and be removed by another contender at `:113-115` while validation is active.
- Restoration retains a second destination-release TOCTOU: after rename-to-fixed fails, `restoreQuarantine` retries only if a later `pathExists(lockDirectory)` is true (`:139-151`). If that holder releases between those operations, it throws the stale destination error and leaves quarantine residue; unlike publication, it does not recognize `EEXIST`/`ENOTEMPTY`/`EACCES`/`EPERM` independently (`:208-214`).
- The passing assertions do check the exact pair, fixed-lock removal, and replacement residue (`test/artifacts.spec.ts:1376-1380,1404-1408`), but their observed flakiness means candidate/dead/ownerless residue is only bounded in quiet interleavings, not race-safe.
- Remaining impact is build-time availability and serialization reliability; no mixed canonical pair, privilege escalation, or overlapping critical section was demonstrated, so remaining severity stays LOW.

## Required closure

- Treat disappearance of an enumerated auxiliary path as a benign concurrent transition after safe revalidation; timestamp quarantine creation independently; make restore retry destination-conflict codes even when the fixed path has already disappeared; and add deterministic interleaving tests for all three races.
- L2 is not resolved, focused verification is red, and final A2 cannot commit unchanged.

Verdict: REQUEST_CHANGES
