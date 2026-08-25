import type { LivenessResponse, ReadinessResponse } from "@agent-workspace/contracts";
import { Controller, Get, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";

import { HealthService } from "./health.service.js";

type HealthReply = Pick<FastifyReply, "status">;

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("live")
  live(): LivenessResponse {
    return { status: "ok" };
  }

  @Get("ready")
  async ready(@Res({ passthrough: true }) reply: HealthReply): Promise<ReadinessResponse> {
    const ready = await this.healthService.isReady();
    reply.status(ready ? 200 : 503);
    return { status: ready ? "ready" : "not-ready" };
  }
}
