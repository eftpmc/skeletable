CREATE TABLE "brand_view" (
	"user_id" text NOT NULL,
	"brand_id" uuid NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"dwell_ms" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_view_user_id_brand_id_pk" PRIMARY KEY("user_id","brand_id")
);
--> statement-breakpoint
ALTER TABLE "brand_view" ADD CONSTRAINT "brand_view_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_view" ADD CONSTRAINT "brand_view_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;