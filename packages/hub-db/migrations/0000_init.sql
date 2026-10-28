CREATE TABLE "assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"contributor_id" uuid NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"result" jsonb,
	"accepted" boolean
);
--> statement-breakpoint
CREATE TABLE "catalog_build" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"format_version" integer NOT NULL,
	"resolver_version" integer NOT NULL,
	"sha256" text NOT NULL,
	"url" text,
	"counts" jsonb NOT NULL,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"kind" text NOT NULL,
	"trust" real DEFAULT 0.5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contributor_handle_unique" UNIQUE("handle"),
	CONSTRAINT "contributor_kind_check" CHECK (kind in ('person', 'worker', 'agent', 'system'))
);
--> statement-breakpoint
CREATE TABLE "crawl" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"reader_id" text NOT NULL,
	"reader_version" integer NOT NULL,
	"recipe_id" uuid,
	"status" text DEFAULT 'running' NOT NULL,
	"stats" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "crawl_status_check" CHECK (status in ('running', 'done', 'failed', 'blocked'))
);
--> statement-breakpoint
CREATE TABLE "embedding" (
	"listing_id" uuid NOT NULL,
	"model" text NOT NULL,
	"kind" text NOT NULL,
	"vector" real[] NOT NULL,
	"reading_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "embedding_listing_id_model_kind_pk" PRIMARY KEY("listing_id","model","kind"),
	CONSTRAINT "embedding_kind_check" CHECK (kind in ('photo', 'text'))
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"kind_version" integer NOT NULL,
	"level" integer NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"input" jsonb NOT NULL,
	"copies" integer DEFAULT 1 NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"expected" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "job_status_check" CHECK (status in ('open', 'settled', 'failed', 'cancelled')),
	CONSTRAINT "job_subject_check" CHECK (subject_kind in ('listing', 'source')),
	CONSTRAINT "job_level_check" CHECK ("job"."level" between 1 and 4)
);
--> statement-breakpoint
CREATE TABLE "listing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"gone_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "listing_annotation" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"reading_id" bigint,
	"field" text NOT NULL,
	"field_version" integer NOT NULL,
	"value" jsonb NOT NULL,
	"confidence" real,
	"reason" text,
	"method" text NOT NULL,
	"model" text,
	"prompt_version" text,
	"contributor_id" uuid NOT NULL,
	"job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_annotation_method_check" CHECK (method in ('rule', 'model', 'agent', 'person'))
);
--> statement-breakpoint
CREATE TABLE "listing_value" (
	"listing_id" uuid NOT NULL,
	"field" text NOT NULL,
	"value" jsonb NOT NULL,
	"annotation_id" bigint NOT NULL,
	"resolver_version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_value_listing_id_field_pk" PRIMARY KEY("listing_id","field")
);
--> statement-breakpoint
CREATE TABLE "reader" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "reader_id_check" CHECK (id in ('shopify', 'woocommerce', 'bigcommerce', 'squarespace', 'standard', 'recipe'))
);
--> statement-breakpoint
CREATE TABLE "reading" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"crawl_id" uuid,
	"format_version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"data" jsonb NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"format_version" integer NOT NULL,
	"spec" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"test_report" jsonb,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_status_check" CHECK (status in ('draft', 'live', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"reader_id" text,
	"reader_config" jsonb,
	"reader_assigned_at" timestamp with time zone,
	"reader_assigned_by_id" uuid,
	"reader_evidence" jsonb,
	"areas" text[] DEFAULT '{}'::text[] NOT NULL,
	"owner_id" uuid,
	"added_by_id" uuid,
	"crawl_every_hours" integer DEFAULT 168 NOT NULL,
	"next_crawl_at" timestamp with time zone,
	"last_crawled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_domain_unique" UNIQUE("domain"),
	CONSTRAINT "source_status_check" CHECK (status in ('candidate', 'approved', 'paused', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "source_annotation" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL,
	"field" text NOT NULL,
	"field_version" integer NOT NULL,
	"value" jsonb NOT NULL,
	"confidence" real,
	"reason" text,
	"method" text NOT NULL,
	"model" text,
	"prompt_version" text,
	"contributor_id" uuid NOT NULL,
	"job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_annotation_method_check" CHECK (method in ('rule', 'model', 'agent', 'person'))
);
--> statement-breakpoint
CREATE TABLE "source_value" (
	"source_id" uuid NOT NULL,
	"field" text NOT NULL,
	"value" jsonb NOT NULL,
	"annotation_id" bigint NOT NULL,
	"resolver_version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_value_source_id_field_pk" PRIMARY KEY("source_id","field")
);
--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_contributor_id_contributor_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl" ADD CONSTRAINT "crawl_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl" ADD CONSTRAINT "crawl_reader_id_reader_id_fk" FOREIGN KEY ("reader_id") REFERENCES "public"."reader"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl" ADD CONSTRAINT "crawl_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding" ADD CONSTRAINT "embedding_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding" ADD CONSTRAINT "embedding_reading_id_reading_id_fk" FOREIGN KEY ("reading_id") REFERENCES "public"."reading"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_annotation" ADD CONSTRAINT "listing_annotation_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_annotation" ADD CONSTRAINT "listing_annotation_reading_id_reading_id_fk" FOREIGN KEY ("reading_id") REFERENCES "public"."reading"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_annotation" ADD CONSTRAINT "listing_annotation_contributor_id_contributor_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_value" ADD CONSTRAINT "listing_value_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_value" ADD CONSTRAINT "listing_value_annotation_id_listing_annotation_id_fk" FOREIGN KEY ("annotation_id") REFERENCES "public"."listing_annotation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading" ADD CONSTRAINT "reading_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading" ADD CONSTRAINT "reading_crawl_id_crawl_id_fk" FOREIGN KEY ("crawl_id") REFERENCES "public"."crawl"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_author_id_contributor_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."contributor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_reader_id_reader_id_fk" FOREIGN KEY ("reader_id") REFERENCES "public"."reader"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_reader_assigned_by_id_contributor_id_fk" FOREIGN KEY ("reader_assigned_by_id") REFERENCES "public"."contributor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_owner_id_contributor_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."contributor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_added_by_id_contributor_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."contributor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_annotation" ADD CONSTRAINT "source_annotation_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_annotation" ADD CONSTRAINT "source_annotation_contributor_id_contributor_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_value" ADD CONSTRAINT "source_value_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_value" ADD CONSTRAINT "source_value_annotation_id_source_annotation_id_fk" FOREIGN KEY ("annotation_id") REFERENCES "public"."source_annotation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_job_contributor_idx" ON "assignment" USING btree ("job_id","contributor_id");--> statement-breakpoint
CREATE INDEX "assignment_expiry_idx" ON "assignment" USING btree ("submitted_at","expires_at");--> statement-breakpoint
CREATE INDEX "crawl_source_started_idx" ON "crawl" USING btree ("source_id","started_at");--> statement-breakpoint
CREATE INDEX "job_open_idx" ON "job" USING btree ("status","level","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_source_external_idx" ON "listing" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "listing_annotation_listing_field_idx" ON "listing_annotation" USING btree ("listing_id","field");--> statement-breakpoint
CREATE INDEX "listing_annotation_contributor_idx" ON "listing_annotation" USING btree ("contributor_id");--> statement-breakpoint
CREATE INDEX "reading_listing_read_idx" ON "reading" USING btree ("listing_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_source_version_idx" ON "recipe" USING btree ("source_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_one_live_idx" ON "recipe" USING btree ("source_id") WHERE "recipe"."status" = 'live';--> statement-breakpoint
CREATE INDEX "source_status_next_crawl_idx" ON "source" USING btree ("status","next_crawl_at");--> statement-breakpoint
CREATE INDEX "source_annotation_source_field_idx" ON "source_annotation" USING btree ("source_id","field");--> statement-breakpoint
CREATE INDEX "source_annotation_contributor_idx" ON "source_annotation" USING btree ("contributor_id");