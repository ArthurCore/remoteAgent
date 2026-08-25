import { vitestUnitDefaults } from "@agent-workspace/test-config/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  ...vitestUnitDefaults,
  test: {
    ...vitestUnitDefaults.test,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["test/**/*.spec.ts"],
          exclude: ["test/**/*.integration.spec.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          passWithNoTests: false,
          include: ["test/**/*.integration.spec.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
