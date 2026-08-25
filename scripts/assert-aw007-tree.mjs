import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const root = process.cwd();

const requiredRootFiles = [
  ".dependency-cruiser.cjs",
  ".dockerignore",
  ".editorconfig",
  ".env.example",
  ".gitignore",
  ".node-version",
  ".nvmrc",
  ".prettierignore",
  "Dockerfile",
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
  "apps/api/tsconfig.json",
  "apps/api/vitest.config.ts",
  "apps/api/src/app.module.ts",
  "apps/api/src/main.ts",
  "apps/api/src/platform/health.controller.ts",
  "apps/api/src/platform/health.service.ts",
  "apps/api/test/health.spec.ts",
  "apps/web/next-env.d.ts",
  "apps/web/next.config.ts",
  "apps/web/package.json",
  "apps/web/tsconfig.json",
  "apps/web/vitest.config.ts",
  "apps/web/app/api/health/route.ts",
  "apps/web/app/globals.css",
  "apps/web/app/layout.tsx",
  "apps/web/app/page.tsx",
  "apps/web/test/fixtures/forbidden-db-import.ts",
  "apps/web/test/health.spec.ts",
  "apps/worker/package.json",
  "apps/worker/tsconfig.json",
  "apps/worker/vitest.config.ts",
  "apps/worker/src/health-server.ts",
  "apps/worker/src/main.ts",
  "apps/worker/src/storage-init.ts",
  "apps/worker/test/health.spec.ts",
  "apps/worker/test/storage-init.spec.ts",
  "packages/chat-core/package.json",
  "packages/chat-core/tsconfig.json",
  "packages/chat-core/src/index.ts",
  "packages/config/package.json",
  "packages/config/tsconfig.json",
  "packages/config/src/env.ts",
  "packages/config/test/env.spec.ts",
  "packages/contracts/package.json",
  "packages/contracts/tsconfig.json",
  "packages/contracts/src/index.ts",
  "packages/db/package.json",
  "packages/db/tsconfig.json",
  "packages/db/src/index.ts",
  "packages/ui/package.json",
  "packages/ui/tsconfig.json",
  "packages/ui/src/index.ts",
  "packages/test-config/package.json",
  "packages/test-config/src/vitest.ts",
  "scripts/assert-aw007-tree.mjs",
  "scripts/assert-boundary-fixture.mjs",
  "scripts/compose.sh",
  "scripts/container-smoke.sh",
  "scripts/wait-for-url.mjs",
];

const packageNamesByManifest = new Map([
  ["apps/api/package.json", "@agent-workspace/api"],
  ["apps/web/package.json", "@agent-workspace/web"],
  ["apps/worker/package.json", "@agent-workspace/worker"],
  ["packages/chat-core/package.json", "@agent-workspace/chat-core"],
  ["packages/config/package.json", "@agent-workspace/config"],
  ["packages/contracts/package.json", "@agent-workspace/contracts"],
  ["packages/db/package.json", "@agent-workspace/db"],
  ["packages/ui/package.json", "@agent-workspace/ui"],
  ["packages/test-config/package.json", "@agent-workspace/test-config"],
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
  "test:unit": "turbo run test:unit",
  "scaffold:check": "node scripts/assert-aw007-tree.mjs",
  "compose:up": "scripts/compose.sh up -d --build --wait",
  "compose:down": "scripts/compose.sh down --remove-orphans",
  "compose:reset": "scripts/compose.sh down --volumes --remove-orphans",
  "container:smoke": "scripts/container-smoke.sh",
  ci: "pnpm format:check && pnpm lint && pnpm typecheck && pnpm boundaries:check && pnpm test:unit && pnpm scaffold:check && pnpm build",
};

const forbiddenFutureScripts = [
  "contracts:check",
  "test:integration",
  "test:isolation",
  "test:correctness",
  "test:reliability",
  "test:ws-resume",
  "test:e2e",
  "test:a11y",
  "test:load",
  "test:restore",
  "test:quality-gate",
  "test:rolling-deploy",
  "db:migrate",
  "db:migrate:check",
  "db:migrate:test-empty",
  "db:schema:assert-clean",
];

const ignoredDirectoryNames = new Set([".next", ".turbo", "coverage", "dist", "node_modules"]);

function normalizedPath(path) {
  return path.split(sep).join("/");
}

async function assertRequiredFiles(paths) {
  const missing = [];
  for (const path of paths) {
    try {
      const details = await stat(resolve(root, path));
      if (!details.isFile()) {
        missing.push(path);
      }
    } catch {
      missing.push(path);
    }
  }
  if (missing.length > 0) {
    throw new Error(`AW-007 required files are missing: ${missing.join(", ")}`);
  }
}

async function collectImplementationFiles(directory) {
  const files = [];
  const entries = await readdir(resolve(root, directory), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) {
      continue;
    }
    const absolutePath = join(root, directory, entry.name);
    const repositoryPath = normalizedPath(relative(root, absolutePath));
    if (entry.isDirectory()) {
      files.push(...(await collectImplementationFiles(repositoryPath)));
    } else if (entry.isFile() && !entry.name.endsWith(".tsbuildinfo")) {
      files.push(repositoryPath);
    }
  }
  return files;
}

function assertExactList(label, actual, expected) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((item) => !actualSet.has(item));
  const extra = actual.filter((item) => !expectedSet.has(item));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `${label} does not match the AW-007 manifest; missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}`,
    );
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

await assertRequiredFiles([...requiredRootFiles, ...implementationFiles]);

const actualImplementationFiles = (
  await Promise.all(["apps", "packages", "scripts"].map(collectImplementationFiles))
)
  .flat()
  .sort();
assertExactList("Implementation tree", actualImplementationFiles, [...implementationFiles].sort());

const actualPackageNames = [];
for (const [manifest, expectedName] of packageNamesByManifest) {
  const packageJson = await readJson(manifest);
  if (packageJson.name !== expectedName) {
    throw new Error(`${manifest} must be named ${expectedName}`);
  }
  actualPackageNames.push(packageJson.name);
}
assertExactList(
  "Workspace package names",
  actualPackageNames.sort(),
  [...packageNamesByManifest.values()].sort(),
);

const rootPackage = await readJson("package.json");
const actualScripts = rootPackage.scripts ?? {};
if (Object.keys(actualScripts).length !== 15) {
  throw new Error(
    `Root package must define exactly 15 scripts; found ${Object.keys(actualScripts).length}`,
  );
}
for (const [name, command] of Object.entries(canonicalRootScripts)) {
  if (actualScripts[name] !== command) {
    throw new Error(`Root script ${name} must equal: ${command}`);
  }
}
const forbiddenScript = Object.keys(actualScripts).find(
  (name) => forbiddenFutureScripts.includes(name) || name.startsWith("test:agent"),
);
if (forbiddenScript !== undefined) {
  throw new Error(`Future script is forbidden in AW-007: ${forbiddenScript}`);
}
assertExactList(
  "Root script namespace",
  Object.keys(actualScripts).sort(),
  Object.keys(canonicalRootScripts).sort(),
);

for (const testPath of implementationFiles.filter((path) => /\/test\/.*\.spec\.ts$/.test(path))) {
  const source = await readFile(resolve(root, testPath), "utf8");
  if (/\b(?:describe|it|test)\.(?:skip|todo)\s*\(/.test(source)) {
    throw new Error(`Skipped or todo test is forbidden in AW-007: ${testPath}`);
  }
}

console.log(
  `AW-007 scaffold verified: ${requiredRootFiles.length + implementationFiles.length} files, ${packageNamesByManifest.size} workspace packages, ${Object.keys(canonicalRootScripts).length} root scripts`,
);
