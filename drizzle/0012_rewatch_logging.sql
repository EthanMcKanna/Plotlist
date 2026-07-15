ALTER TABLE `watch_logs` ADD `date_precision` text DEFAULT 'exact' NOT NULL;--> statement-breakpoint
ALTER TABLE `watch_logs` ADD `watched_on` text;--> statement-breakpoint
ALTER TABLE `watch_logs` ADD `created_at` integer;--> statement-breakpoint
ALTER TABLE `watch_logs` ADD `rating` real;--> statement-breakpoint
ALTER TABLE `watch_logs` ADD `reaction` text;--> statement-breakpoint
ALTER TABLE `watch_logs` ADD `is_rewatch` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `watch_logs_user_show_idx` ON `watch_logs` (`user_id`,`show_id`);--> statement-breakpoint
UPDATE `watch_logs` SET `created_at` = `watched_at` WHERE `created_at` IS NULL;
