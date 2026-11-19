import {z} from 'zod';
import {CatalogError, htmlToText} from './moka';
import {createCampusSession,readCampusJson,readCampusPages} from './campus-http';

const origin='https://zhaopin.meituan.com';
const entry=origin+'/web/campus';
const pageSize=10;
export const meituanSource={
  id:'meituan-campus-beijing-longcat',orgId:'meituan',companyName:'美团',
  entryUrl:entry,
};
const job=z.object({
  jobUnionId:z.string().regex(/^\d{5,20}$/),name:z.string().min(1).max(500),
  jobType:z.enum(['1','2']),jobStatus:z.enum(['000','001']),
});
const names=z.array(z.object({name:z.string().nullish()})).nullish();
const detail=job.extend({
  jobDuty:z.string().nullish(),jobRequirement:z.string().nullish(),desc:z.string().nullish(),
  department:names,cityList:names,projectName:z.string().nullish(),jobFamily:z.string().nullish(),
  firstPostTime:z.number().int().positive().nullish(),expiredTime:z.number().int().positive().nullish(),
});
const envelope=z.object({status:z.literal(1),data:z.unknown()});
const pageSchema=z.object({
  page:z.object({pageNo:z.number().int(),totalCount:z.number().int().min(0).max(100)}),
  list:z.array(job).max(pageSize).nullable(),
});
export async function readMeituanJobs(fetcher:typeof fetch=fetch){
  const request=createCampusSession(origin,'美团校招',fetcher);
  async function read(path:string,body:object){
    return envelope.parse(await readCampusJson(await request('/api/official/job/'+path,{
      method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json',Origin:origin,Referer:entry},
      body:JSON.stringify(body),
    }))).data;
  }
  const rows=await readCampusPages(pageSize,async pageNo=>{
    const page=pageSchema.parse(await read('getJobList',{
      page:{pageNo,pageSize},jobShareType:'1',keywords:'LongCat',cityList:[{code:'001001',name:'北京市'}],
      department:[],jobType:[{code:'1',subCode:[]},{code:'2',subCode:[]}],
    }));
    if(page.page.pageNo!==pageNo)throw new CatalogError('source_incomplete','美团返回了不同页码');
    return {total:page.page.totalCount,items:page.list??[]};
  },row=>row.jobUnionId,'美团校招');
  const entries=[...rows.values()];
  const jobs=[];
  for(let offset=0;offset<entries.length;offset+=5){
    const batch=await Promise.allSettled(entries.slice(offset,offset+5).map(async row=>{
      const result=detail.parse(await read('getJobDetail',{jobUnionId:row.jobUnionId}));
      if(result.jobUnionId!==row.jobUnionId||result.name!==row.name||result.jobType!==row.jobType)
        throw new CatalogError('source_changed_during_sync','美团职位列表与详情不一致，保留上次目录');
      const jdText=[result.jobDuty||result.desc||'',result.jobRequirement??''].map(htmlToText).filter(Boolean).join('\n\n');
      if(!jdText)throw new CatalogError('source_incomplete','美团职位详情缺少正文');
      const originalUrl=origin+'/web/position/detail?jobUnionId='+row.jobUnionId+'&jobShareType=1&highlightType=campus';
      return {
        externalJobId:row.jobUnionId,title:result.name,department:result.department?.map(item=>item.name).filter(Boolean).join(' / ')??'',
        locations:(result.cityList??[]).map(item=>item.name).filter((name):name is string=>!!name),
        employmentType:result.jobType==='2'?'intern':'full_time',programKind:'unknown',graduationLabel:'',graduationYear:null,
        sourceCategory:result.projectName||result.jobFamily||'',jdText,originalUrl,applyUrl:originalUrl,
        availability:result.jobStatus==='000'&&(!result.expiredTime||result.expiredTime>Date.now())?'accepting':'closed',
        publishedAt:result.firstPostTime?new Date(result.firstPostTime).toISOString():null,
        deadlineAt:result.expiredTime?new Date(result.expiredTime).toISOString():null,
        evidence:{sourceStatus:result.jobStatus,endpoint:origin+'/api/official/job/getJobDetail'},
      };
    }));
    for(const result of batch){
      if(result.status==='rejected')throw result.reason;
      jobs.push(result.value);
    }
  }
  return jobs;
}
