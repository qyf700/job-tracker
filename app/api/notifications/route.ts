import {z} from 'zod';
import {getChatGPTUser} from '../../chatgpt-auth';
import {listNotifications, markNotificationRead, readNotificationPreferences, writeNotificationPreferences} from '../../../lib/notifications';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({error: '请先登录'}, {status: 401});
  try {
    const mutedKinds = await readNotificationPreferences(user.userId);
    return Response.json({items: await listNotifications(user.userId, mutedKinds), mutedKinds},
      {headers: {'Cache-Control': 'no-store'}});
  } catch {
    return Response.json({error: '暂时无法加载通知，请稍后重试'}, {status: 503});
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({error: '请先登录'}, {status: 401});
  const parsed = z.object({id: z.string().min(1).max(4000)}).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({error: '通知标识无效'}, {status: 422});
  try {
    const items = await listNotifications(user.userId, await readNotificationPreferences(user.userId));
    if (!items.some(item => item.id === parsed.data.id)) return Response.json({error: '通知已失效'}, {status: 404});
    await markNotificationRead(user.userId, parsed.data.id);
    return new Response(null, {status: 204});
  } catch {
    return Response.json({error: '暂时无法更新通知，请稍后重试'}, {status: 503});
  }
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({error: '请先登录'}, {status: 401});
  const parsed = z.object({mutedKinds: z.array(z.enum(['job', 'deadline', 'follow_up', 'interview'])).max(4)})
    .strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({error: '通知设置无效'}, {status: 422});
  try {
    await writeNotificationPreferences(user.userId, [...new Set(parsed.data.mutedKinds)]);
    return new Response(null, {status: 204});
  } catch {
    return Response.json({error: '暂时无法保存通知设置，请稍后重试'}, {status: 503});
  }
}
