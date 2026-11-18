import { z } from "zod";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{
  const d=new Date(v+"T00:00:00Z");return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10)===v;
}, "日期无效");
export const statuses = ["saved","applied","in_progress","offer","rejected","withdrawn","closed"] as const;
export const applicationInput = z.object({
  company:z.string().trim().min(1).max(200),title:z.string().trim().min(1).max(200),
  city:z.string().trim().max(200).default(""),batch:z.string().trim().max(100).default(""),
  sourceUrl:z.union([z.literal(""),z.string().url().max(2000).refine(v=>["https:","http:"].includes(new URL(v).protocol))]).default(""),
  jd:z.string().max(30000).default(""),status:z.enum(statuses).default("saved"),
  nextAction:z.string().trim().max(500).default(""),dueDate:date.nullable().default(null),
  notes:z.string().max(20000).default(""),
}).strict();
export const patchInput=applicationInput.partial().extend({version:z.number().int().positive()}).strict();
