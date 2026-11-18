import {env} from 'cloudflare:workers';
import {and,asc,desc,eq,gt,isNull,lt,ne,or,sql} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from '../../db';
import {companies,companySources,jobs,catalogSyncRuns,catalogSavedJobs,applications} from '../../db/schema';
import {sha256} from '../m1/files';
import {CatalogError,mokaSources,readZhihuJobs} from './moka';
import {guardedJobUpsert} from './queries.mjs';
export function isCatalogAdmin(userId:string){return !!env.CATALOG_ADMIN_USER_ID&&env.CATALOG_ADMIN_USER_ID===userId;}
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
 const db=getDb(),rows=await db.select().from(companySources);const runs=await db.select().from(catalogSyncRuns).orderBy(desc(catalogSyncRuns.startedAt)).limit(10);
 return {canSync:isCatalogAdmin(userId),sources:mokaSources.map(source=>({id:source.id,companyId:source.orgId,companyName:source.companyName,entryUrl:source.entryUrl,freshnessSeconds:86400,...rows.find(row=>row.id===source.id),state:rows.some(row=>row.id===source.id&&row.lastSuccessAt)?'available':'not_synced'})).map(({leaseRunId,...row})=>({...row,running:!!leaseRunId&&!!row.leaseExpiresAt&&row.leaseExpiresAt>new Date().toISOString()})),runs};
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
const querySchema=z.object({q:z.string().trim().max(100).default(''),companyId:z.string().max(100).default(''),city:z.string().max(100).default(''),programKind:z.enum(['','unknown','autumn','summer_internship','daily_internship','other']).default(''),employmentType:z.enum(['','intern','full_time','unknown']).default(''),graduationYear:z.string().regex(/^(|20\d{2})$/).default(''),availability:z.enum(['','accepting','visible_unverified','closed','stale']).default(''),limit:z.coerce.number().int().min(1).max(100).default(20),cursor:z.string().max(300).default('')}).strict();
export async function listJobs(params:URLSearchParams,ownerId:string){
 const parsed=querySchema.safeParse(Object.fromEntries(params));if(!parsed.success)throw new CatalogError('invalid_filters','筛选参数无效',422);const p=parsed.data,db=getDb(),clauses=[];
 if(p.companyId)clauses.push(eq(jobs.companyId,p.companyId));if(p.programKind)clauses.push(eq(jobs.programKind,p.programKind));if(p.employmentType)clauses.push(eq(jobs.employmentType,p.employmentType));if(p.graduationYear)clauses.push(eq(jobs.graduationYear,Number(p.graduationYear)));
 if(p.q)clauses.push(sql`(instr(lower(${jobs.title}),lower(${p.q}))>0 OR instr(lower(${jobs.jdText}),lower(${p.q}))>0)`);
 if(p.city)clauses.push(sql`EXISTS (SELECT 1 FROM json_each(${jobs.locationsJson}) WHERE instr(value,${p.city})>0)`);
 const threshold=new Date(Date.now()-86400000).toISOString();
 if(p.availability==='stale')clauses.push(and(ne(jobs.availability,'closed'),lt(jobs.lastVerifiedAt,threshold))!);
 else if(p.availability){clauses.push(eq(jobs.availability,p.availability));if(p.availability!=='closed')clauses.push(gt(jobs.lastVerifiedAt,threshold));}
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
 return {companyTotals,items:items.map(row=>({...publicJob(row),savedApplicationId:saved.find(s=>s.jobId===row.id)?.applicationId||null})),nextCursor:hasMore?btoa(JSON.stringify({id:items[items.length-1].id})):null,sourceHealth:await sourceSummary(ownerId)};
}
export async function jobDetail(id:string,ownerId:string){const db=getDb(),row=(await db.select().from(jobs).where(eq(jobs.id,id)))[0];if(!row)throw new CatalogError('job_not_found','岗位不存在',404);const saved=(await db.select().from(catalogSavedJobs).where(and(eq(catalogSavedJobs.jobId,id),eq(catalogSavedJobs.ownerId,ownerId))))[0];return {...publicJob(row,true),savedApplicationId:saved?.applicationId||null};}
export async function saveJob(id:string,ownerId:string){
 const job=await jobDetail(id,ownerId);if(job.savedApplicationId)return {applicationId:job.savedApplicationId,replayed:true};
 const digest=await sha256(new TextEncoder().encode(`${ownerId}\0${id}`));const hex=digest.slice(0,12)+'5'+digest.slice(13,16)+'a'+digest.slice(17,32),appId=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
 const now=new Date().toISOString(),db=getDb();await db.batch([db.insert(applications).values({id:appId,ownerId,company:job.companyName,title:job.title,city:job.locations.join(' / '),batch:job.graduationLabel||'招聘批次未知',sourceUrl:job.originalUrl,jd:job.jdText||'',status:'saved',createdAt:now,updatedAt:now}).onConflictDoNothing(),db.insert(catalogSavedJobs).values({ownerId,jobId:id,applicationId:appId,savedAt:now}).onConflictDoNothing()]);
 const own=(await db.select().from(applications).where(and(eq(applications.id,appId),eq(applications.ownerId,ownerId))))[0];if(!own)throw new CatalogError('application_conflict','申请记录冲突，请联系管理员',409);return {applicationId:appId,replayed:false};
}
