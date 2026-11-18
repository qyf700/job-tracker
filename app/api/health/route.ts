import { getDb } from "../../../db";
import { sql } from "drizzle-orm";
export const dynamic="force-dynamic";
export async function GET(){try{await getDb().get(sql`SELECT 1`);return Response.json({status:"ready",storage:"Cloudflare D1",mode:"live"},{headers:{"Cache-Control":"no-store"}});}catch{return Response.json({status:"unavailable"},{status:503});}}
