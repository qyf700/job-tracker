import {and,eq,sql} from 'drizzle-orm';
// Use an insert builder: D1 batch requires a prepared statement, which SQLiteRaw lacks.
export function snapshotQuery(db,versions,profiles,next){
 return db.insert(versions).select(db.select({
  id:sql`${next.id}`.as('id'),ownerId:sql`${next.ownerId}`.as('owner_id'),revision:sql`${next.revision}`.as('revision'),label:sql`${next.label}`.as('label'),dataJson:sql`${next.dataJson}`.as('data_json'),sourceResumeId:sql`${next.sourceResumeId}`.as('source_resume_id'),changeKind:sql`${next.changeKind}`.as('change_kind'),restoredFromId:sql`${next.restoredFromId}`.as('restored_from_id'),createdAt:sql`${next.createdAt}`.as('created_at')
 }).from(profiles).where(and(eq(profiles.ownerId,next.ownerId),eq(profiles.version,next.revision),sql`changes()=1`)));
}
