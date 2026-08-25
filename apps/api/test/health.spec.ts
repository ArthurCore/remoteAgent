import { describe, expect, it, vi } from "vitest";

import { HealthController } from "../src/platform/health.controller.js";
import { HealthService, type ReadinessProbe } from "../src/platform/health.service.js";

const passingProbe: ReadinessProbe = async () => undefined;
const failingProbe: ReadinessProbe = async () => {
  throw new Error("dependency unavailable");
};

describe("API health", () => {
  it("returns a stable minimal liveness response", () => {
    const controller = new HealthController(new HealthService([]));

    expect(controller.live()).toEqual({ status: "ok" });
    expect(Object.keys(controller.live())).toEqual(["status"]);
  });

  it("reports readiness when every required dependency probe passes", async () => {
    const reply = { status: vi.fn() };
    const controller = new HealthController(new HealthService([passingProbe, passingProbe]));

    await expect(controller.ready(reply)).resolves.toEqual({ status: "ready" });
    expect(reply.status).toHaveBeenCalledOnce();
    expect(reply.status).toHaveBeenCalledWith(200);
  });

  it("returns 503 readiness without leaking probe errors when a dependency fails", async () => {
    const reply = { status: vi.fn() };
    const controller = new HealthController(new HealthService([passingProbe, failingProbe]));

    const body = await controller.ready(reply);

    expect(reply.status).toHaveBeenCalledWith(503);
    expect(body).toEqual({ status: "not-ready" });
    expect(Object.keys(body)).toEqual(["status"]);
  });

  it("bounds readiness when a dependency probe never settles", async () => {
    const hangingProbe: ReadinessProbe = () => new Promise(() => undefined);
    const reply = { status: vi.fn() };
    const controller = new HealthController(new HealthService([hangingProbe], 10));

    await expect(controller.ready(reply)).resolves.toEqual({ status: "not-ready" });
    expect(reply.status).toHaveBeenCalledWith(503);
  });
});
