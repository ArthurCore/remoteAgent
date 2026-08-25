import type { LivenessResponse, ReadinessResponse } from "@agent-workspace/contracts";
import { createServer, type Server, type ServerResponse } from "node:http";

export type ReadinessProbe = () => Promise<void>;

const defaultReadinessTimeoutMs = 2_000;

type HealthResponse = LivenessResponse | ReadinessResponse;

function sendJson(response: ServerResponse, statusCode: number, body: HealthResponse): void {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

async function allProbesPass(
  probes: readonly ReadinessProbe[],
  timeoutMs: number,
): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("readiness probe timed out")), timeoutMs);
    });
    await Promise.race([Promise.all(probes.map(async (probe) => probe())), timeout]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export function createHealthServer(
  probes: readonly ReadinessProbe[],
  readinessTimeoutMs = defaultReadinessTimeoutMs,
): Server {
  return createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health/live") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method === "GET" && request.url === "/health/ready") {
      void allProbesPass(probes, readinessTimeoutMs).then((ready) => {
        sendJson(response, ready ? 200 : 503, {
          status: ready ? "ready" : "not-ready",
        });
      });
      return;
    }

    response.writeHead(404);
    response.end();
  });
}
