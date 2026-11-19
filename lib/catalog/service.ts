import {env} from 'cloudflare:workers';
import {and,asc,desc,eq,gt,inArray,isNull,lt,lte,ne,or,sql} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from '../../db';
import {companies,companySources,jobs,catalogSyncRuns,catalogSavedJobs,applications} from '../../db/schema';
import {sha256} from '../m1/files';
import {CatalogError,mokaSources,readZhihuJobs} from './moka';
import {guardedJobUpsert} from './queries.mjs';
import {filterSchema, sameFilters, type CatalogFilters} from './filters';
import {readCatalogPreferences, readCatalogSettings} from './preferences';
import {nextSourceSync} from './schedule';

export function canScheduleCatalog(userId: string) {
 return env.LOCAL_CATALOG === '1' && userId === 'local_seedy';
}

export function isCatalogAdmin(userId:string){
 return canScheduleCatalog(userId) || (!!env.CATALOG_ADMIN_USER_ID && env.CATALOG_ADMIN_USER_ID === userId);
}
export function catalogFailure(error:unknown){
 if(error instanceof CatalogError)return Response.json({error:error.message,code:error.code},{status:error.status,headers:{'Cache-Control':'no-store'}});
 return Response.json({error:'目录服务暂时不可用，已保存的岗位不会被清空',code:'catalog_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
}
async function ensureSource(source:typeof mokaSources[number]){
 const db=getDb(),now=new Date().toISOString();
 await db.batch([db.insert(companies).values({id:source.orgId,name:source.companyName,officialCareersUrl:source.entryUrl,createdAt:now,updatedAt:now}).onConflictDoNothing(),db.insert(companySources).values({id:source.id,companyId:source.orgId,adapterKey:'moka-public-v1',entryUrl:source.entryUrl}).onConflictDoNothing()]);
}
function effectiveAvailability(row:typeof jobs.$inferSelect,freshnessSeconds=86400){return row.availability!=='closed'&&Date.now()-Date.parse(row.lastVerifiedAt)>freshnessSeconds*1000?'stale':row.availability;}
export function publicJob(row:typeof jobs.$inferSelect,detail=false,freshnessSeconds=86400){
 const {locationsJson,evidenceJson,jdText,contentHash,lastSeenRunId,...value}=row;
 return {...value,companyName:mokaSources.find(source=>source.orgId===row.companyId)?.companyName??row.companyId,locations:JSON.parse(locationsJson) as string[],availability:effectiveAvailability(row,freshnessSeconds),...(detail?{jdText,evidence:JSON.parse(evidenceJson),contentHash}:{})};
}
export async function sourceSummary(userId:string){
 const db = getDb();
 const [rows, runs, preferences] = await Promise.all([
  db.select().from(companySources),
  db.select().from(catalogSyncRuns).orderBy(desc(catalogSyncRuns.startedAt)).limit(10),
  readCatalogPreferences(userId),
 ]);
 const latestIds = rows.flatMap(row => [row.leaseRunId, row.lastRunId].filter((id): id is string => !!id));
 const latest = latestIds.length ? await db.select().from(catalogSyncRuns).where(inArray(catalogSyncRuns.id, latestIds)) : [];
 const canSchedule = canScheduleCatalog(userId);
 const now = Date.now();
 const sources = mokaSources.map(source => {
  const row = rows.find(item => item.id === source.id);
  const selected = canSchedule && preferences.sourceIds.includes(source.id);
  const next = selected ? nextSourceSync(row, preferences.intervalHours, now) : null;
  const running = !!row?.leaseRunId && !!row.leaseExpiresAt && Date.parse(row.leaseExpiresAt) > now;
  const lastRun = latest.find(run => run.id === row?.lastRunId);
  const runningRun = running ? latest.find(run => run.id === row?.leaseRunId) : undefined;
  return {
   id: source.id, companyId: source.orgId, companyName: source.companyName, entryUrl: source.entryUrl,
   freshnessSeconds: row?.freshnessSeconds ?? 86400, state: row?.lastSuccessAt ? 'available' : 'not_synced',
   lastSuccessAt: row?.lastSuccessAt ?? null, lastErrorAt: row?.lastErrorAt ?? null,
   lastErrorMessage: row?.lastErrorMessage ?? null, lastErrorCode: row?.lastErrorCode ?? null,
   lastRunId: row?.lastRunId ?? null, leaseExpiresAt: row?.leaseExpiresAt ?? null, adapterKey: row?.adapterKey,
   running, selected,
   nextUpdateAt: next === null ? null : new Date(next).toISOString(), due: next !== null && next <= now,
   latestRun: runningRun ?? lastRun ?? null,
  };
 });
 return {canSync: isCatalogAdmin(userId), canSchedule, preferences, sources, runs};
}
export async function syncSource(userId:string,id:string){
 if(!isCatalogAdmin(userId))throw new CatalogError('forbidden','只有目录管理员可以触发同步',403);
 const source=mokaSources.find(candidate=>candidate.id===id);
 if(!source)throw new CatalogError('source_not_found','来源不存在',404);
 await ensureSource(source);const db=getDb(),runId=crypto.randomUUID(),startedAt=new Date().toISOString();
 const lease=await db.update(companySources).set({leaseRunId:runId,leaseExpiresAt:new Date(Date.now()+120000).toISOString()}).where(and(eq(companySources.id,id),or(isNull(companySources.leaseRunId),lt(companySources.leaseExpiresAt,startedAt)))).returning();
 if(!lease.length)throw new CatalogError('sync_running','此来源正在同步，请稍后刷新',409);
 // A successful run has a cooldown; failures remain explicitly retryable.
 if(lease[0].lastSuccessAt&&Date.now()-Date.parse(lease[0].lastSuccessAt)<60000){await db.update(companySources).set({leaseRunId:null,leaseExpiresAt:null}).where(and(eq(companySources.id,id),eq(companySources.leaseRunId,runId)));throw new CatalogError('sync_cooldown','刚刚同步成功，请一分钟后再同步',429);}
 await db.insert(catalogSyncRuns).values({id:runId,sourceId:id,state:'running',startedAt});
 try{
  const normalized=await readZhihuJobs(fetch,source),finishedAt=new Date().toISOString();
  const rows=await Promise.all(normalized.map(async job=>({
   id:`${source.id}:${job.externalJobId}`,sourceId:id,externalJobId:job.externalJobId,companyId:source.orgId,programId:null,
   title:job.title,department:job.department,locationsJson:JSON.stringify(job.locations),employmentType:job.employmentType,programKind:job.programKind,graduationYear:job.graduationYear,graduationLabel:job.graduationLabel,sourceCategory:job.sourceCategory,
   jdText:job.jdText,originalUrl:job.originalUrl,applyUrl:job.applyUrl,deadlineAt:job.deadlineAt,publishedAt:job.publishedAt,availability:job.availability,evidenceJson:JSON.stringify({...job.evidence,checkedAt:finishedAt}),contentHash:await sha256(new TextEncoder().encode(JSON.stringify(job))),firstSeenAt:finishedAt,lastSeenAt:finishedAt,lastVerifiedAt:finishedAt,closedAt:job.availability==='closed'?finishedAt:null,lastSeenRunId:runId,
  })));
  const guard=sql`EXISTS (SELECT 1 FROM company_sources WHERE id=${id} AND lease_run_id=${runId})`;
  const result=await db.batch([
   db.update(jobs).set({availability:'closed',closedAt:finishedAt,lastVerifiedAt:finishedAt,evidenceJson:JSON.stringify({reason:'absent_from_complete_public_list',checkedAt:finishedAt,entryUrl:source.entryUrl})}).where(and(eq(jobs.sourceId,id),ne(jobs.lastSeenRunId,runId),ne(jobs.availability,'closed'),guard)),
   ...rows.map(row=>guardedJobUpsert(db,jobs,companySources,row,runId)),
   db.update(catalogSyncRuns).set({state:'succeeded',finishedAt,seenCount:rows.length}).where(and(eq(catalogSyncRuns.id,runId),guard)),
   db.update(companySources).set({lastSuccessAt:finishedAt,lastErrorAt:null,lastErrorCode:null,lastErrorMessage:null,lastRunId:runId,leaseRunId:null,leaseExpiresAt:null}).where(and(eq(companySources.id,id),eq(companySources.leaseRunId,runId))).returning(),
  ]);
  if(!(result[result.length-1] as unknown[]).length)throw new CatalogError('sync_lease_lost','同步租约失效，请刷新查看最新结果',409);
  return {id:runId,state:'succeeded',seenCount:rows.length,startedAt,finishedAt};
 }catch(error){
  const known=error instanceof CatalogError?error:new CatalogError(error instanceof z.ZodError||error instanceof SyntaxError?'source_shape_changed':'source_unavailable','公开岗位来源暂时无法完成核验，未覆盖上次成功目录');
  const finishedAt=new Date().toISOString();await db.batch([db.update(catalogSyncRuns).set({state:'failed',finishedAt,errorCode:known.code,errorMessage:known.message}).where(eq(catalogSyncRuns.id,runId)),db.update(companySources).set({lastErrorAt:finishedAt,lastErrorCode:known.code,lastErrorMessage:known.message,lastRunId:runId,leaseRunId:null,leaseExpiresAt:null}).where(and(eq(companySources.id,id),eq(companySources.leaseRunId,runId)))]);
  throw known;
 }
}
export async function syncDueSources(userId: string, initialOnly: boolean) {
 const preferences = await readCatalogSettings(userId);
 if (!initialOnly && !preferences.intervalHours) return [];

 const sources = await getDb().select().from(companySources);
 const now = Date.now();
 const results = [];
 for (const id of preferences.sourceIds) {
  const source = sources.find(item => item.id === id);
  const next = nextSourceSync(source, preferences.intervalHours, now, initialOnly);
  if (next === null || next > now) continue;
  try {
   results.push({sourceId: id, ...await syncSource(userId, id)});
  } catch (error) {
   if (error instanceof CatalogError && ['sync_running', 'sync_cooldown'].includes(error.code)) continue;
   results.push({sourceId: id, state: 'failed'});
  }
 }
 return results;
}

const querySchema = filterSchema.extend({
 limit: z.coerce.number().int().min(1).max(100).default(20),
 cursor: z.string().max(300).default(''),
 newOnly: z.enum(['0', '1']).default('0'),
 filterId: z.string().uuid().optional(),
});
function searchTerms(value: string) {
 return [...new Set(value.split(/[,，]/).map(term => term.trim()).filter(Boolean))];
}

function jobConditions(filters: CatalogFilters, threshold: string) {
 const clauses = [];
 const companyIds = searchTerms(filters.companyId);
 const keywords = searchTerms(filters.q);
 const cities = searchTerms(filters.city);
 if (companyIds.length) clauses.push(inArray(jobs.companyId, companyIds));
 if (filters.programKind) clauses.push(eq(jobs.programKind, filters.programKind));
 if (filters.employmentType) clauses.push(eq(jobs.employmentType, filters.employmentType));
 if (filters.graduationYear) clauses.push(eq(jobs.graduationYear, Number(filters.graduationYear)));
 if (keywords.length) clauses.push(sql`EXISTS (SELECT 1 FROM json_each(${JSON.stringify(keywords)}) AS term
  WHERE instr(lower(${jobs.title}), lower(term.value)) > 0 OR instr(lower(${jobs.jdText}), lower(term.value)) > 0)`);
 if (cities.length) clauses.push(sql`EXISTS (SELECT 1 FROM json_each(${jobs.locationsJson}) AS location
  JOIN json_each(${JSON.stringify(cities)}) AS city ON instr(location.value, city.value) > 0)`);
 if (filters.availability === 'stale') clauses.push(and(ne(jobs.availability,'closed'),lt(jobs.lastVerifiedAt,threshold)));
 else if (filters.availability) {
  clauses.push(eq(jobs.availability,filters.availability));
  if (filters.availability !== 'closed') clauses.push(sql`${jobs.lastVerifiedAt} >= ${threshold}`);
 }
 return clauses;
}

export async function listJobs(params:URLSearchParams,ownerId:string){
 const parsed = querySchema.safeParse(Object.fromEntries(params));
 if (!parsed.success) throw new CatalogError('invalid_filters','筛选参数无效',422);
 const p = parsed.data, db = getDb();
 const observedAt = new Date().toISOString();
 const threshold = new Date(Date.parse(observedAt) - 86400000).toISOString();
 const sourceHealth = await sourceSummary(ownerId);
 const {savedFilters, activeFilterId} = sourceHealth.preferences;
 const selected = savedFilters.find(filter => filter.id === (p.filterId ?? activeFilterId));
 const activeFilter = selected && sameFilters(selected.filters, p) ? selected : null;
 if (p.newOnly === '1' && !activeFilter) throw new CatalogError('filter_changed', '请重新载入已保存筛选', 409);
 const clauses = jobConditions(p, threshold);
 const counts = await Promise.all(savedFilters.map(async filter => ({
  id: filter.id,
  newCount: await db.$count(jobs, and(...jobConditions(filter.filters, threshold),
   gt(jobs.firstSeenAt, filter.viewedThrough), lte(jobs.firstSeenAt, observedAt))),
 })));
 const newCount = counts.find(count => count.id === activeFilter?.id)?.newCount ?? 0;
 if (p.newOnly === '1' && activeFilter) {
  clauses.push(gt(jobs.firstSeenAt, activeFilter.viewedThrough), lte(jobs.firstSeenAt, observedAt));
 }
 if(p.cursor){let id;try{id=z.object({id:z.string().min(1).max(150)}).strict().parse(JSON.parse(atob(p.cursor))).id;}catch{throw new CatalogError('invalid_cursor','分页标识无效',422);}clauses.push(gt(jobs.id,id));}
 const rows=await db.select().from(jobs).where(and(...clauses)).orderBy(asc(jobs.id)).limit(p.limit+1),hasMore=rows.length>p.limit,items=rows.slice(0,p.limit);
 const saved=await db.select().from(catalogSavedJobs).where(eq(catalogSavedJobs.ownerId,ownerId));
 // Company totals are independent of pagination and search filters.
 const companyTotals = await db.select({
  companyId: companies.id,
  companyName: companies.name,
  open: sql<number>`sum(case when ${jobs.availability} = 'accepting' and ${jobs.lastVerifiedAt} >= ${threshold} then 1 else 0 end)`,
  stale: sql<number>`sum(case when ${jobs.availability} <> 'closed' and ${jobs.lastVerifiedAt} < ${threshold} then 1 else 0 end)`,
  lastVerifiedAt: sql<string | null>`max(${jobs.lastVerifiedAt})`,
 }).from(companies).leftJoin(jobs, eq(jobs.companyId, companies.id)).groupBy(companies.id, companies.name);
 return {companyTotals,newCount,filterCounts:counts,observedAt,items:items.map(row=>({...publicJob(row),isNew:!!activeFilter&&row.firstSeenAt>activeFilter.viewedThrough&&row.firstSeenAt<=observedAt,savedApplicationId:saved.find(s=>s.jobId===row.id)?.applicationId||null})),nextCursor:hasMore?btoa(JSON.stringify({id:items[items.length-1].id})):null,sourceHealth};
}
export async function jobDetail(id:string,ownerId:string){const db=getDb(),row=(await db.select().from(jobs).where(eq(jobs.id,id)))[0];if(!row)throw new CatalogError('job_not_found','岗位不存在',404);const saved=(await db.select().from(catalogSavedJobs).where(and(eq(catalogSavedJobs.jobId,id),eq(catalogSavedJobs.ownerId,ownerId))))[0];return {...publicJob(row,true),savedApplicationId:saved?.applicationId||null};}
export async function saveJob(id:string,ownerId:string){
 const job=await jobDetail(id,ownerId);if(job.savedApplicationId)return {applicationId:job.savedApplicationId,replayed:true};
 const digest=await sha256(new TextEncoder().encode(`${ownerId}\0${id}`));const hex=digest.slice(0,12)+'5'+digest.slice(13,16)+'a'+digest.slice(17,32),appId=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
 const now=new Date().toISOString(),db=getDb();await db.batch([db.insert(applications).values({id:appId,ownerId,company:job.companyName,title:job.title,city:job.locations.join(' / '),batch:job.graduationLabel||'招聘批次未知',sourceUrl:job.originalUrl,jd:job.jdText||'',status:'saved',createdAt:now,updatedAt:now}).onConflictDoNothing(),db.insert(catalogSavedJobs).values({ownerId,jobId:id,applicationId:appId,savedAt:now}).onConflictDoNothing()]);
 const own=(await db.select().from(applications).where(and(eq(applications.id,appId),eq(applications.ownerId,ownerId))))[0];if(!own)throw new CatalogError('application_conflict','申请记录冲突，请联系管理员',409);return {applicationId:appId,replayed:false};
}
