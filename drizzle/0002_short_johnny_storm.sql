CREATE TABLE `imdb_ratings_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`imdb_id` text NOT NULL,
	`season_number` integer NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `imdb_ratings_cache_imdb_season_idx` ON `imdb_ratings_cache` (`imdb_id`,`season_number`);--> statement-breakpoint
CREATE INDEX `imdb_ratings_cache_expires_idx` ON `imdb_ratings_cache` (`expires_at`);--> statement-breakpoint
ALTER TABLE `shows` ADD `imdb_id` text;