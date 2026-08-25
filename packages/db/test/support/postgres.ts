import { randomBytes } from "node:crypto";
import { access, lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { getContainerRuntimeClient, type ContainerRuntimeClient } from "testcontainers";

import { FOUNDATION_MIGRATION_HASH } from "../../src/migration-integrity.js";

export const POSTGRES_TEST_IMAGE =
  "postgres:17.11-bookworm@sha256:84560e3b9c6874893fc4e2854f5dc3e7c1a37bc9d1dfd7a8c641310ae22ba5ad";

export const POSTGRES_TEST_CONTAINER_PORT = 5432;
export const DEFAULT_STALE_CONTAINER_AGE_MILLISECONDS = 4 * 60 * 60 * 1_000;
export const POSTGRES_TEST_EVIDENCE_DIRECTORY_ENV = "AW008D_TEST_EVIDENCE_DIRECTORY";

const HARNESS_LABEL = "com.agent-workspace.aw008d.harness";
const HARNESS_LABEL_VALUE = "postgres";
const RUN_ID_LABEL = "com.agent-workspace.aw008d.run-id";
const PROCESS_ID_LABEL = "com.agent-workspace.aw008d.process-id";
const PROCESS_INSTANCE_LABEL = "com.agent-workspace.aw008d.process-instance";
const PROCESS_HOST_LABEL = "com.agent-workspace.aw008d.process-host";
const CREATED_AT_LABEL = "com.agent-workspace.aw008d.created-at";
const PROCESS_INSTANCE_ID = randomBytes(12).toString("hex");
const PROCESS_HOST = hostname();
const INIT_ROLES_PATH = join(import.meta.dirname, "../../../../scripts/postgres/init-roles.sh");
const INIT_ROLES_CONTAINER_PATH = "/docker-entrypoint-initdb.d/10-init-roles.sh";

type HarnessContainerInfo = Awaited<
  ReturnType<ContainerRuntimeClient["container"]["dockerode"]["listContainers"]>
>[number];

export type PostgresTestRole = "owner" | "migrator" | "runtime";

export interface PostgresTestResources {
  readonly runId: string;
  readonly containerName: string;
  readonly database: string;
  readonly ownerRole: string;
  readonly migratorRole: string;
  readonly runtimeRole: string;
  readonly labels: Readonly<Record<string, string>>;
}

export interface PostgresTestEvidence {
  readonly version: 1;
  readonly runId: string;
  readonly resourceName: string;
  readonly image: string;
  readonly dockerImageReference: string;
  readonly dockerImageId: string;
  readonly containerId: string;
  readonly containerName: string;
  readonly database: string;
  readonly schemas: readonly ["public", "drizzle"];
  readonly migrationHash: string;
  readonly testSeed: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly connection: {
    readonly host: string;
    readonly mappedPort: number;
    readonly dockerHostIp: string;
  };
  readonly staleContainerIdsRemoved: readonly string[];
  readonly createdAt: string;
}

export interface PostgresTestHarness {
  readonly resources: PostgresTestResources;
  readonly connectionUrls: Readonly<Record<PostgresTestRole, string>>;
  readonly pools: Readonly<Record<PostgresTestRole, Pool>>;
  readonly evidence: PostgresTestEvidence;
  readonly evidencePath: string;
  connect(role: PostgresTestRole): Promise<PoolClient>;
  query<Row extends QueryResultRow = QueryResultRow>(
    role: PostgresTestRole,
    statement: string,
    parameters?: unknown[],
  ): Promise<QueryResult<Row>>;
  resetDatabase(): Promise<void>;
  stop(): Promise<void>;
}

export interface StartPostgresTestHarnessOptions {
  readonly staleContainerAgeMilliseconds?: number;
  readonly evidenceDirectory?: string;
}

export interface CleanupStalePostgresTestContainersOptions {
  readonly staleContainerAgeMilliseconds?: number;
  readonly now?: Date;
}

interface GeneratedSecrets {
  readonly ownerPassword: string;
  readonly migratorPassword: string;
  readonly runtimePassword: string;
}

interface ContainerPortBinding {
  readonly HostIp?: string;
}

interface ContainerInspection {
  readonly Config: {
    readonly Image: string;
  };
  readonly Image: string;
  readonly Name: string;
  readonly NetworkSettings: {
    readonly Ports: Record<string, readonly ContainerPortBinding[] | null>;
  };
}

function randomIdentifier(prefix: string): string {
  const identifier = `${prefix}_${randomBytes(16).toString("hex")}`;
  assertSafeIdentifier(identifier);
  return identifier;
}

function randomPassword(): string {
  return randomBytes(32).toString("base64url");
}

function assertSafeIdentifier(identifier: string): void {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(identifier)) {
    throw new Error("Generated PostgreSQL identifier is outside the safe grammar");
  }
}

function quoteIdentifier(identifier: string): string {
  assertSafeIdentifier(identifier);
  return `"${identifier.replaceAll('"', '""')}"`;
}

function createConnectionUrl(
  host: string,
  port: number,
  database: string,
  username: string,
  password: string,
): string {
  const url = new URL("postgresql://placeholder.invalid");
  url.username = username;
  url.password = password;
  url.hostname = host;
  url.port = String(port);
  url.pathname = database;
  return url.toString();
}

function generateResources(): {
  resources: PostgresTestResources;
  secrets: GeneratedSecrets;
} {
  const runId = randomBytes(16).toString("hex");
  const createdAt = new Date().toISOString();
  const labels = Object.freeze({
    [HARNESS_LABEL]: HARNESS_LABEL_VALUE,
    [RUN_ID_LABEL]: runId,
    [PROCESS_ID_LABEL]: String(process.pid),
    [PROCESS_INSTANCE_LABEL]: PROCESS_INSTANCE_ID,
    [PROCESS_HOST_LABEL]: PROCESS_HOST,
    [CREATED_AT_LABEL]: createdAt,
  });

  return {
    resources: Object.freeze({
      runId,
      containerName: `aw008d-postgres-${runId}`,
      database: randomIdentifier("aw008d_db"),
      ownerRole: randomIdentifier("aw008d_owner"),
      migratorRole: randomIdentifier("aw008d_migrator"),
      runtimeRole: randomIdentifier("aw008d_runtime"),
      labels,
    }),
    secrets: Object.freeze({
      ownerPassword: randomPassword(),
      migratorPassword: randomPassword(),
      runtimePassword: randomPassword(),
    }),
  };
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function getErrorStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return undefined;
  return typeof error.statusCode === "number" ? error.statusCode : undefined;
}

function isMissingContainerError(error: unknown): boolean {
  return getErrorStatusCode(error) === 404;
}

function isProcessAlive(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return getErrorCode(error) !== "ESRCH";
  }
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function containerCreatedAtMilliseconds(container: HarnessContainerInfo): number {
  const labelTimestamp = container.Labels?.[CREATED_AT_LABEL];
  if (labelTimestamp !== undefined) {
    const parsed = Date.parse(labelTimestamp);
    if (Number.isFinite(parsed)) return parsed;
  }
  return container.Created * 1_000;
}

function hasPositivelyDeadLocalOwner(container: HarnessContainerInfo): boolean {
  const labels = container.Labels ?? {};
  if (labels[PROCESS_HOST_LABEL] !== PROCESS_HOST) return false;
  const owningProcessId = parsePositiveInteger(labels[PROCESS_ID_LABEL]);
  return owningProcessId !== undefined && !isProcessAlive(owningProcessId);
}

function isStaleContainer(
  container: HarnessContainerInfo,
  nowMilliseconds: number,
  staleContainerAgeMilliseconds: number,
): boolean {
  if (container.State === "running") return hasPositivelyDeadLocalOwner(container);
  if (hasPositivelyDeadLocalOwner(container)) return true;
  return (
    nowMilliseconds - containerCreatedAtMilliseconds(container) >= staleContainerAgeMilliseconds
  );
}

async function removeContainer(
  runtimeClient: ContainerRuntimeClient,
  containerInfo: HarnessContainerInfo,
  forceRunning: boolean,
): Promise<boolean> {
  const container = runtimeClient.container.getById(containerInfo.Id);
  try {
    const inspection = await runtimeClient.container.inspect(container);
    if (inspection.State.Running) {
      if (
        !forceRunning &&
        (containerInfo.State !== "running" || !hasPositivelyDeadLocalOwner(containerInfo))
      ) {
        return false;
      }
      await runtimeClient.container.stop(container, { timeout: 10_000 });
    }
  } catch (error) {
    if (!isMissingContainerError(error)) throw error;
    return true;
  }

  try {
    await runtimeClient.container.remove(container, { removeVolumes: true });
  } catch (error) {
    if (!isMissingContainerError(error)) throw error;
  }
  return true;
}

async function listHarnessContainers(
  runtimeClient: ContainerRuntimeClient,
  runId?: string,
): Promise<HarnessContainerInfo[]> {
  const labelFilters = [`${HARNESS_LABEL}=${HARNESS_LABEL_VALUE}`];
  if (runId !== undefined) labelFilters.push(`${RUN_ID_LABEL}=${runId}`);
  return runtimeClient.container.dockerode.listContainers({
    all: true,
    filters: { label: labelFilters },
  });
}

async function removeContainers(
  runtimeClient: ContainerRuntimeClient,
  containers: readonly HarnessContainerInfo[],
  forceRunning: boolean,
): Promise<string[]> {
  const removedIds: string[] = [];
  const failures: unknown[] = [];

  for (const container of containers) {
    try {
      if (await removeContainer(runtimeClient, container, forceRunning)) {
        removedIds.push(container.Id);
      }
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, "Failed to remove PostgreSQL test containers");
  }
  return removedIds;
}

function validateStaleAge(staleContainerAgeMilliseconds: number): void {
  if (
    !Number.isFinite(staleContainerAgeMilliseconds) ||
    staleContainerAgeMilliseconds < 0 ||
    !Number.isSafeInteger(staleContainerAgeMilliseconds)
  ) {
    throw new TypeError("staleContainerAgeMilliseconds must be a non-negative safe integer");
  }
}

export async function cleanupStalePostgresTestContainers(
  options: CleanupStalePostgresTestContainersOptions = {},
): Promise<readonly string[]> {
  const staleContainerAgeMilliseconds =
    options.staleContainerAgeMilliseconds ?? DEFAULT_STALE_CONTAINER_AGE_MILLISECONDS;
  validateStaleAge(staleContainerAgeMilliseconds);
  const nowMilliseconds = (options.now ?? new Date()).getTime();
  if (!Number.isFinite(nowMilliseconds)) throw new TypeError("now must be a valid Date");

  const runtimeClient = await getContainerRuntimeClient();
  const containers = await listHarnessContainers(runtimeClient);
  return removeContainers(
    runtimeClient,
    containers.filter((container) =>
      isStaleContainer(container, nowMilliseconds, staleContainerAgeMilliseconds),
    ),
    false,
  );
}

async function removeContainersForRun(
  runtimeClient: ContainerRuntimeClient,
  runId: string,
): Promise<readonly string[]> {
  return removeContainers(runtimeClient, await listHarnessContainers(runtimeClient, runId), true);
}

function dockerHostIp(inspection: ContainerInspection): string {
  const bindings = inspection.NetworkSettings.Ports[`${POSTGRES_TEST_CONTAINER_PORT}/tcp`];
  const hostIp = bindings?.[0]?.HostIp;
  if (hostIp === undefined || hostIp.length === 0) {
    throw new Error("Docker did not report the PostgreSQL HostIp binding");
  }
  return hostIp;
}

function resetSql(resources: PostgresTestResources): string {
  const database = quoteIdentifier(resources.database);
  const migrator = quoteIdentifier(resources.migratorRole);
  const runtime = quoteIdentifier(resources.runtimeRole);

  return `
REVOKE ALL PRIVILEGES ON DATABASE ${database} FROM PUBLIC;
REVOKE ALL PRIVILEGES ON DATABASE ${database} FROM ${migrator};
REVOKE ALL PRIVILEGES ON DATABASE ${database} FROM ${runtime};
GRANT CONNECT, CREATE ON DATABASE ${database} TO ${migrator};
GRANT CONNECT ON DATABASE ${database} TO ${runtime};
REVOKE CREATE, TEMPORARY ON DATABASE ${database} FROM ${runtime};

DROP SCHEMA IF EXISTS drizzle CASCADE;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public AUTHORIZATION ${migrator};
REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${runtime};
GRANT USAGE, CREATE ON SCHEMA public TO ${migrator};
GRANT USAGE ON SCHEMA public TO ${runtime};

REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM ${runtime};
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${runtime};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${runtime};
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${runtime};
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${runtime};

ALTER DEFAULT PRIVILEGES FOR ROLE ${migrator}
  REVOKE EXECUTE ON ROUTINES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE ${migrator} IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM ${runtime};
ALTER DEFAULT PRIVILEGES FOR ROLE ${migrator} IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${runtime};
ALTER DEFAULT PRIVILEGES FOR ROLE ${migrator} IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM ${runtime};
ALTER DEFAULT PRIVILEGES FOR ROLE ${migrator} IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${runtime};

CREATE SCHEMA drizzle AUTHORIZATION ${migrator};
REVOKE ALL PRIVILEGES ON SCHEMA drizzle FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA drizzle FROM ${runtime};
`;
}

function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    allowExitOnIdle: true,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 5_000,
    max: 4,
  });
}

async function resolveEvidencePath(
  temporaryDirectory: string,
  runId: string,
  configuredDirectory: string | undefined,
): Promise<string> {
  if (configuredDirectory === undefined) return join(temporaryDirectory, "evidence.json");

  await mkdir(configuredDirectory, { recursive: true, mode: 0o700 });
  const directoryStatus = await lstat(configuredDirectory);
  if (!directoryStatus.isDirectory() || directoryStatus.isSymbolicLink()) {
    throw new TypeError(`${POSTGRES_TEST_EVIDENCE_DIRECTORY_ENV} must name a real directory`);
  }
  return join(configuredDirectory, `${runId}.json`);
}

function readEvidenceDirectory(optionDirectory: string | undefined): string | undefined {
  const configuredDirectory = optionDirectory ?? process.env[POSTGRES_TEST_EVIDENCE_DIRECTORY_ENV];
  if (configuredDirectory === undefined) return undefined;
  if (configuredDirectory.length === 0 || configuredDirectory.trim() !== configuredDirectory) {
    throw new TypeError(`${POSTGRES_TEST_EVIDENCE_DIRECTORY_ENV} must be a non-empty path`);
  }
  if (!isAbsolute(configuredDirectory)) {
    throw new TypeError(`${POSTGRES_TEST_EVIDENCE_DIRECTORY_ENV} must be an absolute path`);
  }
  return configuredDirectory;
}

async function endPools(pools: Readonly<Record<PostgresTestRole, Pool>>): Promise<unknown[]> {
  const failures: unknown[] = [];
  for (const pool of Object.values(pools)) {
    try {
      await pool.end();
    } catch (error) {
      failures.push(error);
    }
  }
  return failures;
}

function throwCleanupFailures(failures: readonly unknown[]): void {
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, "PostgreSQL test harness cleanup failed");
  }
}

class StartedHarness implements PostgresTestHarness {
  readonly #container: StartedPostgreSqlContainer;
  readonly #runtimeClient: ContainerRuntimeClient;
  readonly #temporaryDirectory: string;
  #stopPromise: Promise<void> | undefined;

  public constructor(
    container: StartedPostgreSqlContainer,
    runtimeClient: ContainerRuntimeClient,
    temporaryDirectory: string,
    public readonly resources: PostgresTestResources,
    public readonly connectionUrls: Readonly<Record<PostgresTestRole, string>>,
    public readonly pools: Readonly<Record<PostgresTestRole, Pool>>,
    public readonly evidence: PostgresTestEvidence,
    public readonly evidencePath: string,
  ) {
    this.#container = container;
    this.#runtimeClient = runtimeClient;
    this.#temporaryDirectory = temporaryDirectory;
  }

  public connect(role: PostgresTestRole): Promise<PoolClient> {
    return this.pools[role].connect();
  }

  public query<Row extends QueryResultRow = QueryResultRow>(
    role: PostgresTestRole,
    statement: string,
    parameters: unknown[] = [],
  ): Promise<QueryResult<Row>> {
    return this.pools[role].query<Row, unknown[]>(statement, parameters);
  }

  public async resetDatabase(): Promise<void> {
    await this.query("owner", resetSql(this.resources));
  }

  public stop(): Promise<void> {
    this.#stopPromise ??= this.#stop();
    return this.#stopPromise;
  }

  async #stop(): Promise<void> {
    const failures = await endPools(this.pools);
    try {
      await this.#container.stop({
        timeout: 10_000,
        remove: true,
        removeVolumes: true,
      });
    } catch (error) {
      failures.push(error);
    }

    try {
      await removeContainersForRun(this.#runtimeClient, this.resources.runId);
    } catch (error) {
      failures.push(error);
    }

    try {
      await rm(this.#temporaryDirectory, { recursive: true, force: true });
    } catch (error) {
      failures.push(error);
    }
    throwCleanupFailures(failures);
  }
}

async function verifyRoleConnections(
  pools: Readonly<Record<PostgresTestRole, Pool>>,
  resources: PostgresTestResources,
): Promise<void> {
  const expectedRoles: Readonly<Record<PostgresTestRole, string>> = {
    owner: resources.ownerRole,
    migrator: resources.migratorRole,
    runtime: resources.runtimeRole,
  };

  await Promise.all(
    (Object.keys(pools) as PostgresTestRole[]).map(async (role) => {
      const result = await pools[role].query<{ current_user: string; current_database: string }>(
        "SELECT current_user, current_database() AS current_database",
      );
      const row = result.rows[0];
      if (
        row?.current_user !== expectedRoles[role] ||
        row.current_database !== resources.database
      ) {
        throw new Error(
          `PostgreSQL ${role} connection identity did not match its generated resource`,
        );
      }
    }),
  );
}

function serializeEvidence(
  evidence: PostgresTestEvidence,
  forbiddenValues: readonly string[],
): string {
  const serialized = `${JSON.stringify(evidence, undefined, 2)}\n`;
  if (
    forbiddenValues.some(
      (forbiddenValue) => forbiddenValue.length > 0 && serialized.includes(forbiddenValue),
    )
  ) {
    throw new Error("PostgreSQL test evidence contained credential material");
  }
  return serialized;
}

async function cleanupFailedStart(
  runtimeClient: ContainerRuntimeClient,
  runId: string,
  startedContainer: StartedPostgreSqlContainer | undefined,
  pools: Readonly<Record<PostgresTestRole, Pool>> | undefined,
  temporaryDirectory: string,
): Promise<unknown[]> {
  const failures = pools === undefined ? [] : await endPools(pools);
  if (startedContainer !== undefined) {
    try {
      await startedContainer.stop({ timeout: 10_000, remove: true, removeVolumes: true });
    } catch (error) {
      failures.push(error);
    }
  }
  try {
    await removeContainersForRun(runtimeClient, runId);
  } catch (error) {
    failures.push(error);
  }
  try {
    await rm(temporaryDirectory, { recursive: true, force: true });
  } catch (error) {
    failures.push(error);
  }
  return failures;
}

export async function startPostgresTestHarness(
  options: StartPostgresTestHarnessOptions = {},
): Promise<PostgresTestHarness> {
  if (!/^postgres:17\.11-bookworm@sha256:[0-9a-f]{64}$/u.test(POSTGRES_TEST_IMAGE)) {
    throw new Error("The PostgreSQL test image is not the approved digest-pinned image");
  }

  const evidenceDirectory = readEvidenceDirectory(options.evidenceDirectory);
  await access(INIT_ROLES_PATH);
  const staleContainerAgeMilliseconds =
    options.staleContainerAgeMilliseconds ?? DEFAULT_STALE_CONTAINER_AGE_MILLISECONDS;
  validateStaleAge(staleContainerAgeMilliseconds);

  const runtimeClient = await getContainerRuntimeClient();
  const staleContainerIdsRemoved = await cleanupStalePostgresTestContainers({
    staleContainerAgeMilliseconds,
  });
  const { resources, secrets } = generateResources();
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "aw008d-postgres-"));
  let evidencePath = join(temporaryDirectory, "evidence.json");
  let startedContainer: StartedPostgreSqlContainer | undefined;
  let pools: Readonly<Record<PostgresTestRole, Pool>> | undefined;

  try {
    evidencePath = await resolveEvidencePath(
      temporaryDirectory,
      resources.runId,
      evidenceDirectory,
    );
    const container = new PostgreSqlContainer(POSTGRES_TEST_IMAGE)
      .withName(resources.containerName)
      .withDatabase(resources.database)
      .withUsername(resources.ownerRole)
      .withPassword(secrets.ownerPassword)
      .withEnvironment({
        MIGRATOR_ROLE: resources.migratorRole,
        MIGRATOR_PASSWORD: secrets.migratorPassword,
        RUNTIME_ROLE: resources.runtimeRole,
        RUNTIME_PASSWORD: secrets.runtimePassword,
      })
      .withLabels(resources.labels)
      .withCopyFilesToContainer([
        {
          source: INIT_ROLES_PATH,
          target: INIT_ROLES_CONTAINER_PATH,
          mode: 0o755,
        },
      ]);

    startedContainer = await container.start();
    const host = startedContainer.getHost();
    const mappedPort = startedContainer.getMappedPort(POSTGRES_TEST_CONTAINER_PORT);
    const containerId = startedContainer.getId();
    const inspection = (await runtimeClient.container.inspect(
      runtimeClient.container.getById(containerId),
    )) as ContainerInspection;

    const connectionUrls = Object.freeze({
      owner: createConnectionUrl(
        host,
        mappedPort,
        resources.database,
        resources.ownerRole,
        secrets.ownerPassword,
      ),
      migrator: createConnectionUrl(
        host,
        mappedPort,
        resources.database,
        resources.migratorRole,
        secrets.migratorPassword,
      ),
      runtime: createConnectionUrl(
        host,
        mappedPort,
        resources.database,
        resources.runtimeRole,
        secrets.runtimePassword,
      ),
    });
    pools = Object.freeze({
      owner: createPool(connectionUrls.owner),
      migrator: createPool(connectionUrls.migrator),
      runtime: createPool(connectionUrls.runtime),
    });
    await verifyRoleConnections(pools, resources);

    const evidence: PostgresTestEvidence = Object.freeze({
      version: 1,
      runId: resources.runId,
      resourceName: resources.containerName,
      image: POSTGRES_TEST_IMAGE,
      dockerImageReference: inspection.Config.Image,
      dockerImageId: inspection.Image,
      containerId,
      containerName: inspection.Name,
      database: resources.database,
      schemas: ["public", "drizzle"] as const,
      migrationHash: FOUNDATION_MIGRATION_HASH,
      testSeed: resources.runId,
      labels: resources.labels,
      connection: Object.freeze({
        host,
        mappedPort,
        dockerHostIp: dockerHostIp(inspection),
      }),
      staleContainerIdsRemoved,
      createdAt: new Date().toISOString(),
    });
    const serializedEvidence = serializeEvidence(evidence, [
      resources.ownerRole,
      resources.migratorRole,
      resources.runtimeRole,
      secrets.ownerPassword,
      secrets.migratorPassword,
      secrets.runtimePassword,
      connectionUrls.owner,
      connectionUrls.migrator,
      connectionUrls.runtime,
    ]);
    await writeFile(evidencePath, serializedEvidence, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });

    return new StartedHarness(
      startedContainer,
      runtimeClient,
      temporaryDirectory,
      resources,
      connectionUrls,
      pools,
      evidence,
      evidencePath,
    );
  } catch (error) {
    const cleanupFailures = await cleanupFailedStart(
      runtimeClient,
      resources.runId,
      startedContainer,
      pools,
      temporaryDirectory,
    );
    if (cleanupFailures.length === 0) throw error;
    throw new AggregateError(
      [error, ...cleanupFailures],
      "PostgreSQL test harness failed to start and clean up",
    );
  }
}

export async function withPostgresTestHarness<Result>(
  callback: (harness: PostgresTestHarness) => Result | Promise<Result>,
  options: StartPostgresTestHarnessOptions = {},
): Promise<Result> {
  const harness = await startPostgresTestHarness(options);
  let callbackResult!: Result;
  let callbackFailure: { readonly error: unknown } | undefined;
  try {
    callbackResult = await callback(harness);
  } catch (error) {
    callbackFailure = { error };
  }

  let cleanupFailure: { readonly error: unknown } | undefined;
  try {
    await harness.stop();
  } catch (error) {
    cleanupFailure = { error };
  }

  if (callbackFailure !== undefined && cleanupFailure !== undefined) {
    throw new AggregateError(
      [callbackFailure.error, cleanupFailure.error],
      "PostgreSQL test harness callback and cleanup failed",
    );
  }
  if (callbackFailure !== undefined) throw callbackFailure.error;
  if (cleanupFailure !== undefined) throw cleanupFailure.error;
  return callbackResult;
}
