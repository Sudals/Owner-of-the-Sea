ALTER TABLE "accounts" DROP CONSTRAINT "accounts_username_unique";--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "username";--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "password_hash";