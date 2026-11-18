import {getChatGPTUser} from '../../../chatgpt-auth';
import {catalogFailure, canScheduleCatalog, syncDueSources} from '../../../../lib/catalog/service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({error: '请先登录'}, {status: 401});
  if (!canScheduleCatalog(user.userId)) return Response.json({error: '此实例未启用本地自动同步'}, {status: 403});
  try {
    return Response.json({runs: await syncDueSources(user.userId, new URL(request.url).searchParams.get('initial') === '1')});
  } catch (error) {
    return catalogFailure(error);
  }
}
