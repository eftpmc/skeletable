-- Photo vectors for brand neighbors. Railway's and the self-host image's Postgres ship pgvector.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "brand_photo" (
	"brand_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"image_url" text NOT NULL,
	"title" text,
	"price_usd" real,
	"product_url" text,
	CONSTRAINT "brand_photo_brand_id_position_pk" PRIMARY KEY("brand_id","position")
);
--> statement-breakpoint
CREATE TABLE "brand_profile" (
	"brand_id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"site" text,
	"platform" text,
	"country" text,
	"city" text,
	"description" text,
	"price_low_usd" integer,
	"price_high_usd" integer,
	"quality" real DEFAULT 0 NOT NULL,
	"seen_at" integer,
	"look" vector(512) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_vote" (
	"user_id" text NOT NULL,
	"brand_id" uuid NOT NULL,
	"verdict" text NOT NULL,
	"context" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_vote_user_id_brand_id_pk" PRIMARY KEY("user_id","brand_id")
);
--> statement-breakpoint
ALTER TABLE "brand_photo" ADD CONSTRAINT "brand_photo_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profile" ADD CONSTRAINT "brand_profile_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_vote" ADD CONSTRAINT "brand_vote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_vote" ADD CONSTRAINT "brand_vote_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_profile_look_idx" ON "brand_profile" USING hnsw ("look" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "brand_profile_kind_quality_idx" ON "brand_profile" USING btree ("kind","quality");--> statement-breakpoint
CREATE INDEX "brand_vote_brand_idx" ON "brand_vote" USING btree ("brand_id");