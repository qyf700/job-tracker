import {z} from 'zod';
import {CatalogError,htmlToText} from './moka';
import {createCampusSession,readCampusJson,readCampusPages} from './campus-http';

const origin='https://campus-talent.alibaba.com';
const entry=origin+'/campus/position';
const channel='new_campus_group_official_site';
const pageSize=2;
export const alibabaSource={
  id:'alibaba-campus-hangzhou-model-evaluation',orgId:'alibaba',companyName:'阿里巴巴',entryUrl:entry,
};

const batch=z.object({id:z.number().int().positive(),name:z.string().min(1)});
const batches=z.object({graduate:z.array(batch).max(10).nullable().optional(),internship:z.array(batch).max(10).nullable().optional()});
const job=z.object({id:z.number().int().safe().positive(),name:z.string().min(1).max(500),batchId:z.number().int().positive(),status:z.string().min(1)});
const detail=job.extend({
  description:z.string().nullish(),requirement:z.string().nullish(),workLocations:z.array(z.string()).max(30),
  circleNames:z.array(z.string()).nullish(),categoryName:z.string().nullish(),
});
const listing=z.object({totalCount:z.number().int().min(0).max(50),datas:z.array(job).max(pageSize).nullable()});
const envelope=z.object({success:z.literal(true),content:z.unknown()});

export async function readAlibabaJobs(fetcher:typeof fetch=fetch){
  const request=createCampusSession(origin,'阿里巴巴校招',fetcher);
  const home=await request('/campus/position',{headers:{Accept:'text/html'}});
  // Use only the anonymous cookies issued by this official origin for this run.
  const cookies=new Map<string,string>();
  for(const value of home.headers.getSetCookie()){
    const match=/^(XSRF-TOKEN|SESSION)=([^;]+)(?:;|$)/.exec(value);
    if(match&&match[2].length<4096)cookies.set(match[1],match[2]);
  }
  await home.body?.cancel();
  const token=cookies.get('XSRF-TOKEN');
  if(!token)throw new CatalogError('source_unavailable','阿里巴巴官网未返回匿名会话，保留上次目录');
  async function read(path:string,body:object){
    return envelope.parse(await readCampusJson(await request(path,{
      method:'POST',headers:{Accept:'application/json','Content-Type':'application/json',Referer:entry,Origin:origin,
        'X-XSRF-TOKEN':token!,Cookie:[...cookies].map(([key,value])=>key+'='+value).join('; ')},
      body:JSON.stringify(body),
    }))).content;
  }
  const list=batches.parse(await read('/searchCondition/listBatch',{channel,language:'zh'}));
  const scopes=new Map<number,z.infer<typeof batch>&{employmentType:'intern'|'full_time'}>([
    ...(list.internship??[]).map(item=>[item.id,{...item,employmentType:'intern'}] as const),
    ...(list.graduate??[]).map(item=>[item.id,{...item,employmentType:'full_time'}] as const),
  ]);
  if(!scopes.size)throw new CatalogError('source_incomplete','阿里巴巴返回的招聘批次为空，保留上次目录');
  const jobs=[];
  const seen=new Set<number>();
  for(const scope of scopes.values()){
    const rows=await readCampusPages(pageSize,async pageIndex=>{
      const page=listing.parse(await read('/position/search',{
        batchId:scope.id,pageIndex,pageSize,channel,language:'zh',searchKey:'大模型评测',regions:'杭州',
      }));
      return {total:page.totalCount,items:page.datas??[]};
    },row=>String(row.id),'阿里巴巴校招');
    for(const row of rows.values()){
      if(row.batchId!==scope.id||seen.has(row.id))throw new CatalogError('source_incomplete','阿里巴巴职位批次与列表不一致');
      const result=detail.parse(await read('/position/detail',{id:row.id}));
      if(result.id!==row.id||result.name!==row.name||result.batchId!==scope.id)
        throw new CatalogError('source_changed_during_sync','阿里巴巴职位列表与详情不一致，保留上次目录');
      const jdText=[result.description??'',result.requirement??''].map(htmlToText).filter(Boolean).join('\n\n');
      if(!jdText)throw new CatalogError('source_incomplete','阿里巴巴职位详情缺少正文');
      const originalUrl=entry+'/'+row.id;
      const graduation=scope.employmentType==='full_time'?scope.name.match(/(20\d{2})届/):null;
      seen.add(row.id);
      jobs.push({
        externalJobId:String(row.id),title:result.name,department:result.circleNames?.join(' / ')??'',locations:result.workLocations,
        employmentType:scope.employmentType,programKind:/日常实习/.test(scope.name)?'daily_internship':'unknown',
        graduationLabel:graduation?.[0]??'',graduationYear:graduation?Number(graduation[1]):null,
        sourceCategory:scope.name,jdText,originalUrl,applyUrl:originalUrl,deadlineAt:null,publishedAt:null,
        availability:result.status==='recruit'?'accepting':'visible_unverified',
        evidence:{sourceStatus:result.status,batchId:scope.id,endpoint:origin+'/position/detail'},
      });
    }
  }
  return jobs;
}
