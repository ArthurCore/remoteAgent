import { z } from "zod";

const portSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(65_535));

function hasProtocol(value: string, allowedProtocols: readonly string[]): boolean {
  try {
    return allowedProtocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => hasProtocol(value, ["http:", "https:"]));

const databaseUrlSchema = z
  .string()
  .url()
  .refine((value) => hasProtocol(value, ["postgres:", "postgresql:"]));

const bucketNameSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/)
  .refine((value) => !value.includes("..") && !value.includes(".-") && !value.includes("-."))
  .refine((value) => !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value));

const environmentSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "production"]),
    APP_VERSION: z.string().min(1),
    API_PORT: portSchema,
    WORKER_HEALTH_PORT: portSchema,
    WEB_PORT: portSchema,
    PUBLIC_BASE_URL: httpUrlSchema,
    DATABASE_URL: databaseUrlSchema,
    S3_ENDPOINT: httpUrlSchema,
    S3_REGION: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).transform((value) => value === "true"),
    S3_QUARANTINE_BUCKET: bucketNameSchema,
    S3_CLEAN_BUCKET: bucketNameSchema,
  })
  .superRefine((environment, context) => {
    if (environment.S3_CLEAN_BUCKET === environment.S3_QUARANTINE_BUCKET) {
      context.addIssue({
        code: "custom",
        path: ["S3_CLEAN_BUCKET"],
        message: "clean and quarantine buckets must be distinct",
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

const documentedLocalDefaults = {
  APP_VERSION: "dev",
  API_PORT: 3001,
  WORKER_HEALTH_PORT: 3002,
  WEB_PORT: 3000,
  PUBLIC_BASE_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://agent_workspace:***@postgres:5432/agent_workspace",
  S3_ENDPOINT: "http://rustfs:9000",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY: "agentworkspace-local",
  S3_SECRET_KEY: "local-only-development-secret",
  S3_FORCE_PATH_STYLE: true,
  S3_QUARANTINE_BUCKET: "chat-quarantine",
  S3_CLEAN_BUCKET: "chat-clean",
} as const satisfies Partial<Environment>;

function invalidFieldNames(error: z.ZodError): string[] {
  return [
    ...new Set(
      error.issues.map((issue) => {
        const field = issue.path[0];
        return typeof field === "string" ? field : "environment";
      }),
    ),
  ].sort();
}

export function parseEnvironment(input: unknown): Environment {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    throw new Error(`Invalid environment fields: ${invalidFieldNames(result.error).join(", ")}`);
  }

  if (result.data.APP_ENV === "production") {
    const localFields = Object.entries(documentedLocalDefaults)
      .filter(([field, value]) => result.data[field as keyof Environment] === value)
      .map(([field]) => field)
      .sort();

    if (localFields.length > 0) {
      throw new Error(
        `Production environment cannot use documented local defaults: ${localFields.join(", ")}`,
      );
    }
  }

  return result.data;
}
