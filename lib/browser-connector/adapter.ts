import {and,eq,sql} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from '../../db';
import {browserActions as actions,browserDevices,submissionTasks as tasks,submissionEvents as audit} from '../../db/schema';
import {M1Error,sha256} from '../m1/files';
import {insertFromGuard} from '../submissions/queries.mjs';
import {leaseInput,targetPage} from './protocol';
import {ownedLease,taskRow,snapshot,verifyFrozenJob} from './service';
import {buildFields,ADAPTER_VERSION} from '../../extensions/connector/fields.mjs';

type Device=typeof browserDevices.$inferSelect;
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new M1Error(422,'官网操作请求格式不正确');return result.data;}
const startInput=leaseInput.extend({actionId:z.string().uuid(),version:z.number().int().positive(),kind:z.enum(['fill','upload']),snapshotHash:z.string().regex(/^[a-f0-9]{64}$/),pageUrl:z.string().max(300),acknowledged:z.literal(true)}).strict();
const resultInput=leaseInput.extend({actionId:z.string().uuid(),outcome:z.enum(['fill_observed','upload_dispatched','uncertain'])}).strict();
export async function adapterPlan(device:Device,input:unknown){const data=parse(leaseInput,input);await ownedLease(device,data);const task=await taskRow(device.ownerId,data.taskId),frozen=await snapshot(device.ownerId,task.snapshotId),payload=JSON.parse(frozen.dataJson);return {adapterVersion:ADAPTER_VERSION,task:{id:task.id,version:task.version,state:task.state},snapshotHash:frozen.contentHash,job:{title:payload.job.title,company:payload.job.company,applyUrl:payload.job.applyUrl,externalJobId:payload.job.externalJobId},resume:{originalName:payload.resume.originalName,sizeBytes:payload.resume.sizeBytes,sha256:payload.resume.sha256},profileRevision:payload.profile.revision,fields:buildFields(payload),actions:await getDb().select({id:actions.id,kind:actions.kind,state:actions.state,createdAt:actions.createdAt}).from(actions).where(and(eq(actions.taskId,task.id),eq(actions.ownerId,device.ownerId)))};}
export async function startAction(device:Device,input:unknown){
 const data=parse(startInput,input);await ownedLease(device,data);const task=await taskRow(device.ownerId,data.taskId),frozen=await snapshot(device.ownerId,task.snapshotId),payload=JSON.parse(frozen.dataJson);
 if(data.snapshotHash!==frozen.contentHash||targetPage(data.pageUrl,payload.job.externalJobId)!==data.pageUrl)throw new M1Error(409,'目标岗位或材料快照不一致');
 // An accepted start consumes this task/kind permanently, even if its reply is lost.
 // No replay returns permission to repeat a third-party mutation.
 const existing=await getDb().select().from(actions).where(and(eq(actions.taskId,task.id),eq(actions.kind,data.kind)));
 if(existing.length)throw new M1Error(409,'本任务已授权过此操作；请先核对官网，不会重复填写或上传。需要重做请重新确认新材料快照');
 if(task.version!==data.version||!['ready_for_adapter','needs_manual_fields'].includes(task.state))throw new M1Error(409,'请重新核对目标页及任务版本后再操作');
 await verifyFrozenJob(payload);
 const timestamp=new Date().toISOString(),db=getDb();
 await db.batch([
  db.update(tasks).set({state:'adapter_running',version:task.version+1,updatedAt:timestamp}).where(and(eq(tasks.id,task.id),eq(tasks.ownerId,device.ownerId),eq(tasks.version,data.version),eq(tasks.activeLeaseId,data.leaseId),sql`EXISTS(SELECT 1 FROM browser_leases WHERE id=${data.leaseId} AND ended_at IS NULL AND expires_at>${timestamp}) AND EXISTS(SELECT 1 FROM browser_devices WHERE id=${device.id} AND revoked_at IS NULL) AND NOT EXISTS(SELECT 1 FROM browser_actions WHERE task_id=${task.id} AND kind=${data.kind})`)),
  insertFromGuard(db,actions,{id:data.actionId,ownerId:device.ownerId,deviceId:device.id,leaseId:data.leaseId,taskId:task.id,snapshotId:task.snapshotId,kind:data.kind,state:'started',createdAt:timestamp},tasks,and(eq(tasks.id,task.id),eq(tasks.version,task.version+1),eq(tasks.updatedAt,timestamp),sql`changes()=1`)),
  insertFromGuard(db,audit,{id:`adapter-start:${data.actionId}`,ownerId:device.ownerId,taskId:task.id,action:`adapter_${data.kind}_started`,createdAt:timestamp},actions,and(eq(actions.id,data.actionId),eq(actions.ownerId,device.ownerId))),
 ]);
 const saved=(await db.select().from(actions).where(and(eq(actions.id,data.actionId),eq(actions.ownerId,device.ownerId),eq(actions.deviceId,device.id),eq(actions.leaseId,data.leaseId))))[0];if(!saved)throw new M1Error(409,'操作授权发生冲突，未获得执行许可');
 return {actionId:saved.id,kind:saved.kind,adapterVersion:ADAPTER_VERSION,version:task.version+1,executeBefore:new Date(Math.min(Date.now()+20000,Date.parse((await ownedLease(device,data)).expiresAt))).toISOString()};
}
export async function finishAction(device:Device,input:unknown){
 const data=parse(resultInput,input);await ownedLease(device,data);const db=getDb(),action=(await db.select().from(actions).where(and(eq(actions.id,data.actionId),eq(actions.ownerId,device.ownerId),eq(actions.deviceId,device.id),eq(actions.taskId,data.taskId),eq(actions.leaseId,data.leaseId))))[0];if(!action)throw new M1Error(404,'官网操作不存在');
 if(data.outcome!=='uncertain'&&data.outcome!==(action.kind==='fill'?'fill_observed':'upload_dispatched'))throw new M1Error(422,'操作结果与类型不匹配');
 const hash=await sha256(new TextEncoder().encode(JSON.stringify(data)));if(action.resultHash){if(action.resultHash!==hash)throw new M1Error(409,'操作结果不能改写');return {replayed:true,state:(await taskRow(device.ownerId,data.taskId)).state};}
 const timestamp=new Date().toISOString(),state=data.outcome==='uncertain'?'needs_review':'needs_manual_fields';
 await db.batch([
  db.update(actions).set({state:data.outcome,resultHash:hash,finishedAt:timestamp}).where(and(eq(actions.id,action.id),eq(actions.state,'started'))),
  db.update(tasks).set({state,version:sql`${tasks.version}+1`,updatedAt:timestamp}).where(and(eq(tasks.id,data.taskId),eq(tasks.ownerId,device.ownerId),eq(tasks.activeLeaseId,data.leaseId),sql`changes()=1`)),
  insertFromGuard(db,audit,{id:`adapter-result:${action.id}`,ownerId:device.ownerId,taskId:data.taskId,action:`adapter_${data.outcome}`,createdAt:timestamp},actions,and(eq(actions.id,action.id),eq(actions.resultHash,hash),sql`changes()=1`)),
 ]);return {replayed:false,state:(await taskRow(device.ownerId,data.taskId)).state};
}
export async function reviewAction(device:Device,input:unknown){const data=parse(leaseInput.extend({version:z.number().int().positive(),acknowledged:z.literal(true)}).strict(),input);await ownedLease(device,data);const db=getDb(),timestamp=new Date().toISOString(),task=await taskRow(device.ownerId,data.taskId);
 if(task.state!=='needs_manual_fields'||task.version!==data.version)throw new M1Error(409,'请先完成官网操作并重新核对任务');
 const rows=await db.update(tasks).set({state:'awaiting_final_confirmation',version:task.version+1,updatedAt:timestamp}).where(and(eq(tasks.id,task.id),eq(tasks.version,data.version),eq(tasks.activeLeaseId,data.leaseId),sql`EXISTS(SELECT 1 FROM browser_actions WHERE task_id=${task.id} AND kind='upload' AND state='upload_dispatched') AND NOT EXISTS(SELECT 1 FROM browser_actions WHERE task_id=${task.id} AND state IN ('started','uncertain'))`)).returning();
 if(!rows.length)throw new M1Error(409,'附件仍未交给官网控件，或有结果未知操作，请先核对');
 await db.insert(audit).values({id:crypto.randomUUID(),ownerId:device.ownerId,taskId:task.id,action:'adapter_user_reviewed_before_submit',createdAt:timestamp});return {state:'awaiting_final_confirmation',version:rows[0].version};
}
