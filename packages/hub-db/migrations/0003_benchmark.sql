CREATE TABLE "benchmark" (
	"name" text NOT NULL,
	"listing_id" uuid NOT NULL,
	"draft" jsonb,
	"answer" jsonb,
	"checked_by_id" uuid,
	"checked_at" timestamp with time zone,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "benchmark_name_listing_id_pk" PRIMARY KEY("name","listing_id")
);
--> statement-breakpoint
ALTER TABLE "benchmark" ADD CONSTRAINT "benchmark_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark" ADD CONSTRAINT "benchmark_checked_by_id_contributor_id_fk" FOREIGN KEY ("checked_by_id") REFERENCES "public"."contributor"("id") ON DELETE set null ON UPDATE no action;