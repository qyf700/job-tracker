import {z} from 'zod';
import {getChatGPTUser} from '../../../../chatgpt-auth';
import {ownedProfileVersion,snapshotData,saveProfileVersion} from '../../../../../lib/m1/profile-versions';
import {M1Error,m1Failure} from '../../../../../lib/m1/files';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});try{let body;try{body=await request.json();}catch{throw new M1Error(400,'JSON 格式错误');}const parsed=z.object({version:z.number().int().min(0)}).strict().safeParse(body);if(!parsed.success)throw new M1Error(422,'请提供当前版本号');const row=await ownedProfileVersion(user.userId,(await context.params).id);return Response.json(await saveProfileVersion(user.userId,snapshotData(row),parsed.data.version,{label:`恢复自 v${row.revision} · ${row.label}`.slice(0,100),sourceResumeId:row.sourceResumeId,restoredFromId:row.id}));}catch(e){return m1Failure(e);}}
