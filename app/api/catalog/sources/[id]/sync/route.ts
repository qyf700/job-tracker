import {getChatGPTUser} from '../../../../../chatgpt-auth';
import {catalogFailure,isCatalogAdmin,syncSource} from '../../../../../../lib/catalog/service';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});
 if(!isCatalogAdmin(user.userId))return Response.json({error:'只有目录管理员可以触发同步'},{status:403});
 try{
  // Some proxies expose an empty POST as a non-null stream. Inspect at most the
  // first nonempty chunk; never buffer an arbitrary caller-supplied request.
  const reader=request.body?.getReader();if(reader){try{for(let i=0;i<4;i++){const chunk=await reader.read();if(chunk.done)break;if(chunk.value.length||i===3)return Response.json({error:'同步不接收任意URL或请求参数'},{status:422});}}finally{await reader.cancel();reader.releaseLock();}}
  return Response.json(await syncSource(user.userId,(await context.params).id),{headers:{'Cache-Control':'no-store'}});
 }catch(error){return catalogFailure(error);}
}
