CREATE TABLE "catalog_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"product_url" text NOT NULL,
	"image_url" text NOT NULL,
	"title" text,
	"price_usd" real,
	"category" text NOT NULL,
	"department" text NOT NULL,
	"look" vector(512) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_view" (
	"user_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"dwell_ms" integer DEFAULT 0 NOT NULL,
	"saved" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_view_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "user_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"shop_for" text,
	"price_max_usd" integer,
	"hidden_categories" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_profile" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "catalog_item" ADD CONSTRAINT "catalog_item_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_view" ADD CONSTRAINT "item_view_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_view" ADD CONSTRAINT "item_view_item_id_catalog_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_item_brand_url_idx" ON "catalog_item" USING btree ("brand_id","product_url");--> statement-breakpoint
CREATE INDEX "catalog_item_category_idx" ON "catalog_item" USING btree ("category","department");