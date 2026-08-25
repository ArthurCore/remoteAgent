const fixtureMode = process.env.AW007_BOUNDARY_FIXTURE === "1";

module.exports = {
  forbidden: [
    {
      name: "no-circular-dependencies",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "web-must-not-import-db",
      severity: "error",
      from: { path: "^apps/web/" },
      to: { path: "^(?:packages/db/|@agent-workspace/db)$" },
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
      name: "packages-must-use-public-entry-points",
      severity: "error",
      from: { path: "^(?:apps|packages)/" },
      to: {
        path: "^packages/[^/]+/src/.+",
        pathNot:
          "^packages/(?:[^/]+/src/index\\.ts|config/src/env\\.ts|test-config/src/vitest\\.ts)$",
      },
    },
    {
      name: "chat-core-dependencies-are-restricted",
      severity: "error",
      from: { path: "^packages/chat-core/" },
      to: { path: "^packages/(?!(?:contracts|config)/)" },
    },
    {
      name: "contracts-have-no-internal-dependencies",
      severity: "error",
      from: { path: "^packages/contracts/" },
      to: { path: "^packages/(?!contracts/)" },
    },
    {
      name: "db-internal-dependencies-are-restricted",
      severity: "error",
      from: { path: "^packages/db/" },
      to: { path: "^packages/(?!(?:db|config)/)" },
    },
    {
      name: "ui-must-not-import-server-packages",
      severity: "error",
      from: { path: "^packages/ui/" },
      to: { path: "^packages/(?:db|config|chat-core)/" },
    },
    {
      name: "vendor-agent-sdks-are-not-in-aw007",
      severity: "error",
      from: {},
      to: {
        path: "node_modules/(?:\.pnpm/)?(?:@anthropic-ai|@langchain|openai-agents|agentkit)(?:[/@])",
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: fixtureMode
        ? "(^|/)(?:dist|\\.next|node_modules)/"
        : "(^|/)(?:dist|\\.next|node_modules)/|^apps/web/test/fixtures/forbidden-db-import\\.ts$",
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["types", "import", "require", "default"],
    },
  },
};
