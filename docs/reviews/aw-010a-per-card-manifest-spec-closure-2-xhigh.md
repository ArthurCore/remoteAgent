# AW-010A Per-Card Manifest Specification Closure 2 (xhigh)

**Verdict: PASS**

**Reviewed source:** `docs/plans/aw-010a-task-cards.md` only.

## Closure verification

- **Global pre-review gates are explicit for S1–S8.** The mandatory protocol requires every card to pass `pnpm scaffold:check` and `TURBO_FORCE=true pnpm run ci` before review/commit, with Turbo reporting zero cached tasks. It also fixes the serial order as `S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8`, each predecessor being a reviewed commit.
- **S8 is a cumulative audit, not a checker rebuild.** Its red phase audits the accumulated S1–S7 oracles first, permits only S8-specific evidence/workflow additions, requires all S1–S7 entries to pass already, and forbids reintroduction or rewriting. Its minimum-green wording again requires preservation and audit of the cumulative checker.
- **S3 cardinality is exact.** The red requirement is exactly 6 named tests containing 18 assertions, and the focused green criterion repeats 6 tests / 18 assertions passed.
- **Configuration/script ownership is unambiguous.** S2 owns the `packages/chat-core/vitest.config.ts` addition for `test/public-api.spec.ts`; S3 and S4 each own the exact addition of their respective DB test file to `packages/db/package.json`'s `test:unit` script.
- **S1–S7 manifest and review contracts are complete.** Every card names `scripts/assert-aw007-tree.mjs` as an exclusive cumulative checker edit and supplies exactly two literal review paths. Fixed implementation-path counts agree with the commit instructions: S1=6, S2=7, S3=5, S4=8, and S6=6. S5 correctly has 3 unconditional paths plus an evidence-gated 5-path correction set and stages only exact changed paths; S7 has 3 unconditional paths plus the single evidence-gated adapter correction. The global protocol supplies exact serial execution and review gating throughout.

No remaining per-card manifest specification blocker was found.