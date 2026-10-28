CREATE TABLE "application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contributor_id" uuid NOT NULL,
	"role" text NOT NULL,
	"note" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_role_check" CHECK (role in ('curator')),
	CONSTRAINT "application_status_check" CHECK (status in ('pending', 'approved', 'declined'))
);
--> statement-breakpoint
ALTER TABLE "contributor" ADD COLUMN "role" text DEFAULT 'contributor' NOT NULL;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_contributor_id_contributor_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_decided_by_id_contributor_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."contributor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_one_open" ON "application" USING btree ("contributor_id") WHERE status = 'pending';--> statement-breakpoint
ALTER TABLE "contributor" ADD CONSTRAINT "contributor_role_check" CHECK (role in ('contributor', 'curator', 'owner'));