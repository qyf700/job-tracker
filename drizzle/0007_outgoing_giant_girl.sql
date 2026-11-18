CREATE TABLE `catalog_preferences` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`source_ids_json` text DEFAULT '[]' NOT NULL,
	`interval_hours` integer DEFAULT 6 NOT NULL,
	`filter_json` text,
	`filter_id` text,
	`viewed_through` text
);
