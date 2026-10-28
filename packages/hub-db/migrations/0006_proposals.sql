CREATE TABLE "proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"proposer_id" uuid NOT NULL,
	"note" text NOT NULL,
	"reader_id" text NOT NULL,
	"reader_config" jsonb,
	"recipe_id" uuid,
	"report" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_status_check" CHECK (status in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_proposer_id_contributor_id_fk" FOREIGN KEY ("proposer_id") REFERENCES "public"."contributor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_reader_id_reader_id_fk" FOREIGN KEY ("reader_id") REFERENCES "public"."reader"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_decided_by_id_contributor_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."contributor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_one_pending" ON "proposal" USING btree ("source_id") WHERE status = 'pending';