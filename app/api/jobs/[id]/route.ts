import {getChatGPTUser} from '../../../chatgpt-auth';
import {catalogFailure,jobDetail} from '../../../../lib/catalog/service';
export const dynamic='force-dynamic';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});try{return Response.json(await jobDetail((await context.params).id,user.userId),{headers:{'Cache-Control':'no-store'}});}catch(error){return catalogFailure(error);}}
