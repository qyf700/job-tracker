import {z} from 'zod';
import {boundedText,CatalogError,htmlToText} from './moka';

const origin = 'https://joinbytedance.com';
const listingUrl = 'https://jobs.bytedance.com/api/v1/public/supplier/search/job/posts';
const keyword = 'Machine Learning Engineer Intern';
const city = 'CT_157';
const pageSize = 12;

export const bytedanceSource = {
  id:'bytedance-international-seattle-ml-internships',orgId:'bytedance',companyName:'字节跳动',
  entryUrl:origin+'/search?keyword='+encodeURIComponent(keyword)+'&location_code_list='+city,
};

const listing = z.object({
  id:z.string().regex(/^\d{15,22}$/),
  title:z.string().min(1).max(500),
  description:z.string().min(1).max(100000),
  requirement:z.string().nullish(),
  recruit_type:z.object({id:z.literal('202'),en_name:z.string()}),
  city_info:z.object({code:z.literal(city),en_name:z.string()}),
});
const pageSchema = z.object({
  code:z.literal(0),
  data:z.object({count:z.number().int().min(0).max(100),job_post_list:z.array(listing).max(pageSize).nullable()}),
});
const incomplete = () => new CatalogError('source_incomplete','字节跳动国际站列表或详情不完整，保留上次目录');

export async function readByteDanceJobs(fetcher:typeof fetch=fetch) {
  const deadline = Date.now()+75_000;
  async function read(url:string,init:RequestInit={}) {
    const remaining = deadline-Date.now();
    if(remaining<=0)throw new CatalogError('source_timeout','字节跳动国际站同步超时');
    const response = await fetcher(url,{...init,redirect:'manual',signal:AbortSignal.timeout(Math.min(12_000,remaining))});
    if(!response.ok){
      await response.body?.cancel();
      throw new CatalogError('source_unavailable',`字节跳动国际站返回 HTTP ${response.status}，保留上次目录`);
    }
    return boundedText(response);
  }
  const readPage = async (offset:number) => pageSchema.parse(JSON.parse(await read(listingUrl,{
    method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','Accept-Language':'en','website-path':'en',Origin:origin},
    body:JSON.stringify({keyword,limit:pageSize,offset,recruitment_id_list:['202'],location_code_list:[city],
      job_category_id_list:[],subject_id_list:[],tag_id_list:[],job_function_id_list:[]}),
  }))).data;

  async function readListing(){
    const first = await readPage(0);
    const rows = new Map<string,z.infer<typeof listing>>();
    for(let offset=0;offset<Math.max(1,first.count);offset+=pageSize){
      const page = offset===0?first:await readPage(offset);
      const items = page.job_post_list??[];
      if(page.count!==first.count||items.length!==Math.min(pageSize,first.count-offset))throw incomplete();
      for(const item of items){
        if(rows.has(item.id))throw incomplete();
        rows.set(item.id,item);
      }
    }
    return rows;
  }
  const rows = await readListing();

  const entries = [...rows.values()];
  const jobs = [];
  for(let offset=0;offset<entries.length;offset+=5){
    const batch = await Promise.allSettled(entries.slice(offset,offset+5).map(async row=>{
      const originalUrl = origin+'/search/'+row.id;
      const page = await read(originalUrl,{headers:{Accept:'text/html'}});
      const title = htmlToText(page.match(/<h2\b[^>]*>([^<]*(?:<[^>]+>[^<]*)*?)<\/h2>/i)?.[1]??'').trim();
      if(title!==htmlToText(row.title).trim())throw incomplete();
      const applyHref = 'https://jobs.bytedance.com/en/resume/'+row.id+'/apply';
      const hasApplyLink = page.includes('href="'+applyHref+'"');
      const summer = /\bsummer\b/i.test(row.title);
      return {
        externalJobId:row.id,title:row.title,department:'',locations:['西雅图 · '+row.city_info.en_name],
        employmentType:'intern',programKind:summer?'summer_internship':'unknown',graduationYear:null,graduationLabel:'',
        sourceCategory:row.recruit_type.en_name,
        jdText:[row.description,row.requirement??''].map(htmlToText).filter(Boolean).join('\n\n'),
        originalUrl,applyUrl:originalUrl,deadlineAt:null,publishedAt:null,
        availability:hasApplyLink?'accepting':'visible_unverified',
        evidence:{sourceStatus:hasApplyLink?'official_detail_apply_link':'official_detail_no_apply_link',endpoint:originalUrl},
      };
    }));
    for(const result of batch){
      if(result.status==='rejected')throw result.reason;
      jobs.push(result.value);
    }
  }
  // Search ranking may reorder equal matches between requests. Verify the complete ID set.
  const current = await readListing();
  if(current.size!==rows.size || [...rows.keys()].some(id=>!current.has(id)))throw incomplete();
  return jobs;
}
