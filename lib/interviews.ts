import { z } from 'zod';
const webUrl=z.union([z.literal(''),z.string().url().max(2000).refine(v=>['http:','https:'].includes(new URL(v).protocol))]);
const timestamp=z.string().datetime({offset:true}).transform(v=>new Date(v).toISOString());
export const interviewFields=z.object({
 applicationId:z.string().uuid(),kind:z.enum(['interview','written_test','hr','offer']).default('interview'),
 round:z.string().trim().min(1).max(100),startsAt:timestamp,endsAt:timestamp,
 timezone:z.literal('Asia/Shanghai').default('Asia/Shanghai'),
 state:z.enum(['scheduled','completed','cancelled']).default('scheduled'),
 outcome:z.enum(['pending','passed','failed','waiting']).default('pending'),
 format:z.enum(['online','onsite','phone']).default('online'),location:z.string().max(1000).default(''),
 meetingUrl:webUrl.default(''),interviewer:z.string().max(200).default(''),
 preparation:z.string().max(20000).default(''),questions:z.string().max(20000).default(''),review:z.string().max(20000).default(''),
}).strict();
export const interviewInput=interviewFields.refine(v=>Date.parse(v.endsAt)>Date.parse(v.startsAt),{message:'结束时间必须晚于开始时间',path:['endsAt']});
export const interviewUpdate=interviewFields.extend({version:z.number().int().positive()}).refine(v=>Date.parse(v.endsAt)>Date.parse(v.startsAt),{message:'结束时间必须晚于开始时间',path:['endsAt']});
export type Interview={id:string;ownerId?:string;applicationId:string;company:string;title:string;kind:'interview'|'written_test'|'hr'|'offer';round:string;startsAt:string;endsAt:string;timezone:string;state:'scheduled'|'completed'|'cancelled';outcome:'pending'|'passed'|'failed'|'waiting';format:'online'|'onsite'|'phone';location:string;meetingUrl:string;interviewer:string;preparation:string;questions:string;review:string;version:number;createdAt:string;updatedAt:string};
export const kindLabels={interview:'技术面试',written_test:'笔试',hr:'HR 面试',offer:'Offer 沟通'};
export const stateLabels={scheduled:'待进行',completed:'已完成',cancelled:'已取消'};
export const outcomeLabels={pending:'待反馈',passed:'通过',failed:'未通过',waiting:'候补 / 等待'};
export function localDateTime(iso:string){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso)).replace(' ','T');}
export function overlaps(a:Pick<Interview,'id'|'startsAt'|'endsAt'|'state'>,b:Pick<Interview,'id'|'startsAt'|'endsAt'|'state'>){return a.id!==b.id&&a.state==='scheduled'&&b.state==='scheduled'&&Date.parse(a.startsAt)<Date.parse(b.endsAt)&&Date.parse(b.startsAt)<Date.parse(a.endsAt);}
