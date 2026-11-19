import {z} from 'zod';
import {boundedText,CatalogError,htmlToText} from './moka';

const origin = 'https://join.qq.com';
const keywords = ['AI全栈','后端开发'];
const pageSize = 2;
export const tencentSource = {
  id:'tencent-campus-ai-backend',orgId:'tencent',companyName:'腾讯',
  entryUrl:origin+'/post.html',
};

const postId = z.string().regex(/^\d{12,22}$/);
const listing = z.object({
  postId, positionTitle:z.string().min(1).max(500), projectName:z.string(),
});
const pageSchema = z.object({
  count:z.number().int().min(0).max(100),
  positionList:z.array(listing).max(pageSize).nullable(),
});
const detailSchema = z.object({
  postId, title:z.string().min(1).max(500), projectName:z.string(), tidName:z.string().nullish(),
  workCityList:z.array(z.string()).max(40), desc:z.string().nullish(), request:z.string().nullish(),
  topicDetail:z.string().nullish(), topicRequirement:z.string().nullish(),
});
const partial = () => new CatalogError('source_incomplete','腾讯校招列表或详情不完整，保留上次目录');

export async function readTencentJobs(fetcher:typeof fetch=fetch) {
  const deadline = Date.now()+50_000;
  async function request(path:string,body?:object) {
    const remaining = deadline-Date.now();
    if(remaining<=0)throw new CatalogError('source_timeout','腾讯校招同步超时');
    const response = await fetcher(origin+'/api/v1/'+path,{
      method:body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(Math.min(10_000,remaining)),
      headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    if(!response.ok){
      await response.body?.cancel();
      throw new CatalogError('source_unavailable',`腾讯校招返回 HTTP ${response.status}，保留上次目录`);
    }
    const result = z.object({status:z.literal(0),data:z.unknown()}).parse(JSON.parse(await boundedText(response)));
    return result.data;
  }
  const readPage = async (keyword:string,pageIndex:number) => pageSchema.parse(await request('position/searchPosition',{
    projectIdList:[],projectMappingIdList:[],keyword,bgList:[],workCountryType:1,workCityList:[],
    recruitCityList:[],positionFidList:[],pageIndex,pageSize,
  }));
  const union = new Map<string,z.infer<typeof listing>>();
  for(const keyword of keywords){
    const first = await readPage(keyword,1);
    const seen = new Set<string>();
    for(let pageIndex=1;pageIndex<=Math.max(1,Math.ceil(first.count/pageSize));pageIndex++){
      const page = pageIndex===1?first:await readPage(keyword,pageIndex);
      const rows = page.positionList??[];
      if(page.count!==first.count||rows.length!==Math.min(pageSize,first.count-(pageIndex-1)*pageSize))throw partial();
      for(const row of rows){
        if(seen.has(row.postId))throw partial();
        seen.add(row.postId);
        union.set(row.postId,row);
      }
    }
  }
  const jobs = [];
  for(const row of union.values()){
    const endpoint = 'jobDetails/getJobDetailsByPostId?postId='+row.postId;
    const detail = detailSchema.parse(await request(endpoint));
    if(detail.postId!==row.postId||detail.title!==row.positionTitle||detail.projectName!==row.projectName)throw partial();
    const jdText = [detail.desc?.trim()||detail.topicDetail,detail.request?.trim()||detail.topicRequirement]
      .filter((part):part is string=>!!part).map(htmlToText).filter(Boolean).join('\n\n');
    if(!jdText)throw partial();
    const originalUrl = origin+'/post_detail.html?postid='+row.postId;
    const employmentType = /实习/.test(detail.projectName)?'intern':/应届|毕业生|校招/.test(detail.projectName)?'full_time':'unknown';
    jobs.push({
      externalJobId:row.postId,title:detail.title,department:detail.tidName??'',locations:detail.workCityList,
      employmentType,programKind:'unknown',graduationYear:null,graduationLabel:'',sourceCategory:detail.projectName,
      jdText,originalUrl,applyUrl:originalUrl,deadlineAt:null,publishedAt:null,availability:'accepting',
      evidence:{sourceStatus:'listed_with_public_detail',endpoint:origin+'/api/v1/'+endpoint},
    });
  }
  return jobs;
}
