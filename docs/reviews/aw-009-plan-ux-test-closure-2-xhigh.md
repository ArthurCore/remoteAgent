REQUEST_CHANGES

# AW-009 Plan UX, E2E/Isolation, and Executability Closure 2 (xhigh)

**Reviewed only:** revised `docs/plans/aw-009-tenant-workspace-channel-vertical-slice.md`, revised `docs/plans/aw-009-task-cards.md`, and prior `docs/reviews/aw-009-plan-ux-test-closure-xhigh.md`.

**Decision:** `UXE-07` is closed. `UXE-12` remains blocking on one narrow literal-path defect. The other ten findings remain closed and were not reopened. Per review scope, no implementation or broad test run was performed.

## UXE-07 — CLOSED

AW-009 §15 now freezes the required oracle rather than leaving it to F3:

- The table has exactly 12 route rows and exactly six ingress columns: `path`, `query`, `body`, `header`, `cookie`, and `cursor` (72 cells).
- Every cell is literal `A` or `N/A — <concrete reason>`; no cell leaves applicability or its waiver rationale to implementation-time design.
- Applicable-cell counts are exactly path 6, query 3, body 4, header 10, cookie 10, and cursor 3.
- Generated `HEAD` registrations are derived aliases with the same classification/guards as the source `GET` and do not enlarge the 12-row denominator.
- The expected registered `OPTIONS` count is exactly zero; an observed registration fails inventory and requires plan review.
- The accepted-case arithmetic is exact: `6×32 + 3×24 + 4×24 + 10×8 + 10×8 + 3×24 = 192 + 72 + 96 + 80 + 80 + 72 = 592`.
- The plan freezes seed `9009001`, zero filtering/discards, retries zero, one owning cell per accepted case, and exactly ten separate same-tenant positive controls excluded from 592. F3 repeats `592/592` and `10/10` as its green result.

This satisfies the prior requirement for a literal reviewed route × ingress matrix, reasoned non-applicability, registration handling, numeric cell floors, and balanced denominator.

## UXE-12 — OPEN

The revision closes nearly all of the prior executability defect:

- All 27 cards are present in the exact serial order `F0 → T0 → A1 → A2 → B1 → B2 → B3 → C1 → C2 → C3 → D1 → D2 → D3 → D4 → D5 → E1 → E2 → E3 → E4 → E5 → F1 → F2 → F3 → F4 → F5 → F6 → G1`.
- Every card states a predecessor, red command and expected failure, bounded minimum-green edit, focused green command with an expected count/result, regression command/result, two literal review documents, and a commit message/set.
- The mandatory protocol applies to every card: findings return to that card's implementer, corrections stay within its exclusive paths, and both fresh reviewers rerun to `PASS`/`APPROVED`. F4 and G1 additionally route product corrections back to the originating card/implementer.
- No wildcard path family remains elsewhere in the cards.

However, four entries in the exclusive path lists are still bare filenames rather than literal repository-relative paths:

- E4 (`docs/plans/aw-009-task-cards.md:269`): `channel-sidebar.tsx` and `last-location.ts`.
- E5 (`docs/plans/aw-009-task-cards.md:283`): `channel-form.tsx` and `join-channel-button.tsx`.

Their intended directory can be inferred from adjacent entries, but inference is exactly what the `UXE-12` literal-path requirement forbids. These entries also make the referenced five-path commit sets non-literal.

**Required to close:** replace those four tokens with the complete paths:

- `apps/web/app/channel-sidebar.tsx`
- `apps/web/app/last-location.ts`
- `apps/web/app/channel-form.tsx`
- `apps/web/app/join-channel-button.tsx`

No other card or finding needs revision for this closure.

## Disposition

| Finding | Status | Basis |
|---|---|---|
| `UXE-07` | **CLOSED** | Literal 12×6 matrix, concrete `A`/`N/A` cells, derived-HEAD/zero-OPTIONS policy, exact 592 arithmetic, seed `9009001`, and ten separate positives are frozen. |
| `UXE-12` | **OPEN** | All structural/command/review requirements are now present, but E4/E5 retain four non-literal exclusive-path tokens. |

## Verdict

**REQUEST_CHANGES.** Prefix the four E4/E5 filenames with their full repository-relative paths; then `UXE-12` can close without reopening any other finding.
