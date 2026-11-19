export type OfficialJobStatus = {
  availability: string;
  lastVerifiedAt: string;
  reopenedAt: string | null;
  closedAt: string | null;
};

export function publicJobStatus(status: OfficialJobStatus, freshnessSeconds = 86400): OfficialJobStatus {
  if (status.availability === 'closed') return status;
  if (Date.now() - Date.parse(status.lastVerifiedAt) <= freshnessSeconds * 1000) return status;
  return {...status, availability:'stale'};
}

export function officialJobLabel(status: OfficialJobStatus) {
  if (status.availability === 'closed') return '官网已关闭';
  if (status.availability === 'stale') return '官网状态待核验';
  if (status.availability === 'accepting') return status.reopenedAt ? '官网已重新开放' : '官网开放';
  return '官网开放状态待确认';
}
