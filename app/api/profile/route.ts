import {and,eq} from 'drizzle-orm';
import {z} from 'zod';
import {getChatGPTUser} from '../../chatgpt-auth';
import {getDb} from '../../../db';
import {profiles,profileVersions} from '../../../db/schema';
import {emptyProfile,profileSchema} from '../../../lib/profile';
import {M1Error,m1Failure} from '../../../lib/m1/files';
import {saveProfileVersion} from '../../../lib/m1/profile-versions';
export const dynamic='force-dynamic';
export async function GET(){const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});
 try{const db=getDb(),row=(await db.select().from(profiles).where(eq(profiles.ownerId,user.userId)))[0];const snapshot=row?(await db.select().from(profileVersions).where(and(eq(profileVersions.ownerId,user.userId),eq(profileVersions.revision,row.version))))[0]:null;
 return Response.json(row?{data:profileSchema.parse(JSON.parse(row.dataJson)),version:row.version,updatedAt:row.updatedAt,currentVersionId:snapshot?.id||null,sourceResumeId:snapshot?.sourceResumeId||null}:{data:emptyProfile,version:0,updatedAt:null,currentVersionId:null,sourceResumeId:null},{headers:{'Cache-Control':'no-store'}});}catch(e){return m1Failure(e);}}
export async function PUT(request:Request){const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});
 try{let body;try{body=await request.json();}catch{throw new M1Error(400,'JSON 格式错误');}
 const parsed=z.object({data:profileSchema,version:z.number().int().min(0),label:z.string().trim().max(100).optional(),sourceResumeId:z.string().uuid().nullable().optional()}).strict().safeParse(body);if(!parsed.success)throw new M1Error(422,parsed.error.issues[0]?.message||'请检查资料');
 return Response.json(await saveProfileVersion(user.userId,parsed.data.data,parsed.data.version,{label:parsed.data.label,sourceResumeId:parsed.data.sourceResumeId}));}catch(e){return m1Failure(e);}}
