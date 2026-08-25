import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { MigrationConfig } from "drizzle-orm/migrator";

export const MIGRATIONS_FOLDER_NAME = "drizzle";
export const MIGRATIONS_SCHEMA = "drizzle";
export const MIGRATIONS_TABLE = "__drizzle_migrations";

export function resolveMigrationsFolder(moduleUrl: string): string {
  const moduleDirectory = dirname(fileURLToPath(moduleUrl));
  return join(dirname(moduleDirectory), MIGRATIONS_FOLDER_NAME);
}

export function createMigrationConfig(moduleUrl: string): MigrationConfig {
  return {
    migrationsFolder: resolveMigrationsFolder(moduleUrl),
    migrationsSchema: MIGRATIONS_SCHEMA,
    migrationsTable: MIGRATIONS_TABLE,
  };
}

export const migrationConfig = createMigrationConfig(import.meta.url);
