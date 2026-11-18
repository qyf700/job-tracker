CREATE TABLE `material_settings` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`default_resume_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`default_resume_id`) REFERENCES `resume_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `profile_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`revision` integer NOT NULL,
	`label` text NOT NULL,
	`data_json` text NOT NULL,
	`source_resume_id` text,
	`change_kind` text NOT NULL,
	`restored_from_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_resume_id`) REFERENCES `resume_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_versions_owner_revision` ON `profile_versions` (`owner_id`,`revision`);--> statement-breakpoint
CREATE INDEX `profile_versions_owner_created` ON `profile_versions` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `resume_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`label` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`object_key` text NOT NULL,
	`upload_status` text DEFAULT 'uploading' NOT NULL,
	`upload_error` text DEFAULT '' NOT NULL,
	`extraction_status` text DEFAULT 'not_started' NOT NULL,
	`extraction_text` text DEFAULT '' NOT NULL,
	`extraction_error` text DEFAULT '' NOT NULL,
	`extraction_started_at` text,
	`page_count` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE INDEX `resume_assets_owner_created` ON `resume_assets` (`owner_id`,`created_at`);