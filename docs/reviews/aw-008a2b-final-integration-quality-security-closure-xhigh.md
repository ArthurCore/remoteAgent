# AW-008A2b Final Integration Quality/Security Closure — xhigh

## Scope and remaining severity

- Reviewed only M1/M2/L1/L2 from `aw-008a2b-final-integration-quality-security-review-xhigh.md` against `2c3515dcb619` plus the final A2b2 working tree. The prior A2b1 and final-spec closures remain unchanged.
- BLOCKER: 0; HIGH: 0; MEDIUM: 0; LOW: 1.

## M1 — RESOLVED

- `sortJsonValue` now rejects every non-finite number and negative zero before stringify, with the current JSON Pointer in a stable `TypeError` (`packages/contracts/src/artifacts.ts:1186-1203`). Recursive object/array paths remain pointer-aware (`:1213-1224`), so no accepted location silently becomes `null` or `0`.
- The 12-case matrix covers `NaN`, both infinities, and `-0` at root/object/array positions and asserts exact path-bearing messages (`packages/contracts/test/artifacts.spec.ts:1150-1179`). Focused execution passed 79/79.

## M2 — RESOLVED

- Check mode first `lstat`s the generated root and rejects a symlink/non-directory without following it, then uses `readdir(..., { withFileTypes: true })` and classifies every sorted entry (`packages/contracts/scripts/generate-artifacts.ts:291-331`). Expected non-regular entries block content reads; valid expected files are independently compared (`:346-365`). Dual `unexpected`/`nonregular` diagnostics for one hostile entry are intentional classifications, not false duplicate success rows.
- Sandboxes cover exact-tree success, extra file/directory/symlink with target-tree immutability, accumulated drift+missing, generated-root symlink with external bytes unchanged, and invalid arguments (`packages/contracts/test/artifacts.spec.ts:1223-1316`). Canonical `contracts:check` reported both artifacts `ok` and passed 79/79.

## L1 — RESOLVED

- `renderJsonArtifact` now claims and implements only recursively sorted, two-space `JSON.stringify` plus one newline (`packages/contracts/src/artifacts.ts:1232-1234`); width-sensitive canonicalization is delegated to async Prettier in generation (`packages/contracts/scripts/generate-artifacts.ts:142-160`). The root tool is exactly pinned as `prettier: 3.9.6` (`package.json:39`).
- The Unicode regression includes CJK, emoji, a combining mark, and escaped controls and proves stable canonical output and semantic preservation (`packages/contracts/test/artifacts.spec.ts:1202-1220`).

## L2 — OPEN

- Token-checked release, ordinary two-writer serialization, residue recovery, and cleanup rollback are material improvements (`packages/contracts/scripts/generate-artifacts.ts:86-140,184-289,390-405`), and their normal/concurrent/0500 sandboxes pass (`packages/contracts/test/artifacts.spec.ts:1318-1381`). They do not make stale-lock acquisition ownership-safe.
- Acquisition publishes the lock directory and owner file in two separate awaited operations (`generate-artifacts.ts:93-99`). A crash between them leaves an ownerless directory; `readLockOwner` converts the missing file to `null` (`:75-83`), while reclamation only handles a non-null dead PID (`:117-127`). Timeout throws without removing the orphan (`:128`).
- Independent exact-code sandbox probe: an empty expected lock directory made `--check` return rc1 after 15,288 ms and the lock remained; a valid dead-PID owner returned rc0 in 264 ms and removed the lock. Thus one acquisition-window crash persistently blocks both check and generation.
- There is also a stale-takeover TOCTOU at `:117-123`: after observing a dead owner, a delayed contender renames whatever presently occupies the fixed lock path without validating the quarantined owner. Another contender can replace the stale lock with a live lock in that interval; the delayed contender then removes that live lock and acquires concurrently. A temporary-copy timing probe (markers/delays only around this unchanged interleaving) observed both processes in the post-acquire section simultaneously; both returned rc0, proving the token protects release but not mutual exclusion.
- Remaining impact is build-time availability/serialization, with no demonstrated mixed canonical pair or privilege escalation, so severity remains LOW. Closure requires atomic owner publication or identity-validated quarantine/retry, bounded ownerless recovery, and deterministic tests for crash-before-owner plus two stale-recovery contenders.

## Verification and decision

- PASS: focused artifacts 79/79; canonical `contracts:check` plus artifacts 79/79; full contracts 263/263; workspace unit pipeline 10/10 tasks.
- PASS: contracts typecheck, contracts lint, Prettier over all seven authorized A2b2 paths, `git diff --check`, and no `.skip`/`.todo`/`.only` markers in contracts specs.
- M1, M2, and L1 are closed, but L2's required ownership-safe stale-lock recovery is not. Final A2 must not commit unchanged.

Verdict: REQUEST_CHANGES
