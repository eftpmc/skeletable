ALTER TABLE "contributor" ADD COLUMN "token_hash" text;--> statement-breakpoint
ALTER TABLE "contributor" ADD CONSTRAINT "contributor_token_hash_unique" UNIQUE("token_hash");