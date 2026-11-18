import {getChatGPTUser} from '../../chatgpt-auth';
import {listProfileVersions} from '../../../lib/m1/profile-versions';
import {m1Failure} from '../../../lib/m1/files';
export const dynamic='force-dynamic';
export async function GET(){const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});try{return Response.json(await listProfileVersions(user.userId),{headers:{'Cache-Control':'no-store'}});}catch(e){return m1Failure(e);}}
