import {eq} from 'drizzle-orm';
import {getChatGPTUser} from '../../../../chatgpt-auth';
import {getDb} from '../../../../../db';
import {catalogSyncRuns} from '../../../../../db/schema';
import {catalogFailure} from '../../../../../lib/catalog/service';
export const dynamic='force-dynamic';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});try{const row=(await getDb().select().from(catalogSyncRuns).where(eq(catalogSyncRuns.id,(await context.params).id)))[0];return row?Response.json(row,{headers:{'Cache-Control':'no-store'}}):Response.json({error:'同步记录不存在'},{status:404});}catch(error){return catalogFailure(error);}}
