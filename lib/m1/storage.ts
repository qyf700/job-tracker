import { resumeCandidates } from './resume-candidates';
import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { resumeAssets } from '../../db/schema';
import { M1Error, contactSuggestions } from './files';
export function bucket() { if (!env.BUCKET) throw new M1Error(503, '文件存储尚未就绪，请稍后重试'); return env.BUCKET; }
export async function ownedAsset(ownerId: string, id: string) {
  const row = (await getDb().select().from(resumeAssets).where(and(eq(resumeAssets.id, id), eq(resumeAssets.ownerId, ownerId))))[0];
  if (!row) throw new M1Error(404, '简历不存在');
  return row;
}
export function publicAsset(row: typeof resumeAssets.$inferSelect, includeText = false) {
  const { ownerId: _owner, objectKey: _key, extractionText, extractionStartedAt: _started, ...metadata } = row;
  return { ...metadata, ...(includeText ? { extractionText, suggestions: contactSuggestions(extractionText), candidates: resumeCandidates(extractionText) } : {}) };
}
