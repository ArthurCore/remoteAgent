import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const fixture = "apps/web/test/fixtures/forbidden-db-import.ts";
const executable = resolve("node_modules/.bin/depcruise");
const result = spawnSync(
  executable,
  ["--config", ".dependency-cruiser.cjs", "--output-type", "err-long", "apps", "packages"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, AW007_BOUNDARY_FIXTURE: "1" },
  },
);

if (result.error) {
  throw result.error;
}

const output = `${result.stdout}${result.stderr}`;
if (result.status === 0) {
  throw new Error("boundary fixture was accepted; apps/web must not import @agent-workspace/db");
}
if (!output.includes("web-must-not-import-db") || !output.includes(fixture)) {
  throw new Error(`fixture failed for the wrong reason:
${output}`);
}

console.log("boundary fixture correctly rejected by web-must-not-import-db");
