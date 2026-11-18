import {snapshotQuery} from './snapshot-query.mjs';
import {and,desc,eq,isNull} from 'drizzle-orm';
import {getDb} from '../../db';
import {profiles,profileVersions,resumeAssets} from '../../db/schema';
import {profileSchema,type Profile} from '../profile';
import {M1Error,isConstraint} from './files';
export async function saveProfileVersion(ownerId:string,data:Profile,expectedVersion:number,options:{label?:string;sourceResumeId?:string|null;restoredFromId?:string}={}){
 const db=getDb(),current=(await db.select().from(profiles).where(eq(profiles.ownerId,ownerId)))[0];
 if((current?.version||0)!==expectedVersion)throw new M1Error(409,'资料已在其他页面更新，请重新加载，未覆盖现有资料');
 const currentSnapshot=current?(await db.select().from(profileVersions).where(and(eq(profileVersions.ownerId,ownerId),eq(profileVersions.revision,current.version))))[0]:null;
 const sourceResumeId=options.sourceResumeId===undefined?currentSnapshot?.sourceResumeId||null:options.sourceResumeId;
 if(sourceResumeId){const asset=(await db.select().from(resumeAssets).where(and(eq(resumeAssets.id,sourceResumeId),eq(resumeAssets.ownerId,ownerId),eq(resumeAssets.uploadStatus,'ready'),options.restoredFromId||sourceResumeId===currentSnapshot?.sourceResumeId?undefined:isNull(resumeAssets.archivedAt))))[0];if(!asset)throw new M1Error(404,'来源简历不存在、未就绪或已归档');}
 const revision=expectedVersion+1,now=new Date().toISOString(),id=crypto.randomUUID(),dataJson=JSON.stringify(data);
 const next={id,ownerId,revision,label:options.label?.trim()||`${options.restoredFromId?'恢复资料':'资料'} v${revision}`,dataJson,sourceResumeId,changeKind:options.restoredFromId?'restore':'manual',restoredFromId:options.restoredFromId||null,createdAt:now};
 const write=current?db.update(profiles).set({dataJson,version:revision,updatedAt:now}).where(and(eq(profiles.ownerId,ownerId),eq(profiles.version,expectedVersion))).returning():db.insert(profiles).values({ownerId,dataJson,version:1,updatedAt:now}).onConflictDoNothing().returning();
 try{
  // The unique owner/revision snapshot makes a lost CAS roll back the entire D1 batch.
  const insertSnapshot=snapshotQuery(db,profileVersions,profiles,next);
  const result=current&&!currentSnapshot?await db.batch([db.insert(profileVersions).values({id:crypto.randomUUID(),ownerId,revision:current.version,label:`升级前资料 v${current.version}`,dataJson:current.dataJson,sourceResumeId:null,changeKind:'legacy',restoredFromId:null,createdAt:current.updatedAt}).onConflictDoNothing({target:[profileVersions.ownerId,profileVersions.revision]}),write,insertSnapshot]):await db.batch([write,insertSnapshot]);
  const written=current&&!currentSnapshot?result[1]:result[0];
  if(!Array.isArray(written)||!written.length)throw new M1Error(409,'资料已在其他页面更新，请重新加载');
 }catch(e){if(isConstraint(e))throw new M1Error(409,'资料已在其他页面更新，请重新加载');throw e;}
 return {data,version:revision,updatedAt:now,currentVersionId:id,sourceResumeId};
}
export async function listProfileVersions(ownerId:string){
 const db=getDb();const [rows,current]=await Promise.all([db.select({id:profileVersions.id,revision:profileVersions.revision,label:profileVersions.label,sourceResumeId:profileVersions.sourceResumeId,sourceResumeLabel:resumeAssets.label,sourceResumeArchivedAt:resumeAssets.archivedAt,changeKind:profileVersions.changeKind,restoredFromId:profileVersions.restoredFromId,createdAt:profileVersions.createdAt}).from(profileVersions).leftJoin(resumeAssets,and(eq(resumeAssets.id,profileVersions.sourceResumeId),eq(resumeAssets.ownerId,ownerId))).where(eq(profileVersions.ownerId,ownerId)).orderBy(desc(profileVersions.revision)).limit(100),db.select().from(profiles).where(eq(profiles.ownerId,ownerId))]);
 return {items:rows,currentRevision:current[0]?.version||0,legacyPending:!!current[0]&&!rows.some(r=>r.revision===current[0].version)};
}
export async function ownedProfileVersion(ownerId:string,id:string){const row=(await getDb().select().from(profileVersions).where(and(eq(profileVersions.id,id),eq(profileVersions.ownerId,ownerId))))[0];if(!row)throw new M1Error(404,'资料版本不存在');return row;}
export function snapshotData(row:typeof profileVersions.$inferSelect){return profileSchema.parse(JSON.parse(row.dataJson));}
