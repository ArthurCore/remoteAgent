import type { Environment } from "@agent-workspace/config";
import { Pool } from "pg";

const dependencyTimeoutMs = 1_500;

export type DatabasePool = Pool;
export type DatabaseReadinessClient = Pick<Pool, "query">;

export function createDatabasePool(connectionString: Environment["DATABASE_URL"]): DatabasePool {
  return new Pool({
    connectionString,
    connectionTimeoutMillis: dependencyTimeoutMs,
    query_timeout: dependencyTimeoutMs,
    statement_timeout: dependencyTimeoutMs,
  });
}

export async function probeDatabase(client: DatabaseReadinessClient): Promise<void> {
  await client.query("SELECT 1");
}
