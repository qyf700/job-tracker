CREATE TABLE `catalog_filters` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`filter_json` text NOT NULL,
	`viewed_through` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `catalog_filters_owner` ON `catalog_filters` (`owner_id`);--> statement-breakpoint
ALTER TABLE `catalog_preferences` ADD `active_filter_id` text;--> statement-breakpoint
INSERT INTO catalog_filters (id, owner_id, name, filter_json, viewed_through)
SELECT filter_id, owner_id, '原有筛选', filter_json, viewed_through
FROM catalog_preferences
WHERE filter_id IS NOT NULL AND filter_json IS NOT NULL AND viewed_through IS NOT NULL;
--> statement-breakpoint
UPDATE catalog_preferences
SET active_filter_id = filter_id
WHERE filter_id IS NOT NULL AND filter_json IS NOT NULL AND viewed_through IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `catalog_preferences` DROP COLUMN `filter_json`;--> statement-breakpoint
ALTER TABLE `catalog_preferences` DROP COLUMN `filter_id`;--> statement-breakpoint
ALTER TABLE `catalog_preferences` DROP COLUMN `viewed_through`;