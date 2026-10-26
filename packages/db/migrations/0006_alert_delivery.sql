CREATE TABLE "notify_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"ntfy_url" text,
	"email_digest" boolean DEFAULT false NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"ntfy_since" timestamp with time zone,
	"email_since" timestamp with time zone,
	"last_digest_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "alert_event" ADD COLUMN "pushed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "alert_event" ADD COLUMN "emailed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notify_settings" ADD CONSTRAINT "notify_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;