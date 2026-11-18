import {getChatGPTUser} from '../../../chatgpt-auth';
import {getSubmission,submissionFailure} from '../../../../lib/submissions/service';
export const dynamic='force-dynamic';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录'},{status:401});try{return Response.json(await getSubmission(user.userId,(await context.params).id),{headers:{'Cache-Control':'no-store'}});}catch(e){return submissionFailure(e);}}
