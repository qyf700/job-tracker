import { and, eq, isNull } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { applications } from "../../../../db/schema";
import { patchInput } from "../validation";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function PATCH(request:Request,context:Context){
  const user=await getChatGPTUser();if(!user)return Response.json({error:"请先登录"},{status:401});
  let body;try{body=await request.json();}catch{return Response.json({error:"JSON 格式错误"},{status:400});}
  const parsed=patchInput.safeParse(body);if(!parsed.success)return Response.json({error:parsed.error.flatten().fieldErrors.appliedAt?.[0]??"请检查字段"},{status:422});
  const {id}=await context.params;const db=getDb();
  const scope=and(eq(applications.id,id),eq(applications.ownerId,user.userId),isNull(applications.archivedAt));
  const existing=(await db.select().from(applications).where(scope))[0];
  if(!existing)return Response.json({error:"记录不存在"},{status:404});
  const {version,appliedAt,...fields}=parsed.data;const now=new Date().toISOString();
  const nextStatus=fields.status??existing.status;
  if(appliedAt===null && nextStatus!=="saved" && nextStatus!=="closed"){
    return Response.json({error:"已进入投递流程的记录需要保留实际投递时间"},{status:422});
  }
  const changes={...fields,version:version+1,updatedAt:now,
    appliedAt: appliedAt !== undefined ? appliedAt : !existing.appliedAt && fields.status && ["applied","in_progress","offer","rejected","withdrawn"].includes(fields.status) ? now : existing.appliedAt};
  const rows=await db.update(applications).set(changes).where(and(scope,eq(applications.version,version))).returning();
  if(!rows.length)return Response.json({error:"记录已更新，请刷新后重试"},{status:409});
  return Response.json(rows[0]);
}
export async function DELETE(request:Request,context:Context){
  const user=await getChatGPTUser();if(!user)return Response.json({error:"请先登录"},{status:401});
  const {id}=await context.params;const now=new Date().toISOString();
  const rows=await getDb().update(applications).set({archivedAt:now,updatedAt:now}).where(and(eq(applications.id,id),eq(applications.ownerId,user.userId),isNull(applications.archivedAt))).returning({id:applications.id});
  return rows.length?new Response(null,{status:204}):Response.json({error:"记录不存在"},{status:404});
}
