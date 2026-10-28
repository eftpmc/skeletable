CREATE TABLE "catalog_chunk" (
	"build_id" uuid NOT NULL,
	"n" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
	CONSTRAINT "catalog_chunk_build_id_n_pk" PRIMARY KEY("build_id","n")
);
--> statement-breakpoint
ALTER TABLE "catalog_build" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "catalog_chunk" ADD CONSTRAINT "catalog_chunk_build_id_catalog_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."catalog_build"("id") ON DELETE cascade ON UPDATE no action;