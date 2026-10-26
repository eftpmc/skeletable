CREATE TABLE "offer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"store_id" uuid NOT NULL,
	"source" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"brand" text,
	"price_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"condition" text NOT NULL,
	"image_url" text,
	"in_stock" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offer_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "price_point" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid,
	"title" text NOT NULL,
	"match_key" text NOT NULL,
	"gtin" text,
	"mpn" text,
	"model" text,
	"category" text,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_point" ADD CONSTRAINT "price_point_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offer_product_idx" ON "offer" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "price_point_offer_idx" ON "price_point" USING btree ("offer_id","seen_at");--> statement-breakpoint
CREATE INDEX "product_gtin_idx" ON "product" USING btree ("gtin");--> statement-breakpoint
CREATE INDEX "product_match_key_idx" ON "product" USING btree ("match_key");--> statement-breakpoint
CREATE INDEX "product_model_idx" ON "product" USING btree ("model");