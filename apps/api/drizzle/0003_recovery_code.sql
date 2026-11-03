ALTER TABLE "accounts" ADD COLUMN "recovery_hash" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_recovery_hash_unique" UNIQUE("recovery_hash");