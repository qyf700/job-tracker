import {and, desc, eq, gt, inArray, isNull, lte, ne, sql} from 'drizzle-orm';
import {getDb} from '../db';
import {applications, catalogSavedJobs, interviews, jobs, companies, notificationReads, notificationPreferences} from '../db/schema';
import {readCatalogPreferences} from './catalog/preferences';
import {jobConditions} from './catalog/service';
import {shanghaiDate} from './tracker';

const day = 86_400_000;
const limit = 50;
const activeStatuses = ['saved', 'applied', 'in_progress'];

export type NotificationKind = 'job' | 'deadline' | 'follow_up' | 'interview';
export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  company: string;
  at: string;
  applicationId?: string;
  jobId?: string;
  filters?: string[];
  action?: string;
  read?: boolean;
};

export async function readNotificationPreferences(ownerId: string): Promise<NotificationKind[]> {
  const row = await getDb().select().from(notificationPreferences)
    .where(eq(notificationPreferences.ownerId, ownerId)).get();
  return row ? JSON.parse(row.mutedKindsJson) : [];
}

export async function writeNotificationPreferences(ownerId: string, mutedKinds: NotificationKind[]) {
  const mutedKindsJson = JSON.stringify(mutedKinds);
  await getDb().insert(notificationPreferences).values({ownerId, mutedKindsJson})
    .onConflictDoUpdate({target: notificationPreferences.ownerId, set: {mutedKindsJson}});
}

export async function listNotifications(ownerId: string, mutedKinds: NotificationKind[], now = new Date()) {
  const db = getDb();
  const observedAt = now.toISOString();
  const after = (days: number) => new Date(now.getTime() + day * days).toISOString();
  const today = shanghaiDate(now);
  const applicationOwner = and(eq(applications.ownerId, ownerId), isNull(applications.archivedAt));
  const occurrence = sql<string>`max(${jobs.firstSeenAt}, coalesce(${jobs.reopenedAt}, ${jobs.firstSeenAt}))`;
  const {savedFilters} = mutedKinds.includes('job') ? {savedFilters: []} : await readCatalogPreferences(ownerId);
  const [matches, deadlines, followUps, upcoming] = await Promise.all([
    Promise.all(savedFilters.flatMap(filter => filter.subscribedAt ? [
      db.select({id: jobs.id, title: jobs.title, company: companies.name, at: occurrence})
        .from(jobs).innerJoin(companies, eq(companies.id, jobs.companyId))
        .where(and(eq(jobs.availability, 'accepting'), gt(jobs.lastVerifiedAt, after(-1)),
          gt(occurrence, filter.subscribedAt > after(-7) ? filter.subscribedAt : after(-7)),
          lte(occurrence, observedAt), ...jobConditions(filter.filters, after(-1))))
        .orderBy(desc(occurrence), jobs.id).limit(limit).then(rows => ({rows, name: filter.name})),
    ] : [])),
    mutedKinds.includes('deadline') ? [] : db.select({id: applications.id, title: applications.title, company: applications.company, at: jobs.deadlineAt})
      .from(applications).innerJoin(catalogSavedJobs, and(eq(catalogSavedJobs.applicationId, applications.id),
        eq(catalogSavedJobs.ownerId, ownerId))).innerJoin(jobs, eq(jobs.id, catalogSavedJobs.jobId))
      .where(and(applicationOwner, eq(applications.status, 'saved'), isNull(applications.appliedAt),
        eq(jobs.availability, 'accepting'), gt(jobs.deadlineAt, observedAt), lte(jobs.deadlineAt, after(2))))
      .orderBy(jobs.deadlineAt, applications.id).limit(limit),
    mutedKinds.includes('follow_up') ? [] : db.select({id: applications.id, title: applications.title, company: applications.company,
      at: applications.dueDate, action: applications.nextAction}).from(applications)
      .where(and(applicationOwner, inArray(applications.status, activeStatuses),
        ne(applications.nextAction, ''), lte(applications.dueDate, today)))
      .orderBy(applications.dueDate, applications.id).limit(limit),
    mutedKinds.includes('interview') ? [] : db.select({id: interviews.id, title: interviews.round, company: applications.company,
      at: interviews.startsAt, applicationId: applications.id, action: applications.title})
      .from(interviews).innerJoin(applications, eq(interviews.applicationId, applications.id))
      .where(and(applicationOwner, eq(interviews.ownerId, ownerId), eq(interviews.state, 'scheduled'),
        inArray(applications.status, activeStatuses), gt(interviews.startsAt, observedAt), lte(interviews.startsAt, after(1))))
      .orderBy(interviews.startsAt, interviews.id).limit(limit),
  ]);

  const jobItems = new Map<string, NotificationItem>();
  for (const {rows, name} of matches) {
    for (const row of rows) {
      const id = JSON.stringify(['job', row.id, row.at]);
      const existing = jobItems.get(id);
      if (existing) existing.filters!.push(name);
      else jobItems.set(id, {...row, id, jobId: row.id, kind: 'job', filters: [name]});
    }
  }
  const reminders: NotificationItem[] = [
    ...deadlines.flatMap(row => row.at ? [{...row, id: JSON.stringify(['deadline', row.id, row.at]),
      kind: 'deadline' as const, applicationId: row.id, at: row.at}] : []),
    ...followUps.flatMap(row => row.at ? [{...row, id: JSON.stringify(['follow_up', row.id, row.at, row.action]),
      kind: 'follow_up' as const, applicationId: row.id, at: row.at}] : []),
    ...upcoming.map(row => ({...row, id: JSON.stringify(['interview', row.id, row.at]), kind: 'interview' as const})),
  ];
  reminders.sort((a,b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const newJobs = [...jobItems.values()].sort((a,b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  const items = [...reminders.slice(0, limit), ...newJobs.slice(0, limit)];
  const ids = JSON.stringify(items.map(item => item.id));
  const reads = new Set((await db.select({id: notificationReads.eventId}).from(notificationReads)
    .where(and(eq(notificationReads.ownerId, ownerId),
      sql`${notificationReads.eventId} in (select value from json_each(${ids}))`))).map(row => row.id));
  return items.map(item => ({...item, read: reads.has(item.id)}));
}

export async function markNotificationRead(ownerId: string, eventId: string) {
  await getDb().insert(notificationReads).values({ownerId, eventId}).onConflictDoNothing();
}
