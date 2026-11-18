import {getChatGPTUser} from '../../chatgpt-auth';
import {createPreparation,listPreparations,jsonBody,submissionFailure} from '../../../lib/submissions/service';
export const dynamic='force-dynamic';
export async function GET(){const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});try{return Response.json(await listPreparations(user.userId),{headers:{'Cache-Control':'no-store'}});}catch(e){return submissionFailure(e);}}
export async function POST(request:Request){const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});try{return Response.json(await createPreparation(user.userId,await jsonBody(request)),{headers:{'Cache-Control':'no-store'}});}catch(e){return submissionFailure(e);}}
