import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createHealthServer, type ReadinessProbe } from "../src/health-server.js";

const servers: ReturnType<typeof createHealthServer>[] = [];

async function startServer(
  probes: readonly ReadinessProbe[],
  readinessTimeoutMs?: number,
): Promise<string> {
  const server = createHealthServer(probes, readinessTimeoutMs);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe("worker health server", () => {
  it("keeps liveness healthy when a required dependency is unavailable", async () => {
    const baseUrl = await startServer([
      async () => {
        throw new Error("database unavailable");
      },
    ]);

    const response = await fetch(`${baseUrl}/health/live`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("reports readiness when all required dependency probes pass", async () => {
    const baseUrl = await startServer([async () => undefined, async () => undefined]);

    const response = await fetch(`${baseUrl}/health/ready`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ready" });
  });

  it("returns minimal 503 readiness when any required dependency fails", async () => {
    const baseUrl = await startServer([
      async () => undefined,
      async () => {
        throw new Error("storage details must not leak");
      },
    ]);

    const response = await fetch(`${baseUrl}/health/ready`);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "not-ready" });
  });

  it("bounds readiness when a dependency probe never settles", async () => {
    const baseUrl = await startServer([() => new Promise(() => undefined)], 10);

    const response = await fetch(`${baseUrl}/health/ready`);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "not-ready" });
  });
});
