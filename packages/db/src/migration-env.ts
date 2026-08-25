export const migrationTargetClasses = [
  "testcontainer",
  "local-compose",
  "managed-production",
] as const;

export type MigrationTargetClass = (typeof migrationTargetClasses)[number];

export interface MigrationEnvironment {
  databaseUrl: string;
  targetClass: MigrationTargetClass;
}

export class MigrationEnvironmentError extends Error {
  constructor(field: "MIGRATION_DATABASE_URL" | "MIGRATION_TARGET_CLASS") {
    super(`Invalid migration environment: ${field}`);
    this.name = "MigrationEnvironmentError";
  }
}

function parseDatabaseUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new MigrationEnvironmentError("MIGRATION_DATABASE_URL");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new MigrationEnvironmentError("MIGRATION_DATABASE_URL");
  }

  if (
    (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") ||
    parsed.hostname.length === 0 ||
    parsed.pathname.length <= 1
  ) {
    throw new MigrationEnvironmentError("MIGRATION_DATABASE_URL");
  }

  return value;
}

function parseTargetClass(value: unknown): MigrationTargetClass {
  if (
    typeof value !== "string" ||
    !migrationTargetClasses.includes(value as MigrationTargetClass)
  ) {
    throw new MigrationEnvironmentError("MIGRATION_TARGET_CLASS");
  }
  return value as MigrationTargetClass;
}

export function parseMigrationEnvironment(
  environment: Readonly<Record<string, unknown>>,
): MigrationEnvironment {
  return {
    databaseUrl: parseDatabaseUrl(environment.MIGRATION_DATABASE_URL),
    targetClass: parseTargetClass(environment.MIGRATION_TARGET_CLASS),
  };
}
