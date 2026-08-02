CREATE INDEX `shows_popularity_idx` ON `shows` (`tmdb_popularity`,`tmdb_vote_count`);--> statement-breakpoint
CREATE INDEX `watch_states_updated_idx` ON `watch_states` (`updated_at`);--> statement-breakpoint
CREATE INDEX `watch_states_show_status_idx` ON `watch_states` (`show_id`,`status`);--> statement-breakpoint
CREATE INDEX `watch_states_user_status_updated_idx` ON `watch_states` (`user_id`,`status`,`updated_at`);