import type { UserConfig } from "vitest/config";

export const vitestUnitDefaults = {
  test: {
    environment: "node",
    globals: false,
    passWithNoTests: false,
    clearMocks: true,
    restoreMocks: true,
  },
} satisfies UserConfig;
