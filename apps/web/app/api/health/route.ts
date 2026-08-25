import type { LivenessResponse } from "@agent-workspace/contracts";

export function GET(): Response {
  return Response.json({ status: "ok" } satisfies LivenessResponse);
}
