CREATE TYPE "public"."channel_kind_v1" AS ENUM('public', 'private', 'dm');--> statement-breakpoint
CREATE TYPE "public"."history_mode_v1" AS ENUM('full', 'since_join');--> statement-breakpoint
CREATE TYPE "public"."principal_kind_v1" AS ENUM('human', 'service');--> statement-breakpoint
CREATE TYPE "public"."workspace_role_v1" AS ENUM('owner', 'admin', 'member', 'guest');--> statement-breakpoint
CREATE TABLE "channel_membership_epochs" (
	"tenant_id" varchar(255) NOT NULL,
	"channel_id" varchar(255) NOT NULL,
	"principal_id" varchar(255) NOT NULL,
	"membership_epoch" varchar(255) NOT NULL,
	"history_mode" "history_mode_v1" NOT NULL,
	"joined_event_seq" bigint NOT NULL,
	"exited_event_seq" bigint,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "channel_membership_epochs_pk" PRIMARY KEY("tenant_id","channel_id","principal_id","membership_epoch"),
	CONSTRAINT "channel_membership_epochs_tenant_id_nonempty_ck" CHECK (length("channel_membership_epochs"."tenant_id") > 0),
	CONSTRAINT "channel_membership_epochs_channel_id_nonempty_ck" CHECK (length("channel_membership_epochs"."channel_id") > 0),
	CONSTRAINT "channel_membership_epochs_principal_id_nonempty_ck" CHECK (length("channel_membership_epochs"."principal_id") > 0),
	CONSTRAINT "channel_membership_epochs_epoch_nonempty_ck" CHECK (length("channel_membership_epochs"."membership_epoch") > 0),
	CONSTRAINT "channel_membership_epochs_joined_positive_ck" CHECK ("channel_membership_epochs"."joined_event_seq" > 0),
	CONSTRAINT "channel_membership_epochs_exit_after_join_ck" CHECK ("channel_membership_epochs"."exited_event_seq" IS NULL OR "channel_membership_epochs"."exited_event_seq" > "channel_membership_epochs"."joined_event_seq"),
	CONSTRAINT "channel_membership_epochs_version_positive_ck" CHECK ("channel_membership_epochs"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"tenant_id" varchar(255) NOT NULL,
	"workspace_id" varchar(255) NOT NULL,
	"channel_id" varchar(255) NOT NULL,
	"kind" "channel_kind_v1" NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "channels_pk" PRIMARY KEY("tenant_id","channel_id"),
	CONSTRAINT "channels_tenant_id_nonempty_ck" CHECK (length("channels"."tenant_id") > 0),
	CONSTRAINT "channels_workspace_id_nonempty_ck" CHECK (length("channels"."workspace_id") > 0),
	CONSTRAINT "channels_channel_id_nonempty_ck" CHECK (length("channels"."channel_id") > 0),
	CONSTRAINT "channels_version_positive_ck" CHECK ("channels"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "principals" (
	"tenant_id" varchar(255) NOT NULL,
	"principal_id" varchar(255) NOT NULL,
	"principal_kind" "principal_kind_v1" NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "principals_pk" PRIMARY KEY("tenant_id","principal_id"),
	CONSTRAINT "principals_tenant_id_nonempty_ck" CHECK (length("principals"."tenant_id") > 0),
	CONSTRAINT "principals_principal_id_nonempty_ck" CHECK (length("principals"."principal_id") > 0),
	CONSTRAINT "principals_version_positive_ck" CHECK ("principals"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "tenants_pk" PRIMARY KEY("tenant_id"),
	CONSTRAINT "tenants_tenant_id_nonempty_ck" CHECK (length("tenants"."tenant_id") > 0),
	CONSTRAINT "tenants_version_positive_ck" CHECK ("tenants"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "workspace_memberships" (
	"tenant_id" varchar(255) NOT NULL,
	"workspace_id" varchar(255) NOT NULL,
	"principal_id" varchar(255) NOT NULL,
	"role" "workspace_role_v1" NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "workspace_memberships_pk" PRIMARY KEY("tenant_id","workspace_id","principal_id"),
	CONSTRAINT "workspace_memberships_tenant_id_nonempty_ck" CHECK (length("workspace_memberships"."tenant_id") > 0),
	CONSTRAINT "workspace_memberships_workspace_id_nonempty_ck" CHECK (length("workspace_memberships"."workspace_id") > 0),
	CONSTRAINT "workspace_memberships_principal_id_nonempty_ck" CHECK (length("workspace_memberships"."principal_id") > 0),
	CONSTRAINT "workspace_memberships_version_positive_ck" CHECK ("workspace_memberships"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"tenant_id" varchar(255) NOT NULL,
	"workspace_id" varchar(255) NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "workspaces_pk" PRIMARY KEY("tenant_id","workspace_id"),
	CONSTRAINT "workspaces_tenant_id_nonempty_ck" CHECK (length("workspaces"."tenant_id") > 0),
	CONSTRAINT "workspaces_workspace_id_nonempty_ck" CHECK (length("workspaces"."workspace_id") > 0),
	CONSTRAINT "workspaces_version_positive_ck" CHECK ("workspaces"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "channel_membership_epochs" ADD CONSTRAINT "channel_membership_epochs_channel_fk" FOREIGN KEY ("tenant_id","channel_id") REFERENCES "public"."channels"("tenant_id","channel_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "channel_membership_epochs" ADD CONSTRAINT "channel_membership_epochs_principal_fk" FOREIGN KEY ("tenant_id","principal_id") REFERENCES "public"."principals"("tenant_id","principal_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_workspace_fk" FOREIGN KEY ("tenant_id","workspace_id") REFERENCES "public"."workspaces"("tenant_id","workspace_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "principals" ADD CONSTRAINT "principals_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_fk" FOREIGN KEY ("tenant_id","workspace_id") REFERENCES "public"."workspaces"("tenant_id","workspace_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_principal_fk" FOREIGN KEY ("tenant_id","principal_id") REFERENCES "public"."principals"("tenant_id","principal_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_membership_epochs_one_active_uq" ON "channel_membership_epochs" USING btree ("tenant_id","channel_id","principal_id") WHERE "channel_membership_epochs"."exited_event_seq" IS NULL;--> statement-breakpoint
CREATE INDEX "channel_membership_epochs_principal_idx" ON "channel_membership_epochs" USING btree ("tenant_id","principal_id","channel_id","exited_event_seq");--> statement-breakpoint
CREATE INDEX "channel_membership_epochs_channel_seq_idx" ON "channel_membership_epochs" USING btree ("tenant_id","channel_id","joined_event_seq");--> statement-breakpoint
CREATE INDEX "channels_workspace_idx" ON "channels" USING btree ("tenant_id","workspace_id","channel_id");--> statement-breakpoint
CREATE INDEX "workspace_memberships_principal_idx" ON "workspace_memberships" USING btree ("tenant_id","principal_id","workspace_id");