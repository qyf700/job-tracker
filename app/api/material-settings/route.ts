import {and,eq,isNull,sql} from 'drizzle-orm';
import {z} from 'zod';
import {getChatGPTUser} from '../../chatgpt-auth';
import {getDb} from '../../../db';
import {materialSettings,resumeAssets} from '../../../db/schema';
import {M1Error,m1Failure} from '../../../lib/m1/files';
export const dynamic='force-dynamic';
export async function PUT(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});
 try{let body;try{body=await request.json();}catch{throw new M1Error(400,'JSON 格式无效');}
 const parsed=z.object({version:z.number().int().min(0),defaultResumeId:z.string().uuid().nullable()}).strict().safeParse(body);if(!parsed.success)throw new M1Error(422,'默认简历参数无效');
 const {version,defaultResumeId}=parsed.data,db=getDb(),now=new Date().toISOString();
 if(defaultResumeId){const asset=(await db.select().from(resumeAssets).where(and(eq(resumeAssets.id,defaultResumeId),eq(resumeAssets.ownerId,user.userId),eq(resumeAssets.uploadStatus,'ready'),isNull(resumeAssets.archivedAt))))[0];if(!asset)throw new M1Error(404,'默认简历不存在、未就绪或已归档');}
 const eligible=defaultResumeId?sql`EXISTS (SELECT 1 FROM resume_assets WHERE id=${defaultResumeId} AND owner_id=${user.userId} AND upload_status='ready' AND archived_at IS NULL)`:sql`1=1`;
 if(version===0){const inserted=await db.run(sql`INSERT INTO material_settings (owner_id,default_resume_id,version,updated_at) SELECT ${user.userId},${defaultResumeId},1,${now} WHERE ${eligible} ON CONFLICT(owner_id) DO NOTHING`);if(!inserted.meta.changes)throw new M1Error(409,'默认设置已更新，请重新加载');
 const current=(await db.select().from(materialSettings).where(eq(materialSettings.ownerId,user.userId)))[0];if(!current||current.defaultResumeId!==defaultResumeId)throw new M1Error(409,'默认设置已更新，请重新加载');return Response.json({defaultResumeId:current.defaultResumeId,version:current.version});}
 const rows=await db.update(materialSettings).set({defaultResumeId,version:version+1,updatedAt:now}).where(and(eq(materialSettings.ownerId,user.userId),eq(materialSettings.version,version),eligible)).returning();
 if(!rows.length)throw new M1Error(409,'默认设置已更新或文件状态变化，请重新加载');return Response.json({defaultResumeId:rows[0].defaultResumeId,version:rows[0].version});
 }catch(e){return m1Failure(e);}}
