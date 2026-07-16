-- Split the legacy "completed" watch status into "finished" (show ended or
-- canceled) vs "caught_up" (returning series the user had watched through).
-- The enum lives in TypeScript only, so this is a data migration. Shows with
-- no cached TMDB details default to "finished" — that's what "Completed"
-- meant to the user who picked it — and read-time reconciliation corrects
-- any returning series once details load.
UPDATE `watch_states`
SET `status` = CASE
  WHEN EXISTS (
    SELECT 1
    FROM `shows` s
    JOIN `tmdb_details_cache` c
      ON c.`external_source` = s.`external_source`
     AND c.`external_id` = s.`external_id`
    WHERE s.`id` = `watch_states`.`show_id`
      AND lower(trim(coalesce(json_extract(c.`payload`, '$.status'), ''))) NOT IN ('ended', 'canceled', 'cancelled')
  ) THEN 'caught_up'
  ELSE 'finished'
END
WHERE `status` = 'completed';
