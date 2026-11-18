import {getTableColumns,sql} from 'drizzle-orm';
export function insertFromGuard(db,table,values,from,condition){
 const fields=Object.fromEntries(Object.entries(getTableColumns(table)).map(([key,column])=>{
  const value=key in values?values[key]:column.default!==undefined?column.default:null;
  if(value===null&&column.notNull&&column.default===undefined)throw new Error('Missing guarded insert field: '+key);
  return [key,sql`${value}`.as(key)];
 }));
 return db.insert(table).select(db.select(fields).from(from).where(condition)).onConflictDoNothing();
}
