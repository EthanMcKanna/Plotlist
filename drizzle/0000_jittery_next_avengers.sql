CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`refresh_token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_sessions_user_idx` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_refresh_token_hash_idx` ON `auth_sessions` (`refresh_token_hash`);--> statement-breakpoint
CREATE INDEX `auth_sessions_expires_at_idx` ON `auth_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comments_target_created_idx` ON `comments` (`target_type`,`target_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `comments_author_created_idx` ON `comments` (`author_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `contact_sync_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`source_record_id` text,
	`display_name` text NOT NULL,
	`contact_hash` text NOT NULL,
	`matched_user_id` text,
	`invited_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`matched_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `contact_sync_entries_owner_updated_idx` ON `contact_sync_entries` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `contact_sync_entries_owner_hash_idx` ON `contact_sync_entries` (`owner_id`,`contact_hash`);--> statement-breakpoint
CREATE INDEX `contact_sync_entries_matched_user_idx` ON `contact_sync_entries` (`matched_user_id`);--> statement-breakpoint
CREATE TABLE `episode_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`show_id` text NOT NULL,
	`season_number` integer NOT NULL,
	`episode_number` integer NOT NULL,
	`watched_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `episode_progress_user_show_idx` ON `episode_progress` (`user_id`,`show_id`);--> statement-breakpoint
CREATE INDEX `episode_progress_user_watched_idx` ON `episode_progress` (`user_id`,`watched_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `episode_progress_user_episode_idx` ON `episode_progress` (`user_id`,`show_id`,`season_number`,`episode_number`);--> statement-breakpoint
CREATE TABLE `feed_items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`type` text NOT NULL,
	`target_id` text NOT NULL,
	`show_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `feed_items_owner_timestamp_idx` ON `feed_items` (`owner_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `feed_items_target_idx` ON `feed_items` (`type`,`target_id`);--> statement-breakpoint
CREATE TABLE `follows` (
	`id` text PRIMARY KEY NOT NULL,
	`follower_id` text NOT NULL,
	`followee_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`followee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `follows_follower_created_idx` ON `follows` (`follower_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `follows_followee_created_idx` ON `follows` (`followee_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `follows_pair_idx` ON `follows` (`follower_id`,`followee_id`);--> statement-breakpoint
CREATE TABLE `likes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `likes_user_created_idx` ON `likes` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `likes_target_created_idx` ON `likes` (`target_type`,`target_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `likes_user_target_idx` ON `likes` (`user_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `list_items` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`show_id` text NOT NULL,
	`position` integer NOT NULL,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `list_items_list_position_idx` ON `list_items` (`list_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `list_items_list_show_idx` ON `list_items` (`list_id`,`show_id`);--> statement-breakpoint
CREATE TABLE `lists` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`is_public` integer NOT NULL,
	`cover_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lists_owner_updated_idx` ON `lists` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `phone_verification_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`requested_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `phone_verification_requests_phone_idx` ON `phone_verification_requests` (`phone`);--> statement-breakpoint
CREATE INDEX `phone_verification_requests_expires_at_idx` ON `phone_verification_requests` (`expires_at`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limits_key_idx` ON `rate_limits` (`key`);--> statement-breakpoint
CREATE TABLE `release_events` (
	`id` text PRIMARY KEY NOT NULL,
	`show_id` text NOT NULL,
	`air_date` text NOT NULL,
	`air_date_ts` integer NOT NULL,
	`season_number` integer NOT NULL,
	`episode_number` integer NOT NULL,
	`episode_title` text,
	`is_premiere` integer NOT NULL,
	`is_returning_season` integer NOT NULL,
	`is_season_finale` integer NOT NULL,
	`is_series_finale` integer NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `release_events_show_air_date_idx` ON `release_events` (`show_id`,`air_date_ts`);--> statement-breakpoint
CREATE INDEX `release_events_air_date_idx` ON `release_events` (`air_date_ts`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	`status` text NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	`action` text,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reports_reporter_created_idx` ON `reports` (`reporter_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`show_id` text NOT NULL,
	`rating` real NOT NULL,
	`review_text` text,
	`spoiler` integer NOT NULL,
	`season_number` integer,
	`episode_number` integer,
	`episode_title` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reviews_show_created_idx` ON `reviews` (`show_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reviews_author_created_idx` ON `reviews` (`author_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reviews_author_show_idx` ON `reviews` (`author_id`,`show_id`);--> statement-breakpoint
CREATE INDEX `reviews_created_idx` ON `reviews` (`created_at`);--> statement-breakpoint
CREATE INDEX `reviews_show_episode_idx` ON `reviews` (`show_id`,`season_number`,`episode_number`);--> statement-breakpoint
CREATE TABLE `show_embedding_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`embedding_version` text NOT NULL,
	`model` text NOT NULL,
	`dimensions` integer NOT NULL,
	`batch_size` integer NOT NULL,
	`next_cursor` text,
	`processed_count` integer NOT NULL,
	`embedded_count` integer NOT NULL,
	`skipped_count` integer NOT NULL,
	`total_count` integer,
	`started_at` integer,
	`completed_at` integer,
	`failed_at` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `show_embedding_jobs_created_idx` ON `show_embedding_jobs` (`created_at`);--> statement-breakpoint
CREATE INDEX `show_embedding_jobs_status_created_idx` ON `show_embedding_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `show_embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`show_id` text NOT NULL,
	`external_source` text NOT NULL,
	`external_id` text NOT NULL,
	`embedding_version` text NOT NULL,
	`model` text NOT NULL,
	`dimensions` integer NOT NULL,
	`input_text` text NOT NULL,
	`input_hash` text NOT NULL,
	`similarity_embedding` text NOT NULL,
	`retrieval_embedding` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `show_embeddings_show_idx` ON `show_embeddings` (`show_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `show_embeddings_external_idx` ON `show_embeddings` (`external_source`,`external_id`);--> statement-breakpoint
CREATE INDEX `show_embeddings_version_updated_idx` ON `show_embeddings` (`embedding_version`,`updated_at`);--> statement-breakpoint
CREATE TABLE `show_release_sync_state` (
	`id` text PRIMARY KEY NOT NULL,
	`show_id` text NOT NULL,
	`synced_at` integer,
	`expires_at` integer,
	`status` text NOT NULL,
	`last_error` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `show_release_sync_state_show_idx` ON `show_release_sync_state` (`show_id`);--> statement-breakpoint
CREATE INDEX `show_release_sync_state_status_updated_idx` ON `show_release_sync_state` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `show_release_sync_state_expires_idx` ON `show_release_sync_state` (`expires_at`);--> statement-breakpoint
CREATE TABLE `shows` (
	`id` text PRIMARY KEY NOT NULL,
	`external_source` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`original_title` text,
	`year` integer,
	`overview` text,
	`poster_url` text,
	`backdrop_url` text,
	`genre_ids` text,
	`original_language` text,
	`origin_countries` text,
	`tmdb_popularity` real,
	`tmdb_vote_average` real,
	`tmdb_vote_count` integer,
	`search_text` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shows_external_idx` ON `shows` (`external_source`,`external_id`);--> statement-breakpoint
CREATE INDEX `shows_search_text_idx` ON `shows` (`search_text`);--> statement-breakpoint
CREATE INDEX `shows_updated_at_idx` ON `shows` (`updated_at`);--> statement-breakpoint
CREATE TABLE `tmdb_details_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`external_source` text NOT NULL,
	`external_id` text NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tmdb_details_cache_external_idx` ON `tmdb_details_cache` (`external_source`,`external_id`);--> statement-breakpoint
CREATE INDEX `tmdb_details_cache_expires_idx` ON `tmdb_details_cache` (`expires_at`);--> statement-breakpoint
CREATE TABLE `tmdb_episode_cache_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`requested_by` text,
	`target_show_count` integer NOT NULL,
	`batch_size` integer NOT NULL,
	`next_offset` integer NOT NULL,
	`processed_show_count` integer NOT NULL,
	`cached_season_count` integer NOT NULL,
	`skipped_season_count` integer NOT NULL,
	`failed_show_count` integer NOT NULL,
	`total_show_count` integer,
	`started_at` integer,
	`completed_at` integer,
	`failed_at` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tmdb_episode_cache_jobs_created_idx` ON `tmdb_episode_cache_jobs` (`created_at`);--> statement-breakpoint
CREATE INDEX `tmdb_episode_cache_jobs_status_created_idx` ON `tmdb_episode_cache_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `tmdb_import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`requested_by` text,
	`target_count` integer NOT NULL,
	`page_size` integer NOT NULL,
	`max_page` integer NOT NULL,
	`next_page` integer NOT NULL,
	`pages_processed` integer NOT NULL,
	`shows_processed` integer NOT NULL,
	`total_pages` integer,
	`started_at` integer,
	`completed_at` integer,
	`failed_at` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tmdb_import_jobs_created_idx` ON `tmdb_import_jobs` (`created_at`);--> statement-breakpoint
CREATE INDEX `tmdb_import_jobs_status_created_idx` ON `tmdb_import_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `tmdb_list_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`results` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tmdb_list_cache_category_idx` ON `tmdb_list_cache` (`category`);--> statement-breakpoint
CREATE INDEX `tmdb_list_cache_expires_idx` ON `tmdb_list_cache` (`expires_at`);--> statement-breakpoint
CREATE TABLE `tmdb_search_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`query` text NOT NULL,
	`results` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tmdb_search_cache_query_idx` ON `tmdb_search_cache` (`query`);--> statement-breakpoint
CREATE INDEX `tmdb_search_cache_expires_idx` ON `tmdb_search_cache` (`expires_at`);--> statement-breakpoint
CREATE TABLE `user_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_identities_provider_account_idx` ON `user_identities` (`provider`,`provider_account_id`);--> statement-breakpoint
CREATE INDEX `user_identities_user_idx` ON `user_identities` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_taste_caches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`theme_key` text NOT NULL,
	`embedding_version` text NOT NULL,
	`signal_fingerprint` text NOT NULL,
	`recommendations` text NOT NULL,
	`positive_show_ids` text NOT NULL,
	`negative_show_ids` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_taste_caches_user_theme_idx` ON `user_taste_caches` (`user_id`,`theme_key`);--> statement-breakpoint
CREATE INDEX `user_taste_caches_user_updated_idx` ON `user_taste_caches` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `user_taste_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`favorite_show_ids` text NOT NULL,
	`favorite_themes` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_taste_preferences_user_idx` ON `user_taste_preferences` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_taste_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`embedding_version` text NOT NULL,
	`signal_fingerprint` text NOT NULL,
	`favorite_show_ids` text NOT NULL,
	`favorite_themes` text NOT NULL,
	`positive_show_ids` text NOT NULL,
	`negative_show_ids` text NOT NULL,
	`similarity_embedding` text NOT NULL,
	`updated_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_taste_profiles_user_idx` ON `user_taste_profiles` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_taste_profiles_updated_idx` ON `user_taste_profiles` (`updated_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`image` text,
	`email` text,
	`email_verification_time` integer,
	`phone` text,
	`phone_verification_time` integer,
	`phone_hash` text,
	`is_anonymous` integer,
	`is_admin` integer,
	`username` text,
	`display_name` text,
	`bio` text,
	`avatar_url` text,
	`search_text` text,
	`created_at` integer NOT NULL,
	`last_seen_at` integer,
	`counts_followers` integer DEFAULT 0 NOT NULL,
	`counts_following` integer DEFAULT 0 NOT NULL,
	`counts_reviews` integer DEFAULT 0 NOT NULL,
	`counts_logs` integer DEFAULT 0 NOT NULL,
	`counts_lists` integer DEFAULT 0 NOT NULL,
	`counts_watchlist` integer DEFAULT 0 NOT NULL,
	`counts_watching` integer DEFAULT 0 NOT NULL,
	`counts_completed` integer DEFAULT 0 NOT NULL,
	`counts_dropped` integer DEFAULT 0 NOT NULL,
	`counts_total_shows` integer DEFAULT 0 NOT NULL,
	`onboarding_step` text DEFAULT 'profile',
	`onboarding_completed_at` integer,
	`favorite_show_ids` text,
	`favorite_genres` text,
	`profile_visibility` text,
	`release_calendar_preferences` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_idx` ON `users` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_hash_idx` ON `users` (`phone_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_idx` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `users_created_at_idx` ON `users` (`created_at`);--> statement-breakpoint
CREATE INDEX `users_last_seen_at_idx` ON `users` (`last_seen_at`);--> statement-breakpoint
CREATE INDEX `users_search_text_idx` ON `users` (`search_text`);--> statement-breakpoint
CREATE TABLE `watch_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`show_id` text NOT NULL,
	`watched_at` integer NOT NULL,
	`note` text,
	`season_number` integer,
	`episode_number` integer,
	`episode_title` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `watch_logs_user_watched_idx` ON `watch_logs` (`user_id`,`watched_at`);--> statement-breakpoint
CREATE INDEX `watch_logs_show_watched_idx` ON `watch_logs` (`show_id`,`watched_at`);--> statement-breakpoint
CREATE INDEX `watch_logs_watched_idx` ON `watch_logs` (`watched_at`);--> statement-breakpoint
CREATE TABLE `watch_states` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`show_id` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `watch_states_user_updated_idx` ON `watch_states` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `watch_states_user_show_idx` ON `watch_states` (`user_id`,`show_id`);