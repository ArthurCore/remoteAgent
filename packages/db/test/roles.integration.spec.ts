import { randomUUID } from "node:crypto";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { inspect } from "node:util";

import { GenericContainer, getContainerRuntimeClient } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../src/migrate.js";
import {
  POSTGRES_TEST_EVIDENCE_DIRECTORY_ENV,
  POSTGRES_TEST_IMAGE,
  cleanupStalePostgresTestContainers,
  startPostgresTestHarness,
  withPostgresTestHarness,
  type PostgresTestHarness,
  type PostgresTestRole,
} from "./support/postgres.js";

const FOUNDATION_TABLES = [
  "channel_membership_epochs",
  "channels",
  "principals",
  "tenants",
  "workspace_memberships",
  "workspaces",
] as const;
const DELETE_ORDER = [
  "channel_membership_epochs",
  "channels",
  "workspace_memberships",
  "principals",
  "workspaces",
  "tenants",
] as const;
const HARNESS_LABEL = "com.agent-workspace.aw008d.harness";
const RUN_ID_LABEL = "com.agent-workspace.aw008d.run-id";
const PROCESS_ID_LABEL = "com.agent-workspace.aw008d.process-id";
const PROCESS_INSTANCE_LABEL = "com.agent-workspace.aw008d.process-instance";
const PROCESS_HOST_LABEL = "com.agent-workspace.aw008d.process-host";
const CREATED_AT_LABEL = "com.agent-workspace.aw008d.created-at";
const INHERITED_DATABASE_URL =
  "postgresql://inherited_runtime:inherited_runtime_password@127.0.0.1:1/inherited_runtime";
const INHERITED_MIGRATION_DATABASE_URL =
  "postgresql://inherited_migrator:inherited_migrator_password@127.0.0.1:1/inherited_migration";
const originalEnvironment = {
  DATABASE_URL: process.env.DATABASE_URL,
  MIGRATION_DATABASE_URL: process.env.MIGRATION_DATABASE_URL,
  [POSTGRES_TEST_EVIDENCE_DIRECTORY_ENV]: process.env[POSTGRES_TEST_EVIDENCE_DIRECTORY_ENV],
};

interface RoleAttributes {
  rolname: string;
  rolcanlogin: boolean;
  rolsuper: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
  rolinherit: boolean;
  rolreplication: boolean;
  rolbypassrls: boolean;
}

interface ContainerInspection {
  Id: string;
  Image: string;
  Name: string;
  Config: {
    Image: string;
  };
  NetworkSettings: {
    Ports: Record<string, readonly { HostIp?: string }[] | null>;
  };
}

type CapturedConsoleCall = {
  method: "debug" | "error" | "info" | "log" | "warn";
  arguments: readonly unknown[];
};

const capturedConsoleCalls: CapturedConsoleCall[] = [];
const capturedErrors: unknown[] = [];
const originalConsole = {
  debug: console.debug,
  error: console.error,
  info: console.info,
  log: console.log,
  warn: console.warn,
};
let harness: PostgresTestHarness | undefined;
let retainedEvidenceDirectory: string | undefined;

function captureConsole(): void {
  console.debug = (...arguments_: unknown[]) => {
    capturedConsoleCalls.push({ method: "debug", arguments: arguments_ });
  };
  console.error = (...arguments_: unknown[]) => {
    capturedConsoleCalls.push({ method: "error", arguments: arguments_ });
  };
  console.info = (...arguments_: unknown[]) => {
    capturedConsoleCalls.push({ method: "info", arguments: arguments_ });
  };
  console.log = (...arguments_: unknown[]) => {
    capturedConsoleCalls.push({ method: "log", arguments: arguments_ });
  };
  console.warn = (...arguments_: unknown[]) => {
    capturedConsoleCalls.push({ method: "warn", arguments: arguments_ });
  };
}

function restoreConsole(): void {
  console.debug = originalConsole.debug;
  console.error = originalConsole.error;
  console.info = originalConsole.info;
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
}

function restoreEnvironment(): void {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function activeHarness(): PostgresTestHarness {
  if (harness === undefined) throw new Error("PostgreSQL test harness is not available");
  return harness;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function errorStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return undefined;
  return typeof error.statusCode === "number" ? error.statusCode : undefined;
}

function deadProcessId(): number {
  for (let candidate = 2_147_483_647; candidate > 2_147_483_600; candidate -= 1) {
    try {
      process.kill(candidate, 0);
    } catch (error) {
      if (errorCode(error) === "ESRCH") return candidate;
    }
  }
  throw new Error("Could not identify a process ID that positively reports ESRCH");
}

async function forceRemoveContainers(containerIds: readonly string[]): Promise<unknown[]> {
  const runtimeClient = await getContainerRuntimeClient();
  const failures: unknown[] = [];
  for (const containerId of containerIds) {
    try {
      await runtimeClient.container.dockerode
        .getContainer(containerId)
        .remove({ force: true, v: true });
    } catch (error) {
      if (errorStatusCode(error) !== 404) failures.push(error);
    }
  }
  return failures;
}

type TeardownStage = {
  readonly name: string;
  readonly run: () => void | Promise<void>;
};

type CapturedFailure = { readonly error: unknown };

async function runTeardownStages(
  stages: readonly TeardownStage[],
  primaryFailure?: CapturedFailure,
): Promise<void> {
  const failures: unknown[] = primaryFailure === undefined ? [] : [primaryFailure.error];
  for (const stage of stages) {
    try {
      await stage.run();
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, "AW-008D role integration teardown failed");
  }
}

async function captureFailure(action: () => void | Promise<void>): Promise<unknown> {
  try {
    await action();
    return undefined;
  } catch (error) {
    return error;
  }
}

async function expectRuntimePermissionDenied(
  statement: string,
  parameters: readonly unknown[] = [],
): Promise<void> {
  const client = await activeHarness().connect("runtime");
  let thrown: unknown;
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    try {
      await client.query(statement, [...parameters]);
    } catch (error) {
      thrown = error;
      capturedErrors.push(error);
    }
  } finally {
    try {
      if (transactionStarted) await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }

  expect(thrown).toBeDefined();
  expect(errorCode(thrown)).toBe("42501");
}

function connectionCredentialValues(testHarness: PostgresTestHarness): string[] {
  const connectionUrls = [
    ...Object.values(testHarness.connectionUrls),
    INHERITED_DATABASE_URL,
    INHERITED_MIGRATION_DATABASE_URL,
  ];
  return connectionUrls.flatMap((connectionUrl) => {
    const parsed = new URL(connectionUrl);
    return [
      connectionUrl,
      parsed.username,
      parsed.password,
      decodeURIComponent(parsed.username),
      decodeURIComponent(parsed.password),
    ];
  });
}

function sensitiveValues(testHarness: PostgresTestHarness): string[] {
  return [
    ...connectionCredentialValues(testHarness),
    testHarness.resources.ownerRole,
    testHarness.resources.migratorRole,
    testHarness.resources.runtimeRole,
  ].filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
}

function capturedDiagnostics(): string {
  return [
    ...capturedConsoleCalls.map(
      (call) =>
        `${call.method}: ${call.arguments
          .map((argument) => inspect(argument, { depth: 8, getters: false }))
          .join(" ")}`,
    ),
    ...capturedErrors.map(
      (error) => `caught-error: ${inspect(error, { depth: 8, getters: false })}`,
    ),
  ].join("\n");
}

function expectNoCredentialLeak(text: string, testHarness: PostgresTestHarness): void {
  expect(text).not.toMatch(/postgres(?:ql)?:\/\//u);
  for (const sensitiveValue of sensitiveValues(testHarness)) {
    expect(text).not.toContain(sensitiveValue);
  }
}

async function labeledContainerIds(runId: string): Promise<string[]> {
  const runtimeClient = await getContainerRuntimeClient();
  const containers = await runtimeClient.container.dockerode.listContainers({
    all: true,
    filters: {
      label: [`${HARNESS_LABEL}=postgres`, `${RUN_ID_LABEL}=${runId}`],
    },
  });
  return containers.map((container) => container.Id);
}

function expectedRoleAttributes(roleName: string): RoleAttributes {
  return {
    rolname: roleName,
    rolcanlogin: true,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolinherit: false,
    rolreplication: false,
    rolbypassrls: false,
  };
}

beforeAll(async () => {
  captureConsole();
  process.env.DATABASE_URL = INHERITED_DATABASE_URL;
  process.env.MIGRATION_DATABASE_URL = INHERITED_MIGRATION_DATABASE_URL;
  retainedEvidenceDirectory = await mkdtemp(join(tmpdir(), "aw008d-retained-evidence-"));
  process.env[POSTGRES_TEST_EVIDENCE_DIRECTORY_ENV] = retainedEvidenceDirectory;
  harness = await startPostgresTestHarness();
}, 120_000);

beforeEach(async () => {
  const testHarness = activeHarness();
  await testHarness.resetDatabase();
  await runMigrations({
    MIGRATION_DATABASE_URL: testHarness.connectionUrls.migrator,
    MIGRATION_TARGET_CLASS: "testcontainer",
    DATABASE_URL: process.env.DATABASE_URL,
  });
}, 60_000);

afterAll(async () => {
  const testHarness = harness;
  const evidenceDirectory = retainedEvidenceDirectory;
  const stages: TeardownStage[] = [];

  if (testHarness !== undefined) {
    const { evidencePath } = testHarness;
    const { runId } = testHarness.resources;
    stages.push(
      {
        name: "stop harness",
        run: async () => {
          try {
            await testHarness.stop();
          } catch (error) {
            capturedErrors.push(error);
            throw error;
          }
        },
      },
      {
        name: "assert container residue",
        run: async () => {
          expect(await labeledContainerIds(runId)).toEqual([]);
        },
      },
      {
        name: "assert retained evidence",
        run: async () => {
          await expect(access(evidencePath)).resolves.toBeUndefined();
          const retainedEvidence = await readFile(evidencePath, "utf8");
          expect(JSON.parse(retainedEvidence) as unknown).toStrictEqual(testHarness.evidence);
          expectNoCredentialLeak(retainedEvidence, testHarness);
          expectNoCredentialLeak(capturedDiagnostics(), testHarness);
        },
      },
    );
  }

  if (evidenceDirectory !== undefined) {
    stages.push({
      name: "remove retained evidence",
      run: () => rm(evidenceDirectory, { recursive: true, force: true }),
    });
  }
  stages.push(
    { name: "restore environment", run: restoreEnvironment },
    { name: "restore console", run: restoreConsole },
  );

  harness = undefined;
  retainedEvidenceDirectory = undefined;
  await runTeardownStages(stages);
}, 60_000);

describe.sequential("AW-008D migrator/runtime least privilege", () => {
  it("removes only stopped residue and running containers positively owned by a dead local process", async () => {
    const now = new Date();
    const oldCreatedAt = new Date(now.getTime() - 24 * 60 * 60 * 1_000).toISOString();
    const testRunPrefix = `janitor-${randomUUID()}`;
    const otherLiveProcessId = process.ppid;
    const positivelyDeadProcessId = deadProcessId();
    expect(otherLiveProcessId).toBeGreaterThan(0);
    expect(otherLiveProcessId).not.toBe(process.pid);
    expect(() => process.kill(otherLiveProcessId, 0)).not.toThrow();

    const targetContainerIds: string[] = [];
    const expectedLabelsById = new Map<string, Record<string, string>>();
    let primaryFailure: unknown;
    let primaryFailed = false;
    try {
      const startTarget = async (
        target: string,
        owner: { host: string; processId: string; instance: string },
      ) => {
        const labels = {
          [HARNESS_LABEL]: "postgres",
          [RUN_ID_LABEL]: `${testRunPrefix}-${target}`,
          [PROCESS_ID_LABEL]: owner.processId,
          [PROCESS_INSTANCE_LABEL]: owner.instance,
          [PROCESS_HOST_LABEL]: owner.host,
          [CREATED_AT_LABEL]: oldCreatedAt,
        };
        const started = await new GenericContainer(POSTGRES_TEST_IMAGE)
          .withCommand(["sh", "-c", "while :; do sleep 3600; done"])
          .withLabels(labels)
          .start();
        targetContainerIds.push(started.getId());
        expectedLabelsById.set(started.getId(), labels);
        return started;
      };

      const foreignRunning = await startTarget("foreign-running", {
        host: `${hostname()}-foreign`,
        processId: String(process.pid),
        instance: "foreign-instance",
      });
      const currentProcessRunning = await startTarget("current-process-running", {
        host: hostname(),
        processId: String(process.pid),
        instance: "different-current-process-instance",
      });
      const otherLiveProcessRunning = await startTarget("other-live-process-running", {
        host: hostname(),
        processId: String(otherLiveProcessId),
        instance: "other-live-process-instance",
      });
      const deadLocalProcessRunning = await startTarget("dead-local-process-running", {
        host: hostname(),
        processId: String(positivelyDeadProcessId),
        instance: "dead-local-process-instance",
      });
      const oldStopped = await startTarget("old-stopped", {
        host: `${hostname()}-foreign`,
        processId: "invalid",
        instance: "stopped-instance",
      });
      const runtimeClient = await getContainerRuntimeClient();
      const runningControls = [
        foreignRunning,
        currentProcessRunning,
        otherLiveProcessRunning,
        deadLocalProcessRunning,
      ];
      const observeTargets = async () => {
        const [listedContainers, inspections] = await Promise.all([
          runtimeClient.container.dockerode.listContainers({
            all: true,
            filters: { label: [`${HARNESS_LABEL}=postgres`] },
          }),
          Promise.all(
            targetContainerIds.map(
              async (containerId) =>
                [
                  containerId,
                  await runtimeClient.container.inspect(
                    runtimeClient.container.getById(containerId),
                  ),
                ] as const,
            ),
          ),
        ]);
        const listedTargets = listedContainers.filter((container) =>
          targetContainerIds.includes(container.Id),
        );
        expect(listedTargets).toHaveLength(5);
        const listedById = new Map(
          listedTargets.map((container) => [container.Id, container] as const),
        );
        const inspectionById = new Map(inspections);

        for (const containerId of targetContainerIds) {
          const listed = listedById.get(containerId);
          const expectedLabels = expectedLabelsById.get(containerId);
          expect(listed, `listed target ${containerId}`).toBeDefined();
          expect(expectedLabels, `expected labels ${containerId}`).toBeDefined();
          const relevantLabels = Object.fromEntries(
            Object.keys(expectedLabels ?? {}).map((label) => [label, listed?.Labels?.[label]]),
          );
          expect(relevantLabels, `labels for ${containerId}`).toEqual(expectedLabels);
          expect(inspectionById.has(containerId), `inspection for ${containerId}`).toBe(true);
        }

        return { listedTargets, listedById, inspectionById };
      };

      const preStop = await observeTargets();
      for (const containerId of targetContainerIds) {
        expect(preStop.listedById.get(containerId)?.State).toBe("running");
        expect(preStop.inspectionById.get(containerId)?.State.Running).toBe(true);
      }

      await oldStopped.stop({ timeout: 10_000, remove: false, removeVolumes: false });

      const waitForStoppedTarget = async () => {
        const deadline = Date.now() + 10_000;
        for (;;) {
          const observation = await observeTargets();
          for (const running of runningControls) {
            expect(observation.listedById.get(running.getId())?.State).toBe("running");
            expect(observation.inspectionById.get(running.getId())?.State.Running).toBe(true);
          }

          const listedState = observation.listedById.get(oldStopped.getId())?.State;
          const stoppedInspection = observation.inspectionById.get(oldStopped.getId());
          if (
            listedState === "exited" &&
            stoppedInspection?.State.Running === false &&
            stoppedInspection.State.Status === "exited"
          ) {
            return observation.listedTargets;
          }
          if (Date.now() >= deadline) {
            throw new Error(
              `Stopped target ${oldStopped.getId()} did not converge: listed=${listedState ?? "missing"}, inspectedRunning=${String(stoppedInspection?.State.Running)}, inspectedStatus=${stoppedInspection?.State.Status ?? "missing"}`,
            );
          }
          await delay(100);
        }
      };

      const initialTargets = await waitForStoppedTarget();
      const initialStateById = new Map(
        initialTargets.map((container) => [container.Id, container.State] as const),
      );
      for (const running of runningControls) {
        expect(initialStateById.get(running.getId())).toBe("running");
        await expect(
          runtimeClient.container.inspect(runtimeClient.container.getById(running.getId())),
        ).resolves.toMatchObject({ State: { Running: true } });
      }
      expect(initialStateById.get(oldStopped.getId())).toBe("exited");
      await expect(
        runtimeClient.container.inspect(runtimeClient.container.getById(oldStopped.getId())),
      ).resolves.toMatchObject({ State: { Running: false, Status: "exited" } });

      expect(() => process.kill(process.pid, 0)).not.toThrow();
      expect(() => process.kill(otherLiveProcessId, 0)).not.toThrow();
      let deadProcessError: unknown;
      try {
        process.kill(positivelyDeadProcessId, 0);
      } catch (error) {
        deadProcessError = error;
      }
      expect(errorCode(deadProcessError)).toBe("ESRCH");
      expect(now.getTime() - Date.parse(oldCreatedAt)).toBeGreaterThanOrEqual(60 * 60 * 1_000);

      const removedIds = await cleanupStalePostgresTestContainers({
        now,
        staleContainerAgeMilliseconds: 60 * 60 * 1_000,
      });
      const expectedRemovedIds = [deadLocalProcessRunning.getId(), oldStopped.getId()].sort();
      expect([...removedIds].sort()).toEqual(expectedRemovedIds);

      const survivingIds = runningControls
        .filter((running) => running !== deadLocalProcessRunning)
        .map((running) => running.getId())
        .sort();
      const listedSurvivingIds = (
        await runtimeClient.container.dockerode.listContainers({
          all: true,
          filters: { label: [`${HARNESS_LABEL}=postgres`] },
        })
      )
        .map((container) => container.Id)
        .filter((containerId) => targetContainerIds.includes(containerId))
        .sort();
      expect(listedSurvivingIds).toEqual(survivingIds);
      for (const survivorId of survivingIds) {
        await expect(
          runtimeClient.container.inspect(runtimeClient.container.getById(survivorId)),
        ).resolves.toMatchObject({ State: { Running: true } });
      }
      for (const removedId of expectedRemovedIds) {
        await expect(
          runtimeClient.container.inspect(runtimeClient.container.getById(removedId)),
        ).rejects.toMatchObject({ statusCode: 404 });
      }
    } catch (error) {
      primaryFailure = error;
      primaryFailed = true;
    }

    const cleanupFailures = await forceRemoveContainers(targetContainerIds);
    if (primaryFailed && cleanupFailures.length > 0) {
      throw new AggregateError(
        [primaryFailure, ...cleanupFailures],
        "Janitor regression failed and target cleanup also failed",
      );
    }
    if (primaryFailed) throw primaryFailure;
    if (cleanupFailures.length === 1) throw cleanupFailures[0];
    if (cleanupFailures.length > 1) {
      throw new AggregateError(cleanupFailures, "Janitor target cleanup failed");
    }
  }, 180_000);

  it("preserves callback and cleanup error identities in withPostgresTestHarness", async () => {
    const successSentinel = Object.freeze({ outcome: "success" });
    await expect(withPostgresTestHarness(() => successSentinel)).resolves.toBe(successSentinel);

    const callbackOnlyError = new Error("callback-only sentinel");
    await expect(
      withPostgresTestHarness(() => {
        throw callbackOnlyError;
      }),
    ).rejects.toBe(callbackOnlyError);

    const cleanupOnlyError = new Error("cleanup-only sentinel");
    await expect(
      withPostgresTestHarness((testHarness) => {
        const realStop = testHarness.stop.bind(testHarness);
        testHarness.stop = async () => {
          await realStop();
          throw cleanupOnlyError;
        };
        return successSentinel;
      }),
    ).rejects.toBe(cleanupOnlyError);

    const callbackError = new Error("callback-and-cleanup callback sentinel");
    const cleanupError = new Error("callback-and-cleanup cleanup sentinel");
    let combinedFailure: unknown;
    try {
      await withPostgresTestHarness((testHarness) => {
        const realStop = testHarness.stop.bind(testHarness);
        testHarness.stop = async () => {
          await realStop();
          throw cleanupError;
        };
        throw callbackError;
      });
    } catch (error) {
      combinedFailure = error;
    }

    expect(combinedFailure).toBeInstanceOf(AggregateError);
    expect((combinedFailure as AggregateError).message).toBe(
      "PostgreSQL test harness callback and cleanup failed",
    );
    expect((combinedFailure as AggregateError).errors).toEqual([callbackError, cleanupError]);
    expect((combinedFailure as AggregateError).errors[0]).toBe(callbackError);
    expect((combinedFailure as AggregateError).errors[1]).toBe(cleanupError);
  }, 240_000);

  it("runs every teardown stage and preserves ordered failures", async () => {
    const primaryError = new Error("teardown primary sentinel");
    const stopError = new Error("teardown stop sentinel");
    const removeError = new Error("teardown remove sentinel");

    const runScenario = async (options: {
      readonly primary: boolean;
      readonly stop: boolean;
      readonly remove: boolean;
    }) => {
      const events: string[] = [];
      let environmentState = "mutated";
      let consoleState = "mutated";
      const thrown = await captureFailure(() =>
        runTeardownStages(
          [
            {
              name: "stop",
              run: () => {
                events.push("stop");
                if (options.stop) throw stopError;
              },
            },
            {
              name: "remove evidence",
              run: () => {
                events.push("remove");
                if (options.remove) throw removeError;
              },
            },
            {
              name: "restore environment",
              run: () => {
                events.push("environment");
                environmentState = "original";
              },
            },
            {
              name: "restore console",
              run: () => {
                events.push("console");
                consoleState = "original";
              },
            },
          ],
          options.primary ? { error: primaryError } : undefined,
        ),
      );
      expect(events).toEqual(["stop", "remove", "environment", "console"]);
      expect(environmentState).toBe("original");
      expect(consoleState).toBe("original");
      return thrown;
    };

    expect(await runScenario({ primary: false, stop: true, remove: false })).toBe(stopError);
    expect(await runScenario({ primary: false, stop: false, remove: true })).toBe(removeError);

    const dualFailure = await runScenario({ primary: false, stop: true, remove: true });
    expect(dualFailure).toBeInstanceOf(AggregateError);
    expect((dualFailure as AggregateError).errors).toEqual([stopError, removeError]);

    const primaryAndCleanup = await runScenario({ primary: true, stop: true, remove: true });
    expect(primaryAndCleanup).toBeInstanceOf(AggregateError);
    expect((primaryAndCleanup as AggregateError).errors).toEqual([
      primaryError,
      stopError,
      removeError,
    ]);
  });

  it("creates distinct generated identities with constrained migrator and runtime flags", async () => {
    const testHarness = activeHarness();
    const { ownerRole, migratorRole, runtimeRole } = testHarness.resources;

    expect(new Set([ownerRole, migratorRole, runtimeRole]).size).toBe(3);
    expect(ownerRole).toMatch(/^aw008d_owner_[0-9a-f]{32}$/u);
    expect(migratorRole).toMatch(/^aw008d_migrator_[0-9a-f]{32}$/u);
    expect(runtimeRole).toMatch(/^aw008d_runtime_[0-9a-f]{32}$/u);

    const expectedConnections: Readonly<Record<PostgresTestRole, string>> = {
      owner: ownerRole,
      migrator: migratorRole,
      runtime: runtimeRole,
    };
    for (const role of Object.keys(expectedConnections) as PostgresTestRole[]) {
      const identity = await testHarness.query<{ currentUser: string; currentDatabase: string }>(
        role,
        'SELECT current_user AS "currentUser", current_database() AS "currentDatabase"',
      );
      expect(identity.rows).toEqual([
        {
          currentUser: expectedConnections[role],
          currentDatabase: testHarness.resources.database,
        },
      ]);
    }

    const attributes = await testHarness.query<RoleAttributes>(
      "owner",
      `SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
              rolinherit, rolreplication, rolbypassrls
         FROM pg_catalog.pg_roles
        WHERE rolname = ANY($1::text[])
        ORDER BY rolname`,
      [[migratorRole, runtimeRole]],
    );
    expect(attributes.rows).toEqual(
      [expectedRoleAttributes(migratorRole), expectedRoleAttributes(runtimeRole)].sort(
        (left, right) => left.rolname.localeCompare(right.rolname),
      ),
    );

    const memberships = await testHarness.query<{ grantedRole: string; memberRole: string }>(
      "owner",
      `SELECT granted.rolname AS "grantedRole", member.rolname AS "memberRole"
         FROM pg_catalog.pg_auth_members AS membership
         JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
         JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
        WHERE member.rolname = ANY($1::text[])`,
      [[migratorRole, runtimeRole]],
    );
    expect(memberships.rows).toEqual([]);
  });

  it("makes the migrator the public owner, permits DDL, and revokes PUBLIC routine execute", async () => {
    const testHarness = activeHarness();
    const { migratorRole } = testHarness.resources;

    const schemaOwner = await testHarness.query<{ owner: string }>(
      "owner",
      `SELECT pg_catalog.pg_get_userbyid(nspowner) AS owner
         FROM pg_catalog.pg_namespace
        WHERE nspname = 'public'`,
    );
    expect(schemaOwner.rows).toEqual([{ owner: migratorRole }]);

    const tableOwners = await testHarness.query<{ tableName: string; tableOwner: string }>(
      "owner",
      `SELECT tablename AS "tableName", tableowner AS "tableOwner"
         FROM pg_catalog.pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename`,
    );
    expect(tableOwners.rows).toEqual(
      FOUNDATION_TABLES.map((tableName) => ({ tableName, tableOwner: migratorRole })).sort(
        (left, right) => left.tableName.localeCompare(right.tableName),
      ),
    );

    await testHarness.query(
      "migrator",
      "CREATE TABLE public.aw008d_migrator_ddl_probe (id bigint PRIMARY KEY)",
    );
    await testHarness.query(
      "migrator",
      "ALTER TABLE public.aw008d_migrator_ddl_probe ADD COLUMN payload text",
    );
    const probe = await testHarness.query<{ owner: string; payloadColumnCount: string }>(
      "owner",
      `SELECT pg_catalog.pg_get_userbyid(class.relowner) AS owner,
              count(attribute.attname)::text AS "payloadColumnCount"
         FROM pg_catalog.pg_class AS class
         JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
         LEFT JOIN pg_catalog.pg_attribute AS attribute
           ON attribute.attrelid = class.oid
          AND attribute.attname = 'payload'
          AND NOT attribute.attisdropped
        WHERE namespace.nspname = 'public'
          AND class.relname = 'aw008d_migrator_ddl_probe'
        GROUP BY class.relowner`,
    );
    expect(probe.rows).toEqual([{ owner: migratorRole, payloadColumnCount: "1" }]);
    await testHarness.query("migrator", "DROP TABLE public.aw008d_migrator_ddl_probe");
    const droppedProbe = await testHarness.query<{ relation: string | null }>(
      "owner",
      "SELECT pg_catalog.to_regclass('public.aw008d_migrator_ddl_probe')::text AS relation",
    );
    expect(droppedProbe.rows).toEqual([{ relation: null }]);

    await testHarness.query(
      "migrator",
      `CREATE FUNCTION public.aw008d_routine_probe()
       RETURNS integer
       LANGUAGE sql
       IMMUTABLE
       AS 'SELECT 1'`,
    );
    const routineAcl = await testHarness.query<{ publicExecute: boolean }>(
      "owner",
      `SELECT EXISTS (
         SELECT 1
           FROM pg_catalog.pg_proc AS procedure
           CROSS JOIN LATERAL pg_catalog.aclexplode(
             COALESCE(
               procedure.proacl,
               pg_catalog.acldefault('f', procedure.proowner)
             )
           ) AS privilege
          WHERE procedure.oid = 'public.aw008d_routine_probe()'::regprocedure
            AND privilege.grantee = 0
            AND privilege.privilege_type = 'EXECUTE'
       ) AS "publicExecute"`,
    );
    expect(routineAcl.rows).toEqual([{ publicExecute: false }]);

    const runtimeRoutinePrivilege = await testHarness.query<{ canExecute: boolean }>(
      "runtime",
      `SELECT pg_catalog.has_function_privilege(
         current_user,
         'public.aw008d_routine_probe()'::regprocedure,
         'EXECUTE'
       ) AS "canExecute"`,
    );
    expect(runtimeRoutinePrivilege.rows).toEqual([{ canExecute: false }]);
    await expectRuntimePermissionDenied("SELECT public.aw008d_routine_probe()");
    await testHarness.query("migrator", "DROP FUNCTION public.aw008d_routine_probe()");
  });

  it("allows runtime SELECT, INSERT, UPDATE, and DELETE on every foundation table", async () => {
    const testHarness = activeHarness();
    const tenantId = "aw008d-runtime-tenant";
    const inserts = [
      {
        tableName: "tenants",
        statement: "INSERT INTO public.tenants (tenant_id) VALUES ($1)",
        parameters: [tenantId],
      },
      {
        tableName: "workspaces",
        statement: "INSERT INTO public.workspaces (tenant_id, workspace_id) VALUES ($1, $2)",
        parameters: [tenantId, "workspace"],
      },
      {
        tableName: "principals",
        statement:
          "INSERT INTO public.principals (tenant_id, principal_id, principal_kind) VALUES ($1, $2, $3)",
        parameters: [tenantId, "principal", "human"],
      },
      {
        tableName: "workspace_memberships",
        statement:
          "INSERT INTO public.workspace_memberships (tenant_id, workspace_id, principal_id, role) VALUES ($1, $2, $3, $4)",
        parameters: [tenantId, "workspace", "principal", "member"],
      },
      {
        tableName: "channels",
        statement:
          "INSERT INTO public.channels (tenant_id, workspace_id, channel_id, kind) VALUES ($1, $2, $3, $4)",
        parameters: [tenantId, "workspace", "channel", "public"],
      },
      {
        tableName: "channel_membership_epochs",
        statement:
          "INSERT INTO public.channel_membership_epochs (tenant_id, channel_id, principal_id, membership_epoch, history_mode, joined_event_seq) VALUES ($1, $2, $3, $4, $5, $6)",
        parameters: [tenantId, "channel", "principal", "epoch", "full", "1"],
      },
    ] as const;

    for (const insert of inserts) {
      const result = await testHarness.query("runtime", insert.statement, [...insert.parameters]);
      expect(result.rowCount, insert.tableName).toBe(1);
    }

    for (const tableName of FOUNDATION_TABLES) {
      const selected = await testHarness.query<{ rowCount: string }>(
        "runtime",
        `SELECT count(*)::text AS "rowCount" FROM public.${tableName} WHERE tenant_id = $1`,
        [tenantId],
      );
      expect(selected.rows, tableName).toEqual([{ rowCount: "1" }]);

      const updated = await testHarness.query(
        "runtime",
        `UPDATE public.${tableName} SET version = version + 1 WHERE tenant_id = $1`,
        [tenantId],
      );
      expect(updated.rowCount, tableName).toBe(1);
    }

    for (const tableName of DELETE_ORDER) {
      const deleted = await testHarness.query(
        "runtime",
        `DELETE FROM public.${tableName} WHERE tenant_id = $1`,
        [tenantId],
      );
      expect(deleted.rowCount, tableName).toBe(1);
    }

    for (const tableName of FOUNDATION_TABLES) {
      const selected = await testHarness.query<{ rowCount: string }>(
        "runtime",
        `SELECT count(*)::text AS "rowCount" FROM public.${tableName} WHERE tenant_id = $1`,
        [tenantId],
      );
      expect(selected.rows, tableName).toEqual([{ rowCount: "0" }]);
    }
  });

  it("applies runtime defaults to future migrator tables and identity sequences", async () => {
    const testHarness = activeHarness();
    await testHarness.query(
      "migrator",
      `CREATE TABLE public.aw008d_sequence_probe (
         id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
         payload text NOT NULL
       )`,
    );

    const sequencePrivileges = await testHarness.query<{
      canSelect: boolean;
      canUpdate: boolean;
      canUse: boolean;
    }>(
      "runtime",
      `SELECT
         pg_catalog.has_sequence_privilege(
           current_user,
           'public.aw008d_sequence_probe_id_seq',
           'USAGE'
         ) AS "canUse",
         pg_catalog.has_sequence_privilege(
           current_user,
           'public.aw008d_sequence_probe_id_seq',
           'SELECT'
         ) AS "canSelect",
         pg_catalog.has_sequence_privilege(
           current_user,
           'public.aw008d_sequence_probe_id_seq',
           'UPDATE'
         ) AS "canUpdate"`,
    );
    expect(sequencePrivileges.rows).toEqual([{ canUse: true, canSelect: true, canUpdate: true }]);

    const inserted = await testHarness.query<{ id: string }>(
      "runtime",
      "INSERT INTO public.aw008d_sequence_probe (payload) VALUES ($1) RETURNING id::text AS id",
      ["inserted"],
    );
    expect(inserted.rows).toEqual([{ id: "1" }]);
    const selected = await testHarness.query<{ payload: string }>(
      "runtime",
      "SELECT payload FROM public.aw008d_sequence_probe WHERE id = $1",
      ["1"],
    );
    expect(selected.rows).toEqual([{ payload: "inserted" }]);
    const updated = await testHarness.query(
      "runtime",
      "UPDATE public.aw008d_sequence_probe SET payload = $1 WHERE id = $2",
      ["updated", "1"],
    );
    expect(updated.rowCount).toBe(1);
    const deleted = await testHarness.query(
      "runtime",
      "DELETE FROM public.aw008d_sequence_probe WHERE id = $1",
      ["1"],
    );
    expect(deleted.rowCount).toBe(1);

    await testHarness.query("migrator", "DROP TABLE public.aw008d_sequence_probe");
  });

  it("denies runtime database/schema creation, object DDL, and migration-ledger access", async () => {
    const testHarness = activeHarness();
    const privileges = await testHarness.query<{
      canConnect: boolean;
      canCreateInDatabase: boolean;
      canCreateInPublic: boolean;
      canUsePublic: boolean;
      canUseTemporary: boolean;
    }>(
      "runtime",
      `SELECT
         pg_catalog.has_database_privilege(current_user, current_database(), 'CONNECT') AS "canConnect",
         pg_catalog.has_database_privilege(current_user, current_database(), 'CREATE') AS "canCreateInDatabase",
         pg_catalog.has_database_privilege(current_user, current_database(), 'TEMPORARY') AS "canUseTemporary",
         pg_catalog.has_schema_privilege(current_user, 'public', 'USAGE') AS "canUsePublic",
         pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE') AS "canCreateInPublic"`,
    );
    expect(privileges.rows).toEqual([
      {
        canConnect: true,
        canCreateInDatabase: false,
        canCreateInPublic: false,
        canUsePublic: true,
        canUseTemporary: false,
      },
    ]);

    await expectRuntimePermissionDenied("CREATE TABLE public.aw008d_runtime_forbidden (id bigint)");
    await expectRuntimePermissionDenied(
      "ALTER TABLE public.tenants ADD COLUMN aw008d_runtime_forbidden text",
    );
    await expectRuntimePermissionDenied("DROP TABLE public.tenants");
    await expectRuntimePermissionDenied("CREATE SCHEMA aw008d_runtime_forbidden");
    await expectRuntimePermissionDenied(
      "CREATE TEMPORARY TABLE aw008d_runtime_temp_forbidden (id bigint)",
    );

    const deniedObjects = await testHarness.query<{
      forbiddenRelation: string | null;
      forbiddenSchema: string | null;
      tenantsRelation: string | null;
    }>(
      "owner",
      `SELECT
         pg_catalog.to_regclass('public.aw008d_runtime_forbidden')::text AS "forbiddenRelation",
         pg_catalog.to_regnamespace('aw008d_runtime_forbidden')::text AS "forbiddenSchema",
         pg_catalog.to_regclass('public.tenants')::text AS "tenantsRelation"`,
    );
    expect(deniedObjects.rows).toEqual([
      { forbiddenRelation: null, forbiddenSchema: null, tenantsRelation: "tenants" },
    ]);

    const ledgerPrivileges = await testHarness.query<{
      canDelete: boolean;
      canInsert: boolean;
      canSelect: boolean;
      canUpdate: boolean;
      canUseSchema: boolean;
    }>(
      "owner",
      `SELECT
         pg_catalog.has_schema_privilege($1, 'drizzle', 'USAGE') AS "canUseSchema",
         pg_catalog.has_table_privilege($1, 'drizzle.__drizzle_migrations', 'SELECT') AS "canSelect",
         pg_catalog.has_table_privilege($1, 'drizzle.__drizzle_migrations', 'INSERT') AS "canInsert",
         pg_catalog.has_table_privilege($1, 'drizzle.__drizzle_migrations', 'UPDATE') AS "canUpdate",
         pg_catalog.has_table_privilege($1, 'drizzle.__drizzle_migrations', 'DELETE') AS "canDelete"`,
      [testHarness.resources.runtimeRole],
    );
    expect(ledgerPrivileges.rows).toEqual([
      {
        canUseSchema: false,
        canSelect: false,
        canInsert: false,
        canUpdate: false,
        canDelete: false,
      },
    ]);

    await expectRuntimePermissionDenied("SELECT * FROM drizzle.__drizzle_migrations");
    await expectRuntimePermissionDenied(
      "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
      ["0".repeat(64), "0"],
    );
    await expectRuntimePermissionDenied("UPDATE drizzle.__drizzle_migrations SET hash = $1", [
      "0".repeat(64),
    ]);
    await expectRuntimePermissionDenied("DELETE FROM drizzle.__drizzle_migrations");
  });

  it("records exact non-secret container evidence and ignores inherited database URLs", async () => {
    const testHarness = activeHarness();
    expect(process.env.DATABASE_URL).toBe(INHERITED_DATABASE_URL);
    expect(process.env.MIGRATION_DATABASE_URL).toBe(INHERITED_MIGRATION_DATABASE_URL);
    expect(Object.values(testHarness.connectionUrls)).not.toContain(INHERITED_DATABASE_URL);
    expect(Object.values(testHarness.connectionUrls)).not.toContain(
      INHERITED_MIGRATION_DATABASE_URL,
    );

    const evidenceStats = await stat(testHarness.evidencePath);
    expect(evidenceStats.mode & 0o777).toBe(0o600);
    const serializedEvidence = await readFile(testHarness.evidencePath, "utf8");
    expect(serializedEvidence.endsWith("\n")).toBe(true);
    const parsedEvidence: unknown = JSON.parse(serializedEvidence);
    expect(parsedEvidence).toStrictEqual(testHarness.evidence);
    expect(Object.keys(testHarness.evidence)).toEqual([
      "version",
      "runId",
      "resourceName",
      "image",
      "dockerImageReference",
      "dockerImageId",
      "containerId",
      "containerName",
      "database",
      "schemas",
      "migrationHash",
      "testSeed",
      "labels",
      "connection",
      "staleContainerIdsRemoved",
      "createdAt",
    ]);
    expect(Object.keys(testHarness.evidence.connection)).toEqual([
      "host",
      "mappedPort",
      "dockerHostIp",
    ]);
    expect(testHarness.evidence).toMatchObject({
      version: 1,
      runId: testHarness.resources.runId,
      resourceName: testHarness.resources.containerName,
      image: POSTGRES_TEST_IMAGE,
      dockerImageReference: POSTGRES_TEST_IMAGE,
      containerName: `/${testHarness.resources.containerName}`,
      database: testHarness.resources.database,
      schemas: ["public", "drizzle"],
      migrationHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      testSeed: testHarness.resources.runId,
      labels: testHarness.resources.labels,
    });
    expect(testHarness.evidence.runId).toMatch(/^[0-9a-f]{32}$/u);
    expect(testHarness.evidence.containerId).toMatch(/^[0-9a-f]{64}$/u);
    expect(testHarness.evidence.dockerImageId).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(testHarness.evidence.connection.host.length).toBeGreaterThan(0);
    expect(testHarness.evidence.connection.mappedPort).toBeGreaterThan(0);
    expect(testHarness.evidence.connection.dockerHostIp.length).toBeGreaterThan(0);
    expect(Object.keys(testHarness.evidence.labels).sort()).toEqual(
      [
        "com.agent-workspace.aw008d.created-at",
        HARNESS_LABEL,
        "com.agent-workspace.aw008d.process-host",
        "com.agent-workspace.aw008d.process-id",
        "com.agent-workspace.aw008d.process-instance",
        RUN_ID_LABEL,
      ].sort(),
    );

    const runtimeClient = await getContainerRuntimeClient();
    const inspection = (await runtimeClient.container.inspect(
      runtimeClient.container.getById(testHarness.evidence.containerId),
    )) as ContainerInspection;
    const portBindings = inspection.NetworkSettings.Ports["5432/tcp"];
    expect(inspection.Id).toBe(testHarness.evidence.containerId);
    expect(inspection.Image).toBe(testHarness.evidence.dockerImageId);
    expect(inspection.Config.Image).toBe(POSTGRES_TEST_IMAGE);
    expect(inspection.Name).toBe(testHarness.evidence.containerName);
    expect(portBindings?.[0]?.HostIp).toBe(testHarness.evidence.connection.dockerHostIp);
    expect(await labeledContainerIds(testHarness.resources.runId)).toEqual([
      testHarness.evidence.containerId,
    ]);

    expectNoCredentialLeak(serializedEvidence, testHarness);
    expectNoCredentialLeak(capturedDiagnostics(), testHarness);
  });

  it("preserves opt-in evidence after container cleanup", async () => {
    const evidenceDirectory = await mkdtemp(join(tmpdir(), "aw008d-evidence-contract-"));
    let retainedHarness: PostgresTestHarness | undefined;
    let primaryFailure: CapturedFailure | undefined;
    try {
      retainedHarness = await startPostgresTestHarness({ evidenceDirectory });
      const runId = retainedHarness.resources.runId;
      expect(retainedHarness.evidencePath).toBe(join(evidenceDirectory, `${runId}.json`));
    } catch (error) {
      primaryFailure = { error };
    }

    const stages: TeardownStage[] = [];
    if (retainedHarness !== undefined) {
      const stoppedHarness = retainedHarness;
      const evidencePath = stoppedHarness.evidencePath;
      const runId = stoppedHarness.resources.runId;
      stages.push(
        { name: "stop retained harness", run: () => stoppedHarness.stop() },
        {
          name: "assert retained harness residue",
          run: async () => {
            expect(await labeledContainerIds(runId)).toEqual([]);
          },
        },
        {
          name: "assert retained evidence survives",
          run: async () => {
            await expect(access(evidencePath)).resolves.toBeUndefined();
            const evidenceStats = await stat(evidencePath);
            expect(evidenceStats.mode & 0o777).toBe(0o600);
            const retainedEvidence = await readFile(evidencePath, "utf8");
            expect(JSON.parse(retainedEvidence) as unknown).toStrictEqual(stoppedHarness.evidence);
            expectNoCredentialLeak(retainedEvidence, stoppedHarness);
          },
        },
      );
    }
    stages.push({
      name: "remove retained evidence fixture",
      run: () => rm(evidenceDirectory, { recursive: true, force: true }),
    });
    await runTeardownStages(stages, primaryFailure);
  });
});
