import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { readMigrationFiles, type MigrationConfig, type MigrationMeta } from "drizzle-orm/migrator";

import { migrationConfig } from "./migration-config.js";
import type { MigrationClient } from "./migrate.js";

export const FOUNDATION_MIGRATION_HASH =
  "645229b04fc4eddd44d47301d47f1efbd394daa6c97852c3ea4a3cbb26df23c2";
export const CHANNEL_STREAM_MIGRATION_HASH =
  "e44f52f786360ac502c0d928cebaebdca718abdd39ae2e78275b9d21505aef26";

const frozenArtifactHashes = new Map<string, string>([
  ["0000_aw008_foundation.sql", FOUNDATION_MIGRATION_HASH],
  ["0001_aw010a_channel_stream.sql", CHANNEL_STREAM_MIGRATION_HASH],
  ["meta/0000_snapshot.json", "2dbb8666e9f74ba19e1faa4d3df0309db2a5d29f65aaa6648e399070cbe23fc1"],
  ["meta/0001_snapshot.json", "f118e261f89cd9e6d4faefa23c972c5bd4fc84dc5a14d9cca77cbf2b642751d2"],
  ["meta/_journal.json", "70c038f3554c6b0e9eeb3bf429920d4a20c5cdfb7e6d2d02e43ccbbcc5520762"],
]);

export interface AppliedMigration {
  createdAt: number;
  hash: string;
}

export interface MigrationLedgerComparison {
  appliedCount: number;
  pendingCount: number;
}

export interface MigrationIntegrityResult extends MigrationLedgerComparison {
  ledgerPresent: boolean;
  bootstrapBoundary: boolean;
}

export class MigrationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationIntegrityError";
  }
}

export class MigrationArgumentsError extends Error {
  constructor(message = "Invalid migration arguments") {
    super(message);
    this.name = "MigrationArgumentsError";
  }
}

function assertMigrationHash(hash: unknown, context: string): asserts hash is string {
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) {
    throw new MigrationIntegrityError(`${context} has an invalid hash`);
  }
}

function assertLocalMigrations(localMigrations: readonly MigrationMeta[]): void {
  let previousTimestamp: number | undefined;
  const timestamps = new Set<number>();

  for (const migration of localMigrations) {
    if (!Number.isSafeInteger(migration.folderMillis) || migration.folderMillis < 0) {
      throw new MigrationIntegrityError("Local migration has an invalid created-at timestamp");
    }
    assertMigrationHash(migration.hash, "Local migration");

    if (timestamps.has(migration.folderMillis)) {
      throw new MigrationIntegrityError("Local migration has a duplicate created-at timestamp");
    }
    if (previousTimestamp !== undefined && migration.folderMillis <= previousTimestamp) {
      throw new MigrationIntegrityError("Local migration created-at timestamps are out of order");
    }

    timestamps.add(migration.folderMillis);
    previousTimestamp = migration.folderMillis;
  }
}

function assertAppliedMigrations(appliedMigrations: readonly AppliedMigration[]): void {
  let previousTimestamp: number | undefined;
  const timestamps = new Set<number>();

  for (const migration of appliedMigrations) {
    if (!Number.isSafeInteger(migration.createdAt) || migration.createdAt < 0) {
      throw new MigrationIntegrityError("Applied migration has an invalid created-at timestamp");
    }
    assertMigrationHash(migration.hash, "Applied migration");

    if (timestamps.has(migration.createdAt)) {
      throw new MigrationIntegrityError("Applied migration ledger has a duplicate entry");
    }
    if (previousTimestamp !== undefined && migration.createdAt <= previousTimestamp) {
      throw new MigrationIntegrityError("Applied migration ledger is out of order");
    }

    timestamps.add(migration.createdAt);
    previousTimestamp = migration.createdAt;
  }
}

export function compareMigrationLedger(
  localMigrations: readonly MigrationMeta[],
  appliedMigrations: readonly AppliedMigration[],
  requireAllApplied = false,
): MigrationLedgerComparison {
  assertLocalMigrations(localMigrations);
  assertAppliedMigrations(appliedMigrations);

  const localByTimestamp = new Map(
    localMigrations.map((migration, index) => [migration.folderMillis, { migration, index }]),
  );

  for (const applied of appliedMigrations) {
    const local = localByTimestamp.get(applied.createdAt);
    if (local === undefined) {
      throw new MigrationIntegrityError("Applied migration has an unknown created-at timestamp");
    }
    if (local.migration.hash !== applied.hash) {
      throw new MigrationIntegrityError("Applied migration hash does not match the local file");
    }
  }

  for (const [index, applied] of appliedMigrations.entries()) {
    if (localMigrations[index]?.folderMillis !== applied.createdAt) {
      throw new MigrationIntegrityError("An earlier applied migration is missing from the ledger");
    }
  }

  const pendingCount = localMigrations.length - appliedMigrations.length;
  if (requireAllApplied && pendingCount !== 0) {
    throw new MigrationIntegrityError(
      "Post-migration ledger still has pending or missing migrations",
    );
  }

  return { appliedCount: appliedMigrations.length, pendingCount };
}

function parseCreatedAt(value: unknown): number {
  let createdAt: number;
  if (typeof value === "number") {
    createdAt = value;
  } else if (typeof value === "bigint") {
    createdAt = Number(value);
  } else if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) {
    createdAt = Number(value);
  } else {
    throw new MigrationIntegrityError("Migration ledger row has an invalid created-at timestamp");
  }

  if (!Number.isSafeInteger(createdAt) || createdAt < 0) {
    throw new MigrationIntegrityError("Migration ledger row has an invalid created-at timestamp");
  }
  return createdAt;
}

function parseLedgerRows(rows: readonly Record<string, unknown>[]): AppliedMigration[] {
  return rows.map((row) => {
    const createdAt = parseCreatedAt(row.created_at);
    assertMigrationHash(row.hash, "Migration ledger row");
    return { createdAt, hash: row.hash };
  });
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new MigrationIntegrityError("Migration ledger configuration has an invalid identifier");
  }
  return `"${identifier}"`;
}

export interface VerifyMigrationIntegrityOptions {
  allowMissingLedger: boolean;
  requireAllApplied: boolean;
  readMigrations?: (config: MigrationConfig) => MigrationMeta[];
}

export async function verifyMigrationIntegrity(
  client: Pick<MigrationClient, "query">,
  config: MigrationConfig,
  options: VerifyMigrationIntegrityOptions,
): Promise<MigrationIntegrityResult> {
  const readMigrations = options.readMigrations ?? readMigrationFiles;
  const localMigrations = readMigrations(config);
  assertLocalMigrations(localMigrations);

  const migrationsSchema = config.migrationsSchema ?? "drizzle";
  const migrationsTable = config.migrationsTable ?? "__drizzle_migrations";
  const qualifiedLedger = `${migrationsSchema}.${migrationsTable}`;
  const ledgerLookup = await client.query("SELECT to_regclass($1)::text AS ledger", [
    qualifiedLedger,
  ]);
  const ledger = ledgerLookup.rows[0]?.ledger;

  if (ledger === null) {
    if (!options.allowMissingLedger) {
      throw new MigrationIntegrityError("Migration ledger is absent after migration");
    }
    const comparison = compareMigrationLedger(localMigrations, [], options.requireAllApplied);
    return {
      ledgerPresent: false,
      bootstrapBoundary: true,
      ...comparison,
    };
  }
  if (typeof ledger !== "string" || ledger !== qualifiedLedger) {
    throw new MigrationIntegrityError("Migration ledger lookup returned an invalid result");
  }

  const schemaIdentifier = quoteIdentifier(migrationsSchema);
  const tableIdentifier = quoteIdentifier(migrationsTable);
  const ledgerRows = await client.query(
    `SELECT created_at, hash FROM ${schemaIdentifier}.${tableIdentifier} ORDER BY created_at ASC`,
  );
  const comparison = compareMigrationLedger(
    localMigrations,
    parseLedgerRows(ledgerRows.rows),
    options.requireAllApplied,
  );

  return {
    ledgerPresent: true,
    bootstrapBoundary: false,
    ...comparison,
  };
}

function collectArtifactPaths(root: string, directory = root): string[] {
  try {
    const directoryStatus = lstatSync(directory);
    if (directoryStatus.isSymbolicLink() || !directoryStatus.isDirectory()) {
      throw new MigrationIntegrityError("Migration folder has an invalid artifact topology");
    }

    const paths: string[] = [];
    for (const name of readdirSync(directory)) {
      const absolutePath = join(directory, name);
      const status = lstatSync(absolutePath);
      if (status.isSymbolicLink()) {
        throw new MigrationIntegrityError("Migration folder has an invalid artifact topology");
      }
      if (status.isDirectory()) {
        paths.push(...collectArtifactPaths(root, absolutePath));
      } else if (status.isFile() && status.nlink === 1) {
        paths.push(relative(root, absolutePath));
      } else {
        throw new MigrationIntegrityError("Migration folder has an invalid artifact topology");
      }
    }
    return paths;
  } catch (error) {
    if (error instanceof MigrationIntegrityError) throw error;
    throw new MigrationIntegrityError("Migration folder topology could not be verified");
  }
}

export function checkLocalMigrationFiles(config: MigrationConfig = migrationConfig): {
  migrationCount: number;
  hashes: string[];
} {
  const actualPaths = collectArtifactPaths(config.migrationsFolder).sort();
  const expectedPaths = [...frozenArtifactHashes.keys()].sort();
  if (
    actualPaths.length !== expectedPaths.length ||
    actualPaths.some((path, index) => path !== expectedPaths[index])
  ) {
    throw new MigrationIntegrityError("Migration folder does not contain the exact artifact set");
  }

  for (const [path, expectedHash] of frozenArtifactHashes) {
    const actualHash = createHash("sha256")
      .update(readFileSync(join(config.migrationsFolder, path)))
      .digest("hex");
    if (actualHash !== expectedHash) {
      throw new MigrationIntegrityError(`Migration artifact hash mismatch: ${path}`);
    }
  }

  const migrations = readMigrationFiles(config);
  assertLocalMigrations(migrations);
  if (
    migrations.length !== 2 ||
    migrations[0]?.hash !== FOUNDATION_MIGRATION_HASH ||
    migrations[1]?.hash !== CHANNEL_STREAM_MIGRATION_HASH
  ) {
    throw new MigrationIntegrityError("Migration journal does not describe the frozen prefix");
  }

  return { migrationCount: migrations.length, hashes: migrations.map(({ hash }) => hash) };
}

export function parseMigrationIntegrityArguments(arguments_: readonly string[]): "check-files" {
  if (arguments_.length !== 1 || arguments_[0] !== "--check-files") {
    throw new MigrationArgumentsError();
  }
  return "check-files";
}

interface MigrationIntegrityCliDependencies {
  checkFiles: () => unknown | Promise<unknown>;
}

interface DiagnosticLogger {
  error(message: string): void;
}

export async function runMigrationIntegrityCli(
  arguments_: readonly string[],
  dependencyOverrides: Partial<MigrationIntegrityCliDependencies> = {},
  logger: DiagnosticLogger = console,
): Promise<number> {
  try {
    parseMigrationIntegrityArguments(arguments_);
  } catch {
    logger.error("migration-integrity: invalid arguments");
    return 2;
  }

  try {
    await (dependencyOverrides.checkFiles ?? checkLocalMigrationFiles)();
    return 0;
  } catch {
    logger.error("migration-integrity: failed");
    return 1;
  }
}

function isExecutedModule(moduleUrl: string, executablePath: string | undefined): boolean {
  if (executablePath === undefined) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(executablePath);
  } catch {
    return false;
  }
}

if (isExecutedModule(import.meta.url, process.argv[1])) {
  process.exitCode = await runMigrationIntegrityCli(process.argv.slice(2));
}
