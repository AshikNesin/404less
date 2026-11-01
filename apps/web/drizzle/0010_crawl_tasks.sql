CREATE TABLE `crawl_tasks` (
	`id` integer PRIMARY KEY NOT NULL,
	`website_id` text NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`depth` integer DEFAULT 0 NOT NULL,
	`source_url` text,
	`source_title` text,
	`anchor` text,
	`found_on_page` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_crawl_tasks_site_kind_url` ON `crawl_tasks` (`website_id`,`kind`,`url`);--> statement-breakpoint
CREATE INDEX `idx_crawl_tasks_site` ON `crawl_tasks` (`website_id`);--> statement-breakpoint
ALTER TABLE `websites` ADD `crawl_cursor` integer;--> statement-breakpoint
ALTER TABLE `websites` ADD `crawl_pages` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `websites` DROP COLUMN `title_job`;