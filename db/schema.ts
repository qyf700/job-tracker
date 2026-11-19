import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(),
  company: text("company").notNull(), title: text("title").notNull(),
  city: text("city").notNull().default(""), batch: text("batch").notNull().default(""),
  sourceUrl: text("source_url").notNull().default(""), jd: text("jd").notNull().default(""),
  status: text("status").notNull().default("saved"),
  nextAction: text("next_action").notNull().default(""), dueDate: text("due_date"),
  notes: text("notes").notNull().default(""), appliedAt: text("applied_at"),
  archivedAt: text("archived_at"), version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [index("applications_owner_created").on(t.ownerId,t.createdAt)]);


export const interviews = sqliteTable("interviews", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(),
  applicationId: text("application_id").notNull().references(() => applications.id),
  kind: text("kind").notNull().default("interview"), round: text("round").notNull(),
  startsAt: text("starts_at").notNull(), endsAt: text("ends_at").notNull(),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  state: text("state").notNull().default("scheduled"), outcome: text("outcome").notNull().default("pending"),
  format: text("format").notNull().default("online"), location: text("location").notNull().default(""),
  meetingUrl: text("meeting_url").notNull().default(""), interviewer: text("interviewer").notNull().default(""),
  preparation: text("preparation").notNull().default(""), questions: text("questions").notNull().default(""),
  review: text("review").notNull().default(""), version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
},t=>[index("interviews_owner_start").on(t.ownerId,t.startsAt),index("interviews_application").on(t.applicationId)]);

export const interviewHistory = sqliteTable("interview_history", {
  id:text("id").primaryKey(), ownerId:text("owner_id").notNull(),
  interviewId:text("interview_id").notNull().references(()=>interviews.id),
  action:text("action").notNull(), beforeJson:text("before_json"), afterJson:text("after_json").notNull(),
  createdAt:text("created_at").notNull(),
},t=>[index("history_interview").on(t.interviewId,t.createdAt)]);

export const profiles = sqliteTable("profiles", {
  ownerId:text("owner_id").primaryKey(), dataJson:text("data_json").notNull(),
  version:integer("version").notNull().default(1),updatedAt:text("updated_at").notNull(),
});


export const resumeAssets = sqliteTable("resume_assets", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(),
  label: text("label").notNull(), originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(), sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(), objectKey: text("object_key").notNull(),
  uploadStatus: text("upload_status").notNull().default("uploading"),
  uploadError: text("upload_error").notNull().default(""),
  extractionStatus: text("extraction_status").notNull().default("not_started"),
  extractionText: text("extraction_text").notNull().default(""),
  extractionError: text("extraction_error").notNull().default(""),
  extractionStartedAt: text("extraction_started_at"), pageCount: integer("page_count"),
  version: integer("version").notNull().default(1), createdAt: text("created_at").notNull(),
  archivedAt: text("archived_at"),
},t=>[index("resume_assets_owner_created").on(t.ownerId,t.createdAt)]);

export const materialSettings = sqliteTable("material_settings", {
  ownerId: text("owner_id").primaryKey(),
  defaultResumeId: text("default_resume_id").references(()=>resumeAssets.id),
  version: integer("version").notNull().default(1), updatedAt: text("updated_at").notNull(),
});

export const profileVersions = sqliteTable("profile_versions", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(),
  revision: integer("revision").notNull(), label: text("label").notNull(),
  dataJson: text("data_json").notNull(),
  sourceResumeId: text("source_resume_id").references(()=>resumeAssets.id),
  changeKind: text("change_kind").notNull(), restoredFromId: text("restored_from_id"),
  createdAt: text("created_at").notNull(),
},t=>[uniqueIndex("profile_versions_owner_revision").on(t.ownerId,t.revision),index("profile_versions_owner_created").on(t.ownerId,t.createdAt)]);

// Public recruiting catalogue; deliberately separate from user-owned materials.
export const companies = sqliteTable('companies', {
 id:text('id').primaryKey(),name:text('name').notNull(),officialCareersUrl:text('official_careers_url').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
});
export const companySources = sqliteTable('company_sources', {
 id:text('id').primaryKey(),companyId:text('company_id').notNull().references(()=>companies.id),adapterKey:text('adapter_key').notNull(),entryUrl:text('entry_url').notNull(),freshnessSeconds:integer('freshness_seconds').notNull().default(86400),
 lastSuccessAt:text('last_success_at'),lastErrorAt:text('last_error_at'),lastErrorCode:text('last_error_code'),lastErrorMessage:text('last_error_message'),lastRunId:text('last_run_id'),leaseRunId:text('lease_run_id'),leaseExpiresAt:text('lease_expires_at'),
});
export const recruitmentPrograms = sqliteTable('recruitment_programs', {
 id:text('id').primaryKey(),companyId:text('company_id').notNull().references(()=>companies.id),externalProgramId:text('external_program_id').notNull(),kind:text('kind').notNull(),recruitmentYear:integer('recruitment_year'),graduationYearsJson:text('graduation_years_json').notNull().default('[]'),evidenceUrl:text('evidence_url').notNull(),evidenceText:text('evidence_text').notNull(),verifiedAt:text('verified_at').notNull(),
},t=>[uniqueIndex('programs_company_external').on(t.companyId,t.externalProgramId)]);
export const jobs = sqliteTable('jobs', {
 id:text('id').primaryKey(),sourceId:text('source_id').notNull().references(()=>companySources.id),externalJobId:text('external_job_id').notNull(),companyId:text('company_id').notNull().references(()=>companies.id),programId:text('program_id').references(()=>recruitmentPrograms.id),
 title:text('title').notNull(),department:text('department').notNull(),locationsJson:text('locations_json').notNull(),employmentType:text('employment_type').notNull(),programKind:text('program_kind').notNull(),graduationYear:integer('graduation_year'),graduationLabel:text('graduation_label').notNull(),sourceCategory:text('source_category').notNull(),
 jdText:text('jd_text').notNull(),originalUrl:text('original_url').notNull(),applyUrl:text('apply_url').notNull(),deadlineAt:text('deadline_at'),publishedAt:text('published_at'),availability:text('availability').notNull(),evidenceJson:text('evidence_json').notNull(),contentHash:text('content_hash').notNull(),firstSeenAt:text('first_seen_at').notNull(),lastSeenAt:text('last_seen_at').notNull(),lastVerifiedAt:text('last_verified_at').notNull(),closedAt:text('closed_at'),lastSeenRunId:text('last_seen_run_id').notNull(),reopenedAt:text('reopened_at'),
},t=>[uniqueIndex('jobs_source_external').on(t.sourceId,t.externalJobId),index('jobs_company_availability').on(t.companyId,t.availability)]);
export const catalogSyncRuns = sqliteTable('catalog_sync_runs', {
 id:text('id').primaryKey(),sourceId:text('source_id').notNull().references(()=>companySources.id),state:text('state').notNull(),startedAt:text('started_at').notNull(),finishedAt:text('finished_at'),reviewHash:text('review_hash'),seenCount:integer('seen_count').notNull().default(0),errorCode:text('error_code'),errorMessage:text('error_message'),
},t=>[index('catalog_runs_source_started').on(t.sourceId,t.startedAt)]);
export const catalogSavedJobs = sqliteTable('catalog_saved_jobs', {
 ownerId:text('owner_id').notNull(),jobId:text('job_id').notNull().references(()=>jobs.id),applicationId:text('application_id').notNull().references(()=>applications.id),savedAt:text('saved_at').notNull(),
},t=>[uniqueIndex('saved_jobs_owner_job').on(t.ownerId,t.jobId)]);

export const submissionPreparations=sqliteTable('submission_preparations',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),jobId:text('job_id').notNull().references(()=>jobs.id),resumeId:text('resume_id').references(()=>resumeAssets.id),profileVersionId:text('profile_version_id').references(()=>profileVersions.id),answersJson:text('answers_json').notNull().default('{}'),version:integer('version').notNull().default(1),state:text('state').notNull().default('draft'),lastSnapshotId:text('last_snapshot_id'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('preparations_owner_job').on(t.ownerId,t.jobId)]);
export const submissionPreviews=sqliteTable('submission_previews',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),preparationId:text('preparation_id').notNull().references(()=>submissionPreparations.id),preparationVersion:integer('preparation_version').notNull(),dataJson:text('data_json').notNull(),contentHash:text('content_hash').notNull(),expiresAt:text('expires_at').notNull(),createdAt:text('created_at').notNull(),
});
export const materialSnapshots=sqliteTable('material_snapshots',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),preparationId:text('preparation_id').notNull().references(()=>submissionPreparations.id),dataJson:text('data_json').notNull(),contentHash:text('content_hash').notNull(),confirmedAt:text('confirmed_at').notNull(),
});
export const submissionTasks=sqliteTable('submission_tasks',{
 id:text('id').primaryKey(),snapshotId:text('snapshot_id').notNull().references(()=>materialSnapshots.id),ownerId:text('owner_id').notNull(),preparationId:text('preparation_id').notNull().references(()=>submissionPreparations.id),applicationId:text('application_id').notNull().references(()=>applications.id),state:text('state').notNull().default('needs_connector'),activeLeaseId:text('active_lease_id'),version:integer('version').notNull().default(1),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('task_snapshot').on(t.snapshotId),index('tasks_owner_created').on(t.ownerId,t.createdAt)]);
export const submissionEvents=sqliteTable('submission_events',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),taskId:text('task_id').notNull().references(()=>submissionTasks.id),action:text('action').notNull(),createdAt:text('created_at').notNull(),
});

export const browserPairings=sqliteTable('browser_pairings',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),codeHash:text('code_hash').notNull(),state:text('state').notNull().default('pending'),version:integer('version').notNull().default(1),deviceId:text('device_id'),deviceName:text('device_name'),deviceTokenHash:text('device_token_hash'),expiresAt:text('expires_at').notNull(),createdAt:text('created_at').notNull(),
});
export const browserDevices=sqliteTable('browser_devices',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),name:text('name').notNull(),tokenHash:text('token_hash').notNull(),version:integer('version').notNull().default(1),currentLeaseId:text('current_lease_id'),approvedAt:text('approved_at').notNull(),expiresAt:text('expires_at').notNull(),lastSeenAt:text('last_seen_at'),revokedAt:text('revoked_at'),
},t=>[index('browser_devices_owner').on(t.ownerId)]);
export const browserLeases=sqliteTable('browser_leases',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),deviceId:text('device_id').notNull().references(()=>browserDevices.id),taskId:text('task_id').notNull().references(()=>submissionTasks.id),tokenHash:text('token_hash').notNull(),startedAt:text('started_at').notNull(),expiresAt:text('expires_at').notNull(),endedAt:text('ended_at'),endReason:text('end_reason'),
},t=>[index('browser_leases_task').on(t.taskId)]);
export const browserEvents=sqliteTable('browser_events',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),deviceId:text('device_id').notNull().references(()=>browserDevices.id),taskId:text('task_id').notNull().references(()=>submissionTasks.id),leaseId:text('lease_id').notNull().references(()=>browserLeases.id),type:text('type').notNull(),requestHash:text('request_hash').notNull(),createdAt:text('created_at').notNull(),
});

export const browserActions=sqliteTable('browser_actions',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),deviceId:text('device_id').notNull().references(()=>browserDevices.id),leaseId:text('lease_id').notNull().references(()=>browserLeases.id),taskId:text('task_id').notNull().references(()=>submissionTasks.id),snapshotId:text('snapshot_id').notNull().references(()=>materialSnapshots.id),kind:text('kind').notNull(),state:text('state').notNull().default('started'),resultHash:text('result_hash'),createdAt:text('created_at').notNull(),finishedAt:text('finished_at'),
},t=>[uniqueIndex('browser_actions_task_kind').on(t.taskId,t.kind)]);

export const catalogPreferences = sqliteTable('catalog_preferences', {
  ownerId: text('owner_id').primaryKey(),
  sourceIdsJson: text('source_ids_json').notNull().default('[]'),
  intervalHours: integer('interval_hours').notNull().default(6),
  activeFilterId: text('active_filter_id'),
});

export const catalogFilters = sqliteTable('catalog_filters', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  filterJson: text('filter_json').notNull(),
  viewedThrough: text('viewed_through').notNull(),
  subscribedAt: text('subscribed_at'),
  revision: integer('revision').notNull().default(1),
}, table => [index('catalog_filters_owner').on(table.ownerId)]);

export const notificationReads = sqliteTable('notification_reads', {
  ownerId: text('owner_id').notNull(),
  eventId: text('event_id').notNull(),
}, table => [uniqueIndex('notification_reads_owner_event').on(table.ownerId, table.eventId)]);

export const notificationPreferences = sqliteTable('notification_preferences', {
  ownerId: text('owner_id').primaryKey(),
  mutedKindsJson: text('muted_kinds_json').notNull().default('[]'),
});
