import { and,eq,isNull } from 'drizzle-orm';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { getDb } from '../../../../db';
import { applications,interviews,interviewHistory } from '../../../../db/schema';
import { interviewUpdate } from '../../../../lib/interviews';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function PATCH(request:Request,context:Context){const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});
 let body;try{body=await request.json();}catch{return Response.json({error:'JSON 格式错误'},{status:400});}
 const parsed=interviewUpdate.safeParse(body);if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message||'请检查字段'},{status:422});
 const {id}=await context.params;const db=getDb();
 const existing=(await db.select().from(interviews).where(and(eq(interviews.id,id),eq(interviews.ownerId,user.userId))))[0];
 if(!existing)return Response.json({error:'日程不存在'},{status:404});
 const {version,...data}=parsed.data;if(version!==existing.version)return Response.json({error:'日程已更新，请重新加载'},{status:409});
 if(data.applicationId!==existing.applicationId)return Response.json({error:'不能更换已有日程的关联岗位'},{status:422});
 const app=(await db.select().from(applications).where(and(eq(applications.id,existing.applicationId),eq(applications.ownerId,user.userId),isNull(applications.archivedAt))))[0];
 if(!app)return Response.json({error:'关联岗位已归档'},{status:404});
 const now=new Date().toISOString(),row={...existing,...data,version:version+1,updatedAt:now};
 const action=data.state==='cancelled'&&existing.state!=='cancelled'?'cancelled':data.startsAt!==existing.startsAt||data.endsAt!==existing.endsAt?'rescheduled':'updated';
 try{const [updated]=await db.batch([db.update(interviews).set(row).where(and(eq(interviews.id,id),eq(interviews.ownerId,user.userId),eq(interviews.version,version))).returning(),db.insert(interviewHistory).values({id:`${id}:${version+1}`,ownerId:user.userId,interviewId:id,action,beforeJson:JSON.stringify(existing),afterJson:JSON.stringify(row),createdAt:now})]);
 if(!updated.length)return Response.json({error:'日程已更新，请重新加载'},{status:409});
 return Response.json({...updated[0],company:app.company,title:app.title});
 }catch(e){if(/unique|constraint/i.test(String(e)+' '+String((e as {cause?:unknown})?.cause)))return Response.json({error:'日程已更新，请重新加载'},{status:409});throw e;}}
export async function GET(_request:Request,context:Context){const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});const{id}=await context.params;
 const rows=await getDb().select().from(interviewHistory).where(and(eq(interviewHistory.interviewId,id),eq(interviewHistory.ownerId,user.userId))).orderBy(interviewHistory.createdAt);
 return Response.json({items:rows.map(row=>({id:row.id,action:row.action,before:row.beforeJson?JSON.parse(row.beforeJson):null,after:JSON.parse(row.afterJson),createdAt:row.createdAt}))},{headers:{'Cache-Control':'no-store'}});}
