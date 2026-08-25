import { pgEnum } from "drizzle-orm/pg-core";

export const principalKindV1 = pgEnum("principal_kind_v1", ["human", "service"]);

export const workspaceRoleV1 = pgEnum("workspace_role_v1", ["owner", "admin", "member", "guest"]);

export const channelKindV1 = pgEnum("channel_kind_v1", ["public", "private", "dm"]);

export const historyModeV1 = pgEnum("history_mode_v1", ["full", "since_join"]);
