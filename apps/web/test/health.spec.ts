import { describe, expect, it } from "vitest";

import { GET } from "../app/api/health/route.js";

describe("web health route", () => {
  it("reports only web-server readiness with a 200 response", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
