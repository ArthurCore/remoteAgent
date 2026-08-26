PASS

# AW-010A S5 Specification Re-review — xhigh

**Verdict:** **PASS.** Against `HEAD 1293599`, the revised S5 candidate closes both prior blocking findings. I found no remaining specification deviation, test/checker weakening, scope expansion, migration change, or lock/dependency drift.

## Closure of prior findings

1. **Application rollback now proves committed pre-AW-010A code behavior after the additive migration.** `writePreAw010aApplicationFixture` contains exactly the five old-foundation insert targets `tenants`, `workspaces`, `principals`, `workspace_memberships`, and `channels`; it contains no stream-table or membership-marker identifier. The test runs that helper only after the full migration and commits it through `withCommittedTransaction`, then reads every legacy row back. It also proves the additive channel trigger created exactly one sequence-state row with `last_event_seq = 0` and that the journal remains empty (`events = 0`). The boundary is honest: the released pre-AW-010A product had no channel/membership writer, so this is explicitly an old-code/old-table compatibility probe rather than a claim that a historical product membership write path existed.

2. **The wrong-tenant negative now isolates the tenant-leading event reference.** The test creates the same literal channel ID under tenant A and tenant B, proves both channel rows exist, and proves sequence `1` exists only as a `channel.member_joined` event under tenant B. It then inserts tenant A's membership against that same channel ID and sequence and requires SQLSTATE `23503` from exact constraint `channel_membership_epochs_joined_event_fk`. A defective `(channel_id, event_seq)`-only reference would accept this fixture, so rejection independently proves the tenant dimension.

## Preserved specification surface

- The implementation workspace remains exactly the seven S5-owned paths: the new focused suite; the Vitest config; the retained 5/10/10 integration suites; the PostgreSQL evidence helper; and the cumulative checker. This review is the only additional path.
- The focused suite retains exactly 24 unique, ordered, literal `AW010A-S5` names with no inventory change. The integration project remains the exact frozen four-file list, for a cumulative 49-test inventory.
- The checker now byte-freezes all six non-checker S5 files at their current SHA-256 values and includes semantic tokens for both corrected oracles. Its S5 delta remains additive, and the whole checker diff is `238` additions / `0` deletions.
- No SQL, Drizzle metadata, migration-integrity source, package manifest, dependency, lockfile, workflow, application, or unrelated path changed.

## Verification

- `pnpm scaffold:check`: **PASS** — 114 required files, 9 workspace packages, 19 root scripts, 6 migration tables.
- Independent current-file audit: all six checker SHA-256 oracles match; exactly 24 unique prefixed S5 test names are present.
- `git diff --check`: **PASS**.
- A fresh focused integration attempt could not start because this reviewer environment had no working container runtime; Vitest reported all 24 tests skipped after harness setup failed. This is an infrastructure limitation, not acceptance evidence. The supplied parent evidence records the complete DB integration gate at **49/49** and uncached root CI as green on this candidate.

No implementation edit or commit was made by this reviewer.
