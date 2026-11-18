import { and,eq,isNull } from 'drizzle-orm';
import {getChatGPTUser} from '../../chatgpt-auth';import {getDb} from '../../../db';import {applications,interviews} from '../../../db/schema';import {calendar} from '../../../lib/calendar';
export const dynamic='force-dynamic';
export async function GET(){const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});const rows=await getDb().select({event:interviews,company:applications.company,title:applications.title}).from(interviews).innerJoin(applications,eq(applications.id,interviews.applicationId)).where(and(eq(interviews.ownerId,user.userId),eq(applications.ownerId,user.userId),isNull(applications.archivedAt)));
 return new Response(calendar(rows.map(({event,company,title})=>({...event,company,title}) as Parameters<typeof calendar>[0][number])),{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="interviews.ics"','Cache-Control':'no-store'}});}
