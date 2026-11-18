import {getChatGPTUser} from '../../../../chatgpt-auth';
import {archiveAsset} from '../../../../../lib/m1/asset-actions';
import {M1Error,m1Failure} from '../../../../../lib/m1/files';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});
 try{let body;try{body=await request.json();}catch{throw new M1Error(400,'JSON 格式无效');}
 return Response.json({item:await archiveAsset(user.userId,(await context.params).id,body,false)});}catch(e){return m1Failure(e);}}
