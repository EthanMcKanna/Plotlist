CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`blocker_id` text NOT NULL,
	`blocked_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`blocker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blocked_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `blocks_blocker_created_idx` ON `blocks` (`blocker_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `blocks_blocked_idx` ON `blocks` (`blocked_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `blocks_pair_idx` ON `blocks` (`blocker_id`,`blocked_id`);--> statement-breakpoint
CREATE TABLE `follow_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`requester_id` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `follow_requests_target_created_idx` ON `follow_requests` (`target_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `follow_requests_requester_idx` ON `follow_requests` (`requester_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `follow_requests_pair_idx` ON `follow_requests` (`requester_id`,`target_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `is_private` integer;--> statement-breakpoint
UPDATE `users` SET `name` = COALESCE(`display_name`, `username`), `search_text` = lower(trim(COALESCE(`display_name`, '') || ' ' || COALESCE(`username`, ''))) WHERE `name` LIKE '+%';--> statement-breakpoint
DROP INDEX IF EXISTS `users_phone_idx`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `phone`;--> statement-breakpoint
DELETE FROM `user_identities` WHERE `provider` = 'phone';--> statement-breakpoint
DROP TABLE `phone_verification_requests`;--> statement-breakpoint
CREATE TABLE `phone_verification_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`phone_hash` text NOT NULL,
	`requested_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `phone_verification_requests_phone_hash_idx` ON `phone_verification_requests` (`phone_hash`);--> statement-breakpoint
CREATE INDEX `phone_verification_requests_expires_at_idx` ON `phone_verification_requests` (`expires_at`);