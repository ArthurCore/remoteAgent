import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const fixtures = [
  {
    source: "apps/web/test/fixtures/forbidden-db-import.ts",
    requestedModule: "../../../../packages/db/src/index.js",
    resolvedTarget: "packages/db/src/index.ts",
    expectedRule: "web-must-not-import-db",
    expectedUnresolvedTo: "../../../../packages/db/src/index.js",
  },
  {
    source: "packages/chat-core/test/fixtures/forbidden-db-import.ts",
    requestedModule: "../../../db/src/index.js",
    resolvedTarget: "packages/db/src/index.ts",
    expectedRule: "chat-core-dependencies-are-restricted",
    expectedUnresolvedTo: "../../../db/src/index.js",
  },
];
const expectedStatus = 0;
const repositoryRoot = process.cwd();
const executable = resolve(repositoryRoot, "node_modules/.bin/depcruise");
const config = resolve(repositoryRoot, ".dependency-cruiser.cjs");

function executionDetails(result) {
  return [
    `status: ${String(result.status)}`,
    `error: ${result.error === undefined ? "null" : String(result.error)}`,
    `signal: ${String(result.signal)}`,
    `stdout:\n${result.stdout}`,
    `stderr:\n${result.stderr}`,
  ].join("\n");
}

function assertionError(message, result, cause) {
  return new Error(`${message}\n${executionDetails(result)}`, cause === undefined ? {} : { cause });
}

function runCruise(source, cwd = repositoryRoot) {
  const result = spawnSync(executable, ["--config", config, "--output-type", "json", source], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, AW008_BOUNDARY_FIXTURE: "1" },
  });
  const resultError = result.error ?? null;

  if (resultError !== null || result.signal !== null || result.status !== expectedStatus) {
    throw assertionError(
      `dependency-cruiser execution must have error null, signal null, and pinned status ${expectedStatus}: ${source}`,
      result,
    );
  }

  try {
    return { cruiseResult: JSON.parse(result.stdout), result };
  } catch (error) {
    throw assertionError(`dependency-cruiser did not produce valid JSON: ${source}`, result, error);
  }
}

function hasExactRule(rule, expectedName) {
  return (
    rule !== null &&
    typeof rule === "object" &&
    Object.keys(rule).length === 2 &&
    rule.name === expectedName &&
    rule.severity === "error"
  );
}

function assertResolvedFixture(fixture) {
  const { cruiseResult, result } = runCruise(fixture.source);
  const sourceModules = (cruiseResult.modules ?? []).filter(
    (module) => module.source === fixture.source,
  );
  const sourceModule = sourceModules[0];
  const dependencies = sourceModule?.dependencies ?? [];
  const dependency = dependencies[0];
  const violations = cruiseResult.summary?.violations ?? [];
  const violation = violations[0];
  const hasUnresolvedTo = violation !== undefined && Object.hasOwn(violation, "unresolvedTo");

  if (
    sourceModules.length !== 1 ||
    dependencies.length !== 1 ||
    dependency?.module !== fixture.requestedModule ||
    dependency.resolved !== fixture.resolvedTarget ||
    dependency.followable !== true ||
    dependency.couldNotResolve !== false ||
    dependency.matchesDoNotFollow !== false ||
    violations.length !== 1 ||
    cruiseResult.summary?.error !== 1 ||
    violation?.type !== "dependency" ||
    !hasExactRule(violation.rule, fixture.expectedRule) ||
    violation.from !== fixture.source ||
    violation.to !== fixture.resolvedTarget ||
    !hasUnresolvedTo ||
    violation.unresolvedTo !== fixture.expectedUnresolvedTo
  ) {
    throw assertionError(
      `resolved fixture must have one followable edge and exactly one ${fixture.expectedRule} error from ${fixture.source} via ${fixture.requestedModule} to ${fixture.resolvedTarget}, with pinned unresolvedTo ${fixture.expectedUnresolvedTo}`,
      result,
    );
  }

  console.log(
    `boundary fixture ${fixture.source} resolved ${fixture.requestedModule} to ${fixture.resolvedTarget} and was rejected only by ${fixture.expectedRule}`,
  );
}

function assertUnresolvedProtection(source, requestedModule, cruiseResult, result) {
  const sourceModules = (cruiseResult.modules ?? []).filter((module) => module.source === source);
  const dependencies = sourceModules[0]?.dependencies ?? [];
  const dependency = dependencies[0];
  const violations = cruiseResult.summary?.violations ?? [];
  const violation = violations[0];

  if (
    sourceModules.length !== 1 ||
    dependencies.length !== 1 ||
    dependency?.module !== requestedModule ||
    dependency.resolved !== requestedModule ||
    dependency.followable !== false ||
    dependency.couldNotResolve !== true ||
    violations.length !== 1 ||
    cruiseResult.summary?.error !== 1 ||
    violation?.type !== "dependency" ||
    !hasExactRule(violation.rule, "no-unresolvable-dependencies") ||
    violation.from !== source ||
    violation.to !== requestedModule ||
    !Object.hasOwn(violation, "unresolvedTo") ||
    violation.unresolvedTo !== requestedModule
  ) {
    throw assertionError(
      `fixture mode must reject the adversarial unresolved import only by no-unresolvable-dependencies: ${source} -> ${requestedModule}`,
      result,
    );
  }
}

function assertAliasLikeAllowed(source, requestedModule, resolvedTarget, cruiseResult, result) {
  const sourceModules = (cruiseResult.modules ?? []).filter((module) => module.source === source);
  const dependencies = sourceModules[0]?.dependencies ?? [];
  const dependency = dependencies[0];
  const violations = cruiseResult.summary?.violations ?? [];

  if (
    sourceModules.length !== 1 ||
    dependencies.length !== 1 ||
    dependency?.module !== requestedModule ||
    dependency.resolved !== resolvedTarget ||
    dependency.followable !== false ||
    dependency.couldNotResolve !== false ||
    dependency.matchesDoNotFollow !== true ||
    violations.length !== 0 ||
    cruiseResult.summary?.error !== 0
  ) {
    throw assertionError(
      `fixture mode must allow the resolved alias-like package without a chat-core DB false positive: ${source} -> ${requestedModule}`,
      result,
    );
  }
}

async function assertAdversarialProbes() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "aw008-boundary-probes-"));
  const probeDirectory = join(temporaryRoot, "packages/chat-core/test/fixtures");
  const unresolvedSource = "packages/chat-core/test/fixtures/unresolved-boundary-probe.ts";
  const unresolvedModule = "review-definitely-missing-framework";
  const unresolvedAliasLikeSource =
    "packages/chat-core/test/fixtures/unresolved-alias-like-boundary-probe.ts";
  const unresolvedAliasLikeModule = "@agent-workspace/database-unresolved-boundary-probe";
  const aliasLikeSource = "packages/chat-core/test/fixtures/alias-like-boundary-probe.ts";
  const aliasLikeModule = "@agent-workspace/database-boundary-probe";
  const aliasLikePackageDirectory = join(
    temporaryRoot,
    "node_modules/@agent-workspace/database-boundary-probe",
  );
  const aliasLikeResolvedTarget = "node_modules/@agent-workspace/database-boundary-probe/index.js";

  try {
    await mkdir(probeDirectory, { recursive: true });
    await mkdir(aliasLikePackageDirectory, { recursive: true });
    await writeFile(
      join(temporaryRoot, "tsconfig.base.json"),
      `${JSON.stringify({
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          target: "ES2023",
        },
      })}\n`,
    );
    await writeFile(
      join(temporaryRoot, unresolvedSource),
      `import ${JSON.stringify(unresolvedModule)};\n`,
    );
    await writeFile(
      join(temporaryRoot, unresolvedAliasLikeSource),
      `import ${JSON.stringify(unresolvedAliasLikeModule)};\n`,
    );
    await writeFile(
      join(aliasLikePackageDirectory, "package.json"),
      `${JSON.stringify({
        name: aliasLikeModule,
        version: "0.0.0",
        type: "module",
        exports: "./index.js",
      })}\n`,
    );
    await writeFile(join(aliasLikePackageDirectory, "index.js"), "export {};\n");
    await writeFile(
      join(temporaryRoot, aliasLikeSource),
      `import ${JSON.stringify(aliasLikeModule)};\n`,
    );

    const unresolvedRun = runCruise(unresolvedSource, temporaryRoot);
    assertUnresolvedProtection(
      unresolvedSource,
      unresolvedModule,
      unresolvedRun.cruiseResult,
      unresolvedRun.result,
    );

    const unresolvedAliasLikeRun = runCruise(unresolvedAliasLikeSource, temporaryRoot);
    assertUnresolvedProtection(
      unresolvedAliasLikeSource,
      unresolvedAliasLikeModule,
      unresolvedAliasLikeRun.cruiseResult,
      unresolvedAliasLikeRun.result,
    );

    const aliasLikeRun = runCruise(aliasLikeSource, temporaryRoot);
    assertAliasLikeAllowed(
      aliasLikeSource,
      aliasLikeModule,
      aliasLikeResolvedTarget,
      aliasLikeRun.cruiseResult,
      aliasLikeRun.result,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  console.log(
    "boundary fixture mode rejected both temporary unresolved probes only by no-unresolvable-dependencies, avoided an alias-like DB false positive, and allowed the resolved alias-like probe",
  );
}

for (const fixture of fixtures) assertResolvedFixture(fixture);
await assertAdversarialProbes();
