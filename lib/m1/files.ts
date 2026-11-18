import { z } from 'zod';
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_MULTIPART_BYTES = MAX_PDF_BYTES + 64 * 1024;
export class M1Error extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export function safeFilename(input: string) {
  const name = input.replace(/\\/g, '/').split('/').pop()!.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!name || name.length > 200) throw new M1Error(422, '文件名为空或过长');
  return name;
}
export const uploadMetadata = z.object({ id: z.string().uuid(), label: z.string().trim().min(1).max(100) }).strict();
export function validatePdf(bytes: Uint8Array, filename: string) {
  if (!bytes.length) throw new M1Error(422, '不能上传空文件');
  if (bytes.length > MAX_PDF_BYTES) throw new M1Error(413, 'PDF 不能超过 5 MiB');
  if (!/\.pdf$/i.test(filename) || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-' || !new TextDecoder().decode(bytes.slice(-1024)).includes('%%EOF')) {
    throw new M1Error(415, '请选择完整的 PDF 文件，不能只修改文件扩展名');
  }
}
export async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
}
export async function limitedBody(request: Request, limit = MAX_MULTIPART_BYTES) {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > limit) throw new M1Error(413, '上传请求超过大小限制');
  if (!request.body) throw new M1Error(400, '缺少请求内容');
  const reader = request.body.getReader(), parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) { const result = await reader.read(); if (result.done) break; size += result.value.length;
      if (size > limit) { await reader.cancel(); throw new M1Error(413, '上传请求超过大小限制'); }
      parts.push(result.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}
export function parseRange(header: string | null, size: number) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new M1Error(416, '不支持此文件范围');
  let start: number, end: number;
  if (!match[1]) { const suffix = Number(match[2]); if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new M1Error(416, '文件范围无效'); start = Math.max(0, size - suffix); end = size - 1; }
  else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1; }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw new M1Error(416, '文件范围无效');
  return { offset: start, length: end - start + 1, end };
}
export function contactSuggestions(text: string) {
  return {
    emails: [...new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])].slice(0, 5),
    phones: [...new Set(Array.from(text.matchAll(/(?:^|[^\d])(1[3-9]\d{9})(?!\d)/g), m => m[1]))].slice(0, 5),
  };
}
export function m1Failure(error: unknown) {
  if (error instanceof M1Error) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: '服务暂时不可用，请稍后重试，已有资料不会被覆盖' }, { status: 503 });
}
export function isConstraint(error: unknown) {
  return /unique|constraint/i.test(String(error) + ' ' + String((error as { cause?: unknown })?.cause));
}
