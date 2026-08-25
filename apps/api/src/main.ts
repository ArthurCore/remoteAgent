import "reflect-metadata";

import { parseEnvironment } from "@agent-workspace/config";
import { createDatabasePool, probeDatabase } from "@agent-workspace/db";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";

import { AppModule } from "./app.module.js";
import type { ReadinessProbe } from "./platform/health.service.js";

const dependencyProbeTimeoutMs = 1_500;

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

  let app: NestFastifyApplication | undefined;
  try {
    app = await NestFactory.create<NestFastifyApplication>(
      AppModule.register(readinessProbes),
      new FastifyAdapter(),
    );
    await app.listen(environment.API_PORT, "0.0.0.0");
  } catch (error) {
    await app?.close().catch(() => undefined);
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
      await app.close();
    } finally {
      storageClient.destroy();
      await databasePool.end();
    }
  };
  const handleSignal = (): void => {
    void shutdown().catch(() => {
      console.error("API failed to shut down cleanly");
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
}

void bootstrap().catch(() => {
  console.error("API failed to start");
  process.exitCode = 1;
});
