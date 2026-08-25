import { CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

import {
  ensureStorageBuckets,
  type StorageCommand,
  type StorageCommandSender,
} from "../src/storage-init.js";

function missingBucketError(): Error & { $metadata: { httpStatusCode: number } } {
  return Object.assign(new Error("missing"), { $metadata: { httpStatusCode: 404 } });
}

describe("storage bucket initialization", () => {
  it("is idempotent when both buckets are already visible", async () => {
    const send = vi.fn(async () => ({}));

    await ensureStorageBuckets(
      { send } as StorageCommandSender,
      ["chat-quarantine", "chat-clean"],
      { timeoutMs: 100, retryDelayMs: 1 },
    );

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.every(([command]) => command instanceof HeadBucketCommand)).toBe(true);
  });

  it("creates each missing bucket and confirms visibility", async () => {
    const visible = new Set<string>();
    const commands: StorageCommand[] = [];
    const sender: StorageCommandSender = {
      async send(command) {
        commands.push(command);
        const bucket = command.input.Bucket;
        if (command instanceof CreateBucketCommand) {
          visible.add(bucket ?? "");
          return {};
        }
        if (!visible.has(bucket ?? "")) {
          throw missingBucketError();
        }
        return {};
      },
    };

    await ensureStorageBuckets(sender, ["chat-quarantine", "chat-clean"], {
      timeoutMs: 100,
      retryDelayMs: 1,
    });

    expect(commands.map((command) => command.constructor.name)).toEqual([
      "HeadBucketCommand",
      "CreateBucketCommand",
      "HeadBucketCommand",
      "HeadBucketCommand",
      "CreateBucketCommand",
      "HeadBucketCommand",
    ]);
  });

  it("retries transient failures before the bounded deadline", async () => {
    let attempts = 0;
    const sleep = vi.fn(async () => undefined);
    const sender: StorageCommandSender = {
      async send() {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("temporary network failure");
        }
        return {};
      },
    };

    await ensureStorageBuckets(sender, ["chat-clean"], {
      timeoutMs: 100,
      retryDelayMs: 10,
      now: (() => {
        let now = 0;
        return () => ++now;
      })(),
      sleep,
    });

    expect(attempts).toBe(2);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("fails after the deadline instead of retrying forever", async () => {
    const sender: StorageCommandSender = {
      async send() {
        throw new Error("storage offline");
      },
    };
    const nowValues = [0, 1, 10];

    await expect(
      ensureStorageBuckets(sender, ["chat-clean"], {
        timeoutMs: 5,
        retryDelayMs: 1,
        now: () => nowValues.shift() ?? 10,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow(/timed out.*storage offline/i);
  });

  it("aborts and rejects a storage request that never settles", async () => {
    let observedSignal: AbortSignal | undefined;
    const sender: StorageCommandSender = {
      send(_command, options) {
        observedSignal = options?.abortSignal;
        return new Promise(() => undefined);
      },
    };

    await expect(
      ensureStorageBuckets(sender, ["chat-clean"], {
        timeoutMs: 10,
        retryDelayMs: 1,
      }),
    ).rejects.toThrow(/timed out after 10ms/i);
    expect(observedSignal?.aborted).toBe(true);
  });
});
