import { vitestUnitDefaults } from "@agent-workspace/test-config/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  ...vitestUnitDefaults,
  test: {
    ...vitestUnitDefaults.test,
    include: ["test/**/*.spec.ts"],
  },
});
