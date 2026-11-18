CREATE TABLE `catalog_saved_jobs` (
	`owner_id` text NOT NULL,
	`job_id` text NOT NULL,
	`application_id` text NOT NULL,
	`saved_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_jobs_owner_job` ON `catalog_saved_jobs` (`owner_id`,`job_id`);--> statement-breakpoint
CREATE TABLE `catalog_sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`state` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`seen_count` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`error_message` text,
	FOREIGN KEY (`source_id`) REFERENCES `company_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `catalog_runs_source_started` ON `catalog_sync_runs` (`source_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`official_careers_url` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `company_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`adapter_key` text NOT NULL,
	`entry_url` text NOT NULL,
	`freshness_seconds` integer DEFAULT 86400 NOT NULL,
	`last_success_at` text,
	`last_error_at` text,
	`last_error_code` text,
	`last_error_message` text,
	`last_run_id` text,
	`lease_run_id` text,
	`lease_expires_at` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_job_id` text NOT NULL,
	`company_id` text NOT NULL,
	`program_id` text,
	`title` text NOT NULL,
	`department` text NOT NULL,
	`locations_json` text NOT NULL,
	`employment_type` text NOT NULL,
	`program_kind` text NOT NULL,
	`graduation_year` integer,
	`graduation_label` text NOT NULL,
	`source_category` text NOT NULL,
	`jd_text` text NOT NULL,
	`original_url` text NOT NULL,
	`apply_url` text NOT NULL,
	`deadline_at` text,
	`published_at` text,
	`availability` text NOT NULL,
	`evidence_json` text NOT NULL,
	`content_hash` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`last_verified_at` text NOT NULL,
	`closed_at` text,
	`last_seen_run_id` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `company_sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`program_id`) REFERENCES `recruitment_programs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_source_external` ON `jobs` (`source_id`,`external_job_id`);--> statement-breakpoint
CREATE INDEX `jobs_company_availability` ON `jobs` (`company_id`,`availability`);--> statement-breakpoint
CREATE TABLE `recruitment_programs` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`external_program_id` text NOT NULL,
	`kind` text NOT NULL,
	`recruitment_year` integer,
	`graduation_years_json` text DEFAULT '[]' NOT NULL,
	`evidence_url` text NOT NULL,
	`evidence_text` text NOT NULL,
	`verified_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `programs_company_external` ON `recruitment_programs` (`company_id`,`external_program_id`);