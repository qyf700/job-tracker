type SyncTimes = {
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  leaseRunId: string | null;
  leaseExpiresAt: string | null;
};

const HOUR = 3_600_000;
const RETRY_DELAY = 15 * 60_000;

export function nextSourceSync(source: SyncTimes | undefined, intervalHours: number, now: number, initialOnly = false) {
  if (initialOnly ? source?.lastSuccessAt : !intervalHours) return null;
  const regular = source?.lastSuccessAt ? Date.parse(source.lastSuccessAt) + intervalHours * HOUR : 0;
  const retry = source?.lastErrorAt ? Date.parse(source.lastErrorAt) + RETRY_DELAY : 0;
  const lease = source?.leaseRunId && source.leaseExpiresAt ? Date.parse(source.leaseExpiresAt) : 0;
  return Math.max(regular, retry, lease) || now;
}
