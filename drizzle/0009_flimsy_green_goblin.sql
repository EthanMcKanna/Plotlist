PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_feed_items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`type` text NOT NULL,
	`target_id` text NOT NULL,
	`show_id` text,
	`timestamp` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_feed_items`("id", "owner_id", "actor_id", "type", "target_id", "show_id", "timestamp", "created_at") SELECT "id", "owner_id", "actor_id", "type", "target_id", "show_id", "timestamp", "created_at" FROM `feed_items`;--> statement-breakpoint
DROP TABLE `feed_items`;--> statement-breakpoint
ALTER TABLE `__new_feed_items` RENAME TO `feed_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `feed_items_owner_timestamp_idx` ON `feed_items` (`owner_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `feed_items_target_idx` ON `feed_items` (`type`,`target_id`);