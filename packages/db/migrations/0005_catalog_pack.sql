CREATE TABLE "catalog_pack" (
	"hash" text PRIMARY KEY NOT NULL,
	"counts" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
