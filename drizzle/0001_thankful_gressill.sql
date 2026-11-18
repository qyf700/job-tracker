CREATE TABLE `interview_history` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`interview_id` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`interview_id`) REFERENCES `interviews`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `history_interview` ON `interview_history` (`interview_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `interviews` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`application_id` text NOT NULL,
	`kind` text DEFAULT 'interview' NOT NULL,
	`round` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Shanghai' NOT NULL,
	`state` text DEFAULT 'scheduled' NOT NULL,
	`outcome` text DEFAULT 'pending' NOT NULL,
	`format` text DEFAULT 'online' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`meeting_url` text DEFAULT '' NOT NULL,
	`interviewer` text DEFAULT '' NOT NULL,
	`preparation` text DEFAULT '' NOT NULL,
	`questions` text DEFAULT '' NOT NULL,
	`review` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `interviews_owner_start` ON `interviews` (`owner_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `interviews_application` ON `interviews` (`application_id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`data_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
