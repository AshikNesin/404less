ALTER TABLE `broken_links` ADD `anchor` text;--> statement-breakpoint
ALTER TABLE `broken_links` ADD `found_on` text;--> statement-breakpoint
ALTER TABLE `broken_links` ADD `found_on_title` text;--> statement-breakpoint
-- Backfill from the latest crawl's sources, preferring one with anchor text.
UPDATE `broken_links` SET
  `found_on` = (SELECT `source_url` FROM `crawl_sources` s WHERE s.`website_id` = `broken_links`.`website_id` AND s.`target_url` = `broken_links`.`url` ORDER BY s.`anchor` IS NULL LIMIT 1),
  `found_on_title` = (SELECT `source_title` FROM `crawl_sources` s WHERE s.`website_id` = `broken_links`.`website_id` AND s.`target_url` = `broken_links`.`url` ORDER BY s.`anchor` IS NULL LIMIT 1),
  `anchor` = (SELECT `anchor` FROM `crawl_sources` s WHERE s.`website_id` = `broken_links`.`website_id` AND s.`target_url` = `broken_links`.`url` ORDER BY s.`anchor` IS NULL LIMIT 1)
WHERE EXISTS (SELECT 1 FROM `crawl_sources` s WHERE s.`website_id` = `broken_links`.`website_id` AND s.`target_url` = `broken_links`.`url`);
