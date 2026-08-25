# AW-008C Migration Runner Quality/Security Review — xhigh

## Scope and evidence

- Reviewed HEAD `bd43a50efd106605e9ab6de927970ce440f0072f` plus the exact 11 untracked AW-008C paths; the independent specification report remains `PASS`. No implementation, generated artifact, test, manifest, prior review, or database was changed by this review.
- Current verification passes: focused `migration.spec.ts` **47/47**, root `pnpm db:check`, and `git diff --check`. These gates do not exercise the three adversarial seams below.
- Recovered probe `proc_a4733af9ecf0`: `checkLocalMigrationFiles` returned `migrationCount:1` and the frozen foundation hash for a migration-root symlink, an expected SQL symlink to an external canonical file, and an expected SQL hardlink.
- Recovered probe `proc_8b1442e8453d`: a getter-backed environment was read twice; validation observed the first URL, Pool construction received the second, rc was 1, and the only diagnostic was `migration: failed`.

## Severity ledger

| ID | Severity | Exact location | Finding | Required disposition |
|---|---|---|---|---|
| H1 | HIGH | `packages/db/src/migrate.ts:64-68,84-104`; `migration-integrity.ts:241-269` | `db:migrate` never runs the frozen exact-file/hash gate | Fix before commit |
| M1 | MEDIUM | `packages/db/src/migration-integrity.ts:226-269` | Exact-file checker accepts filesystem aliases/hardlinks | Fix before commit |
| L1 | LOW | `packages/db/src/migrate.ts:84-89,145-160` | CLI validates and then reparses a mutable public environment seam | Fix with H1/M1 |

Totals: **BLOCKER 0 / HIGH 1 / MEDIUM 1 / LOW 1**.

## H1 — Migration execution is not bound to the frozen artifact set

`runMigrations` creates the Pool, locks, calls `verifyMigrationIntegrity`, migrates, and rechecks the ledger. `verifyMigrationIntegrity` uses `readMigrationFiles` plus ledger state; it does not enforce the frozen SQL/journal/snapshot hashes or reject extra artifacts. On a fresh database the intentionally allowed absent ledger therefore provides no trusted hash to stop drifted pending SQL before it executes with migrator DDL authority. A separate CI `db:check` is not a fail-closed control against post-check packaging or deployment drift.

Exact code fix:

1. Add `checkFiles(config: MigrationConfig): unknown | Promise<unknown>` to `MigrationRunnerDependencies`; wire its default to `checkLocalMigrationFiles`.
2. Invoke `await dependencies.checkFiles(migrationConfig)` inside runner failure handling but before `createPool`, `connect`, advisory SQL, or Drizzle SQL.
3. Keep the existing locked pre/post ledger comparisons: the local frozen gate and database ledger gate protect different boundaries.

Exact tests in `migration.spec.ts`:

- Extend the orchestration event oracle to begin `files,pool,connect,lock,pre,migrate,post,...`.
- Inject a rejecting `checkFiles`; assert Pool construction, connect, integrity checks, migrate, unlock, release, and end are all untouched, the primary error survives, and CLI returns rc1 with only the generic diagnostic.
- Retain the real offline checker test so the injected runner seam is paired with real frozen-byte coverage; no real database is needed.

## M1 — “Exact immutable files” accepts aliases

`readdirSync(..., {withFileTypes:true})` records non-file entries by name and `readFileSync` follows them. Thus a root symlink or correctly named SQL symlink can pass by resolving outside the folder; a hardlink is reported as a regular file and can pass with `nlink > 1`. Matching bytes at one instant do not establish the required path-local immutable topology.

Exact code fix:

1. Use `lstatSync` on the configured root and every traversed node; require the root/subdirectories to be real directories, reject every symbolic or other non-regular artifact, and require expected files to be regular files with `nlink === 1`.
2. Preserve the sorted exact relative-path set, all three frozen SHA-256 checks, and the one-entry Drizzle journal check; emit only generic/path-safe integrity errors.
3. Add temporary-copy regressions that reject the recovered root symlink, external canonical SQL symlink, and canonical SQL hardlink while an ordinary copied tree still passes.

## L1 — Environment parse/check-use split

`runMigrationCli` parses the raw record for rc2 classification, then `runMigrations` parses it again. Normal `process.env` is stable, so this is low severity, and diagnostics remained secret-safe; nevertheless the exported record seam permits endpoint substitution after validation.

Exact code/test fix: parse once in `runMigrationCli`, pass the resulting `MigrationEnvironment` to a parsed internal orchestrator, and keep `runMigrations(raw, ...)` as a one-parse wrapper if its public seam is retained. Re-run the getter probe and assert one read, the first URL reaches `createPool`, and diagnostics remain generic.

## Confirmed non-findings and accepted boundaries

- URL protocol/host/database and exact target-class validation, no `DATABASE_URL` fallback, field-only diagnostics, fixed/quoted ledger identifiers, safe-integer timestamp parsing, ordered hash comparison, and realpath main guards are sound.
- A completed blocking `pg_advisory_lock` query is sufficient acquisition evidence; unlock requires literal `true`. Drizzle supports a `PoolClient`, and cleanup attempts unlock → release → Pool end while preserving the first failure.
- A same-principal writer can still race regular-file replacement between checking and Drizzle's later read; this is accepted only at the immutable/read-only release-image boundary because such a writer can also alter executable code. H1/M1 still close accidental/post-check drift and alias substitution.
- Unbounded hostile-tree traversal, hung network cleanup, and SIGKILL cleanup are accepted one-shot build/deploy availability boundaries, not durability guarantees. Native Windows path separators are outside the current POSIX CI/container topology; normalize relative paths before claiming native Windows support.
- Real PostgreSQL lock serialization, transactional partial-failure rollback, bootstrap privileges, second-run no-op, and resource cleanup remain AW-008D's blocking integration scope; none is demanded from C's injected unit seams.

AW-008C is not commit-safe unchanged because H1 permits unfrozen pending SQL to reach a fresh database and M1 weakens the checker intended to close that boundary.

Verdict: REQUEST_CHANGES
