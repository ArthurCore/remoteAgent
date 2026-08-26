LOCK TABLE public.channels IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
LOCK TABLE public.channel_membership_epochs IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
DO $do$
BEGIN
	IF EXISTS (SELECT 1 FROM public.channel_membership_epochs) THEN
		RAISE EXCEPTION USING
			ERRCODE = '55000',
			MESSAGE = 'channel stream migration precondition failed';
	END IF;
END;
$do$;
--> statement-breakpoint
CREATE TABLE "public"."channel_event_sequences" (
	"tenant_id" varchar(255) NOT NULL,
	"channel_id" varchar(255) NOT NULL,
	"last_event_seq" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_event_sequences_pkey" PRIMARY KEY("tenant_id","channel_id"),
	CONSTRAINT "channel_event_sequences_tenant_channel_fk" FOREIGN KEY ("tenant_id","channel_id") REFERENCES "public"."channels"("tenant_id","channel_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT "channel_event_sequences_last_event_seq_check" CHECK ("channel_event_sequences"."last_event_seq" >= 0)
);
--> statement-breakpoint
CREATE TABLE "public"."channel_events" (
	"tenant_id" varchar(255) NOT NULL,
	"channel_id" varchar(255) NOT NULL,
	"event_seq" bigint NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"schema_version" integer NOT NULL,
	"event_type" text NOT NULL,
	"actor_principal_id" varchar(255) NOT NULL,
	"actor_kind" text NOT NULL,
	"occurred_at" timestamp (6) with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_events_pkey" PRIMARY KEY("tenant_id","channel_id","event_seq"),
	CONSTRAINT "channel_events_tenant_channel_fk" FOREIGN KEY ("tenant_id","channel_id") REFERENCES "public"."channels"("tenant_id","channel_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT "channel_events_event_id_key" UNIQUE("event_id"),
	CONSTRAINT "channel_events_event_seq_check" CHECK ("channel_events"."event_seq" > 0),
	CONSTRAINT "channel_events_event_id_nonempty_check" CHECK (length("channel_events"."event_id") > 0),
	CONSTRAINT "channel_events_schema_version_check" CHECK ("channel_events"."schema_version" = 1),
	CONSTRAINT "channel_events_event_type_check" CHECK ("channel_events"."event_type" IN ('message.created', 'message.edited', 'message.deleted', 'reaction.changed', 'channel.member_joined', 'channel.member_left', 'channel.member_revoked')),
	CONSTRAINT "channel_events_actor_principal_id_nonempty_check" CHECK (length("channel_events"."actor_principal_id") > 0),
	CONSTRAINT "channel_events_actor_kind_check" CHECK ("channel_events"."actor_kind" IN ('human', 'service', 'system')),
	CONSTRAINT "channel_events_payload_object_check" CHECK (jsonb_typeof("channel_events"."payload") = 'object')
);
--> statement-breakpoint
CREATE FUNCTION public.initialize_channel_event_sequence()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
	INSERT INTO public.channel_event_sequences (tenant_id, channel_id, last_event_seq)
	VALUES (NEW.tenant_id, NEW.channel_id, 0);
	RETURN NEW;
END;
$function$;
--> statement-breakpoint
CREATE FUNCTION public.reject_channel_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
	RAISE EXCEPTION USING
		ERRCODE = '55000',
		MESSAGE = 'channel events are append-only';
END;
$function$;
--> statement-breakpoint
CREATE FUNCTION public.enforce_channel_membership_event_types()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
	joined_event_type text;
	exited_event_type text;
BEGIN
	SELECT events.event_type
	INTO joined_event_type
	FROM public.channel_events AS events
	WHERE events.tenant_id = NEW.tenant_id
		AND events.channel_id = NEW.channel_id
		AND events.event_seq = NEW.joined_event_seq;

	IF NOT FOUND THEN
		RAISE EXCEPTION USING
			ERRCODE = '23514',
			MESSAGE = 'channel membership joined event is invalid';
	END IF;
	IF joined_event_type IS DISTINCT FROM 'channel.member_joined' THEN
		RAISE EXCEPTION USING
			ERRCODE = '23514',
			MESSAGE = 'channel membership joined event is invalid';
	END IF;

	IF NEW.exited_event_seq IS NOT NULL THEN
		SELECT events.event_type
		INTO exited_event_type
		FROM public.channel_events AS events
		WHERE events.tenant_id = NEW.tenant_id
			AND events.channel_id = NEW.channel_id
			AND events.event_seq = NEW.exited_event_seq;

		IF NOT FOUND THEN
			RAISE EXCEPTION USING
				ERRCODE = '23514',
				MESSAGE = 'channel membership exited event is invalid';
		END IF;
		IF exited_event_type NOT IN ('channel.member_left', 'channel.member_revoked') THEN
			RAISE EXCEPTION USING
				ERRCODE = '23514',
				MESSAGE = 'channel membership exited event is invalid';
		END IF;
	END IF;

	RETURN NEW;
END;
$function$;
--> statement-breakpoint
CREATE TRIGGER channels_initialize_event_sequence
AFTER INSERT ON public.channels
FOR EACH ROW
EXECUTE FUNCTION public.initialize_channel_event_sequence();
--> statement-breakpoint
CREATE TRIGGER channel_events_append_only_guard
BEFORE UPDATE OR DELETE ON public.channel_events
FOR EACH ROW
EXECUTE FUNCTION public.reject_channel_event_mutation();
--> statement-breakpoint
INSERT INTO public.channel_event_sequences (tenant_id, channel_id, last_event_seq)
SELECT channels.tenant_id, channels.channel_id, 0
FROM public.channels AS channels;
--> statement-breakpoint
ALTER TABLE public.channel_membership_epochs
ADD CONSTRAINT channel_membership_epochs_joined_event_fk
FOREIGN KEY (tenant_id, channel_id, joined_event_seq)
REFERENCES public.channel_events(tenant_id, channel_id, event_seq)
ON DELETE RESTRICT
ON UPDATE RESTRICT
NOT DEFERRABLE;
--> statement-breakpoint
ALTER TABLE public.channel_membership_epochs
ADD CONSTRAINT channel_membership_epochs_exited_event_fk
FOREIGN KEY (tenant_id, channel_id, exited_event_seq)
REFERENCES public.channel_events(tenant_id, channel_id, event_seq)
ON DELETE RESTRICT
ON UPDATE RESTRICT
NOT DEFERRABLE;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER channel_membership_epochs_event_type_guard
AFTER INSERT OR UPDATE OF tenant_id, channel_id, joined_event_seq, exited_event_seq
ON public.channel_membership_epochs
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.enforce_channel_membership_event_types();
--> statement-breakpoint
DO $do$
BEGIN
	IF EXISTS (SELECT 1 FROM public.channel_membership_epochs) THEN
		RAISE EXCEPTION USING
			ERRCODE = '55000',
			MESSAGE = 'channel stream migration postcondition failed';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.channels AS channels
		WHERE (
			SELECT count(*)
			FROM public.channel_event_sequences AS sequences
			WHERE sequences.tenant_id = channels.tenant_id
				AND sequences.channel_id = channels.channel_id
		) <> 1
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '55000',
			MESSAGE = 'channel stream migration postcondition failed';
	END IF;
END;
$do$;
