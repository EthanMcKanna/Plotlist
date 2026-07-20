CREATE TABLE `trakt_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`trakt_username` text,
	`trakt_slug` text,
	`access_token` text NOT NULL,
	`refresh_token` text,
	`token_expires_at` integer,
	`connected_at` integer NOT NULL,
	`last_imported_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trakt_accounts_user_idx` ON `trakt_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `trakt_device_auths` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_code` text NOT NULL,
	`user_code` text NOT NULL,
	`verification_url` text NOT NULL,
	`interval_seconds` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`status` text NOT NULL,
	`last_polled_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `trakt_device_auths_user_created_idx` ON `trakt_device_auths` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `trakt_device_auths_expires_idx` ON `trakt_device_auths` (`expires_at`);--> statement-breakpoint
CREATE TABLE `trakt_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`phase` text NOT NULL,
	`options` text NOT NULL,
	`cursor` text NOT NULL,
	`counts` text NOT NULL,
	`unmatched` text,
	`snapshot_key` text,
	`error` text,
	`fail_count` integer NOT NULL,
	`lease_until` integer,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `trakt_imports_user_created_idx` ON `trakt_imports` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `trakt_imports_status_lease_idx` ON `trakt_imports` (`status`,`lease_until`);