CREATE TABLE "game_config" (
	"version" serial PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"hash" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fish_sessions" ADD COLUMN "config_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" DROP COLUMN "fuel_tank";