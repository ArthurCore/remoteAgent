import { describe, expect, it } from "vitest";

import { parseEnvironment } from "../src/env.js";

const developmentEnvironment = {
  APP_ENV: "development",
  APP_VERSION: "dev",
  API_PORT: "3001",
  WORKER_HEALTH_PORT: "3002",
  WEB_PORT: "3000",
  PUBLIC_BASE_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://agent_workspace:***@postgres:5432/agent_workspace",
  S3_ENDPOINT: "http://rustfs:9000",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY: "agentworkspace-local",
  S3_SECRET_KEY: "local-only-development-secret",
  S3_FORCE_PATH_STYLE: "true",
  S3_QUARANTINE_BUCKET: "chat-quarantine",
  S3_CLEAN_BUCKET: "chat-clean",
} as const;

describe("environment validation", () => {
  it("accepts and normalizes every documented development value", () => {
    expect(parseEnvironment(developmentEnvironment)).toMatchObject({
      APP_ENV: "development",
      API_PORT: 3001,
      WORKER_HEALTH_PORT: 3002,
      WEB_PORT: 3000,
      S3_FORCE_PATH_STYLE: true,
      S3_CLEAN_BUCKET: "chat-clean",
    });
  });

  it("rejects a missing required value", () => {
    const { DATABASE_URL: _missing, ...incomplete } = developmentEnvironment;

    expect(() => parseEnvironment(incomplete)).toThrow(/DATABASE_URL/);
  });

  it("rejects malformed URLs, ports, booleans, and bucket names", () => {
    expect(() =>
      parseEnvironment({
        ...developmentEnvironment,
        API_PORT: "70000",
        PUBLIC_BASE_URL: "not a URL",
        S3_FORCE_PATH_STYLE: "yes",
        S3_CLEAN_BUCKET: "INVALID_BUCKET",
      }),
    ).toThrow(/API_PORT|PUBLIC_BASE_URL|S3_FORCE_PATH_STYLE|S3_CLEAN_BUCKET/);
  });

  it("rejects synthetic local defaults in production", () => {
    expect(() =>
      parseEnvironment({
        ...developmentEnvironment,
        APP_ENV: "production",
      }),
    ).toThrow(/production/i);
  });

  it("rejects a clean bucket that aliases the quarantine bucket", () => {
    expect(() =>
      parseEnvironment({
        ...developmentEnvironment,
        S3_CLEAN_BUCKET: developmentEnvironment.S3_QUARANTINE_BUCKET,
      }),
    ).toThrow(/S3_CLEAN_BUCKET/);
  });
});
