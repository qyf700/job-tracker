import {getChatGPTUser} from '../../../chatgpt-auth';
import {ownedProfileVersion,snapshotData} from '../../../../lib/m1/profile-versions';
import {m1Failure} from '../../../../lib/m1/files';
export const dynamic='force-dynamic';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});try{const row=await ownedProfileVersion(user.userId,(await context.params).id);const{ownerId:_owner,dataJson:_raw,...metadata}=row;return Response.json({...metadata,data:snapshotData(row)},{headers:{'Cache-Control':'no-store'}});}catch(e){return m1Failure(e);}}
