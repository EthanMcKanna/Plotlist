DROP INDEX `shows_search_text_idx`;--> statement-breakpoint
ALTER TABLE `show_ingest_state` ADD `content_hash` text;--> statement-breakpoint
ALTER TABLE `show_ingest_state` ADD `changes_seen_at` integer;--> statement-breakpoint
DROP TRIGGER IF EXISTS `shows_fts_after_update`;--> statement-breakpoint
CREATE TRIGGER `shows_fts_after_update` AFTER UPDATE OF `title`, `original_title`, `search_text` ON `shows` BEGIN
	INSERT INTO shows_fts(shows_fts, rowid, title, original_title, search_text)
	VALUES ('delete', old.rowid, old.title, old.original_title, old.search_text);
	INSERT INTO shows_fts(rowid, title, original_title, search_text)
	VALUES (new.rowid, new.title, new.original_title, new.search_text);
END;
