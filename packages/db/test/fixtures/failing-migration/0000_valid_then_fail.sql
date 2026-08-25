CREATE TABLE "aw008_partial_migration_probe" (
	"id" integer PRIMARY KEY
);
--> statement-breakpoint
DO $$
BEGIN
	RAISE EXCEPTION 'AW-008 intentional migration failure';
END
$$;
