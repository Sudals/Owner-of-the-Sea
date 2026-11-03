ALTER TABLE "players" ADD COLUMN "tank_lv" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "hold_lv" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "market_log" jsonb DEFAULT '{"demand":{}}'::jsonb NOT NULL;