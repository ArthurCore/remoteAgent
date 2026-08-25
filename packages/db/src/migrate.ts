import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as drizzleMigrate } from "drizzle-orm/node-postgres/migrator";
import type { MigrationConfig } from "drizzle-orm/migrator";
import type { PoolClient } from "pg";
import { Pool } from "pg";

import { migrationConfig } from "./migration-config.js";
import {
  MigrationArgumentsError,
  checkLocalMigrationFiles,
  verifyMigrationIntegrity,
} from "./migration-integrity.js";
import { parseMigrationEnvironment, type MigrationEnvironment } from "./migration-env.js";

export { MigrationArgumentsError } from "./migration-integrity.js";

export const MIGRATION_ADVISORY_LOCK_ID = 0x4157_008c;

export interface MigrationQueryResult {
  rows: readonly Record<string, unknown>[];
}

export interface MigrationClient {
  query(statement: string, parameters?: readonly unknown[]): Promise<MigrationQueryResult>;
  release(): void;
}

export interface MigrationPool {
  connect(): Promise<MigrationClient>;
  end(): Promise<void>;
}

export type MigrationIntegrityPhase = "pre" | "post";

export interface MigrationRunnerDependencies {
  checkFiles(config: MigrationConfig): unknown | Promise<unknown>;
  createPool(databaseUrl: string): MigrationPool;
  checkIntegrity(
    client: MigrationClient,
    config: MigrationConfig,
    phase: MigrationIntegrityPhase,
  ): Promise<unknown>;
  migrate(client: MigrationClient, config: MigrationConfig): Promise<void>;
}

function createPool(databaseUrl: string): MigrationPool {
  return new Pool({ connectionString: databaseUrl }) as unknown as MigrationPool;
}

async function checkIntegrity(
  client: MigrationClient,
  config: MigrationConfig,
  phase: MigrationIntegrityPhase,
): Promise<void> {
  await verifyMigrationIntegrity(client, config, {
    allowMissingLedger: phase === "pre",
    requireAllApplied: phase === "post",
  });
}

async function migrate(client: MigrationClient, config: MigrationConfig): Promise<void> {
  const database = drizzle(client as unknown as PoolClient);
  await drizzleMigrate(database, config);
}

const defaultDependencies: MigrationRunnerDependencies = {
  checkFiles: checkLocalMigrationFiles,
  createPool,
  checkIntegrity,
  migrate,
};

export function parseMigrationArguments(arguments_: readonly string[]): undefined {
  if (arguments_.length !== 0) {
    throw new MigrationArgumentsError();
  }
  return undefined;
}

function rememberFailure(failure: { present: boolean; reason: unknown }, reason: unknown): void {
  if (!failure.present) {
    failure.present = true;
    failure.reason = reason;
  }
}

async function runParsedMigrations(
  environment: Readonly<MigrationEnvironment>,
  dependencyOverrides: Partial<MigrationRunnerDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const failure: { present: boolean; reason: unknown } = { present: false, reason: undefined };

  let pool: MigrationPool | undefined;
  let client: MigrationClient | undefined;
  let lockAcquired = false;

  try {
    await dependencies.checkFiles(migrationConfig);
    pool = dependencies.createPool(environment.databaseUrl);
    client = await pool.connect();
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_ADVISORY_LOCK_ID]);
    lockAcquired = true;

    await dependencies.checkIntegrity(client, migrationConfig, "pre");
    await dependencies.migrate(client, migrationConfig);
    await dependencies.checkIntegrity(client, migrationConfig, "post");
  } catch (error) {
    rememberFailure(failure, error);
  }

  if (client !== undefined) {
    if (lockAcquired) {
      try {
        const unlockResult = await client.query("SELECT pg_advisory_unlock($1) AS unlocked", [
          MIGRATION_ADVISORY_LOCK_ID,
        ]);
        if (unlockResult.rows[0]?.unlocked !== true) {
          throw new Error("Migration advisory lock was not released");
        }
      } catch (error) {
        rememberFailure(failure, error);
      }
    }

    try {
      client.release();
    } catch (error) {
      rememberFailure(failure, error);
    }
  }

  if (pool !== undefined) {
    try {
      await pool.end();
    } catch (error) {
      rememberFailure(failure, error);
    }
  }

  if (failure.present) throw failure.reason;
}

export async function runMigrations(
  environment: Readonly<Record<string, unknown>>,
  dependencyOverrides: Partial<MigrationRunnerDependencies> = {},
): Promise<void> {
  const parsedEnvironment = parseMigrationEnvironment(environment);
  await runParsedMigrations(parsedEnvironment, dependencyOverrides);
}

interface DiagnosticLogger {
  error(message: string): void;
}

export async function runMigrationCli(
  arguments_: readonly string[],
  environment: Readonly<Record<string, unknown>>,
  dependencyOverrides: Partial<MigrationRunnerDependencies> = {},
  logger: DiagnosticLogger = console,
): Promise<number> {
  let parsedEnvironment: MigrationEnvironment;
  try {
    parseMigrationArguments(arguments_);
    parsedEnvironment = parseMigrationEnvironment(environment);
  } catch {
    logger.error("migration: invalid arguments or environment");
    return 2;
  }

  try {
    await runParsedMigrations(parsedEnvironment, dependencyOverrides);
    return 0;
  } catch {
    logger.error("migration: failed");
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
  process.exitCode = await runMigrationCli(process.argv.slice(2), process.env);
}
