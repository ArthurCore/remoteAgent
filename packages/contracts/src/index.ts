export type LivenessResponse = Readonly<{ status: "ok" }>;

export type ReadinessResponse = Readonly<{ status: "ready" } | { status: "not-ready" }>;
