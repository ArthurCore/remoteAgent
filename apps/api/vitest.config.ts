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
          include: ["test/health.spec.ts", "test/channel-event-journal.spec.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["test/channel-event-journal.integration.spec.ts"],
          passWithNoTests: false,
          fileParallelism: false,
        },
      },
    ],
  },
});
