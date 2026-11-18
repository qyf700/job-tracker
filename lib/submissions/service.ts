import {ACTIVE_STATES,CANCELLABLE_STATES} from '../browser-connector/protocol';
import {and,desc,eq,inArray,isNull,sql} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from '../../db';
import {applications,catalogSavedJobs,jobs,profileVersions,resumeAssets,submissionPreparations as preparations,submissionPreviews as previews,materialSnapshots as snapshots,submissionTasks as tasks,submissionEvents as events,browserLeases} from '../../db/schema';
import {profileSchema} from '../profile';
import {M1Error,sha256,limitedBody} from '../m1/files';
import {bucket,ownedAsset} from '../m1/storage';
import {ownedProfileVersion} from '../m1/profile-versions';
import {CatalogError,revalidateZhihuJob,SOURCE_ID} from '../catalog/moka';
import {answersSchema,selectionSchema,validateMaterials,POLICY_VERSION,VERIFIED_JOB,canCancelTask} from './policy';
import {insertFromGuard} from './queries.mjs';
export async function jsonBody(request:Request){try{return JSON.parse(new TextDecoder().decode(await limitedBody(request,16384)));}catch(e){if(e instanceof M1Error)throw e;throw new M1Error(400,'JSON 格式错误');}}
export function submissionFailure(error:unknown){if(error instanceof M1Error||error instanceof CatalogError)return Response.json({error:error.message,...(error instanceof CatalogError?{code:error.code}:{})},{status:error.status,headers:{'Cache-Control':'no-store'}});return Response.json({error:'投递准备服务暂时不可用，已确认的快照不会被覆盖'},{status:503,headers:{'Cache-Control':'no-store'}});}
export async function ownedPreparation(ownerId:string,id:string){const row=(await getDb().select().from(preparations).where(and(eq(preparations.id,id),eq(preparations.ownerId,ownerId))))[0];if(!row)throw new M1Error(404,'准备单不存在');return row;}
function publicPreparation(row:typeof preparations.$inferSelect){const {ownerId:_owner,answersJson,...rest}=row;return {...rest,answers:answersSchema.parse(JSON.parse(answersJson))};}
export async function getPreparation(ownerId:string,id:string){const row=await ownedPreparation(ownerId,id),job=(await getDb().select().from(jobs).where(eq(jobs.id,row.jobId)))[0];return {...publicPreparation(row),job:job?{id:job.id,title:job.title,companyName:'知乎',originalUrl:job.originalUrl}:null};}
export async function listPreparations(ownerId:string){const rows=await getDb().select({preparation:preparations,title:jobs.title}).from(preparations).innerJoin(jobs,eq(jobs.id,preparations.jobId)).where(eq(preparations.ownerId,ownerId)).orderBy(desc(preparations.updatedAt)).limit(100);return {items:rows.map(r=>({...publicPreparation(r.preparation),title:r.title}))};}
export async function createPreparation(ownerId:string,input:unknown){const parsed=z.object({jobId:z.string().min(1).max(150)}).strict().safeParse(input);if(!parsed.success)throw new M1Error(422,'请选择有效岗位');const db=getDb(),job=(await db.select().from(jobs).where(eq(jobs.id,parsed.data.jobId)))[0];if(!job)throw new M1Error(404,'岗位不存在');const now=new Date().toISOString();await db.insert(preparations).values({id:crypto.randomUUID(),ownerId,jobId:job.id,createdAt:now,updatedAt:now}).onConflictDoNothing();const row=(await db.select().from(preparations).where(and(eq(preparations.ownerId,ownerId),eq(preparations.jobId,job.id))))[0];return getPreparation(ownerId,row.id);}
export async function updatePreparation(ownerId:string,id:string,input:unknown){
 const parsed=selectionSchema.safeParse(input);if(!parsed.success)throw new M1Error(422,'材料选择或答案不符合要求');const data=parsed.data,row=await ownedPreparation(ownerId,id);if(row.version!==data.version)throw new M1Error(409,'准备单已在其他页面更新，请重新加载');
 if(data.resumeId){const resume=await ownedAsset(ownerId,data.resumeId);if(resume.archivedAt||resume.uploadStatus!=='ready')throw new M1Error(409,'请选择未归档且上传完成的简历');}if(data.profileVersionId)await ownedProfileVersion(ownerId,data.profileVersionId);
 const db=getDb(),now=new Date().toISOString();
 const [written]=await db.batch([db.update(preparations).set({resumeId:data.resumeId,profileVersionId:data.profileVersionId,answersJson:JSON.stringify(data.answers),version:row.version+1,state:'draft',updatedAt:now}).where(and(eq(preparations.id,id),eq(preparations.ownerId,ownerId),eq(preparations.version,row.version))).returning(),
  db.update(tasks).set({state:'cancelled',activeLeaseId:null,version:sql`${tasks.version}+1`,updatedAt:now}).where(and(eq(tasks.preparationId,id),eq(tasks.ownerId,ownerId),inArray(tasks.state,CANCELLABLE_STATES),sql`EXISTS(SELECT 1 FROM submission_preparations WHERE id=${id} AND version=${row.version+1} AND updated_at=${now})`)),
  db.insert(events).select(db.select({id:sql<string>`'materials-changed:' || ${tasks.id}`.as('id'),ownerId:tasks.ownerId,taskId:tasks.id,action:sql<string>`'materials_changed'`.as('action'),createdAt:sql<string>`${now}`.as('created_at')}).from(tasks).where(and(eq(tasks.preparationId,id),eq(tasks.ownerId,ownerId),eq(tasks.state,'cancelled'),eq(tasks.updatedAt,now)))).onConflictDoNothing(),
 ]);if(!written.length)throw new M1Error(409,'准备单已更新，未覆盖其他修改');return getPreparation(ownerId,id);
}
async function materialData(ownerId:string,row:typeof preparations.$inferSelect){
 const db=getDb(),job=(await db.select().from(jobs).where(eq(jobs.id,row.jobId)))[0];if(!job)throw new M1Error(404,'岗位不存在');
 const resume=row.resumeId?await ownedAsset(ownerId,row.resumeId):null,version=row.profileVersionId?await ownedProfileVersion(ownerId,row.profileVersionId):null;
 const profile=version?profileSchema.parse(JSON.parse(version.dataJson)):null,validation=validateMaterials(profile,answersSchema.parse(JSON.parse(row.answersJson)),!!resume&&resume.uploadStatus==='ready'&&!resume.archivedAt,job.externalJobId);
 if(job.sourceId!==SOURCE_ID)validation.missing.push({key:'source',label:'此来源尚未适配',source:'official',message:'不能使用未核验来源创建投递快照'});
 if(job.availability!=='accepting')validation.missing.push({key:'job',label:'岗位当前不开放或未核实',source:'official',message:'请先同步官网并核对岗位'});
 return {job,resume,version,profile,validation};
}
async function verifyJob(job:typeof jobs.$inferSelect){
 const live=await revalidateZhihuJob(job.externalJobId);if(live.availability!=='accepting')throw new M1Error(409,'官网岗位已关闭，不能确认投递材料');const hash=await sha256(new TextEncoder().encode(JSON.stringify(live)));if(hash!==job.contentHash)throw new M1Error(409,'官网岗位内容已变化，请先同步目录并重新预览');return new Date().toISOString();
}
function redactPayload(data:Record<string,any>){const {objectKey:_key,...resume}=data.resume;return {...data,resume};}
export async function previewPreparation(ownerId:string,id:string,input:unknown){
 const parsed=z.object({version:z.number().int().positive()}).strict().safeParse(input);if(!parsed.success)throw new M1Error(422,'请提供准备单版本');const row=await ownedPreparation(ownerId,id);if(row.version!==parsed.data.version)throw new M1Error(409,'准备单已变化，请重新加载');
 if(row.state==='confirmed')throw new M1Error(409,'已有确认快照，请先修改材料或取消等待任务');
 const {job,resume,version,profile,validation}=await materialData(ownerId,row);
 if(validation.missing.length)return {canConfirm:false,...validation,preparationVersion:row.version};
 const checkedAt=await verifyJob(job),head=await bucket().head(resume!.objectKey);if(!head||head.size!==resume!.sizeBytes||head.customMetadata?.sha256!==resume!.sha256)throw new M1Error(409,'简历原件缺失或校验不一致，请重新上传新版本');
 const payload={schemaVersion:1,policy:{version:POLICY_VERSION,verifiedJobId:VERIFIED_JOB,checkedOn:'2026-11-18',formUrl:job.applyUrl,scope:'observed_required_fields_and_tool_baseline'},
  job:{id:job.id,externalJobId:job.externalJobId,company:'知乎',title:job.title,locations:JSON.parse(job.locationsJson),jdText:job.jdText,originalUrl:job.originalUrl,applyUrl:job.applyUrl,officialHost:new URL(job.applyUrl).host,catalogContentHash:job.contentHash,liveCheckedAt:checkedAt},
  resume:{id:resume!.id,label:resume!.label,originalName:resume!.originalName,mimeType:resume!.mimeType,sizeBytes:resume!.sizeBytes,sha256:resume!.sha256,assetVersion:resume!.version,objectKey:resume!.objectKey},
  profile:{id:version!.id,revision:version!.revision,label:version!.label,createdAt:version!.createdAt,data:profile!},answers:validation.answers,
  preparedProfile:{...profile!,internshipAvailability:validation.answers.internshipAvailability,jobSource:validation.answers.jobSource},warnings:validation.warnings,
  pendingActions:['由已配对连接器领取并核对官网目标','本人完成官网登录或验证','本人在官网处理隐私说明','连接器逐字段和附件核对','取得真实官网回执后才能标记已投递'],
 };
 const dataJson=JSON.stringify(payload);if(new TextEncoder().encode(dataJson).byteLength>1048576)throw new M1Error(422,'材料内容超过快照大小上限，请精简资料后重试');const hash=await sha256(new TextEncoder().encode(dataJson)),previewId=crypto.randomUUID(),expiresAt=new Date(Date.now()+600000).toISOString();
 // A selection changing during network verification must not produce a usable preview.
 const guard=and(eq(preparations.id,id),eq(preparations.ownerId,ownerId),eq(preparations.version,row.version),eq(preparations.state,'draft'));
 await insertFromGuard(getDb(),previews,{id:previewId,ownerId,preparationId:id,preparationVersion:row.version,dataJson,contentHash:hash,expiresAt,createdAt:checkedAt},preparations,guard);
 const saved=(await getDb().select().from(previews).where(eq(previews.id,previewId)))[0];if(!saved)throw new M1Error(409,'材料选择已变化，请重新预览');
 return {canConfirm:true,previewId,contentHash:hash,expiresAt,preparationVersion:row.version,missing:[],warnings:validation.warnings,payload:redactPayload(payload)};
}
async function snapshotTask(ownerId:string,id:string){const row=(await getDb().select().from(tasks).where(and(eq(tasks.id,id),eq(tasks.ownerId,ownerId))))[0];if(!row)throw new M1Error(404,'确认任务不存在');return row;}
export async function confirmPreparation(ownerId:string,id:string,input:unknown){
 const parsed=z.object({previewId:z.string().uuid(),contentHash:z.string().regex(/^[a-f0-9]{64}$/),acknowledged:z.literal(true)}).strict().safeParse(input);if(!parsed.success)throw new M1Error(422,'请明确核对并确认本次预览');
 const {previewId,contentHash}=parsed.data,db=getDb(),row=await ownedPreparation(ownerId,id);
 const previous=(await db.select().from(snapshots).where(and(eq(snapshots.id,previewId),eq(snapshots.ownerId,ownerId),eq(snapshots.preparationId,id))))[0];if(previous){if(previous.contentHash!==contentHash)throw new M1Error(409,'确认哈希不一致');return {...await getSubmission(ownerId,previewId),replayed:true};}
 const preview=(await db.select().from(previews).where(and(eq(previews.id,previewId),eq(previews.ownerId,ownerId),eq(previews.preparationId,id))))[0];if(!preview)throw new M1Error(404,'预览不存在');
 if(preview.expiresAt<=new Date().toISOString()||preview.preparationVersion!==row.version||row.state!=='draft')throw new M1Error(409,'预览已过期或材料发生变化，请重新预览');
 if(preview.contentHash!==contentHash||await sha256(new TextEncoder().encode(preview.dataJson))!==contentHash)throw new M1Error(409,'预览内容校验失败，不能确认');
 const payload=JSON.parse(preview.dataJson);if(payload.policy.version!==POLICY_VERSION)throw new M1Error(409,'字段规则已更新，请重新预览');const {job,resume,validation}=await materialData(ownerId,row);if(validation.missing.length||!resume||resume.id!==payload.resume.id||resume.version!==payload.resume.assetVersion||job.contentHash!==payload.job.catalogContentHash)throw new M1Error(409,'岗位或原件状态已变化，请重新预览');
 const checkedAt=await verifyJob(job),object=await bucket().get(payload.resume.objectKey);if(!object||await sha256(new Uint8Array(await object.arrayBuffer()))!==payload.resume.sha256)throw new M1Error(409,'原件内容校验不通过，不能确认');
 // Prepare the same deterministic application identity used by M2, without
 // touching an existing user's application notes, stage or timestamps.
 const digest=await sha256(new TextEncoder().encode(`${ownerId}\0${job.id}`));const hex=digest.slice(0,12)+'5'+digest.slice(13,16)+'a'+digest.slice(17,32),applicationId=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
 const existingApp=(await db.select().from(applications).where(eq(applications.id,applicationId)))[0];if(existingApp&&(existingApp.ownerId!==ownerId||existingApp.status!=='saved'||existingApp.appliedAt||existingApp.archivedAt))throw new M1Error(409,'该岗位已有投递进度或已归档，请先核对申请记录，不能重复创建任务');
 const now=new Date().toISOString(),nextVersion=row.version+1;if(preview.expiresAt<=now)throw new M1Error(409,'预览已过期，请重新预览');
 const eligible=sql`EXISTS(SELECT 1 FROM resume_assets WHERE id=${resume.id} AND owner_id=${ownerId} AND archived_at IS NULL AND upload_status='ready' AND version=${resume.version}) AND EXISTS(SELECT 1 FROM jobs WHERE id=${job.id} AND content_hash=${job.contentHash} AND availability='accepting') AND NOT EXISTS(SELECT 1 FROM applications WHERE id=${applicationId} AND (owner_id<>${ownerId} OR status<>'saved' OR applied_at IS NOT NULL OR archived_at IS NOT NULL))`;
 const snapshotGuard=and(eq(preparations.id,id),eq(preparations.ownerId,ownerId),eq(preparations.version,nextVersion),eq(preparations.lastSnapshotId,previewId),sql`changes()=1`);
 const exists=sql`EXISTS(SELECT 1 FROM material_snapshots WHERE id=${previewId} AND owner_id=${ownerId} AND preparation_id=${id})`;
 await db.batch([
  db.update(preparations).set({state:'confirmed',version:nextVersion,lastSnapshotId:previewId,updatedAt:now}).where(and(eq(preparations.id,id),eq(preparations.ownerId,ownerId),eq(preparations.version,row.version),eq(preparations.state,'draft'),eligible)),
  insertFromGuard(db,snapshots,{id:previewId,ownerId,preparationId:id,dataJson:preview.dataJson,contentHash,confirmedAt:now},preparations,snapshotGuard),
  insertFromGuard(db,applications,{id:applicationId,ownerId,company:'知乎',title:job.title,city:JSON.parse(job.locationsJson).join(' / '),batch:job.graduationLabel||'招聘批次未知',sourceUrl:job.originalUrl,jd:job.jdText,status:'saved',createdAt:now,updatedAt:now},snapshots,and(eq(snapshots.id,previewId),eq(snapshots.ownerId,ownerId))),
  insertFromGuard(db,catalogSavedJobs,{ownerId,jobId:job.id,applicationId,savedAt:now},snapshots,and(eq(snapshots.id,previewId),eq(snapshots.ownerId,ownerId))),
  insertFromGuard(db,tasks,{id:previewId,snapshotId:previewId,ownerId,preparationId:id,applicationId,state:'needs_connector',version:1,createdAt:now,updatedAt:now},snapshots,and(eq(snapshots.id,previewId),eq(snapshots.ownerId,ownerId))),
  insertFromGuard(db,events,{id:`confirmed:${previewId}`,ownerId,taskId:previewId,action:'materials_confirmed_waiting_connector',createdAt:now},tasks,and(eq(tasks.id,previewId),eq(tasks.ownerId,ownerId))),
 ]);
 const confirmed=(await db.select().from(snapshots).where(and(eq(snapshots.id,previewId),eq(snapshots.ownerId,ownerId))))[0];if(!confirmed)throw new M1Error(409,'准备单已在其他页面更新，请重新预览');
 return {...await getSubmission(ownerId,previewId),replayed:false,liveRecheckedAt:checkedAt};
}
export async function getSubmission(ownerId:string,id:string){const task=await snapshotTask(ownerId,id),snapshot=(await getDb().select().from(snapshots).where(and(eq(snapshots.id,task.snapshotId),eq(snapshots.ownerId,ownerId))))[0];if(!snapshot)throw new M1Error(404,'材料快照不存在');const {ownerId:_owner,...taskInfo}=task;const history=await getDb().select({action:events.action,createdAt:events.createdAt}).from(events).where(and(eq(events.taskId,id),eq(events.ownerId,ownerId))).orderBy(events.createdAt);const lease=task.activeLeaseId?(await getDb().select().from(browserLeases).where(and(eq(browserLeases.id,task.activeLeaseId),eq(browserLeases.ownerId,ownerId))))[0]:null;return {task:{...taskInfo,leaseExpiresAt:lease?.expiresAt||null,effectiveState:lease&&(lease.endedAt||lease.expiresAt<=new Date().toISOString())&&ACTIVE_STATES.includes(task.state as typeof ACTIVE_STATES[number])?'needs_review':task.state},snapshot:{id:snapshot.id,contentHash:snapshot.contentHash,confirmedAt:snapshot.confirmedAt,payload:redactPayload(JSON.parse(snapshot.dataJson))},events:history};}
export async function listSubmissions(ownerId:string){const rows=await getDb().select({task:tasks,dataJson:snapshots.dataJson,confirmedAt:snapshots.confirmedAt,leaseExpiresAt:browserLeases.expiresAt,leaseEndedAt:browserLeases.endedAt}).from(tasks).innerJoin(snapshots,eq(snapshots.id,tasks.snapshotId)).leftJoin(browserLeases,and(eq(browserLeases.id,tasks.activeLeaseId),eq(browserLeases.ownerId,ownerId))).where(eq(tasks.ownerId,ownerId)).orderBy(desc(tasks.createdAt)).limit(100);return {items:rows.map(r=>({id:r.task.id,preparationId:r.task.preparationId,state:r.task.state,version:r.task.version,title:JSON.parse(r.dataJson).job.title,confirmedAt:r.confirmedAt,leaseExpiresAt:r.leaseExpiresAt,effectiveState:r.leaseExpiresAt&&(r.leaseEndedAt||r.leaseExpiresAt<=new Date().toISOString())&&ACTIVE_STATES.includes(r.task.state)?'needs_review':r.task.state}))};}

export async function cancelSubmission(ownerId:string,id:string,input:unknown){const parsed=z.object({version:z.number().int().positive()}).strict().safeParse(input);if(!parsed.success)throw new M1Error(422,'请提供任务版本号');const task=await snapshotTask(ownerId,id);if(!canCancelTask(task.state)||task.version!==parsed.data.version)throw new M1Error(409,'任务状态已变化或不可取消');const db=getDb(),now=new Date().toISOString();const [written]=await db.batch([
 db.update(tasks).set({state:'cancelled',activeLeaseId:null,version:task.version+1,updatedAt:now}).where(and(eq(tasks.id,id),eq(tasks.ownerId,ownerId),inArray(tasks.state,CANCELLABLE_STATES),eq(tasks.version,task.version))).returning(),
 db.update(preparations).set({state:'draft',version:sql`${preparations.version}+1`,updatedAt:now}).where(and(eq(preparations.id,task.preparationId),eq(preparations.ownerId,ownerId),eq(preparations.lastSnapshotId,id),sql`EXISTS(SELECT 1 FROM submission_tasks WHERE id=${id} AND state='cancelled' AND updated_at=${now})`)),
 insertFromGuard(db,events,{id:`cancelled:${id}`,ownerId,taskId:id,action:'user_cancelled_before_execution',createdAt:now},tasks,and(eq(tasks.id,id),eq(tasks.ownerId,ownerId),eq(tasks.state,'cancelled'),eq(tasks.updatedAt,now))),
 ]);if(!written.length)throw new M1Error(409,'任务已更新');return getSubmission(ownerId,id);}
export async function frozenFile(ownerId:string,id:string){const task=await snapshotTask(ownerId,id),snapshot=(await getDb().select().from(snapshots).where(and(eq(snapshots.id,task.snapshotId),eq(snapshots.ownerId,ownerId))))[0];if(!snapshot)throw new M1Error(404,'快照不存在');return JSON.parse(snapshot.dataJson).resume as {objectKey:string;originalName:string;sizeBytes:number;sha256:string};}
