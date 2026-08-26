const fixtureMode = process.env.AW008_BOUNDARY_FIXTURE === "1";

module.exports = {
  forbidden: [
    {
      name: "no-runtime-circular-dependencies",
      severity: "error",
      from: {},
      to: {
        circular: true,
        viaOnly: { dependencyTypesNot: ["type-only"] },
      },
    },
    {
      name: "no-unresolvable-dependencies",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "web-must-not-import-db",
      severity: "error",
      from: { path: "^apps/web/" },
      to: { path: "^(?:packages/db/|@agent-workspace/db(?:/|$))" },
    },
    {
      name: "packages-must-not-import-apps",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "apps-must-not-import-other-apps",
      severity: "error",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/(?!$1/)" },
    },
    {
      name: "cross-package-imports-must-use-public-entry-points",
      severity: "error",
      from: { path: "^(?:apps|packages)/([^/]+)/" },
      to: {
        path: "^packages/(?!$1/)[^/]+/src/.+",
        pathNot:
          "^packages/(?:[^/]+/src/index\\.ts|config/src/env\\.ts|test-config/src/vitest\\.ts)$",
      },
    },
    {
      name: "chat-core-dependencies-are-restricted",
      severity: "error",
      from: { path: "^packages/chat-core/" },
      to: {
        path: "^(?:packages/(?!(?:chat-core|contracts|config)/)|@agent-workspace/db(?:/|$))",
      },
    },
    {
      name: "contracts-runtime-has-no-workspace-dependencies",
      severity: "error",
      from: { path: "^packages/contracts/src/" },
      to: { path: "^packages/(?!contracts/)" },
    },

    {
      name: "contracts-test-workspace-dependencies-are-restricted",
      severity: "error",
      from: { path: "^packages/contracts/(?!src/)" },
      to: { path: "^packages/(?!(?:contracts|test-config)/)" },
    },

    {
      name: "db-must-not-import-apps",
      severity: "error",
      from: { path: "^packages/db/" },
      to: { path: "^apps/" },
    },
    {
      name: "db-workspace-dependencies-are-restricted",
      severity: "error",
      from: { path: "^packages/db/" },
      to: { path: "^packages/(?!(?:db|config|test-config)/)" },
    },
    {
      name: "ui-must-not-import-server-packages",
      severity: "error",
      from: { path: "^packages/ui/" },
      to: {
        path: "^(?:packages/(?:db|config|chat-core)/|@agent-workspace/(?:db|config|chat-core)(?:/|$))",
      },
    },
    {
      name: "vendor-agent-sdks-are-not-in-aw008",
      severity: "error",
      from: {},
      to: {
        path: "node_modules/(?:\\.pnpm/)?(?:@anthropic-ai|@langchain|openai-agents|agentkit)(?:[/@])",
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: fixtureMode
        ? "(^|/)(?:dist|\\.next|coverage)/"
        : "(^|/)(?:dist|\\.next|coverage)/|^apps/web/test/fixtures/forbidden-db-import\\.ts$|^packages/chat-core/test/fixtures/forbidden-db-import\\.ts$",
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["types", "import", "require", "default"],
    },
  },
};
