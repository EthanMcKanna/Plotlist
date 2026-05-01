CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."feed_item_type" AS ENUM('review', 'log');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step" AS ENUM('profile', 'follow', 'shows', 'complete');--> statement-breakpoint
CREATE TYPE "public"."release_sync_status" AS ENUM('idle', 'scheduled', 'running', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."report_action" AS ENUM('dismiss', 'delete');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."target_type" AS ENUM('review', 'log', 'list');--> statement-breakpoint
CREATE TYPE "public"."watch_status" AS ENUM('watchlist', 'watching', 'completed', 'dropped');--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"last_used_at" bigint NOT NULL,
	"revoked_at" bigint
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"target_type" "target_type" NOT NULL,
	"target_id" text NOT NULL,
	"text" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_sync_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"source_record_id" text,
	"display_name" text NOT NULL,
	"contact_hash" text NOT NULL,
	"matched_user_id" text,
	"invited_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"show_id" text NOT NULL,
	"season_number" integer NOT NULL,
	"episode_number" integer NOT NULL,
	"watched_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_items" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"type" "feed_item_type" NOT NULL,
	"target_id" text NOT NULL,
	"show_id" text NOT NULL,
	"timestamp" bigint NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"id" text PRIMARY KEY NOT NULL,
	"follower_id" text NOT NULL,
	"followee_id" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "likes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"target_type" "target_type" NOT NULL,
	"target_id" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_items" (
	"id" text PRIMARY KEY NOT NULL,
	"list_id" text NOT NULL,
	"show_id" text NOT NULL,
	"position" integer NOT NULL,
	"added_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_public" boolean NOT NULL,
	"cover_url" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_verification_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"requested_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"completed_at" bigint
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"reset_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_events" (
	"id" text PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"air_date" text NOT NULL,
	"air_date_ts" bigint NOT NULL,
	"season_number" integer NOT NULL,
	"episode_number" integer NOT NULL,
	"episode_title" text,
	"is_premiere" boolean NOT NULL,
	"is_returning_season" boolean NOT NULL,
	"is_season_finale" boolean NOT NULL,
	"is_series_finale" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_id" text NOT NULL,
	"target_type" "target_type" NOT NULL,
	"target_id" text NOT NULL,
	"reason" text,
	"created_at" bigint NOT NULL,
	"status" "report_status" NOT NULL,
	"resolved_at" bigint,
	"resolved_by" text,
	"action" "report_action"
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"show_id" text NOT NULL,
	"rating" double precision NOT NULL,
	"review_text" text,
	"spoiler" boolean NOT NULL,
	"season_number" integer,
	"episode_number" integer,
	"episode_title" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint
);
--> statement-breakpoint
CREATE TABLE "show_embedding_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" "job_status" NOT NULL,
	"embedding_version" text NOT NULL,
	"model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"batch_size" integer NOT NULL,
	"next_cursor" text,
	"processed_count" integer NOT NULL,
	"embedded_count" integer NOT NULL,
	"skipped_count" integer NOT NULL,
	"total_count" integer,
	"started_at" bigint,
	"completed_at" bigint,
	"failed_at" bigint,
	"error" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "show_embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"external_source" text NOT NULL,
	"external_id" text NOT NULL,
	"embedding_version" text NOT NULL,
	"model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"input_text" text NOT NULL,
	"input_hash" text NOT NULL,
	"similarity_embedding" vector(1536) NOT NULL,
	"retrieval_embedding" vector(1536) NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "show_release_sync_state" (
	"id" text PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"synced_at" bigint,
	"expires_at" bigint,
	"status" "release_sync_status" NOT NULL,
	"last_error" text,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shows" (
	"id" text PRIMARY KEY NOT NULL,
	"external_source" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"original_title" text,
	"year" integer,
	"overview" text,
	"poster_url" text,
	"backdrop_url" text,
	"genre_ids" jsonb,
	"original_language" text,
	"origin_countries" jsonb,
	"tmdb_popularity" double precision,
	"tmdb_vote_average" double precision,
	"tmdb_vote_count" integer,
	"search_text" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tmdb_details_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"external_source" text NOT NULL,
	"external_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tmdb_episode_cache_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" "job_status" NOT NULL,
	"requested_by" text,
	"target_show_count" integer NOT NULL,
	"batch_size" integer NOT NULL,
	"next_offset" integer NOT NULL,
	"processed_show_count" integer NOT NULL,
	"cached_season_count" integer NOT NULL,
	"skipped_season_count" integer NOT NULL,
	"failed_show_count" integer NOT NULL,
	"total_show_count" integer,
	"started_at" bigint,
	"completed_at" bigint,
	"failed_at" bigint,
	"error" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tmdb_import_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" "job_status" NOT NULL,
	"requested_by" text,
	"target_count" integer NOT NULL,
	"page_size" integer NOT NULL,
	"max_page" integer NOT NULL,
	"next_page" integer NOT NULL,
	"pages_processed" integer NOT NULL,
	"shows_processed" integer NOT NULL,
	"total_pages" integer,
	"started_at" bigint,
	"completed_at" bigint,
	"failed_at" bigint,
	"error" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tmdb_list_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"results" jsonb NOT NULL,
	"fetched_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tmdb_search_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"results" jsonb NOT NULL,
	"fetched_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_taste_caches" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"theme_key" text NOT NULL,
	"embedding_version" text NOT NULL,
	"signal_fingerprint" text NOT NULL,
	"recommendations" jsonb NOT NULL,
	"positive_show_ids" jsonb NOT NULL,
	"negative_show_ids" jsonb NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_taste_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"favorite_show_ids" jsonb NOT NULL,
	"favorite_themes" jsonb NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_taste_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"embedding_version" text NOT NULL,
	"signal_fingerprint" text NOT NULL,
	"favorite_show_ids" jsonb NOT NULL,
	"favorite_themes" jsonb NOT NULL,
	"positive_show_ids" jsonb NOT NULL,
	"negative_show_ids" jsonb NOT NULL,
	"similarity_embedding" vector(1536) NOT NULL,
	"updated_at" bigint NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"image" text,
	"email" text,
	"email_verification_time" bigint,
	"phone" text,
	"phone_verification_time" bigint,
	"phone_hash" text,
	"is_anonymous" boolean,
	"is_admin" boolean,
	"username" text,
	"display_name" text,
	"bio" text,
	"avatar_url" text,
	"search_text" text,
	"created_at" bigint NOT NULL,
	"last_seen_at" bigint,
	"counts_followers" integer DEFAULT 0 NOT NULL,
	"counts_following" integer DEFAULT 0 NOT NULL,
	"counts_reviews" integer DEFAULT 0 NOT NULL,
	"counts_logs" integer DEFAULT 0 NOT NULL,
	"counts_lists" integer DEFAULT 0 NOT NULL,
	"counts_watchlist" integer DEFAULT 0 NOT NULL,
	"counts_watching" integer DEFAULT 0 NOT NULL,
	"counts_completed" integer DEFAULT 0 NOT NULL,
	"counts_dropped" integer DEFAULT 0 NOT NULL,
	"counts_total_shows" integer DEFAULT 0 NOT NULL,
	"onboarding_step" "onboarding_step" DEFAULT 'profile',
	"onboarding_completed_at" bigint,
	"favorite_show_ids" jsonb,
	"favorite_genres" jsonb,
	"profile_visibility" jsonb,
	"release_calendar_preferences" jsonb
);
--> statement-breakpoint
CREATE TABLE "watch_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"show_id" text NOT NULL,
	"watched_at" bigint NOT NULL,
	"note" text,
	"season_number" integer,
	"episode_number" integer,
	"episode_title" text
);
--> statement-breakpoint
CREATE TABLE "watch_states" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"show_id" text NOT NULL,
	"status" "watch_status" NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_sync_entries" ADD CONSTRAINT "contact_sync_entries_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_sync_entries" ADD CONSTRAINT "contact_sync_entries_matched_user_id_users_id_fk" FOREIGN KEY ("matched_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_progress" ADD CONSTRAINT "episode_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_progress" ADD CONSTRAINT "episode_progress_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_users_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_events" ADD CONSTRAINT "release_events_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "show_embeddings" ADD CONSTRAINT "show_embeddings_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "show_release_sync_state" ADD CONSTRAINT "show_release_sync_state_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tmdb_episode_cache_jobs" ADD CONSTRAINT "tmdb_episode_cache_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tmdb_import_jobs" ADD CONSTRAINT "tmdb_import_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_taste_caches" ADD CONSTRAINT "user_taste_caches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_taste_preferences" ADD CONSTRAINT "user_taste_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_taste_profiles" ADD CONSTRAINT "user_taste_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_logs" ADD CONSTRAINT "watch_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_logs" ADD CONSTRAINT "watch_logs_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_states" ADD CONSTRAINT "watch_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_states" ADD CONSTRAINT "watch_states_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_idx" ON "auth_sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "comments_target_created_idx" ON "comments" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_author_created_idx" ON "comments" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "contact_sync_entries_owner_updated_idx" ON "contact_sync_entries" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_sync_entries_owner_hash_idx" ON "contact_sync_entries" USING btree ("owner_id","contact_hash");--> statement-breakpoint
CREATE INDEX "contact_sync_entries_matched_user_idx" ON "contact_sync_entries" USING btree ("matched_user_id");--> statement-breakpoint
CREATE INDEX "episode_progress_user_show_idx" ON "episode_progress" USING btree ("user_id","show_id");--> statement-breakpoint
CREATE INDEX "episode_progress_user_watched_idx" ON "episode_progress" USING btree ("user_id","watched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "episode_progress_user_episode_idx" ON "episode_progress" USING btree ("user_id","show_id","season_number","episode_number");--> statement-breakpoint
CREATE INDEX "feed_items_owner_timestamp_idx" ON "feed_items" USING btree ("owner_id","timestamp");--> statement-breakpoint
CREATE INDEX "feed_items_target_idx" ON "feed_items" USING btree ("type","target_id");--> statement-breakpoint
CREATE INDEX "follows_follower_created_idx" ON "follows" USING btree ("follower_id","created_at");--> statement-breakpoint
CREATE INDEX "follows_followee_created_idx" ON "follows" USING btree ("followee_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "follows_pair_idx" ON "follows" USING btree ("follower_id","followee_id");--> statement-breakpoint
CREATE INDEX "likes_user_created_idx" ON "likes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "likes_target_created_idx" ON "likes" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "likes_user_target_idx" ON "likes" USING btree ("user_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "list_items_list_position_idx" ON "list_items" USING btree ("list_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "list_items_list_show_idx" ON "list_items" USING btree ("list_id","show_id");--> statement-breakpoint
CREATE INDEX "lists_owner_updated_idx" ON "lists" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "phone_verification_requests_phone_idx" ON "phone_verification_requests" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "phone_verification_requests_expires_at_idx" ON "phone_verification_requests" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limits_key_idx" ON "rate_limits" USING btree ("key");--> statement-breakpoint
CREATE INDEX "release_events_show_air_date_idx" ON "release_events" USING btree ("show_id","air_date_ts");--> statement-breakpoint
CREATE INDEX "release_events_air_date_idx" ON "release_events" USING btree ("air_date_ts");--> statement-breakpoint
CREATE INDEX "reports_reporter_created_idx" ON "reports" USING btree ("reporter_id","created_at");--> statement-breakpoint
CREATE INDEX "reviews_show_created_idx" ON "reviews" USING btree ("show_id","created_at");--> statement-breakpoint
CREATE INDEX "reviews_author_created_idx" ON "reviews" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "reviews_author_show_idx" ON "reviews" USING btree ("author_id","show_id");--> statement-breakpoint
CREATE INDEX "reviews_created_idx" ON "reviews" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reviews_show_episode_idx" ON "reviews" USING btree ("show_id","season_number","episode_number");--> statement-breakpoint
CREATE INDEX "show_embedding_jobs_created_idx" ON "show_embedding_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "show_embedding_jobs_status_created_idx" ON "show_embedding_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "show_embeddings_show_idx" ON "show_embeddings" USING btree ("show_id");--> statement-breakpoint
CREATE UNIQUE INDEX "show_embeddings_external_idx" ON "show_embeddings" USING btree ("external_source","external_id");--> statement-breakpoint
CREATE INDEX "show_embeddings_version_updated_idx" ON "show_embeddings" USING btree ("embedding_version","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "show_release_sync_state_show_idx" ON "show_release_sync_state" USING btree ("show_id");--> statement-breakpoint
CREATE INDEX "show_release_sync_state_status_updated_idx" ON "show_release_sync_state" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "show_release_sync_state_expires_idx" ON "show_release_sync_state" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shows_external_idx" ON "shows" USING btree ("external_source","external_id");--> statement-breakpoint
CREATE INDEX "shows_search_text_idx" ON "shows" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "shows_updated_at_idx" ON "shows" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tmdb_details_cache_external_idx" ON "tmdb_details_cache" USING btree ("external_source","external_id");--> statement-breakpoint
CREATE INDEX "tmdb_details_cache_expires_idx" ON "tmdb_details_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "tmdb_episode_cache_jobs_created_idx" ON "tmdb_episode_cache_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tmdb_episode_cache_jobs_status_created_idx" ON "tmdb_episode_cache_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "tmdb_import_jobs_created_idx" ON "tmdb_import_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tmdb_import_jobs_status_created_idx" ON "tmdb_import_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tmdb_list_cache_category_idx" ON "tmdb_list_cache" USING btree ("category");--> statement-breakpoint
CREATE INDEX "tmdb_list_cache_expires_idx" ON "tmdb_list_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tmdb_search_cache_query_idx" ON "tmdb_search_cache" USING btree ("query");--> statement-breakpoint
CREATE INDEX "tmdb_search_cache_expires_idx" ON "tmdb_search_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_provider_account_idx" ON "user_identities" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "user_identities_user_idx" ON "user_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_taste_caches_user_theme_idx" ON "user_taste_caches" USING btree ("user_id","theme_key");--> statement-breakpoint
CREATE INDEX "user_taste_caches_user_updated_idx" ON "user_taste_caches" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_taste_preferences_user_idx" ON "user_taste_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_taste_profiles_user_idx" ON "user_taste_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_taste_profiles_updated_idx" ON "user_taste_profiles" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_hash_idx" ON "users" USING btree ("phone_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_idx" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_last_seen_at_idx" ON "users" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "users_search_text_idx" ON "users" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "watch_logs_user_watched_idx" ON "watch_logs" USING btree ("user_id","watched_at");--> statement-breakpoint
CREATE INDEX "watch_logs_show_watched_idx" ON "watch_logs" USING btree ("show_id","watched_at");--> statement-breakpoint
CREATE INDEX "watch_logs_watched_idx" ON "watch_logs" USING btree ("watched_at");--> statement-breakpoint
CREATE INDEX "watch_states_user_updated_idx" ON "watch_states" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "watch_states_user_show_idx" ON "watch_states" USING btree ("user_id","show_id");
