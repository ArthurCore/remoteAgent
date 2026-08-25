import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = process.cwd();

const requiredRootFiles = [
  ".dependency-cruiser.cjs",
  ".dockerignore",
  ".editorconfig",
  ".env.example",
  ".github/workflows/ci.yml",
  ".gitignore",
  ".node-version",
  ".nvmrc",
  ".prettierignore",
  "Dockerfile",
  "LICENSE",
  "docker-compose.yml",
  "eslint.config.mjs",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "prettier.config.mjs",
  "tsconfig.base.json",
  "turbo.json",
  "docs/operations/container-image-lock.md",
];

const implementationFiles = [
  "apps/api/package.json",
  "apps/api/src/app.module.ts",
  "apps/api/src/main.ts",
  "apps/api/src/platform/health.controller.ts",
  "apps/api/src/platform/health.service.ts",
  "apps/api/test/health.spec.ts",
  "apps/api/tsconfig.json",
  "apps/api/vitest.config.ts",
  "apps/web/app/api/health/route.ts",
  "apps/web/app/globals.css",
  "apps/web/app/layout.tsx",
  "apps/web/app/page.tsx",
  "apps/web/next-env.d.ts",
  "apps/web/next.config.ts",
  "apps/web/package.json",
  "apps/web/test/fixtures/forbidden-db-import.ts",
  "apps/web/test/health.spec.ts",
  "apps/web/tsconfig.json",
  "apps/web/vitest.config.ts",
  "apps/worker/package.json",
  "apps/worker/src/health-server.ts",
  "apps/worker/src/main.ts",
  "apps/worker/src/storage-init.ts",
  "apps/worker/test/health.spec.ts",
  "apps/worker/test/storage-init.spec.ts",
  "apps/worker/tsconfig.json",
  "apps/worker/vitest.config.ts",
  "packages/chat-core/package.json",
  "packages/chat-core/src/index.ts",
  "packages/chat-core/tsconfig.json",
  "packages/config/package.json",
  "packages/config/src/env.ts",
  "packages/config/test/env.spec.ts",
  "packages/config/tsconfig.json",
  "packages/contracts/generated/openapi-sync-v1.json",
  "packages/contracts/generated/sync-v1.schema.json",
  "packages/contracts/package.json",
  "packages/contracts/scripts/generate-artifacts.ts",
  "packages/contracts/src/artifacts.ts",
  "packages/contracts/src/events.ts",
  "packages/contracts/src/index.ts",
  "packages/contracts/src/primitives.ts",
  "packages/contracts/src/sync.ts",
  "packages/contracts/test/artifacts.spec.ts",
  "packages/contracts/test/events.spec.ts",
  "packages/contracts/test/primitives.spec.ts",
  "packages/contracts/test/sync.spec.ts",
  "packages/contracts/tsconfig.json",
  "packages/contracts/vitest.config.ts",
  "packages/db/drizzle.config.ts",
  "packages/db/drizzle/0000_aw008_foundation.sql",
  "packages/db/drizzle/meta/0000_snapshot.json",
  "packages/db/drizzle/meta/_journal.json",
  "packages/db/package.json",
  "packages/db/src/index.ts",
  "packages/db/src/migrate.ts",
  "packages/db/src/migration-config.ts",
  "packages/db/src/migration-env.ts",
  "packages/db/src/migration-integrity.ts",
  "packages/db/src/schema/enums.ts",
  "packages/db/src/schema/foundation.ts",
  "packages/db/src/schema/index.ts",
  "packages/db/test/constraints.integration.spec.ts",
  "packages/db/test/fixtures/failing-migration/0000_valid_then_fail.sql",
  "packages/db/test/fixtures/failing-migration/meta/_journal.json",
  "packages/db/test/migration.integration.spec.ts",
  "packages/db/test/migration.spec.ts",
  "packages/db/test/roles.integration.spec.ts",
  "packages/db/test/schema.spec.ts",
  "packages/db/test/support/postgres.ts",
  "packages/db/tsconfig.json",
  "packages/db/vitest.config.ts",
  "packages/test-config/package.json",
  "packages/test-config/src/vitest.ts",
  "packages/ui/package.json",
  "packages/ui/src/index.ts",
  "packages/ui/tsconfig.json",
  "scripts/assert-aw007-tree.mjs",
  "scripts/assert-boundary-fixture.mjs",
  "scripts/compose.sh",
  "scripts/container-smoke.sh",
  "scripts/postgres/init-roles.sh",
  "scripts/wait-for-url.mjs",
];

const workflowFiles = [".github/workflows/ci.yml"];

const packageNamesByManifest = new Map([
  ["apps/api/package.json", "@agent-workspace/api"],
  ["apps/web/package.json", "@agent-workspace/web"],
  ["apps/worker/package.json", "@agent-workspace/worker"],
  ["packages/chat-core/package.json", "@agent-workspace/chat-core"],
  ["packages/config/package.json", "@agent-workspace/config"],
  ["packages/contracts/package.json", "@agent-workspace/contracts"],
  ["packages/db/package.json", "@agent-workspace/db"],
  ["packages/test-config/package.json", "@agent-workspace/test-config"],
  ["packages/ui/package.json", "@agent-workspace/ui"],
]);

const canonicalRootScripts = {
  dev: "turbo run dev --parallel",
  build: "turbo run build",
  clean: "turbo run clean",
  format: "prettier --write .",
  "format:check": "prettier --check .",
  lint: "turbo run lint",
  typecheck: "turbo run typecheck",
  "boundaries:check":
    "depcruise --config .dependency-cruiser.cjs apps packages && node scripts/assert-boundary-fixture.mjs",
  "db:generate": "pnpm --filter @agent-workspace/db db:generate",
  "db:check":
    "pnpm --filter @agent-workspace/contracts contracts:check && pnpm --filter @agent-workspace/db db:check",
  "db:migrate": "pnpm --filter @agent-workspace/db db:migrate",
  "test:unit": "turbo run test:unit",
  "test:integration": "pnpm --filter @agent-workspace/db test:integration",
  "scaffold:check": "node scripts/assert-aw007-tree.mjs",
  "compose:up": "scripts/compose.sh up -d --build --wait",
  "compose:down": "scripts/compose.sh down --remove-orphans",
  "compose:reset": "scripts/compose.sh down --volumes --remove-orphans",
  "container:smoke": "scripts/container-smoke.sh",
  ci: "pnpm format:check && pnpm lint && pnpm typecheck && pnpm boundaries:check && pnpm test:unit && pnpm db:check && pnpm scaffold:check && pnpm build",
};

const canonicalContractsScripts = {
  build: "tsc -p tsconfig.json",
  clean: "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\"",
  "contracts:generate": "tsx scripts/generate-artifacts.ts",
  "contracts:check":
    "tsx scripts/generate-artifacts.ts --check && vitest run test/artifacts.spec.ts",
  lint: "eslint src test scripts vitest.config.ts",
  typecheck: "tsc -p tsconfig.json --noEmit",
  "test:unit": "vitest run test/{primitives,events,sync}.spec.ts",
};

const canonicalDbScripts = {
  build: "tsc -p tsconfig.json",
  clean: "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\"",
  "db:generate": "drizzle-kit generate --config drizzle.config.ts --name aw008_foundation",
  "db:check":
    "drizzle-kit check --config drizzle.config.ts && tsx src/migration-integrity.ts --check-files",
  "db:migrate": "tsx src/migrate.ts",
  lint: "eslint src test drizzle.config.ts vitest.config.ts",
  typecheck: "tsc -p tsconfig.json --noEmit",
  "test:unit": "vitest run test/schema.spec.ts test/migration.spec.ts",
  "test:integration":
    "vitest run --config vitest.config.ts --project integration --no-file-parallelism",
};

const exactDependenciesByManifest = new Map([
  [
    "apps/api/package.json",
    {
      dependencies: {
        "@agent-workspace/config": "workspace:*",
        "@agent-workspace/contracts": "workspace:*",
        "@agent-workspace/db": "workspace:*",
        "@aws-sdk/client-s3": "3.1116.0",
        "@nestjs/common": "11.2.1",
        "@nestjs/core": "11.2.1",
        "@nestjs/platform-fastify": "11.2.1",
        fastify: "5.12.1",
        "reflect-metadata": "0.2.2",
        rxjs: "7.8.2",
        "socket.io": "4.8.3",
      },
      devDependencies: {
        "@agent-workspace/test-config": "workspace:*",
        typescript: "5.9.3",
        vitest: "4.1.11",
      },
    },
  ],
  [
    "apps/web/package.json",
    {
      dependencies: {
        "@agent-workspace/contracts": "workspace:*",
        "@agent-workspace/ui": "workspace:*",
        next: "16.3.2",
        react: "19.2.8",
        "react-dom": "19.2.8",
        "socket.io-client": "4.8.3",
      },
      devDependencies: {
        "@agent-workspace/test-config": "workspace:*",
        "@types/react": "19.2.18",
        "@types/react-dom": "19.2.5",
        typescript: "5.9.3",
        vitest: "4.1.11",
      },
    },
  ],
  [
    "apps/worker/package.json",
    {
      dependencies: {
        "@agent-workspace/config": "workspace:*",
        "@agent-workspace/contracts": "workspace:*",
        "@agent-workspace/db": "workspace:*",
        "@aws-sdk/client-s3": "3.1116.0",
      },
      devDependencies: {
        "@agent-workspace/test-config": "workspace:*",
        typescript: "5.9.3",
        vitest: "4.1.11",
      },
    },
  ],
  [
    "packages/chat-core/package.json",
    {
      dependencies: {
        "@agent-workspace/config": "workspace:*",
        "@agent-workspace/contracts": "workspace:*",
      },
      devDependencies: { typescript: "5.9.3" },
    },
  ],
  [
    "packages/config/package.json",
    {
      dependencies: { zod: "4.4.3" },
      devDependencies: { typescript: "5.9.3", vitest: "4.1.11" },
    },
  ],
  [
    "packages/contracts/package.json",
    {
      dependencies: { zod: "4.4.3" },
      devDependencies: {
        "@agent-workspace/test-config": "workspace:*",
        "fast-check": "4.9.0",
        tsx: "4.23.12",
        typescript: "5.9.3",
        vitest: "4.1.11",
      },
    },
  ],
  [
    "packages/db/package.json",
    {
      dependencies: {
        "@agent-workspace/config": "workspace:*",
        "drizzle-orm": "0.45.2",
        pg: "8.23.0",
      },
      devDependencies: {
        "@agent-workspace/test-config": "workspace:*",
        "@testcontainers/postgresql": "12.1.0",
        "@types/pg": "8.23.1",
        "drizzle-kit": "0.31.10",
        testcontainers: "12.1.0",
        tsx: "4.23.12",
        typescript: "5.9.3",
        vitest: "4.1.11",
      },
    },
  ],
  [
    "packages/test-config/package.json",
    {
      dependencies: {},
      devDependencies: { vitest: "4.1.11" },
    },
  ],
  [
    "packages/ui/package.json",
    {
      dependencies: { react: "19.2.8" },
      devDependencies: { "@types/react": "19.2.18", typescript: "5.9.3" },
    },
  ],
]);

const canonicalRootDevDependencies = {
  "@types/node": "24.13.3",
  "@typescript-eslint/eslint-plugin": "8.67.0",
  "@typescript-eslint/parser": "8.67.0",
  "@vitest/coverage-v8": "4.1.11",
  "dependency-cruiser": "18.2.0",
  "drizzle-kit": "0.31.10",
  eslint: "9.39.5",
  prettier: "3.9.6",
  tsx: "4.23.12",
  turbo: "2.10.11",
  typescript: "5.9.3",
  vitest: "4.1.11",
};

const canonicalWorkspacePolicy = `packages:
  - apps/*
  - packages/*
allowBuilds:
  "cpu-features@0.0.10": false
  esbuild: true
  "protobufjs@7.6.5": false
  "ssh2@1.17.0": false
minimumReleaseAgeExclude:
  - "@types/react-dom@19.2.5"
`;

const canonicalWorkflow = `name: CI

"on":
  pull_request:

permissions:
  contents: read

jobs:
  ci:
    name: Frozen uncached CI and integration
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09
      - name: Set up Node.js
        uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444
        with:
          node-version: 24.15.0
          package-manager-cache: false
      - name: Enable Corepack and pin pnpm
        run: |
          corepack enable
          corepack prepare pnpm@11.23.0 --activate
      - name: Install frozen dependencies
        run: CI=true pnpm install --frozen-lockfile
      - name: Run uncached CI
        run: TURBO_FORCE=true pnpm run ci
      - name: Run Testcontainers integration
        env:
          AW008D_TEST_EVIDENCE_DIRECTORY: \${{ github.workspace }}/artifacts/testcontainers
        run: pnpm test:integration
      - name: Upload Testcontainers evidence
        if: always()
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02
        with:
          name: aw008d-testcontainers-evidence
          path: artifacts/testcontainers/*.json
          if-no-files-found: error
`;

const exactMigrationTables = [
  "channel_membership_epochs",
  "channels",
  "principals",
  "tenants",
  "workspace_memberships",
  "workspaces",
];

const ignoredDirectoryNames = new Set([".next", ".turbo", "coverage", "dist", "node_modules"]);
const forbiddenTestMarker =
  /\b(?:describe|suite|it|test)(?:\s*\.\s*(?:concurrent|sequential))?\s*\.\s*(?:only|runIf|skip|skipIf|todo)\b|\b(?:runIf|skipIf)\s*\(/u;

function normalizedPath(path) {
  return path.split(sep).join("/");
}

function sortedObject(value) {
  if (Array.isArray(value)) return value.map(sortedObject);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortedObject(value[key])]),
  );
}

function assertExactObject(label, actual, expected) {
  if (JSON.stringify(sortedObject(actual)) !== JSON.stringify(sortedObject(expected))) {
    throw new Error(`${label} does not match the AW-008 frozen manifest`);
  }
}

function assertExactList(label, actual, expected) {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  const actualSet = new Set(sortedActual);
  const expectedSet = new Set(sortedExpected);
  const missing = sortedExpected.filter((item) => !actualSet.has(item));
  const extra = sortedActual.filter((item) => !expectedSet.has(item));
  if (sortedActual.length !== sortedExpected.length || missing.length > 0 || extra.length > 0) {
    throw new Error(
      `${label} does not match the AW-008 manifest; missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}`,
    );
  }
}

async function assertRealFile(path) {
  let details;
  try {
    details = await lstat(resolve(root, path));
  } catch {
    throw new Error(`AW-008 required file is missing: ${path}`);
  }
  if (details.isSymbolicLink() || !details.isFile()) {
    throw new Error(`AW-008 required file must be a real regular file: ${path}`);
  }
}

async function assertRealDirectory(path) {
  let details;
  try {
    details = await lstat(resolve(root, path));
  } catch {
    throw new Error(`AW-008 required directory is missing: ${path}`);
  }
  if (details.isSymbolicLink() || !details.isDirectory()) {
    throw new Error(`AW-008 required directory must be a real directory: ${path}`);
  }
}

async function collectExactTree(directory, files, directories) {
  await assertRealDirectory(directory);
  directories.push(directory);
  const entries = await readdir(resolve(root, directory));
  for (const entry of entries) {
    const repositoryPath = normalizedPath(join(directory, entry));
    const details = await lstat(resolve(root, repositoryPath));
    if (details.isSymbolicLink()) {
      throw new Error(`Symlink is forbidden in the AW-008 implementation tree: ${repositoryPath}`);
    }
    if (details.isDirectory()) {
      if (ignoredDirectoryNames.has(entry)) continue;
      await collectExactTree(repositoryPath, files, directories);
    } else if (details.isFile()) {
      if (entry.endsWith(".tsbuildinfo")) continue;
      files.push(repositoryPath);
    } else {
      throw new Error(
        `Non-regular AW-008 implementation tree entry is forbidden: ${repositoryPath}`,
      );
    }
  }
}

function expectedDirectoriesFor(files, roots) {
  const expected = new Set(roots);
  for (const file of files) {
    let directory = normalizedPath(dirname(file));
    while (directory !== ".") {
      expected.add(directory);
      directory = normalizedPath(dirname(directory));
    }
  }
  return [...expected];
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

for (const path of requiredRootFiles) await assertRealFile(path);

const implementationRoots = ["apps", "packages", "scripts"];
const actualImplementationFiles = [];
const actualImplementationDirectories = [];
for (const directory of implementationRoots) {
  await collectExactTree(directory, actualImplementationFiles, actualImplementationDirectories);
}
assertExactList("Implementation files", actualImplementationFiles, implementationFiles);
assertExactList(
  "Implementation directories",
  actualImplementationDirectories,
  expectedDirectoriesFor(implementationFiles, implementationRoots),
);

const actualWorkflowFiles = [];
const actualWorkflowDirectories = [];
await collectExactTree(".github", actualWorkflowFiles, actualWorkflowDirectories);
assertExactList("Workflow files", actualWorkflowFiles, workflowFiles);
assertExactList(
  "Workflow directories",
  actualWorkflowDirectories,
  expectedDirectoriesFor(workflowFiles, [".github"]),
);

const actualPackageNames = [];
for (const [manifest, expectedName] of packageNamesByManifest) {
  const packageJson = await readJson(manifest);
  if (packageJson.name !== expectedName) {
    throw new Error(`${manifest} must be named ${expectedName}`);
  }
  actualPackageNames.push(packageJson.name);
  const expectedDependencies = exactDependenciesByManifest.get(manifest);
  assertExactObject(
    `${manifest} dependencies`,
    packageJson.dependencies ?? {},
    expectedDependencies.dependencies,
  );
  assertExactObject(
    `${manifest} devDependencies`,
    packageJson.devDependencies ?? {},
    expectedDependencies.devDependencies,
  );
  for (const field of [
    "optionalDependencies",
    "peerDependencies",
    "bundledDependencies",
    "bundleDependencies",
  ]) {
    if (packageJson[field] !== undefined) {
      throw new Error(`${manifest} must not define ${field} in AW-008`);
    }
  }
}
assertExactList("Workspace package names", actualPackageNames, [
  ...packageNamesByManifest.values(),
]);

const rootPackage = await readJson("package.json");
if (rootPackage.license !== "Apache-2.0") {
  throw new Error("Root package license must equal Apache-2.0");
}
if (rootPackage.packageManager !== "pnpm@11.23.0") {
  throw new Error("Root packageManager must equal pnpm@11.23.0");
}
assertExactObject("Root engines", rootPackage.engines, {
  node: "24.15.0",
  pnpm: "11.23.0",
});
assertExactObject("Root scripts", rootPackage.scripts ?? {}, canonicalRootScripts);
assertExactObject("Root dependencies", rootPackage.dependencies ?? {}, {});
assertExactObject(
  "Root devDependencies",
  rootPackage.devDependencies ?? {},
  canonicalRootDevDependencies,
);
for (const field of [
  "optionalDependencies",
  "peerDependencies",
  "bundledDependencies",
  "bundleDependencies",
]) {
  if (rootPackage[field] !== undefined) {
    throw new Error(`Root package must not define ${field} in AW-008`);
  }
}

const contractsPackage = await readJson("packages/contracts/package.json");
assertExactObject(
  "Contracts package scripts",
  contractsPackage.scripts ?? {},
  canonicalContractsScripts,
);
assertExactObject("Contracts public exports", contractsPackage.exports, {
  ".": { types: "./src/index.ts", import: "./dist/index.js" },
});

const dbPackage = await readJson("packages/db/package.json");
assertExactObject("DB package scripts", dbPackage.scripts ?? {}, canonicalDbScripts);
assertExactObject("DB public exports", dbPackage.exports, {
  ".": { types: "./src/index.ts", import: "./dist/index.js" },
});

const workspacePolicy = await readFile(resolve(root, "pnpm-workspace.yaml"), "utf8");
if (workspacePolicy !== canonicalWorkspacePolicy) {
  throw new Error("pnpm-workspace.yaml does not match the AW-008 frozen build policy");
}

const workflow = await readFile(resolve(root, ".github/workflows/ci.yml"), "utf8");
if (workflow !== canonicalWorkflow) {
  throw new Error("PR workflow does not match the immutable AW-008 blocking lane");
}

const schemaSource = await readFile(resolve(root, "packages/db/src/schema/foundation.ts"), "utf8");
const sourceTableNames = [...schemaSource.matchAll(/\bpgTable\(\s*"([^"]+)"/gu)].map(
  (match) => match[1],
);
assertExactList("Drizzle source tables", sourceTableNames, exactMigrationTables);

const migrationSql = await readFile(
  resolve(root, "packages/db/drizzle/0000_aw008_foundation.sql"),
  "utf8",
);
const migrationTableNames = [...migrationSql.matchAll(/\bCREATE TABLE\s+"([^"]+)"/gu)].map(
  (match) => match[1],
);
assertExactList("Migration SQL tables", migrationTableNames, exactMigrationTables);

const migrationSnapshot = await readJson("packages/db/drizzle/meta/0000_snapshot.json");
const snapshotTableNames = Object.values(migrationSnapshot.tables ?? {}).map((table) => table.name);
assertExactList("Migration snapshot tables", snapshotTableNames, exactMigrationTables);

const migrationJournal = await readJson("packages/db/drizzle/meta/_journal.json");
if (
  migrationJournal.entries?.length !== 1 ||
  migrationJournal.entries[0]?.idx !== 0 ||
  migrationJournal.entries[0]?.tag !== "0000_aw008_foundation"
) {
  throw new Error("Migration journal must contain only 0000_aw008_foundation");
}

const staticModuleSpecifierPattern =
  /(?:\bimport\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?|\bexport\s+[^"']*?\s+from\s+)["']([^"']+)["']/gu;
const dynamicModuleSpecifierPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu;
for (const sourcePath of implementationFiles.filter((path) =>
  /^packages\/contracts\/src\/.*\.ts$/u.test(path),
)) {
  const source = await readFile(resolve(root, sourcePath), "utf8");
  const specifiers = [
    ...[...source.matchAll(staticModuleSpecifierPattern)].map((match) => match[1]),
    ...[...source.matchAll(dynamicModuleSpecifierPattern)].map((match) => match[1]),
  ];
  const forbiddenSpecifier = specifiers.find(
    (specifier) =>
      specifier !== undefined &&
      !specifier.startsWith("./") &&
      !specifier.startsWith("../") &&
      !specifier.startsWith("node:") &&
      specifier !== "zod",
  );
  if (forbiddenSpecifier !== undefined) {
    throw new Error(
      `Contracts runtime import is outside the AW-008 allowlist in ${sourcePath}: ${forbiddenSpecifier}`,
    );
  }
}

for (const testPath of implementationFiles.filter((path) => /\.spec\.[cm]?[jt]sx?$/u.test(path))) {
  const source = await readFile(resolve(root, testPath), "utf8");
  if (forbiddenTestMarker.test(source)) {
    throw new Error(`Skipped, conditional, todo, or only test is forbidden in AW-008: ${testPath}`);
  }
}

console.log(
  `AW-008 scaffold verified: ${requiredRootFiles.length + implementationFiles.length} required files, ${packageNamesByManifest.size} workspace packages, ${Object.keys(canonicalRootScripts).length} root scripts, ${exactMigrationTables.length} migration tables`,
);
