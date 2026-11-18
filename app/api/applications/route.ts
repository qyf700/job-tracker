import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { applications } from "../../../db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { applicationInput } from "./validation";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const rows = await getDb().select().from(applications).where(and(eq(applications.ownerId,user.userId),isNull(applications.archivedAt))).orderBy(desc(applications.createdAt),desc(applications.id));
  return Response.json({items: rows}, {headers:{"Cache-Control":"no-store"}});
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({error:"请先登录"},{status:401});
  let body; try { body = await request.json(); } catch { return Response.json({error:"JSON 格式错误"},{status:400}); }
  const input = applicationInput.safeParse(body);
  if (!input.success) return Response.json({error:"请检查字段",fields:input.error.flatten()},{status:422});
  const now = new Date().toISOString();
  const row = {...input.data,id:crypto.randomUUID(),ownerId:user.userId,createdAt:now,updatedAt:now,
    appliedAt:["applied","in_progress","offer","rejected","withdrawn"].includes(input.data.status) ? now : null};
  const inserted = await getDb().insert(applications).values(row).returning();
  return Response.json(inserted[0],{status:201});
}
