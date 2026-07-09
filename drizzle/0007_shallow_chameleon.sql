CREATE TABLE `list_follows` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `list_follows_list_user_idx` ON `list_follows` (`list_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `list_follows_user_created_idx` ON `list_follows` (`user_id`,`created_at`);