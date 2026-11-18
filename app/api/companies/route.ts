import {getChatGPTUser} from '../../chatgpt-auth';
import {catalogFailure,sourceSummary} from '../../../lib/catalog/service';
export const dynamic='force-dynamic';
export async function GET(){const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});try{const summary=await sourceSummary(user.userId);return Response.json({items:summary.sources,...summary},{headers:{'Cache-Control':'no-store'}});}catch(error){return catalogFailure(error);}}
