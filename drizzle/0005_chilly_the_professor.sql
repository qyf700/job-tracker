CREATE TABLE `browser_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`current_lease_id` text,
	`approved_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE INDEX `browser_devices_owner` ON `browser_devices` (`owner_id`);--> statement-breakpoint
CREATE TABLE `browser_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`task_id` text NOT NULL,
	`lease_id` text NOT NULL,
	`type` text NOT NULL,
	`request_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `browser_devices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `submission_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lease_id`) REFERENCES `browser_leases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `browser_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`task_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`started_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`ended_at` text,
	`end_reason` text,
	FOREIGN KEY (`device_id`) REFERENCES `browser_devices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `submission_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `browser_leases_task` ON `browser_leases` (`task_id`);--> statement-breakpoint
CREATE TABLE `browser_pairings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`device_id` text,
	`device_name` text,
	`device_token_hash` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `submission_tasks` ADD `active_lease_id` text;--> statement-breakpoint
CREATE TRIGGER browser_events_no_update BEFORE UPDATE ON browser_events BEGIN SELECT RAISE(ABORT,'browser events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER browser_events_no_delete BEFORE DELETE ON browser_events BEGIN SELECT RAISE(ABORT,'browser events are immutable'); END;
