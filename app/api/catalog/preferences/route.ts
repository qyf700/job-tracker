import {getChatGPTUser} from '../../../chatgpt-auth';
import {catalogFailure, canScheduleCatalog} from '../../../../lib/catalog/service';
import {writeCatalogPreferences} from '../../../../lib/catalog/preferences';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({error: '请先登录'}, {status: 401});
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({error: '需要有效的 JSON 设置'}, {status: 400}); }
  try {
    return Response.json(await writeCatalogPreferences(user.userId, body, canScheduleCatalog(user.userId)));
  } catch (error) {
    return catalogFailure(error);
  }
}
