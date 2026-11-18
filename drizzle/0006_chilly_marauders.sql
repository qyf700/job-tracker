CREATE TABLE `browser_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`lease_id` text NOT NULL,
	`task_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`kind` text NOT NULL,
	`state` text DEFAULT 'started' NOT NULL,
	`result_hash` text,
	`created_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`device_id`) REFERENCES `browser_devices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lease_id`) REFERENCES `browser_leases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `submission_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`snapshot_id`) REFERENCES `material_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `browser_actions_task_kind` ON `browser_actions` (`task_id`,`kind`);--> statement-breakpoint
CREATE TRIGGER browser_actions_protect_update BEFORE UPDATE ON browser_actions
WHEN OLD.id<>NEW.id OR OLD.owner_id<>NEW.owner_id OR OLD.device_id<>NEW.device_id OR OLD.lease_id<>NEW.lease_id OR OLD.task_id<>NEW.task_id OR OLD.snapshot_id<>NEW.snapshot_id OR OLD.kind<>NEW.kind OR OLD.created_at<>NEW.created_at OR OLD.state<>'started' OR NEW.state NOT IN ('fill_observed','upload_dispatched','uncertain') OR NEW.result_hash IS NULL OR NEW.finished_at IS NULL
BEGIN SELECT RAISE(ABORT, 'immutable browser action'); END;
--> statement-breakpoint
CREATE TRIGGER browser_actions_no_delete BEFORE DELETE ON browser_actions BEGIN SELECT RAISE(ABORT, 'immutable browser action'); END;
