import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: "node",
    globals: false,
    passWithNoTests: false,
    clearMocks: true,
    restoreMocks: true,
    include: ["test/channel-event-journal.spec.ts", "test/public-api.spec.ts"],
  },
});
