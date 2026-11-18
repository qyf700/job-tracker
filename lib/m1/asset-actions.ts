import {and,eq,isNotNull,isNull,sql} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from '../../db';
import {resumeAssets,materialSettings} from '../../db/schema';
import {ownedAsset,publicAsset} from './storage';
import {M1Error} from './files';
export async function archiveAsset(ownerId:string,id:string,body:unknown,restore=false){
 const parsed=z.object({version:z.number().int().positive()}).strict().safeParse(body);
 if(!parsed.success)throw new M1Error(422,'请提供有效版本号');
 const row=await ownedAsset(ownerId,id);if(row.version!==parsed.data.version)throw new M1Error(409,'文件状态已更新，请重新加载');
 const now=new Date().toISOString(),db=getDb();
 const update=db.update(resumeAssets).set({archivedAt:restore?null:now,version:row.version+1}).where(and(eq(resumeAssets.id,id),eq(resumeAssets.ownerId,ownerId),eq(resumeAssets.version,row.version),restore?isNotNull(resumeAssets.archivedAt):isNull(resumeAssets.archivedAt))).returning();
 const [rows]=restore?await db.batch([update]):await db.batch([update,db.update(materialSettings).set({defaultResumeId:null,version:sql`${materialSettings.version}+1`,updatedAt:now}).where(and(eq(materialSettings.ownerId,ownerId),eq(materialSettings.defaultResumeId,id),sql`EXISTS (SELECT 1 FROM resume_assets WHERE id=${id} AND owner_id=${ownerId} AND archived_at=${now})`))]);
 if(!rows.length)throw new M1Error(409,'文件状态已更新，请重新加载');
 return publicAsset(rows[0]);
}
