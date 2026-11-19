CREATE TABLE `notification_preferences` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`muted_kinds_json` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_reads` (
	`owner_id` text NOT NULL,
	`event_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_reads_owner_event` ON `notification_reads` (`owner_id`,`event_id`);--> statement-breakpoint
ALTER TABLE `catalog_filters` ADD `subscribed_at` text;--> statement-breakpoint
ALTER TABLE `catalog_sync_runs` ADD `review_hash` text;