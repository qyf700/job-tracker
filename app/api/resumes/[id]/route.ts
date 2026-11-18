import { getChatGPTUser } from '../../../chatgpt-auth';
import { ownedAsset, publicAsset } from '../../../../lib/m1/storage';
import { m1Failure } from '../../../../lib/m1/files';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{id:string}> }) {
  const user = await getChatGPTUser(); if (!user) return Response.json({error:'请先登录'},{status:401});
  try { return Response.json({ item: publicAsset(await ownedAsset(user.userId,(await context.params).id),true) },{headers:{'Cache-Control':'no-store'}}); }
  catch(e){return m1Failure(e);}
}
