CREATE TABLE `catchup_briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`show_id` text NOT NULL,
	`season_number` integer NOT NULL,
	`episode_number` integer NOT NULL,
	`version` text NOT NULL,
	`brief` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catchup_briefs_episode_idx` ON `catchup_briefs` (`show_id`,`season_number`,`episode_number`,`version`);