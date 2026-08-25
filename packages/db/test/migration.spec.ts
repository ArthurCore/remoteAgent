import { createHash } from "node:crypto";
import {
  cpSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { MigrationMeta } from "drizzle-orm/migrator";
import { describe, expect, it, vi } from "vitest";

import drizzleKitConfig from "../drizzle.config.js";
import {
  MIGRATIONS_FOLDER_NAME,
  MIGRATIONS_SCHEMA,
  MIGRATIONS_TABLE,
  createMigrationConfig,
  migrationConfig,
  resolveMigrationsFolder,
} from "../src/migration-config.js";
import {
  MigrationEnvironmentError,
  migrationTargetClasses,
  parseMigrationEnvironment,
} from "../src/migration-env.js";
import {
  CHANNEL_STREAM_MIGRATION_HASH,
  FOUNDATION_MIGRATION_HASH,
  MigrationIntegrityError,
  checkLocalMigrationFiles,
  compareMigrationLedger,
  parseMigrationIntegrityArguments,
  runMigrationIntegrityCli,
  verifyMigrationIntegrity,
  type AppliedMigration,
} from "../src/migration-integrity.js";
import {
  MIGRATION_ADVISORY_LOCK_ID,
  MigrationArgumentsError,
  parseMigrationArguments,
  runMigrationCli,
  runMigrations,
  type MigrationClient,
  type MigrationPool,
  type MigrationRunnerDependencies,
} from "../src/migrate.js";

const packageDirectory = join(import.meta.dirname, "..");
const expectedTableNames = [
  "channel_membership_epochs",
  "channels",
  "principals",
  "tenants",
  "workspace_memberships",
  "workspaces",
] as const;
const validMigrationEnvironment = {
  MIGRATION_DATABASE_URL: "postgresql://migrator:unit-secret@db.invalid/workspace",
  MIGRATION_TARGET_CLASS: "testcontainer",
} as const;

function hash(character: string): string {
  return character.repeat(64);
}

function localMigration(createdAt: number, migrationHash: string): MigrationMeta {
  return {
    sql: ["SELECT 1"],
    folderMillis: createdAt,
    hash: migrationHash,
    bps: true,
  };
}

function appliedMigration(createdAt: number, migrationHash: string): AppliedMigration {
  return { createdAt, hash: migrationHash };
}

function queryResult(rows: readonly Record<string, unknown>[] = []) {
  return { rows };
}

function withTemporaryMigrationCopy(
  assertions: (paths: { copiedFolder: string; temporaryDirectory: string }) => void,
): void {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "aw008-migrations-"));
  const copiedFolder = join(temporaryDirectory, "drizzle");
  try {
    cpSync(migrationConfig.migrationsFolder, copiedFolder, { recursive: true });
    assertions({ copiedFolder, temporaryDirectory });
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

describe("AW-008C fixed migration configuration", () => {
  it("pins the Kit folder, schema source, ledger schema, and ledger table", () => {
    expect(drizzleKitConfig).toEqual({
      dialect: "postgresql",
      schema: "./src/schema/index.ts",
      out: "./drizzle",
      breakpoints: true,
      migrations: {
        schema: "drizzle",
        table: "__drizzle_migrations",
      },
    });
    expect(MIGRATIONS_FOLDER_NAME).toBe("drizzle");
    expect(MIGRATIONS_SCHEMA).toBe("drizzle");
    expect(MIGRATIONS_TABLE).toBe("__drizzle_migrations");
  });

  it("resolves the same package-relative folder from source and compiled module layouts", () => {
    expect(resolveMigrationsFolder(pathToFileURL("/repo/packages/db/src/migrate.ts").href)).toBe(
      "/repo/packages/db/drizzle",
    );
    expect(resolveMigrationsFolder(pathToFileURL("/app/packages/db/dist/migrate.js").href)).toBe(
      "/app/packages/db/drizzle",
    );
    expect(createMigrationConfig(pathToFileURL("/app/packages/db/dist/migrate.js").href)).toEqual({
      migrationsFolder: "/app/packages/db/drizzle",
      migrationsSchema: "drizzle",
      migrationsTable: "__drizzle_migrations",
    });
    expect(migrationConfig.migrationsFolder).toBe(join(packageDirectory, "drizzle"));
  });
});

describe("migration-only environment", () => {
  it.each([
    ["missing URL", { MIGRATION_TARGET_CLASS: "testcontainer" }, "MIGRATION_DATABASE_URL"],
    [
      "empty URL",
      { MIGRATION_DATABASE_URL: "  ", MIGRATION_TARGET_CLASS: "testcontainer" },
      "MIGRATION_DATABASE_URL",
    ],
    [
      "malformed URL",
      {
        MIGRATION_DATABASE_URL: "postgresql://migrator:do-not-print@",
        MIGRATION_TARGET_CLASS: "testcontainer",
      },
      "MIGRATION_DATABASE_URL",
    ],
    [
      "missing target class",
      { MIGRATION_DATABASE_URL: "postgresql://migrator@db.invalid/workspace" },
      "MIGRATION_TARGET_CLASS",
    ],
    [
      "empty target class",
      {
        MIGRATION_DATABASE_URL: "postgresql://migrator@db.invalid/workspace",
        MIGRATION_TARGET_CLASS: "",
      },
      "MIGRATION_TARGET_CLASS",
    ],
    [
      "unknown target class",
      {
        MIGRATION_DATABASE_URL: "postgresql://migrator@db.invalid/workspace",
        MIGRATION_TARGET_CLASS: "production",
      },
      "MIGRATION_TARGET_CLASS",
    ],
  ])("rejects $0 without disclosing values", (_name, input, expectedField) => {
    let thrown: unknown;
    try {
      parseMigrationEnvironment(input);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(MigrationEnvironmentError);
    expect(String(thrown)).toContain(expectedField);
    expect(String(thrown)).not.toContain("do-not-print");
    expect(String(thrown)).not.toContain("postgresql://");
  });

  it.each(migrationTargetClasses)("accepts the exact %s target class", (targetClass) => {
    expect(
      parseMigrationEnvironment({
        ...validMigrationEnvironment,
        MIGRATION_TARGET_CLASS: targetClass,
        UNRELATED_ENVIRONMENT_VALUE: "ignored",
      }),
    ).toEqual({
      databaseUrl: validMigrationEnvironment.MIGRATION_DATABASE_URL,
      targetClass,
    });
  });

  it("never reads or falls back to runtime DATABASE_URL", () => {
    expect(() =>
      parseMigrationEnvironment({
        DATABASE_URL: "postgresql://runtime:runtime-secret@runtime.invalid/workspace",
        MIGRATION_TARGET_CLASS: "testcontainer",
      }),
    ).toThrow(/MIGRATION_DATABASE_URL/);

    expect(
      parseMigrationEnvironment({
        ...validMigrationEnvironment,
        DATABASE_URL: "postgresql://runtime:runtime-secret@runtime.invalid/workspace",
      }).databaseUrl,
    ).toBe(validMigrationEnvironment.MIGRATION_DATABASE_URL);
  });
});

describe("migration CLI parsing and secret-safe diagnostics", () => {
  it("accepts no runner arguments and rejects every extra argument", () => {
    expect(parseMigrationArguments([])).toBeUndefined();
    for (const arguments_ of [["--help"], ["--check-files"], ["unexpected", "extra"]]) {
      expect(() => parseMigrationArguments(arguments_)).toThrow(MigrationArgumentsError);
    }
  });

  it("requires exactly --check-files for the offline integrity CLI", () => {
    expect(parseMigrationIntegrityArguments(["--check-files"])).toBe("check-files");
    for (const arguments_ of [[], ["--help"], ["--check-files", "extra"], ["--unknown"]]) {
      expect(() => parseMigrationIntegrityArguments(arguments_)).toThrow(MigrationArgumentsError);
    }
  });

  it("returns rc2 for invalid arguments without invoking either operation", async () => {
    const createPool = vi.fn();
    const checkFiles = vi.fn();
    const diagnostics: string[] = [];
    const logger = { error: (message: string) => diagnostics.push(message) };

    await expect(
      runMigrationCli(["--unknown"], validMigrationEnvironment, { createPool }, logger),
    ).resolves.toBe(2);
    await expect(runMigrationIntegrityCli(["--unknown"], { checkFiles }, logger)).resolves.toBe(2);
    expect(createPool).not.toHaveBeenCalled();
    expect(checkFiles).not.toHaveBeenCalled();
    expect(diagnostics.join("\n")).not.toContain(validMigrationEnvironment.MIGRATION_DATABASE_URL);
  });

  it("fails absent or invalid runner env before pool construction", async () => {
    const createPool = vi.fn();
    const diagnostics: string[] = [];

    await expect(
      runMigrationCli(
        [],
        { DATABASE_URL: validMigrationEnvironment.MIGRATION_DATABASE_URL },
        { createPool },
        {
          error: (message) => diagnostics.push(message),
        },
      ),
    ).resolves.toBe(2);
    expect(createPool).not.toHaveBeenCalled();
    expect(diagnostics.join("\n")).not.toContain(validMigrationEnvironment.MIGRATION_DATABASE_URL);
  });

  it("never includes a URL or secret from operational failures in diagnostics", async () => {
    const secretUrl = validMigrationEnvironment.MIGRATION_DATABASE_URL;
    const diagnostics: string[] = [];
    const createPool = vi.fn(() => {
      throw new Error(`connection failed for ${secretUrl}`);
    });

    await expect(
      runMigrationCli(
        [],
        validMigrationEnvironment,
        { createPool },
        {
          error: (message) => diagnostics.push(message),
        },
      ),
    ).resolves.toBe(1);
    expect(createPool).toHaveBeenCalledWith(secretUrl);
    expect(diagnostics.join("\n")).not.toContain(secretUrl);
    expect(diagnostics.join("\n")).not.toContain("unit-secret");
    expect(diagnostics).toEqual(["migration: failed"]);
  });

  it("runs the frozen file gate before pool construction and reports only a generic failure", async () => {
    const primaryFailure = new Error(
      `file check failed for ${validMigrationEnvironment.MIGRATION_DATABASE_URL}`,
    );
    const checkFiles = vi.fn(async () => {
      throw primaryFailure;
    });
    const createPool = vi.fn();
    const checkIntegrity = vi.fn();
    const migrate = vi.fn();
    const diagnostics: string[] = [];

    await expect(
      runMigrationCli(
        [],
        validMigrationEnvironment,
        { checkFiles, checkIntegrity, createPool, migrate },
        { error: (message) => diagnostics.push(message) },
      ),
    ).resolves.toBe(1);
    expect(checkFiles).toHaveBeenCalledTimes(1);
    expect(createPool).not.toHaveBeenCalled();
    expect(checkIntegrity).not.toHaveBeenCalled();
    expect(migrate).not.toHaveBeenCalled();
    expect(diagnostics).toEqual(["migration: failed"]);
    expect(diagnostics.join("\n")).not.toContain(validMigrationEnvironment.MIGRATION_DATABASE_URL);
  });

  it("reads a getter-backed migration URL once and passes that parsed value to the pool", async () => {
    const firstUrl = "postgresql://first:***@first.invalid/workspace";
    const secondUrl = "postgresql://second:***@second.invalid/workspace";
    let urlReads = 0;
    const environment = {
      get MIGRATION_DATABASE_URL(): string {
        urlReads += 1;
        return urlReads === 1 ? firstUrl : secondUrl;
      },
      MIGRATION_TARGET_CLASS: "testcontainer",
    };
    const createPool = vi.fn(() => {
      throw new Error(`connection failed for ${secondUrl}`);
    });
    const diagnostics: string[] = [];

    await expect(
      runMigrationCli(
        [],
        environment,
        { checkFiles: vi.fn(), createPool },
        { error: (message) => diagnostics.push(message) },
      ),
    ).resolves.toBe(1);
    expect(urlReads).toBe(1);
    expect(createPool).toHaveBeenCalledWith(firstUrl);
    expect(diagnostics).toEqual(["migration: failed"]);
    expect(diagnostics.join("\n")).not.toContain(firstUrl);
    expect(diagnostics.join("\n")).not.toContain(secondUrl);
  });

  it("runs only the real offline file check and reports deterministic status", async () => {
    const checkFiles = vi.fn();
    const diagnostics: string[] = [];

    await expect(
      runMigrationIntegrityCli(
        ["--check-files"],
        { checkFiles },
        {
          error: (message) => diagnostics.push(message),
        },
      ),
    ).resolves.toBe(0);
    expect(checkFiles).toHaveBeenCalledTimes(1);
    expect(diagnostics).toEqual([]);
  });
});

describe("ledger-to-file integrity comparison", () => {
  const first = localMigration(1_700_000_000_000, hash("a"));
  const second = localMigration(1_700_000_001_000, hash("b"));

  it("accepts exactly one matching applied migration and a complete no-op ledger", () => {
    expect(
      compareMigrationLedger([first], [appliedMigration(first.folderMillis, first.hash)]),
    ).toEqual({
      appliedCount: 1,
      pendingCount: 0,
    });
    expect(
      compareMigrationLedger(
        [first, second],
        [
          appliedMigration(first.folderMillis, first.hash),
          appliedMigration(second.folderMillis, second.hash),
        ],
        true,
      ),
    ).toEqual({ appliedCount: 2, pendingCount: 0 });
  });

  it("allows only a local unapplied suffix", () => {
    expect(
      compareMigrationLedger([first, second], [appliedMigration(first.folderMillis, first.hash)]),
    ).toEqual({ appliedCount: 1, pendingCount: 1 });
    expect(compareMigrationLedger([first, second], [])).toEqual({
      appliedCount: 0,
      pendingCount: 2,
    });
  });

  it("fails closed when an earlier applied ledger entry is missing", () => {
    expect(() =>
      compareMigrationLedger([first, second], [appliedMigration(second.folderMillis, second.hash)]),
    ).toThrow(/missing/i);
  });

  it("fails closed on hash drift", () => {
    expect(() =>
      compareMigrationLedger([first], [appliedMigration(first.folderMillis, hash("f"))]),
    ).toThrow(/hash/i);
  });

  it("fails closed on an unknown applied timestamp", () => {
    expect(() =>
      compareMigrationLedger([first], [appliedMigration(first.folderMillis + 1, first.hash)]),
    ).toThrow(/unknown/i);
  });

  it("fails closed on duplicate applied entries", () => {
    expect(() =>
      compareMigrationLedger(
        [first],
        [
          appliedMigration(first.folderMillis, first.hash),
          appliedMigration(first.folderMillis, first.hash),
        ],
      ),
    ).toThrow(/duplicate/i);
  });

  it("requires the post-migration ledger to contain every local migration", () => {
    expect(() =>
      compareMigrationLedger(
        [first, second],
        [appliedMigration(first.folderMillis, first.hash)],
        true,
      ),
    ).toThrow(/pending|missing/i);
  });

  it("rejects duplicate or non-increasing local migration timestamps", () => {
    expect(() => compareMigrationLedger([first, first], [])).toThrow(/local.*duplicate/i);
    expect(() => compareMigrationLedger([second, first], [])).toThrow(/order/i);
  });
});

describe("database integrity seam", () => {
  const local = [localMigration(1_700_000_000_000, hash("a"))];
  const readMigrations = vi.fn(() => local);

  it("treats an absent pre-migration ledger as an explicit bootstrap boundary", async () => {
    const client: MigrationClient = {
      query: vi.fn(async () => queryResult([{ ledger: null }])),
      release: vi.fn(),
    };

    await expect(
      verifyMigrationIntegrity(client, migrationConfig, {
        allowMissingLedger: true,
        requireAllApplied: false,
        readMigrations,
      }),
    ).resolves.toEqual({
      ledgerPresent: false,
      bootstrapBoundary: true,
      appliedCount: 0,
      pendingCount: 1,
    });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("fails if the ledger is still absent after migration", async () => {
    const client: MigrationClient = {
      query: vi.fn(async () => queryResult([{ ledger: null }])),
      release: vi.fn(),
    };

    await expect(
      verifyMigrationIntegrity(client, migrationConfig, {
        allowMissingLedger: false,
        requireAllApplied: true,
        readMigrations,
      }),
    ).rejects.toThrow(/ledger.*absent/i);
  });

  it("reads every ledger row and compares created_at plus hash", async () => {
    const query = vi
      .fn<MigrationClient["query"]>()
      .mockResolvedValueOnce(queryResult([{ ledger: "drizzle.__drizzle_migrations" }]))
      .mockResolvedValueOnce(
        queryResult([{ created_at: String(local[0]?.folderMillis), hash: local[0]?.hash }]),
      );
    const client: MigrationClient = { query, release: vi.fn() };

    await expect(
      verifyMigrationIntegrity(client, migrationConfig, {
        allowMissingLedger: false,
        requireAllApplied: true,
        readMigrations,
      }),
    ).resolves.toMatchObject({
      ledgerPresent: true,
      bootstrapBoundary: false,
      appliedCount: 1,
      pendingCount: 0,
    });
    expect(query).toHaveBeenNthCalledWith(1, expect.stringMatching(/to_regclass/i), [
      "drizzle.__drizzle_migrations",
    ]);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/created_at.*hash|hash.*created_at/i),
    );
  });

  it("rejects malformed ledger rows rather than coercing them", async () => {
    const query = vi
      .fn<MigrationClient["query"]>()
      .mockResolvedValueOnce(queryResult([{ ledger: "drizzle.__drizzle_migrations" }]))
      .mockResolvedValueOnce(queryResult([{ created_at: "not-an-integer", hash: local[0]?.hash }]));
    const client: MigrationClient = { query, release: vi.fn() };

    await expect(
      verifyMigrationIntegrity(client, migrationConfig, {
        allowMissingLedger: false,
        requireAllApplied: true,
        readMigrations,
      }),
    ).rejects.toBeInstanceOf(MigrationIntegrityError);
  });
});

type FailureStage =
  "files" | "connect" | "lock" | "pre" | "migrate" | "post" | "unlock" | "release" | "end";

function migrationRunnerHarness(
  failureStage?: FailureStage,
  failureReason = new Error(`${failureStage ?? "unexpected"} failed`),
) {
  const events: string[] = [];
  const identities: MigrationClient[] = [];
  const client: MigrationClient = {
    query: vi.fn(async (statement: string) => {
      const stage = /advisory_unlock/i.test(statement) ? "unlock" : "lock";
      events.push(stage);
      if (failureStage === stage) throw failureReason;
      return queryResult(stage === "unlock" ? [{ unlocked: true }] : []);
    }),
    release: vi.fn(() => {
      events.push("release");
      if (failureStage === "release") throw failureReason;
    }),
  };
  const pool: MigrationPool = {
    connect: vi.fn(async () => {
      events.push("connect");
      if (failureStage === "connect") throw failureReason;
      return client;
    }),
    end: vi.fn(async () => {
      events.push("end");
      if (failureStage === "end") throw failureReason;
    }),
  };
  const dependencies: MigrationRunnerDependencies = {
    checkFiles: vi.fn(async () => {
      events.push("files");
      if (failureStage === "files") throw failureReason;
    }),
    createPool: vi.fn(() => {
      events.push("pool");
      return pool;
    }),
    checkIntegrity: vi.fn(async (candidate, _config, phase) => {
      identities.push(candidate);
      events.push(phase);
      if (failureStage === phase) throw failureReason;
    }),
    migrate: vi.fn(async (candidate) => {
      identities.push(candidate);
      events.push("migrate");
      if (failureStage === "migrate") throw failureReason;
    }),
  };

  return { client, dependencies, events, failureReason, identities, pool };
}

describe("locked migration runner orchestration", () => {
  it("uses one dedicated client while the fixed advisory lock spans both checks and migrate", async () => {
    const harness = migrationRunnerHarness();

    await expect(
      runMigrations(validMigrationEnvironment, harness.dependencies),
    ).resolves.toBeUndefined();
    expect(harness.events).toEqual([
      "files",
      "pool",
      "connect",
      "lock",
      "pre",
      "migrate",
      "post",
      "unlock",
      "release",
      "end",
    ]);
    expect(harness.identities).toEqual([harness.client, harness.client, harness.client]);
    expect(harness.client.query).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/pg_advisory_lock/i),
      [MIGRATION_ADVISORY_LOCK_ID],
    );
    expect(harness.client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/pg_advisory_unlock/i),
      [MIGRATION_ADVISORY_LOCK_ID],
    );
  });

  it("does not invoke the migrator or postcheck when the precheck fails", async () => {
    const harness = migrationRunnerHarness("pre");

    await expect(runMigrations(validMigrationEnvironment, harness.dependencies)).rejects.toThrow(
      "pre failed",
    );
    expect(harness.dependencies.migrate).not.toHaveBeenCalled();
    expect(harness.dependencies.checkIntegrity).toHaveBeenCalledTimes(1);
    expect(harness.events).toEqual([
      "files",
      "pool",
      "connect",
      "lock",
      "pre",
      "unlock",
      "release",
      "end",
    ]);
  });

  it("preserves a frozen-file failure without constructing or touching network resources", async () => {
    const primaryFailure = new Error("primary frozen-file failure");
    const harness = migrationRunnerHarness("files", primaryFailure);

    await expect(runMigrations(validMigrationEnvironment, harness.dependencies)).rejects.toBe(
      primaryFailure,
    );
    expect(harness.events).toEqual(["files"]);
    expect(harness.dependencies.createPool).not.toHaveBeenCalled();
    expect(harness.pool.connect).not.toHaveBeenCalled();
    expect(harness.dependencies.checkIntegrity).not.toHaveBeenCalled();
    expect(harness.dependencies.migrate).not.toHaveBeenCalled();
    expect(harness.client.query).not.toHaveBeenCalled();
    expect(harness.client.release).not.toHaveBeenCalled();
    expect(harness.pool.end).not.toHaveBeenCalled();
  });

  it("propagates a postcheck failure only after the migrator ran", async () => {
    const harness = migrationRunnerHarness("post");

    await expect(runMigrations(validMigrationEnvironment, harness.dependencies)).rejects.toThrow(
      "post failed",
    );
    expect(harness.dependencies.migrate).toHaveBeenCalledTimes(1);
    expect(harness.events).toContain("unlock");
  });

  it.each<FailureStage>([
    "files",
    "connect",
    "lock",
    "pre",
    "migrate",
    "post",
    "unlock",
    "release",
    "end",
  ])("releases every acquired resource when %s fails", async (stage) => {
    const harness = migrationRunnerHarness(stage);

    await expect(runMigrations(validMigrationEnvironment, harness.dependencies)).rejects.toThrow(
      `${stage} failed`,
    );
    if (stage === "files") {
      expect(harness.pool.end).not.toHaveBeenCalled();
      expect(harness.client.release).not.toHaveBeenCalled();
      expect(harness.events).toEqual(["files"]);
    } else {
      expect(harness.pool.end).toHaveBeenCalledTimes(1);
    }
    if (stage === "connect") {
      expect(harness.client.release).not.toHaveBeenCalled();
      expect(harness.events).not.toContain("unlock");
    } else if (stage !== "files") {
      expect(harness.client.release).toHaveBeenCalledTimes(1);
      if (stage === "lock") expect(harness.events).not.toContain("unlock");
      else expect(harness.events).toContain("unlock");
    }
  });

  it("attempts unlock, release, and pool end without masking the primary failure", async () => {
    const harness = migrationRunnerHarness("migrate");
    const query = vi.mocked(harness.client.query);
    query.mockImplementation(async (statement: string) => {
      if (/advisory_unlock/i.test(statement)) {
        harness.events.push("unlock");
        throw new Error("secondary unlock failure");
      }
      harness.events.push("lock");
      return queryResult();
    });
    vi.mocked(harness.client.release).mockImplementation(() => {
      harness.events.push("release");
      throw new Error("secondary release failure");
    });
    vi.mocked(harness.pool.end).mockImplementation(async () => {
      harness.events.push("end");
      throw new Error("secondary end failure");
    });

    await expect(runMigrations(validMigrationEnvironment, harness.dependencies)).rejects.toThrow(
      "migrate failed",
    );
    expect(harness.events).toContain("unlock");
    expect(harness.events).toContain("release");
    expect(harness.events.at(-1)).toBe("end");
  });

  it("passes only MIGRATION_DATABASE_URL to pool construction", async () => {
    const harness = migrationRunnerHarness();
    await runMigrations(
      {
        ...validMigrationEnvironment,
        DATABASE_URL: "postgresql://runtime:runtime-secret@runtime.invalid/workspace",
      },
      harness.dependencies,
    );

    expect(harness.dependencies.createPool).toHaveBeenCalledWith(
      validMigrationEnvironment.MIGRATION_DATABASE_URL,
    );
  });
});

describe("committed generated migration artifacts", () => {
  it("passes the offline exact-set and frozen-hash check without a database", () => {
    const result = checkLocalMigrationFiles(migrationConfig);
    const sql = readFileSync(join(migrationConfig.migrationsFolder, "0000_aw008_foundation.sql"));

    expect(result).toEqual({
      migrationCount: 2,
      hashes: [FOUNDATION_MIGRATION_HASH, CHANNEL_STREAM_MIGRATION_HASH],
    });
    expect(createHash("sha256").update(sql).digest("hex")).toBe(FOUNDATION_MIGRATION_HASH);
  });

  it("rejects an extra artifact and SQL hash drift", () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "aw008-migrations-"));
    const copiedFolder = join(temporaryDirectory, "drizzle");
    try {
      cpSync(migrationConfig.migrationsFolder, copiedFolder, { recursive: true });
      writeFileSync(join(copiedFolder, "unexpected.sql"), "SELECT 1;\n");
      expect(() =>
        checkLocalMigrationFiles({ ...migrationConfig, migrationsFolder: copiedFolder }),
      ).toThrow(/unexpected|exact/i);

      rmSync(join(copiedFolder, "unexpected.sql"));
      writeFileSync(
        join(copiedFolder, "0000_aw008_foundation.sql"),
        `${readFileSync(join(copiedFolder, "0000_aw008_foundation.sql"), "utf8")}-- drift\n`,
      );
      expect(() =>
        checkLocalMigrationFiles({ ...migrationConfig, migrationsFolder: copiedFolder }),
      ).toThrow(/hash/i);
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("accepts an ordinary temporary copy of the frozen migration tree", () => {
    withTemporaryMigrationCopy(({ copiedFolder }) => {
      expect(
        checkLocalMigrationFiles({ ...migrationConfig, migrationsFolder: copiedFolder }),
      ).toEqual({
        migrationCount: 2,
        hashes: [FOUNDATION_MIGRATION_HASH, CHANNEL_STREAM_MIGRATION_HASH],
      });
    });
  });

  it("rejects a migration root that is a symbolic link", () => {
    withTemporaryMigrationCopy(({ copiedFolder, temporaryDirectory }) => {
      const linkedRoot = join(temporaryDirectory, "linked-drizzle");
      symlinkSync(copiedFolder, linkedRoot, "dir");

      expect(() =>
        checkLocalMigrationFiles({ ...migrationConfig, migrationsFolder: linkedRoot }),
      ).toThrow(MigrationIntegrityError);
    });
  });

  it("rejects a canonical SQL path linked symbolically to unchanged external bytes", () => {
    withTemporaryMigrationCopy(({ copiedFolder, temporaryDirectory }) => {
      const canonicalSql = readFileSync(
        join(migrationConfig.migrationsFolder, "0000_aw008_foundation.sql"),
      );
      const copiedSqlPath = join(copiedFolder, "0000_aw008_foundation.sql");
      const externalSqlPath = join(temporaryDirectory, "external-foundation.sql");
      writeFileSync(externalSqlPath, canonicalSql);
      rmSync(copiedSqlPath);
      symlinkSync(externalSqlPath, copiedSqlPath, "file");

      expect(() =>
        checkLocalMigrationFiles({ ...migrationConfig, migrationsFolder: copiedFolder }),
      ).toThrow(MigrationIntegrityError);
      expect(readFileSync(externalSqlPath)).toEqual(canonicalSql);
    });
  });

  it("rejects a canonical SQL hardlink while leaving external bytes unchanged", () => {
    withTemporaryMigrationCopy(({ copiedFolder, temporaryDirectory }) => {
      const canonicalSql = readFileSync(
        join(migrationConfig.migrationsFolder, "0000_aw008_foundation.sql"),
      );
      const copiedSqlPath = join(copiedFolder, "0000_aw008_foundation.sql");
      const externalSqlPath = join(temporaryDirectory, "external-foundation.sql");
      writeFileSync(externalSqlPath, canonicalSql);
      rmSync(copiedSqlPath);
      linkSync(externalSqlPath, copiedSqlPath);

      expect(() =>
        checkLocalMigrationFiles({ ...migrationConfig, migrationsFolder: copiedFolder }),
      ).toThrow(MigrationIntegrityError);
      expect(readFileSync(externalSqlPath)).toEqual(canonicalSql);
    });
  });

  it("contains exactly the six AW-008 tables and no AW-010 tables", () => {
    const sql = readFileSync(
      join(migrationConfig.migrationsFolder, "0000_aw008_foundation.sql"),
      "utf8",
    );
    const snapshot = JSON.parse(
      readFileSync(join(migrationConfig.migrationsFolder, "meta", "0000_snapshot.json"), "utf8"),
    ) as { tables: Record<string, unknown> };
    const sqlTables = [...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1]).sort();

    expect(sqlTables).toEqual([...expectedTableNames].sort());
    expect(Object.keys(snapshot.tables).sort()).toEqual(
      expectedTableNames.map((table) => `public.${table}`).sort(),
    );
    expect(sql).not.toMatch(/\b(messages|durable_events|outbox|projections)\b/i);
  });

  it("keeps the failing fixture literal, partially valid, and deterministically failing", () => {
    const fixtureFolder = join(import.meta.dirname, "fixtures", "failing-migration");
    const fixtureSql = readFileSync(join(fixtureFolder, "0000_valid_then_fail.sql"), "utf8");
    const fixtureJournal = JSON.parse(
      readFileSync(join(fixtureFolder, "meta", "_journal.json"), "utf8"),
    );

    expect(fixtureSql).toMatch(/^CREATE TABLE "aw008_partial_migration_probe"/);
    expect(fixtureSql).toContain("--> statement-breakpoint");
    expect(fixtureSql).toMatch(/RAISE EXCEPTION 'AW-008 intentional migration failure'/);
    expect(fixtureJournal).toEqual({
      version: "7",
      dialect: "postgresql",
      entries: [
        {
          idx: 0,
          version: "7",
          when: 1_900_000_000_000,
          tag: "0000_valid_then_fail",
          breakpoints: true,
        },
      ],
    });
  });
});
