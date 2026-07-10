CREATE TABLE `facet_defs` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`group_key` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`embedding_version` text NOT NULL,
	`query_vector` text NOT NULL,
	`sort_order` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facet_defs_key_idx` ON `facet_defs` (`key`);--> statement-breakpoint
CREATE INDEX `facet_defs_group_idx` ON `facet_defs` (`group_key`,`sort_order`);--> statement-breakpoint
CREATE TABLE `show_embedding_state` (
	`id` text PRIMARY KEY NOT NULL,
	`show_id` text NOT NULL,
	`tmdb_id` integer,
	`embedding_version` text NOT NULL,
	`input_hash` text NOT NULL,
	`base_input_hash` text,
	`status` text NOT NULL,
	`fail_count` integer NOT NULL,
	`last_error` text,
	`embedded_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `show_embedding_state_show_idx` ON `show_embedding_state` (`show_id`);--> statement-breakpoint
CREATE INDEX `show_embedding_state_status_updated_idx` ON `show_embedding_state` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `show_facets` (
	`id` text PRIMARY KEY NOT NULL,
	`show_id` text NOT NULL,
	`facet_key` text NOT NULL,
	`score` real NOT NULL,
	`rank` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `show_facets_show_facet_idx` ON `show_facets` (`show_id`,`facet_key`);--> statement-breakpoint
CREATE INDEX `show_facets_facet_score_idx` ON `show_facets` (`facet_key`,`score`);--> statement-breakpoint
CREATE INDEX `show_facets_show_idx` ON `show_facets` (`show_id`);--> statement-breakpoint
DROP TABLE `show_embedding_jobs`;--> statement-breakpoint
DROP TABLE `show_embeddings`;--> statement-breakpoint
DROP TABLE `user_taste_caches`;--> statement-breakpoint
DROP TABLE `user_taste_profiles`;--> statement-breakpoint
CREATE TABLE `user_taste_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`embedding_version` text NOT NULL,
	`signal_fingerprint` text NOT NULL,
	`profile_vector` text NOT NULL,
	`positive_seeds` text NOT NULL,
	`negative_show_ids` text NOT NULL,
	`top_facets` text NOT NULL,
	`updated_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_taste_profiles_user_idx` ON `user_taste_profiles` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_taste_profiles_updated_idx` ON `user_taste_profiles` (`updated_at`);