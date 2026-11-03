CREATE TYPE "public"."notable_reason" AS ENUM('boss', 'rare', 'record', 'trophy');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" "citext" NOT NULL,
	"password_hash" text NOT NULL,
	"nickname" "citext" NOT NULL,
	"steam_id" text,
	"banned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "accounts_username_unique" UNIQUE("username"),
	CONSTRAINT "accounts_nickname_unique" UNIQUE("nickname"),
	CONSTRAINT "accounts_steam_id_unique" UNIQUE("steam_id")
);
--> statement-breakpoint
CREATE TABLE "auth_throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"fail_count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "commits" (
	"batch_id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"session_id" uuid,
	"from_index" integer,
	"to_index" integer,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dex" (
	"account_id" uuid NOT NULL,
	"fish_id" text NOT NULL,
	"first_caught_at" timestamp with time zone DEFAULT now() NOT NULL,
	"max_size_cm" real NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "dex_account_id_fish_id_pk" PRIMARY KEY("account_id","fish_id")
);
--> statement-breakpoint
CREATE TABLE "endless" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"score_total" bigint DEFAULT 0 NOT NULL,
	"next_threshold" bigint NOT NULL,
	"threshold_step" bigint NOT NULL,
	"spawn_bonus" real DEFAULT 0 NOT NULL,
	"omen" jsonb,
	"title" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fish_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"spot_id" text NOT NULL,
	"seed" "bytea" NOT NULL,
	"next_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"account_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "inventory_account_id_item_id_pk" PRIMARY KEY("account_id","item_id"),
	CONSTRAINT "inventory_qty_nonneg" CHECK ("inventory"."qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notable_catches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"cast_index" integer NOT NULL,
	"fish_id" text NOT NULL,
	"spot_id" text NOT NULL,
	"size_cm" real NOT NULL,
	"is_boss" boolean DEFAULT false NOT NULL,
	"boss_tier" text,
	"score" integer DEFAULT 0 NOT NULL,
	"season_id" text,
	"caught_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" "notable_reason" NOT NULL,
	"trophy_key" text
);
--> statement-breakpoint
CREATE TABLE "players" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"gold" integer DEFAULT 0 NOT NULL,
	"location_id" text NOT NULL,
	"day" integer DEFAULT 1 NOT NULL,
	"rod_lv" integer DEFAULT 1 NOT NULL,
	"line_lv" integer DEFAULT 1 NOT NULL,
	"hull_lv" integer DEFAULT 1 NOT NULL,
	"hull_hp" integer NOT NULL,
	"fuel" integer NOT NULL,
	"has_lantern" boolean DEFAULT false NOT NULL,
	"ice_lv" integer DEFAULT 0 NOT NULL,
	"cargo" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"story_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"story_cleared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_gold_nonneg" CHECK ("players"."gold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"account_id" uuid NOT NULL,
	"quest_id" text NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quests_account_id_quest_id_pk" PRIMARY KEY("account_id","quest_id")
);
--> statement-breakpoint
CREATE TABLE "season_scores" (
	"season_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"score" bigint DEFAULT 0 NOT NULL,
	"boss_points" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_scores_season_id_account_id_pk" PRIMARY KEY("season_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "titles" (
	"season_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"title" text NOT NULL,
	"rank" integer NOT NULL,
	CONSTRAINT "titles_season_id_account_id_pk" PRIMARY KEY("season_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "unlocks" (
	"account_id" uuid NOT NULL,
	"island_id" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unlocks_account_id_island_id_pk" PRIMARY KEY("account_id","island_id")
);
--> statement-breakpoint
ALTER TABLE "commits" ADD CONSTRAINT "commits_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dex" ADD CONSTRAINT "dex_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endless" ADD CONSTRAINT "endless_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fish_sessions" ADD CONSTRAINT "fish_sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notable_catches" ADD CONSTRAINT "notable_catches_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_scores" ADD CONSTRAINT "season_scores_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titles" ADD CONSTRAINT "titles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unlocks" ADD CONSTRAINT "unlocks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commits_account_time_idx" ON "commits" USING btree ("account_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "fish_sessions_account_open_idx" ON "fish_sessions" USING btree ("account_id","closed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notable_session_cast_uq" ON "notable_catches" USING btree ("session_id","cast_index");--> statement-breakpoint
CREATE INDEX "notable_account_time_idx" ON "notable_catches" USING btree ("account_id","caught_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notable_fish_size_idx" ON "notable_catches" USING btree ("fish_id","size_cm" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "season_scores_rank_idx" ON "season_scores" USING btree ("season_id","score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sessions_account_idx" ON "sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");