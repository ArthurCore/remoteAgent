import { parseEnvironment } from "@agent-workspace/config";
import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export type StorageCommand = HeadBucketCommand | CreateBucketCommand;

export interface StorageSendOptions {
  readonly abortSignal?: AbortSignal;
}

export interface StorageCommandSender {
  send(command: StorageCommand, options?: StorageSendOptions): Promise<unknown>;
}

export interface StorageInitializationOptions {
  readonly timeoutMs: number;
  readonly retryDelayMs: number;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

const defaultOptions: StorageInitializationOptions = {
  timeoutMs: 30_000,
  retryDelayMs: 250,
};

class StorageInitializationTimeoutError extends Error {}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function statusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("$metadata" in error)) {
    return undefined;
  }
  const metadata = error.$metadata;
  if (typeof metadata !== "object" || metadata === null || !("httpStatusCode" in metadata)) {
    return undefined;
  }
  return typeof metadata.httpStatusCode === "number" ? metadata.httpStatusCode : undefined;
}

function errorName(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "name" in error
    ? String(error.name)
    : undefined;
}

function isMissingBucket(error: unknown): boolean {
  return statusCode(error) === 404 || ["NoSuchBucket", "NotFound"].includes(errorName(error) ?? "");
}

function isCreateRace(error: unknown): boolean {
  return ["BucketAlreadyExists", "BucketAlreadyOwnedByYou"].includes(errorName(error) ?? "");
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "unknown storage error";
}

function timeoutError(timeoutMs: number, cause?: unknown): StorageInitializationTimeoutError {
  return new StorageInitializationTimeoutError(
    `Storage initialization timed out after ${timeoutMs}ms`,
    cause === undefined ? undefined : { cause },
  );
}

async function sendBeforeDeadline(
  sender: StorageCommandSender,
  command: StorageCommand,
  deadline: number,
  options: Pick<Required<StorageInitializationOptions>, "now" | "timeoutMs">,
): Promise<void> {
  const remainingMs = deadline - options.now();
  if (remainingMs <= 0) {
    throw timeoutError(options.timeoutMs);
  }

  const abortController = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      abortController.abort();
      reject(timeoutError(options.timeoutMs));
    }, remainingMs);
  });

  try {
    await Promise.race([sender.send(command, { abortSignal: abortController.signal }), timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

async function ensureBucket(
  sender: StorageCommandSender,
  bucket: string,
  deadline: number,
  options: Required<Pick<StorageInitializationOptions, "timeoutMs" | "retryDelayMs">> &
    Pick<Required<StorageInitializationOptions>, "now" | "sleep">,
): Promise<void> {
  let creationRequested = false;
  let lastError: unknown = new Error("bucket is not visible");

  const waitForRetry = async (): Promise<void> => {
    if (options.now() >= deadline) {
      throw new Error(
        `Storage initialization timed out after ${options.timeoutMs}ms: ${errorMessage(lastError)}`,
        { cause: lastError },
      );
    }
    const remainingMs = Math.max(0, deadline - options.now());
    await options.sleep(Math.min(options.retryDelayMs, remainingMs));
  };

  while (true) {
    try {
      await sendBeforeDeadline(
        sender,
        new HeadBucketCommand({ Bucket: bucket }),
        deadline,
        options,
      );
      return;
    } catch (error) {
      if (error instanceof StorageInitializationTimeoutError) {
        throw error;
      }
      lastError = error;

      if (isMissingBucket(error) && !creationRequested) {
        try {
          await sendBeforeDeadline(
            sender,
            new CreateBucketCommand({ Bucket: bucket }),
            deadline,
            options,
          );
          creationRequested = true;
          continue;
        } catch (createError) {
          if (createError instanceof StorageInitializationTimeoutError) {
            throw createError;
          }
          lastError = createError;
          if (isCreateRace(createError)) {
            creationRequested = true;
            continue;
          }
        }
      }
    }

    await waitForRetry();
  }
}

export async function ensureStorageBuckets(
  sender: StorageCommandSender,
  buckets: readonly string[],
  suppliedOptions: StorageInitializationOptions = defaultOptions,
): Promise<void> {
  const options = {
    timeoutMs: suppliedOptions.timeoutMs,
    retryDelayMs: suppliedOptions.retryDelayMs,
    now: suppliedOptions.now ?? Date.now,
    sleep: suppliedOptions.sleep ?? defaultSleep,
  };
  const deadline = options.now() + options.timeoutMs;

  for (const bucket of buckets) {
    await ensureBucket(sender, bucket, deadline, options);
  }
}

async function runStorageInitialization(): Promise<void> {
  const environment = parseEnvironment(process.env);
  const client = new S3Client({
    endpoint: environment.S3_ENDPOINT,
    region: environment.S3_REGION,
    forcePathStyle: environment.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: environment.S3_ACCESS_KEY,
      secretAccessKey: environment.S3_SECRET_KEY,
    },
  });
  const sender: StorageCommandSender = {
    async send(command, options) {
      if (command instanceof HeadBucketCommand) {
        return client.send(command, options);
      }
      return client.send(command, options);
    },
  };

  try {
    await ensureStorageBuckets(sender, [
      environment.S3_QUARANTINE_BUCKET,
      environment.S3_CLEAN_BUCKET,
    ]);
  } finally {
    client.destroy();
  }
}

const entryPath = process.argv[1];
if (entryPath !== undefined && fileURLToPath(import.meta.url) === resolve(entryPath)) {
  void runStorageInitialization().catch(() => {
    console.error("Storage initialization failed");
    process.exitCode = 1;
  });
}
