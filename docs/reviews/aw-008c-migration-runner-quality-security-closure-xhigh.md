# AW-008C Migration Runner Quality/Security Closure — xhigh

## Scope

- Closure review only for H1/M1/L1 from `aw-008c-migration-runner-quality-security-review-xhigh.md`, against HEAD `bd43a50` plus the current AW-008C paths.
- The independent specification verdict remains `PASS`; AW-008D's real-PostgreSQL obligations remain out of scope.
- No source, test, generated artifact, prior review, manifest, or database was changed by this closure.

## Closure ledger

| ID | Original | Status | Remaining severity |
|---|---:|---|---:|
| H1 | HIGH | RESOLVED | NONE |
| M1 | MEDIUM | RESOLVED | NONE |
| L1 | LOW | RESOLVED | NONE |

## H1 — frozen artifacts now gate migration execution

**RESOLVED.** `MigrationRunnerDependencies.checkFiles` is mandatory at `packages/db/src/migrate.ts:38-47`, and the production default is `checkLocalMigrationFiles` at `:69-74`. The parsed orchestrator awaits it at `:90-103`, before `createPool` at `:103`, `connect` at `:104`, and every advisory, ledger, or Drizzle query at `:105-110`.

Failure remains inside the primary-failure path at `migrate.ts:101-145`. The event oracle begins `files,pool,connect,lock,pre,migrate,post` (`migration.spec.ts:561-615`); a rejecting check preserves the exact error and touches no Pool, client, query, migrator, release, or end seam (`:637-652`). The CLI regression returns rc1 with only `migration: failed` and never constructs the Pool (`:286-312`).

Remaining severity: **NONE**.

## M1 — aliases and hardlinks are rejected

**RESOLVED.** `collectArtifactPaths` uses `lstatSync` on the configured root and every traversed node, requires real directories, rejects symlinks/other node types, and accepts only regular files with `nlink === 1` (`migration-integrity.ts:226-253`). It retains the sorted exact relative-path comparison and all frozen hashes (`:255-275`) plus the one-entry journal/foundation assertion (`:277-283`). Errors expose only generic topology text or frozen relative artifact paths.

The focused regressions prove an ordinary copy passes, while a root symlink, external canonical-SQL symlink, and canonical-SQL hardlink reject; both external-file cases remain byte-unchanged (`migration.spec.ts:773-825`). The recovered alias probe is therefore closed.

The `nlink === 1` hardlink policy is accepted for the stated POSIX CI/container topology; this closure makes no native-Windows claim. The previously accepted same-principal regular-file replacement race between check and later Drizzle read remains an immutable/read-only release-image boundary, not an open M1.

Remaining severity: **NONE**.

## L1 — environment is parsed once per entry path

**RESOLVED.** The internal orchestrator consumes `MigrationEnvironment` directly (`migrate.ts:90-145`). Public `runMigrations` parses raw input once and delegates (`:147-153`); `runMigrationCli` parses once for rc2 classification and passes that same value directly to the orchestrator (`:159-179`).

The recovered getter probe now observes exactly one URL read, passes the first URL to `createPool`, returns rc1, and emits only the generic diagnostic (`migration.spec.ts:314-343`).

Remaining severity: **NONE**.

## Verification and disposition

- Focused migration suite: **55/55 PASS**; DB unit suite: **64/64 PASS**; root unit run: **10/10 Turbo tasks PASS**.
- `db:check` (contracts artifact check, Drizzle Kit check, and real offline checker), DB typecheck, DB lint, root Prettier, root build, root clean, and `git diff --check`: **PASS**; generated `dist` is absent after clean.
- Remaining totals: **BLOCKER 0 / HIGH 0 / MEDIUM 0 / LOW 0**. No H1/M1/L1 condition remains open; the change is commit-safe within this closure's scope.

Verdict: APPROVED
