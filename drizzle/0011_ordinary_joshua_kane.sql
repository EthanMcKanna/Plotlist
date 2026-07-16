ALTER TABLE `comments` ADD `parent_id` text REFERENCES comments(id);--> statement-breakpoint
CREATE INDEX `comments_parent_idx` ON `comments` (`parent_id`);