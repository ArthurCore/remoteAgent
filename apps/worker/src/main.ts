import { parseEnvironment } from "@agent-workspace/config";
import { createDatabasePool, probeDatabase } from "@agent-workspace/db";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import type { Server } from "node:http";

import { createHealthServer, type ReadinessProbe } from "./health-server.js";

const dependencyProbeTimeoutMs = 1_500;

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once("error", onError);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", onError);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function bootstrap(): Promise<void> {
  const environment = parseEnvironment(process.env);
  const databasePool = createDatabasePool(environment.DATABASE_URL);
  const storageClient = new S3Client({
    endpoint: environment.S3_ENDPOINT,
    region: environment.S3_REGION,
    forcePathStyle: environment.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: environment.S3_ACCESS_KEY,
      secretAccessKey: environment.S3_SECRET_KEY,
    },
  });
  const storageBuckets = [environment.S3_QUARANTINE_BUCKET, environment.S3_CLEAN_BUCKET] as const;
  const readinessProbes: readonly ReadinessProbe[] = [
    async () => probeDatabase(databasePool),
    async () => {
      await Promise.all(
        storageBuckets.map(async (bucket) =>
          storageClient.send(new HeadBucketCommand({ Bucket: bucket }), {
            abortSignal: AbortSignal.timeout(dependencyProbeTimeoutMs),
          }),
        ),
      );
    },
  ];
  const healthServer = createHealthServer(readinessProbes);
  try {
    await listen(healthServer, environment.WORKER_HEALTH_PORT);
  } catch (error) {
    if (healthServer.listening) {
      await close(healthServer).catch(() => undefined);
    }
    storageClient.destroy();
    await databasePool.end().catch(() => undefined);
    throw error;
  }

  let shutdownStarted = false;
  const shutdown = async (): Promise<void> => {
    if (shutdownStarted) {
      return;
    }
    shutdownStarted = true;
    try {
      await close(healthServer);
    } finally {
      storageClient.destroy();
      await databasePool.end();
    }
  };
  const handleSignal = (): void => {
    void shutdown().catch(() => {
      console.error("Worker failed to shut down cleanly");
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
}

void bootstrap().catch(() => {
  console.error("Worker failed to start");
  process.exitCode = 1;
});
