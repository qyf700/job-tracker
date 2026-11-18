import {and,eq,sql} from 'drizzle-orm';
// D1 batch needs real prepared builders, not SQLiteRaw. Guard every upsert by the sync lease.
export function guardedJobUpsert(db,jobs,sources,row,runId){
 const guard=and(eq(sources.id,row.sourceId),eq(sources.leaseRunId,runId));
 const fields=Object.fromEntries(Object.entries(row).map(([key,value])=>[key,sql`${value}`.as(key)]));
 const {id,sourceId,externalJobId,firstSeenAt,...updates}=row;
 return db.insert(jobs).select(db.select(fields).from(sources).where(guard)).onConflictDoUpdate({target:[jobs.sourceId,jobs.externalJobId],set:updates}).returning({id:jobs.id});
}
