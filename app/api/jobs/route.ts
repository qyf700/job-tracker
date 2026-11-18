import {getChatGPTUser} from '../../chatgpt-auth';
import {catalogFailure,listJobs} from '../../../lib/catalog/service';
export const dynamic='force-dynamic';
export async function GET(request:Request){const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});try{return Response.json(await listJobs(new URL(request.url).searchParams,user.userId),{headers:{'Cache-Control':'no-store'}});}catch(error){return catalogFailure(error);}}
