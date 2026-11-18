CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`company` text NOT NULL,
	`title` text NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`batch` text DEFAULT '' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`jd` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'saved' NOT NULL,
	`next_action` text DEFAULT '' NOT NULL,
	`due_date` text,
	`notes` text DEFAULT '' NOT NULL,
	`applied_at` text,
	`archived_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `applications_owner_created` ON `applications` (`owner_id`,`created_at`);