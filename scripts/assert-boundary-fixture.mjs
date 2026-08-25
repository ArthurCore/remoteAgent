import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const fixture = "apps/web/test/fixtures/forbidden-db-import.ts";
const expectedRule = "web-must-not-import-db";
const executable = resolve("node_modules/.bin/depcruise");
const result = spawnSync(
  executable,
  ["--config", ".dependency-cruiser.cjs", "--output-type", "json", fixture],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, AW008_BOUNDARY_FIXTURE: "1" },
  },
);

if (result.error) throw result.error;
if (result.signal !== null) {
  throw new Error(`boundary fixture dependency-cruiser was terminated by ${result.signal}`);
}

let cruiseResult;
try {
  cruiseResult = JSON.parse(result.stdout);
} catch (error) {
  throw new Error(`boundary fixture did not produce dependency-cruiser JSON:\n${result.stderr}`, {
    cause: error,
  });
}

const violations = cruiseResult.summary?.violations ?? [];
const violation = violations[0];
if (
  violations.length !== 1 ||
  cruiseResult.summary?.error !== 1 ||
  violation?.rule?.name !== expectedRule ||
  violation?.from !== fixture ||
  violation?.to !== "@agent-workspace/db" ||
  violation?.unresolvedTo !== "@agent-workspace/db"
) {
  throw new Error(
    `fixture must fail exactly ${expectedRule} from ${fixture} to @agent-workspace/db:\n${result.stdout}${result.stderr}`,
  );
}

console.log(`boundary fixture correctly rejected only by ${expectedRule}`);
