CREATE TABLE `ingest_sync_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `show_ingest_state` (
	`id` text PRIMARY KEY NOT NULL,
	`tmdb_id` integer NOT NULL,
	`popularity` real,
	`status` text NOT NULL,
	`next_refresh_at` integer NOT NULL,
	`last_ingested_at` integer,
	`fail_count` integer NOT NULL,
	`last_error` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `show_ingest_state_tmdb_idx` ON `show_ingest_state` (`tmdb_id`);--> statement-breakpoint
CREATE INDEX `show_ingest_state_due_idx` ON `show_ingest_state` (`next_refresh_at`);--> statement-breakpoint
CREATE INDEX `show_ingest_state_status_popularity_idx` ON `show_ingest_state` (`status`,`popularity`);--> statement-breakpoint
CREATE VIRTUAL TABLE `shows_fts` USING fts5(
	`title`,
	`original_title`,
	`search_text`,
	content='shows',
	content_rowid='rowid',
	tokenize='unicode61 remove_diacritics 2'
);--> statement-breakpoint
CREATE TRIGGER `shows_fts_after_insert` AFTER INSERT ON `shows` BEGIN
	INSERT INTO shows_fts(rowid, title, original_title, search_text)
	VALUES (new.rowid, new.title, new.original_title, new.search_text);
END;--> statement-breakpoint
CREATE TRIGGER `shows_fts_after_delete` AFTER DELETE ON `shows` BEGIN
	INSERT INTO shows_fts(shows_fts, rowid, title, original_title, search_text)
	VALUES ('delete', old.rowid, old.title, old.original_title, old.search_text);
END;--> statement-breakpoint
CREATE TRIGGER `shows_fts_after_update` AFTER UPDATE ON `shows` BEGIN
	INSERT INTO shows_fts(shows_fts, rowid, title, original_title, search_text)
	VALUES ('delete', old.rowid, old.title, old.original_title, old.search_text);
	INSERT INTO shows_fts(rowid, title, original_title, search_text)
	VALUES (new.rowid, new.title, new.original_title, new.search_text);
END;--> statement-breakpoint
INSERT INTO shows_fts(rowid, title, original_title, search_text)
SELECT rowid, title, original_title, search_text FROM shows;
