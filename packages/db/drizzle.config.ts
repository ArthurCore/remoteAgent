import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  breakpoints: true,
  migrations: {
    schema: "drizzle",
    table: "__drizzle_migrations",
  },
});
