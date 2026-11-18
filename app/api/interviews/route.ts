import { and, asc, eq, isNull } from 'drizzle-orm';
import { getChatGPTUser } from '../../chatgpt-auth';
import { getDb } from '../../../db';
import { applications,interviews,interviewHistory } from '../../../db/schema';
import { interviewInput } from '../../../lib/interviews';
export const dynamic='force-dynamic';
export async function GET(){const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});
 const rows=await getDb().select({event:interviews,company:applications.company,title:applications.title}).from(interviews).innerJoin(applications,eq(interviews.applicationId,applications.id)).where(and(eq(interviews.ownerId,user.userId),eq(applications.ownerId,user.userId),isNull(applications.archivedAt))).orderBy(asc(interviews.startsAt));
 return Response.json({items:rows.map(({event,company,title})=>({...event,company,title}))},{headers:{'Cache-Control':'no-store'}});}
export async function POST(request:Request){const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});
 let body;try{body=await request.json();}catch{return Response.json({error:'JSON 格式错误'},{status:400});}
 const parsed=interviewInput.safeParse(body);if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message||'请检查字段'},{status:422});
 const db=getDb();const app=(await db.select().from(applications).where(and(eq(applications.id,parsed.data.applicationId),eq(applications.ownerId,user.userId),isNull(applications.archivedAt))))[0];
 if(!app)return Response.json({error:'关联岗位不存在或已归档'},{status:404});
 const now=new Date().toISOString(),id=crypto.randomUUID();const row={...parsed.data,id,ownerId:user.userId,version:1,createdAt:now,updatedAt:now};
 await db.batch([db.insert(interviews).values(row),db.insert(interviewHistory).values({id:`${id}:1`,ownerId:user.userId,interviewId:id,action:'created',beforeJson:null,afterJson:JSON.stringify(row),createdAt:now})]);
 return Response.json({...row,company:app.company,title:app.title},{status:201});}
