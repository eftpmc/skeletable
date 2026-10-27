CREATE TABLE "server_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "server_setting" ADD CONSTRAINT "server_setting_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- The first account on an existing server has always been its owner.
UPDATE "user" SET "role" = 'owner' WHERE "id" = (SELECT "id" FROM "user" ORDER BY "created_at" ASC, "id" ASC LIMIT 1);
