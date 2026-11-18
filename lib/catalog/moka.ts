import {z} from 'zod';
export const SOURCE_ID='zhihu-moka-campus';
export const ENTRY_URL='https://app.mokahr.com/campus_apply/zhihu/3818';
export const zhihuSource={id:SOURCE_ID,orgId:'zhihu',siteId:'3818',companyName:'知乎',entryUrl:ENTRY_URL};
export const mokaSources=[
 {id:'ztgame-moka-campus',orgId:'ztgame',siteId:'92438',companyName:'巨人网络',entryUrl:'https://app.mokahr.com/campus-recruitment/ztgame/92438'},
 {id:'tuhu-moka-campus',orgId:'tuhu',siteId:'28398',companyName:'途虎养车',entryUrl:'https://app.mokahr.com/campus-recruitment/tuhu/28398'},
 {id:'step-moka-campus',orgId:'step',siteId:'94905',companyName:'阶跃星辰',entryUrl:'https://app.mokahr.com/campus-recruitment/step/94905'},zhihuSource,{id:'xunlei-moka-campus',orgId:'xunlei',siteId:'26600',companyName:'迅雷',entryUrl:'https://app.mokahr.com/campus_apply/xunlei/26600'},{id:'luster-moka-campus',orgId:'lusterinc',siteId:'44882',companyName:'凌云光',entryUrl:'https://app.mokahr.com/campus_apply/lusterinc/44882'},
 {id:'shengqu-moka-campus',orgId:'shengqu',siteId:'96336',companyName:'盛趣游戏',entryUrl:'https://app.mokahr.com/campus-recruitment/shengqu/96336'},
 {id:'agora-moka-campus',orgId:'agora',siteId:'4789',companyName:'声网',entryUrl:'https://app.mokahr.com/campus_apply/agora/4789'},
 {id:'sohu-moka-campus',orgId:'sohu',siteId:'5682',companyName:'搜狐',entryUrl:'https://app.mokahr.com/campus-recruitment/sohu/5682'},
 {id:'aobi-moka-campus',orgId:'aobi',siteId:'25016',companyName:'百奥家庭互动',entryUrl:'https://app.mokahr.com/campus_apply/aobi/25016'},
];
const ORIGIN='https://app.mokahr.com';
const API='/api/outer/ats-apply/website/';
export class CatalogError extends Error{
 code:string;status:number;
 constructor(code:string,message:string,status=502){super(message);this.code=code;this.status=status;}
}
export function decodeEntities(value:string){return value.replace(/&(#x[0-9a-f]+|#\d+|quot|amp|lt|gt|apos|nbsp);/gi,(_,key:string)=>{
 if(key[0]==='#'){const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}
 return ({quot:'"',amp:'&',lt:'<',gt:'>',apos:"'",nbsp:' '} as Record<string,string>)[key.toLowerCase()];});}
export function htmlToText(value:string){return decodeEntities(value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<\s*(?:br\b[^>]*|\/(?:p|div|li|h[1-6]))\s*>/gi,'\n').replace(/<[^>]*>/g,'')).replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();}
export function parseBootstrap(html:string,source=zhihuSource){
 const input=html.match(/<input\b[^>]*\bid=["']init-data["'][^>]*>/i)?.[0];
 const raw=input?.match(/\bvalue="([^"]*)"/i)?.[1];if(!raw)throw new CatalogError('source_shape_changed','官网数据结构已变化，保留上次目录');
 const parsed=z.object({org:z.object({id:z.literal(source.orgId)}),siteId:z.union([z.literal(source.siteId),z.literal(Number(source.siteId))]),aesIv:z.string().length(16)}).safeParse(JSON.parse(decodeEntities(raw)));
 if(!parsed.success)throw new CatalogError('source_shape_changed','官网身份或数据结构不符合已核验来源');return parsed.data;
}
export async function decodeEnvelope(envelope:unknown,iv:string){
 let value=envelope;
 if(envelope&&typeof envelope==='object'&&'necromancer'in envelope){
  const e=z.object({data:z.string().max(3_000_000),necromancer:z.string().length(16)}).parse(envelope);
  const bytes=Uint8Array.from(atob(e.data),c=>c.charCodeAt(0)),encoder=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',encoder.encode(e.necromancer),'AES-CBC',false,['decrypt']);
  value=JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-CBC',iv:encoder.encode(iv)},key,bytes)));
 }
 const response=z.object({code:z.number(),success:z.boolean().optional(),data:z.unknown()}).safeParse(value);
 if(!response.success||response.data.code!==0||response.data.success===false)throw new CatalogError('source_rejected','官网没有返回有效的公开岗位结果');return response.data.data;
}
const jobSchema=z.object({id:z.string().uuid(),orgId:z.string(),title:z.string().min(1).max(500),status:z.enum(['open','closed']),jobDescription:z.string().max(100000).optional(),department:z.object({name:z.string().max(500)}).nullable().optional(),zhineng:z.object({name:z.string().max(500)}).nullable().optional(),locations:z.array(z.object({cityName:z.string().optional(),provinceName:z.string().optional()})).max(30).default([]),publishedAt:z.string().nullable().optional()});
export function normalizeJob(raw:unknown,source=zhihuSource){
 const job=jobSchema.parse(raw);if(job.orgId!==source.orgId||job.jobDescription===undefined)throw new CatalogError('source_shape_changed','岗位详情缺少职位正文，未覆盖现有目录');
 const locations=[...new Set(job.locations.map(l=>[l.provinceName,l.cityName].filter(Boolean).join('·')).filter(Boolean))];
 const programText=job.title+' '+(job.zhineng?.name||'');
 const explicitPrograms=[[/暑期实习/,'summer_internship'],[/日常实习/,'daily_internship'],[/秋招|秋季校园招聘/,'autumn']] as const;
 const programs=explicitPrograms.filter(([pattern])=>pattern.test(programText));
 const programKind=programs.length===1?programs[0][1]:'unknown';
 const graduation=job.title.match(/((?:20\d{2}|\d{2})届)/)?.[1]||'';
 return {externalJobId:job.id,title:job.title,department:job.department?.name||'',locations,employmentType:/实习/.test(job.title+' '+(job.zhineng?.name||''))?'intern':'unknown',
  programKind,graduationYear:graduation.length===5?Number(graduation.slice(0,4)):null,graduationLabel:graduation,sourceCategory:job.zhineng?.name||'',jdText:htmlToText(job.jobDescription),
  originalUrl:`${source.entryUrl}#/job/${job.id}`,applyUrl:`${source.entryUrl}#/job/${job.id}/apply`,deadlineAt:null,publishedAt:job.publishedAt?new Date(job.publishedAt.includes('Z')||/[+-]\d\d:\d\d$/.test(job.publishedAt)?job.publishedAt:job.publishedAt+'+08:00').toISOString():null,
  availability:job.status==='open'?'accepting':'closed',evidence:{sourceStatus:job.status,endpoint:ORIGIN+API+'job',orgId:source.orgId,siteId:source.siteId,classification:programKind==='unknown'?'招聘批次未知；职位名称和官网栏目按原文保留':'职位名称或官网栏目明确标注批次',graduationEvidence:graduation?`标题标注${graduation}；两位年份不补齐世纪`:null}};
}
async function boundedText(response:Response){
 const reader=response.body?.getReader();if(!reader)throw new CatalogError('source_empty','官网响应为空');const chunks:Uint8Array[]=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>2*1024*1024){await reader.cancel();throw new CatalogError('source_too_large','官网响应超过同步上限');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(bytes);
}
// Only fresh anonymous session cookies returned for this fixed public origin are used.
// No user session/candidate cookie or credential is accepted from the caller.
export function createPublicSession(fetcher:typeof fetch=fetch,source=zhihuSource){
 const cookies=new Map<string,string>();const deadline=Date.now()+50000;
 return async function request(path:string,body?:unknown){
  if(path!==new URL(source.entryUrl).pathname&&![API+'jobs',API+'job'].includes(path))throw new CatalogError('source_not_allowed','非白名单来源');
  const url=ORIGIN+path;
  for(let hop=0;hop<4;hop++){
   const remaining=deadline-Date.now();if(remaining<=0)throw new CatalogError('source_timeout','官网同步超时，保留上次目录');
   const response=await fetcher(url,{method:body===undefined?'GET':'POST',headers:{Accept:body===undefined?'text/html':'application/json',...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookies.size?{Cookie:[...cookies].map(([name,value])=>`${name}=${value}`).join('; ')}:{})},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(Math.min(10000,remaining))});
   for(const line of response.headers.getSetCookie()){const match=/^([^=]+)=([^;]*)/.exec(line);if(match&&['acw_tc','csrfCk','locale','moka-apply','connect.sid'].includes(match[1])&&match[2].length<4096)cookies.set(match[1],match[2]);}
   if([301,302,303,307,308].includes(response.status)){const target=new URL(response.headers.get('location')||'',url);await response.body?.cancel();if(target.href!==url||body!==undefined)throw new CatalogError('source_redirected','官网发生未核验的重定向');continue;}
   if(!response.ok){await response.body?.cancel();throw new CatalogError('source_http_error',`官网返回HTTP ${response.status}，保留上次目录`);}
   return boundedText(response);
  }
  throw new CatalogError('source_redirect_loop','官网需要额外验证，暂停同步');
 };
}
export async function readZhihuJobs(fetcher:typeof fetch=fetch,source=zhihuSource){
 const request=createPublicSession(fetcher,source);const boot=parseBootstrap(await request(new URL(source.entryUrl).pathname),source);
 const read=async(path:string,body:unknown)=>decodeEnvelope(JSON.parse(await request(API+path,body)),boot.aesIv);
 const seen=new Map<string,z.infer<typeof jobSchema>>();let total:number|undefined;
 for(let page=0;page<10;page++){
  const result=z.object({jobStats:z.object({orgId:z.literal(source.orgId),total:z.number().int().min(0).max(200)}),jobs:z.array(jobSchema).max(20)}).parse(await read('jobs',{orgId:source.orgId,siteId:source.siteId,site:'campus',needStat:true,limit:20,offset:page*20}));
  if(total!==undefined&&total!==result.jobStats.total)throw new CatalogError('source_changed_during_sync','官网列表同步期间发生变化，请重新同步');total=result.jobStats.total;
  for(const row of result.jobs){if(seen.has(row.id))throw new CatalogError('source_duplicate_page','官网分页重复，未关闭或覆盖旧岗位');seen.set(row.id,row);}
  if(seen.size===total)break;if(result.jobs.length<20)throw new CatalogError('source_incomplete','官网返回的列表不完整，保留上次目录');
 }
 if(seen.size!==total)throw new CatalogError('source_incomplete','官网分页未完整读取');
 const entries=[...seen];
 const jobs=[];
 // Keep the number of simultaneous upstream connections bounded.
 for(let offset=0;offset<entries.length;offset+=5){
  const group=await Promise.allSettled(entries.slice(offset,offset+5).map(async ([id,row])=>{
   const detail=jobSchema.parse(await read('job',{orgId:source.orgId,siteId:source.siteId,jobId:id}));
   if(detail.id!==id||detail.title!==row.title||detail.status!==row.status){
    throw new CatalogError('source_changed_during_sync','列表与详情不一致，请重试同步');
   }
   return normalizeJob(detail,source);
  }));
  for(const result of group){
   if(result.status==='rejected')throw result.reason;
   jobs.push(result.value);
  }
 }
 return jobs;
}

// Revalidate only the selected job; candidate material is never sent upstream.
export async function revalidateZhihuJob(id:string){
 z.string().uuid().parse(id);const request=createPublicSession();const boot=parseBootstrap(await request(new URL(ENTRY_URL).pathname));
 const detail=await decodeEnvelope(JSON.parse(await request(API+'job',{orgId:'zhihu',siteId:'3818',jobId:id})),boot.aesIv);const normalized=normalizeJob(detail);
 if(normalized.externalJobId!==id)throw new CatalogError('source_changed_during_sync','官网返回的目标岗位不一致');return normalized;
}
