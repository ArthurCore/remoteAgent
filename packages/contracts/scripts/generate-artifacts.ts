import { createHash, randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { realpathSync } from "node:fs";
import { lstat, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { format } from "prettier";

import { renderSyncJsonSchemaV1, renderSyncOpenApiV1 } from "../src/artifacts.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const contractsDirectory = dirname(scriptDirectory);
const generatedDirectory = join(contractsDirectory, "generated");
const generatedParentDirectory = dirname(generatedDirectory);
const lockKey = createHash("sha256").update(resolve(generatedDirectory)).digest("hex").slice(0, 24);
const lockBaseName = `agent-workspace-contracts-${lockKey}.lock`;
const lockDirectory = join(tmpdir(), lockBaseName);
const lockCandidatePrefix = `${lockBaseName}.candidate-`;
const lockQuarantinePrefix = `${lockBaseName}.quarantine-`;
const OWNERLESS_LOCK_GRACE_MS = 250;
const ABANDONED_QUARANTINE_GRACE_MS = 15_000;

const artifactNames = ["sync-v1.schema.json", "openapi-sync-v1.json"] as const;
type ArtifactName = (typeof artifactNames)[number];
type Command = "check" | "generate";
type SupportedSignal = "SIGINT" | "SIGTERM";
type CheckStatus = "drift" | "missing" | "nonregular" | "ok" | "unexpected";

type Artifact = Readonly<{ name: ArtifactName; bytes: Buffer }>;
type CheckResult = Readonly<{ name: string; status: CheckStatus }>;
type LockOwner = Readonly<{ pid: number; token: string }>;

const signalExitCodes: Readonly<Record<SupportedSignal, number>> = {
  SIGINT: 130,
  SIGTERM: 143,
};

let interruptedBy: SupportedSignal | null = null;

class InterruptedError extends Error {
  readonly signal: SupportedSignal;

  constructor(signal: SupportedSignal) {
    super(`interrupted by ${signal}`);
    this.name = "InterruptedError";
    this.signal = signal;
  }
}

function parseCommand(arguments_: readonly string[]): Command {
  if (arguments_.length === 0) return "generate";
  if (arguments_.length === 1 && arguments_[0] === "--check") return "check";
  throw new TypeError("expected no arguments or exactly --check");
}

function throwIfInterrupted(): void {
  if (interruptedBy !== null) throw new InterruptedError(interruptedBy);
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isNodeError(error, "EPERM");
  }
}

async function readLockOwner(directory = lockDirectory): Promise<LockOwner | null> {
  try {
    const value = JSON.parse(
      await readFile(join(directory, "owner.json"), "utf8"),
    ) as Partial<LockOwner>;
    return typeof value.pid === "number" && typeof value.token === "string"
      ? { pid: value.pid, token: value.token }
      : null;
  } catch {
    return null;
  }
}

async function releaseOwnedLock(owner: LockOwner): Promise<void> {
  const current = await readLockOwner();
  if (current?.token === owner.token && current.pid === owner.pid) {
    await rm(lockDirectory, { force: true, recursive: true });
  }
}

async function recoverAuxiliaryLockResidue(): Promise<boolean> {
  const entries = await readdir(tmpdir(), { withFileTypes: true });
  let quarantinePresent = false;
  for (const entry of entries) {
    const isCandidate = entry.name.startsWith(lockCandidatePrefix);
    const isQuarantine = entry.name.startsWith(lockQuarantinePrefix);
    if (!isCandidate && !isQuarantine) continue;
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new TypeError(`artifact lock residue ${entry.name} must be a real directory`);
    }
    const path = join(tmpdir(), entry.name);
    let stats;
    let owner: LockOwner | null;
    try {
      [stats, owner] = await Promise.all([lstat(path), readLockOwner(path)]);
    } catch (error) {
      if (isNodeError(error, "ENOENT")) continue;
      throw error;
    }
    const age = Date.now() - stats.mtimeMs;
    if (isQuarantine) {
      const publishedAtText = entry.name.slice(lockQuarantinePrefix.length).split("-", 1)[0];
      const publishedAt = Number(publishedAtText);
      if (!Number.isSafeInteger(publishedAt) || publishedAt <= 0) {
        throw new TypeError(
          `artifact lock quarantine ${entry.name} has an invalid publication time`,
        );
      }
      if (
        Date.now() - publishedAt >= ABANDONED_QUARANTINE_GRACE_MS &&
        (owner === null || !processIsAlive(owner.pid))
      ) {
        await rm(path, { force: true, recursive: true });
        continue;
      }
      quarantinePresent = true;
      continue;
    }
    const expiredOwnerless = owner === null && age >= OWNERLESS_LOCK_GRACE_MS;
    if (expiredOwnerless || (owner !== null && !processIsAlive(owner.pid))) {
      await rm(path, { force: true, recursive: true });
    }
  }
  return quarantinePresent;
}

type LockObservation = Readonly<{
  dev: number;
  ino: number;
  owner: LockOwner | null;
}>;

function sameOwner(left: LockOwner | null, right: LockOwner | null): boolean {
  if (left === null || right === null) return left === right;
  return left.pid === right.pid && left.token === right.token;
}

async function restoreQuarantine(quarantineDirectory: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      await rename(quarantineDirectory, lockDirectory);
      return;
    } catch (error) {
      if (
        !isNodeError(error, "EEXIST") &&
        !isNodeError(error, "ENOTEMPTY") &&
        !isNodeError(error, "EACCES") &&
        !isNodeError(error, "EPERM") &&
        !(await pathExists(lockDirectory))
      ) {
        throw error;
      }
    }
    if (Date.now() >= deadline) {
      throw new TypeError("artifact lock quarantine restoration timed out");
    }
    await delay(25);
  }
}

async function quarantineObservedLock(observed: LockObservation): Promise<void> {
  const quarantineDirectory = join(
    tmpdir(),
    `${lockQuarantinePrefix}${String(Date.now())}-${randomUUID()}`,
  );
  try {
    await rename(lockDirectory, quarantineDirectory);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return;
    throw error;
  }

  const [movedStats, movedOwner] = await Promise.all([
    lstat(quarantineDirectory),
    readLockOwner(quarantineDirectory),
  ]);
  const sameIdentity =
    movedStats.dev === observed.dev &&
    movedStats.ino === observed.ino &&
    sameOwner(movedOwner, observed.owner);
  if (!sameIdentity) {
    await restoreQuarantine(quarantineDirectory);
    return;
  }
  await rm(quarantineDirectory, { force: true, recursive: true });
}

async function recoverStaleLock(): Promise<void> {
  let stats;
  try {
    stats = await lstat(lockDirectory);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return;
    throw error;
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new TypeError("artifact generator lock must be a real directory");
  }
  const owner = await readLockOwner();
  if (owner !== null && processIsAlive(owner.pid)) return;
  if (owner === null && Date.now() - stats.mtimeMs < OWNERLESS_LOCK_GRACE_MS) return;
  await quarantineObservedLock({ dev: stats.dev, ino: stats.ino, owner });
}

async function publishCandidate(owner: LockOwner): Promise<boolean> {
  let candidateDirectory: string | null = await mkdtemp(join(tmpdir(), lockCandidatePrefix));
  try {
    await writeFile(join(candidateDirectory, "owner.json"), `${JSON.stringify(owner)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    if (await recoverAuxiliaryLockResidue()) return false;
    try {
      await rename(candidateDirectory, lockDirectory);
      candidateDirectory = null;
    } catch (error) {
      if (
        isNodeError(error, "EEXIST") ||
        isNodeError(error, "ENOTEMPTY") ||
        isNodeError(error, "EACCES") ||
        isNodeError(error, "EPERM") ||
        (await pathExists(lockDirectory))
      ) {
        return false;
      }
      throw error;
    }
    if (await recoverAuxiliaryLockResidue()) {
      await releaseOwnedLock(owner);
      return false;
    }
    return true;
  } finally {
    if (candidateDirectory !== null) {
      await rm(candidateDirectory, { force: true, recursive: true });
    }
  }
}

async function acquireLock(): Promise<() => Promise<void>> {
  const owner: LockOwner = { pid: process.pid, token: randomUUID() };
  const deadline = Date.now() + 15_000;

  for (;;) {
    throwIfInterrupted();
    if (!(await recoverAuxiliaryLockResidue()) && (await publishCandidate(owner))) {
      return async () => releaseOwnedLock(owner);
    }
    await recoverStaleLock();
    if (Date.now() >= deadline) throw new TypeError("artifact generator lock timed out");
    await delay(25);
  }
}

async function withLock<T>(operation: () => Promise<T>): Promise<T> {
  const release = await acquireLock();
  try {
    return await operation();
  } finally {
    await release();
  }
}

export async function formatJsonForGeneration(raw: string): Promise<string> {
  return format(raw, {
    parser: "json",
    printWidth: 100,
    tabWidth: 2,
    endOfLine: "lf",
  });
}

async function renderArtifacts(): Promise<readonly Artifact[]> {
  const input = { mode: "core" } as const;
  const [schemaText, openApiText] = await Promise.all([
    formatJsonForGeneration(renderSyncJsonSchemaV1(input)),
    formatJsonForGeneration(renderSyncOpenApiV1(input)),
  ]);
  return [
    { name: "sync-v1.schema.json", bytes: Buffer.from(schemaText, "utf8") },
    { name: "openapi-sync-v1.json", bytes: Buffer.from(openApiText, "utf8") },
  ];
}

async function writeArtifacts(directory: string, artifacts: readonly Artifact[]): Promise<void> {
  const results = await Promise.allSettled(
    artifacts.map(({ name, bytes }) => writeFile(join(directory, name), bytes, { flag: "wx" })),
  );
  const failures = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map(({ reason }) => reason as unknown);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "artifact staging writes failed");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return false;
    throw error;
  }
}

async function recoverReplacementResidue(): Promise<void> {
  const entries = await readdir(generatedParentDirectory, { withFileTypes: true });
  const stages = entries.filter(({ name }) => name.startsWith(".generated-stage-"));
  const backups = entries.filter(({ name }) => name.startsWith(".generated-backup-"));

  for (const entry of [...stages, ...backups]) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new TypeError(`replacement residue ${entry.name} must be a real directory`);
    }
  }
  for (const { name } of stages) {
    await rm(join(generatedParentDirectory, name), { force: true, recursive: true });
  }

  const targetExists = await pathExists(generatedDirectory);
  if (!targetExists && backups.length === 1) {
    await rename(join(generatedParentDirectory, backups[0]!.name), generatedDirectory);
    return;
  }
  if (!targetExists && backups.length > 1) {
    throw new TypeError("multiple artifact backups require manual recovery");
  }
  if (targetExists) {
    for (const { name } of backups) {
      await rm(join(generatedParentDirectory, name), { force: true, recursive: true });
    }
  }
}

async function rollbackInstalledReplacement(
  backupDirectory: string,
  cleanupError: unknown,
): Promise<never> {
  const failedNewDirectory = join(generatedParentDirectory, `.generated-failed-${randomUUID()}`);
  let rollbackError: unknown;
  try {
    await rename(generatedDirectory, failedNewDirectory);
    await rename(backupDirectory, generatedDirectory);
    await rm(failedNewDirectory, { force: true, recursive: true });
  } catch (error) {
    rollbackError = error;
  }
  if (rollbackError !== undefined) {
    throw new AggregateError(
      [cleanupError, rollbackError],
      "artifact cleanup failed and replacement rollback was incomplete",
    );
  }
  throw cleanupError;
}

async function replaceGeneratedDirectory(stageDirectory: string): Promise<void> {
  const backupDirectory = join(generatedParentDirectory, `.generated-backup-${randomUUID()}`);
  let previousDirectoryMoved = false;
  let replacementInstalled = false;

  try {
    await rename(generatedDirectory, backupDirectory);
    previousDirectoryMoved = true;
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) throw error;
  }

  try {
    throwIfInterrupted();
    await rename(stageDirectory, generatedDirectory);
    replacementInstalled = true;
    throwIfInterrupted();
  } catch (error) {
    if (previousDirectoryMoved && !replacementInstalled) {
      try {
        await rename(backupDirectory, generatedDirectory);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "artifact directory replacement and rollback failed",
        );
      }
    }
    throw error;
  }

  if (replacementInstalled && previousDirectoryMoved) {
    try {
      await rm(backupDirectory, { force: true, recursive: true });
    } catch (cleanupError) {
      await rollbackInstalledReplacement(backupDirectory, cleanupError);
    }
  }
}

async function generateArtifacts(artifacts: readonly Artifact[]): Promise<void> {
  await recoverReplacementResidue();
  let stageDirectory: string | null = null;
  try {
    stageDirectory = await mkdtemp(join(generatedParentDirectory, ".generated-stage-"));
    throwIfInterrupted();
    await writeArtifacts(stageDirectory, artifacts);
    throwIfInterrupted();
    await replaceGeneratedDirectory(stageDirectory);
  } finally {
    if (stageDirectory !== null) {
      await rm(stageDirectory, { force: true, recursive: true });
    }
  }
}

async function inspectGeneratedTree(): Promise<readonly CheckResult[]> {
  try {
    const rootStats = await lstat(generatedDirectory);
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
      return [
        { name: "generated", status: "nonregular" },
        ...artifactNames.map((name) => ({ name, status: "missing" }) as const),
      ];
    }
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return artifactNames.map((name) => ({ name, status: "missing" }));
    }
    throw error;
  }

  let entries: Dirent<string>[];
  try {
    entries = await readdir(generatedDirectory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return artifactNames.map((name) => ({ name, status: "missing" }));
    }
    throw error;
  }

  const results: CheckResult[] = [];
  const expected = new Set<string>(artifactNames);
  const seen = new Set<string>();
  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    const isExpected = expected.has(entry.name);
    if (isExpected) seen.add(entry.name);
    if (!isExpected) results.push({ name: entry.name, status: "unexpected" });
    if (!entry.isFile() || entry.isSymbolicLink()) {
      results.push({ name: entry.name, status: "nonregular" });
    }
  }
  for (const name of artifactNames) {
    if (!seen.has(name)) results.push({ name, status: "missing" });
  }
  return results;
}

async function compareArtifact(
  temporaryDirectory: string,
  artifact: Artifact,
): Promise<CheckResult> {
  const temporaryBytes = await readFile(join(temporaryDirectory, artifact.name));
  const committedBytes = await readFile(join(generatedDirectory, artifact.name));
  return {
    name: artifact.name,
    status: temporaryBytes.equals(committedBytes) ? "ok" : "drift",
  };
}

async function checkArtifacts(artifacts: readonly Artifact[]): Promise<readonly CheckResult[]> {
  let temporaryDirectory: string | null = null;
  try {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "agent-workspace-contracts-"));
    await writeArtifacts(temporaryDirectory, artifacts);
    const treeResults = await inspectGeneratedTree();
    const blockedExpected = new Set(
      treeResults
        .filter(
          ({ name, status }) => artifactNames.includes(name as ArtifactName) && status !== "ok",
        )
        .map(({ name }) => name),
    );
    const contentResults: CheckResult[] = [];
    for (const artifact of artifacts) {
      if (!blockedExpected.has(artifact.name)) {
        contentResults.push(await compareArtifact(temporaryDirectory, artifact));
      }
    }
    return [...treeResults, ...contentResults];
  } finally {
    if (temporaryDirectory !== null) {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  }
}

function installSignalHandlers(): () => void {
  const handlers: Record<SupportedSignal, () => void> = {
    SIGINT: () => {
      interruptedBy = "SIGINT";
    },
    SIGTERM: () => {
      interruptedBy = "SIGTERM";
    },
  };
  for (const signal of Object.keys(handlers) as SupportedSignal[])
    process.on(signal, handlers[signal]);
  return () => {
    for (const signal of Object.keys(handlers) as SupportedSignal[])
      process.off(signal, handlers[signal]);
  };
}

async function run(command: Command): Promise<boolean> {
  const artifacts = await renderArtifacts();
  return withLock(async () => {
    throwIfInterrupted();
    if (command === "generate") {
      await generateArtifacts(artifacts);
      for (const { name } of artifacts) console.log(`${name}: generated`);
      return true;
    }
    const results = await checkArtifacts(artifacts);
    for (const { name, status } of results) {
      const output = status === "ok" ? console.log : console.error;
      output(`${name}: ${status}`);
    }
    return results.every(({ status }) => status === "ok");
  });
}

export async function runArtifactGeneratorCli(arguments_: readonly string[]): Promise<number> {
  let command: Command;
  try {
    command = parseCommand(arguments_);
  } catch {
    console.error("arguments: invalid");
    return 2;
  }

  interruptedBy = null;
  const removeSignalHandlers = installSignalHandlers();
  try {
    return (await run(command)) ? 0 : 1;
  } catch (error) {
    if (error instanceof InterruptedError) {
      console.error(`artifacts: interrupted (${error.signal})`);
      return signalExitCodes[error.signal];
    }
    for (const name of artifactNames) console.error(`${name}: failed`);
    return 1;
  } finally {
    removeSignalHandlers();
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return (
    pathToFileURL(realpathSync(resolve(entry))).href ===
    pathToFileURL(realpathSync(fileURLToPath(import.meta.url))).href
  );
}

if (isMainModule()) {
  void runArtifactGeneratorCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
