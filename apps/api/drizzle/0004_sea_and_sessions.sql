ALTER TABLE "players" ALTER COLUMN "fuel" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "fish_sessions" ADD COLUMN "point_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "fish_sessions" ADD COLUMN "conds" jsonb DEFAULT '{"deep":false,"storm":false}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "fuel_tank" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "sea_x" real;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "sea_y" real;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "sea_heading" real;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "game_hour" real DEFAULT 9 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "sea_time" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "chart" text DEFAULT '' NOT NULL;