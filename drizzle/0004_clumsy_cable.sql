CREATE TABLE `material_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`preparation_id` text NOT NULL,
	`data_json` text NOT NULL,
	`content_hash` text NOT NULL,
	`confirmed_at` text NOT NULL,
	FOREIGN KEY (`preparation_id`) REFERENCES `submission_preparations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `submission_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`task_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `submission_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `submission_preparations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`job_id` text NOT NULL,
	`resume_id` text,
	`profile_version_id` text,
	`answers_json` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`last_snapshot_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resume_id`) REFERENCES `resume_assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`profile_version_id`) REFERENCES `profile_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preparations_owner_job` ON `submission_preparations` (`owner_id`,`job_id`);--> statement-breakpoint
CREATE TABLE `submission_previews` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`preparation_id` text NOT NULL,
	`preparation_version` integer NOT NULL,
	`data_json` text NOT NULL,
	`content_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`preparation_id`) REFERENCES `submission_preparations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `submission_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`preparation_id` text NOT NULL,
	`application_id` text NOT NULL,
	`state` text DEFAULT 'needs_connector' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `material_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`preparation_id`) REFERENCES `submission_preparations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_snapshot` ON `submission_tasks` (`snapshot_id`);--> statement-breakpoint
CREATE INDEX `tasks_owner_created` ON `submission_tasks` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER material_snapshots_no_update BEFORE UPDATE ON material_snapshots BEGIN SELECT RAISE(ABORT,'material snapshots are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER material_snapshots_no_delete BEFORE DELETE ON material_snapshots BEGIN SELECT RAISE(ABORT,'material snapshots are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER submission_events_no_update BEFORE UPDATE ON submission_events BEGIN SELECT RAISE(ABORT,'submission events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER submission_events_no_delete BEFORE DELETE ON submission_events BEGIN SELECT RAISE(ABORT,'submission events are immutable'); END;
