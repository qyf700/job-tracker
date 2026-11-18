import { and, count, desc, eq, inArray, isNull, isNotNull, ne, sql } from 'drizzle-orm';
import { getChatGPTUser } from '../../chatgpt-auth';
import { getDb } from '../../../db';
import { resumeAssets, materialSettings } from '../../../db/schema';
import { bucket, publicAsset } from '../../../lib/m1/storage';
import { limitedBody, M1Error, m1Failure, safeFilename, sha256, uploadMetadata, validatePdf } from '../../../lib/m1/files';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const user = await getChatGPTUser(); if (!user) return Response.json({ error: '请先登录' }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams, archived = params.get('archived') || '0';
    const limit = Number(params.get('limit') || 50), offset = Number(params.get('offset') || 0);
    if (!['0','1'].includes(archived) || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10000) throw new M1Error(422, '列表参数无效');
    const db = getDb(), scope = and(eq(resumeAssets.ownerId, user.userId), archived === '1' ? isNotNull(resumeAssets.archivedAt) : isNull(resumeAssets.archivedAt));
    const [rows, totals, settings] = await Promise.all([
      db.select().from(resumeAssets).where(scope).orderBy(desc(resumeAssets.createdAt), desc(resumeAssets.id)).limit(limit).offset(offset),
      db.select({ total: count() }).from(resumeAssets).where(scope),
      db.select().from(materialSettings).where(eq(materialSettings.ownerId, user.userId)),
    ]);
    return Response.json({ items: rows.map(row => publicAsset(row)), total: totals[0].total, limit, offset, defaultResumeId: settings[0]?.defaultResumeId || null, settingsVersion: settings[0]?.version || 0 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return m1Failure(e); }
}
export async function POST(request: Request) {
  const user = await getChatGPTUser(); if (!user) return Response.json({ error: '请先登录' }, { status: 401 });
  let assetId: string | null = null;
  try {
    const store = bucket(), contentType = request.headers.get('content-type') || '';
    if (!/^multipart\/form-data;/i.test(contentType)) throw new M1Error(415, '请通过文件上传表单提交');
    const raw = await limitedBody(request);
    let form: FormData;
    try { form = await new Response(raw, { headers: { 'Content-Type': contentType } }).formData(); } catch { throw new M1Error(400, '上传表单格式无效'); }
    const meta = uploadMetadata.safeParse({ id: form.get('id'), label: form.get('label') });
    if (!meta.success) throw new M1Error(422, '请填写简历版本名称，并使用有效的上传标识');
    const file = form.get('file');
    if (!file || typeof file === 'string') throw new M1Error(422, '请选择 PDF 文件');
    const originalName = safeFilename(file.name), bytes = new Uint8Array(await file.arrayBuffer());
    validatePdf(bytes, originalName);
    const digest = await sha256(bytes), db = getDb(), now = new Date().toISOString();
    const objectKey = `resumes/${encodeURIComponent(user.userId)}/${meta.data.id}.pdf`;
    const inserted = await db.insert(resumeAssets).values({ id: meta.data.id, ownerId: user.userId, label: meta.data.label, originalName, mimeType: 'application/pdf', sizeBytes: bytes.length, sha256: digest, objectKey, createdAt: now }).onConflictDoNothing().returning();
    const row = (await db.select().from(resumeAssets).where(eq(resumeAssets.id, meta.data.id)))[0];
    if (!row || row.ownerId !== user.userId || row.sha256 !== digest || row.originalName !== originalName || row.label !== meta.data.label) throw new M1Error(409, '此上传标识已用于其他文件或版本名称，请重新选择文件');
    if (row.archivedAt) throw new M1Error(409, '此版本已归档，请先恢复或重新上传新版本');
    if (row.uploadStatus === 'ready') return Response.json({ item: publicAsset(row), replayed: true });
    assetId = row.id;
    const head = await store.head(objectKey);
    if (head && head.customMetadata?.sha256 !== digest) throw new M1Error(409, '原件存储校验冲突，未覆盖已有文件');
    if (!head) {
      const object = await store.put(objectKey, bytes, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/pdf' }, customMetadata: { sha256: digest } });
      if (!object) { const existing = await store.head(objectKey); if (existing?.customMetadata?.sha256 !== digest) throw new M1Error(409, '原件存储校验冲突'); }
    }
    await db.update(resumeAssets).set({ uploadStatus: 'ready', uploadError: '' }).where(and(eq(resumeAssets.id, row.id), eq(resumeAssets.ownerId, user.userId), isNull(resumeAssets.archivedAt), inArray(resumeAssets.uploadStatus, ['uploading','upload_failed'])));
    const ready = (await db.select().from(resumeAssets).where(and(eq(resumeAssets.id, row.id), eq(resumeAssets.ownerId, user.userId))))[0];
    if (ready.uploadStatus !== 'ready' || ready.archivedAt) throw new M1Error(409, '该文件状态已变化，请重新加载');
    await db.run(sql`INSERT INTO material_settings (owner_id,default_resume_id,version,updated_at) SELECT ${user.userId},id,1,${now} FROM resume_assets WHERE id=${row.id} AND owner_id=${user.userId} AND upload_status='ready' AND archived_at IS NULL ON CONFLICT(owner_id) DO NOTHING`);
    return Response.json({ item: publicAsset(ready), replayed: false }, { status: inserted.length ? 201 : 200 });
  } catch (e) {
    if (assetId) {
      try { await getDb().update(resumeAssets).set({ uploadStatus: 'upload_failed', uploadError: '上传未完成，可使用原文件重试' }).where(and(eq(resumeAssets.id, assetId), eq(resumeAssets.ownerId, user.userId), ne(resumeAssets.uploadStatus, 'ready'))); } catch { /* Recovery uses the persisted upload id; never delete a potentially referenced object. */ }
    }
    return m1Failure(e);
  }
}
