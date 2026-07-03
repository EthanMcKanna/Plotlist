CREATE TABLE `tmdb_season_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`external_source` text NOT NULL,
	`external_id` text NOT NULL,
	`season_number` integer NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tmdb_season_cache_external_season_idx` ON `tmdb_season_cache` (`external_source`,`external_id`,`season_number`);--> statement-breakpoint
CREATE INDEX `tmdb_season_cache_expires_idx` ON `tmdb_season_cache` (`expires_at`);