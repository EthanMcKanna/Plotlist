CREATE TABLE `show_notification_mutes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`show_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `show_notification_mutes_user_show_idx` ON `show_notification_mutes` (`user_id`,`show_id`);--> statement-breakpoint
CREATE INDEX `show_notification_mutes_show_idx` ON `show_notification_mutes` (`show_id`);--> statement-breakpoint
CREATE TABLE `show_provider_availability` (
	`show_id` text PRIMARY KEY NOT NULL,
	`provider_keys` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
