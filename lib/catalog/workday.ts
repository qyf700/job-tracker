import {z} from 'zod';
import {boundedText, CatalogError, htmlToText} from './moka';

const origin = 'https://nvidia.wd5.myworkdayjobs.com';
const site = 'NVIDIAExternalCareerSite';
const apiPath = '/wday/cxs/nvidia/' + site;
export const nvidiaSource = {
  id: 'nvidia-workday-china-internships',
  orgId: 'nvidia',
  companyName: 'NVIDIA',
  entryUrl: `${origin}/${site}?locationHierarchy1=2fcb99c455831013ea529fe151e3323c&workerSubType=0c40f6bd1d8f10adf6dae42e46d44a17`,
};

const pageSize = 20;
const pageSchema = z.object({
  total:z.number().int().min(0).max(200),
  jobPostings:z.array(z.object({
    title:z.string().min(1).max(500),
    externalPath:z.string().regex(/^\/job\/[A-Za-z0-9_%.-]+\/[A-Za-z0-9_%.,()-]+_JR\d+(?:-\d+)?$/),
    bulletFields:z.array(z.string()).min(1),
  })).max(pageSize),
});
type ListJob = z.infer<typeof pageSchema>['jobPostings'][number];
const detailSchema = z.object({jobPostingInfo:z.object({
  title:z.string().min(1).max(500),
  jobReqId:z.string().regex(/^JR\d+$/),
  jobPostingId:z.string(),
  jobPostingSiteId:z.literal(site),
  jobDescription:z.string().min(1).max(100000),
  location:z.string().min(1),
  additionalLocations:z.array(z.string()).max(30).optional(),
  startDate:z.string().date().optional(),
  externalUrl:z.string(),
  posted:z.boolean(),
  canApply:z.boolean(),
})});

const cityNames:Record<string,string> = {
  'China, Beijing':'北京', 'China, Shanghai':'上海', 'China, Shenzhen':'深圳',
};
const incomplete = () => new CatalogError('source_incomplete','Workday 职位列表未完整读取，保留上次目录');

function normalizeDetail(raw:unknown,row:ListJob) {
  const job = detailSchema.parse(raw).jobPostingInfo;
  const originalUrl = origin + '/' + site + row.externalPath;
  if(job.title!==row.title || !row.bulletFields.includes(job.jobReqId)
    || row.externalPath.split('/').at(-1)!==job.jobPostingId || job.externalUrl!==originalUrl) {
    throw new CatalogError('source_changed_during_sync','Workday 列表与详情不一致，请重试同步');
  }
  const officialLocations = [...new Set([job.location,...job.additionalLocations??[]])];
  if(!officialLocations.some(location=>location.startsWith('China, '))) {
    throw new CatalogError('source_shape_changed','Workday 详情与中国地区筛选不匹配');
  }
  const locations = officialLocations.map(location=>cityNames[location] ? cityNames[location]+' · '+location : location);
  return {
    externalJobId: job.jobReqId, title:job.title, department:'', locations, employmentType:'intern',
    programKind:'unknown', graduationYear:null, graduationLabel:'', sourceCategory:'Intern (Fixed Term)',
    jdText:htmlToText(job.jobDescription), originalUrl, applyUrl:originalUrl,
    deadlineAt:null, publishedAt:job.startDate ? job.startDate+'T00:00:00.000Z' : null,
    availability:job.posted&&job.canApply?'accepting':'closed',
    evidence:{posted:job.posted,canApply:job.canApply,endpoint:origin+apiPath+row.externalPath,officialLocations},
  };
}

export async function readNvidiaJobs(fetcher:typeof fetch=fetch) {
  const deadline = Date.now()+65_000;
  async function read(path:string,body?:object) {
    const remaining = deadline-Date.now();
    if(remaining<=0)throw new CatalogError('source_timeout','Workday 同步超过时间预算，保留上次目录');
    const response = await fetcher(origin+apiPath+path,{
      method:body?'POST':'GET', redirect:'manual', signal:AbortSignal.timeout(Math.min(12_000,remaining)),
      headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    if(!response.ok){
      await response.body?.cancel();
      throw new CatalogError('source_unavailable',`Workday 返回 HTTP ${response.status}，保留上次目录`);
    }
    return JSON.parse(await boundedText(response)) as unknown;
  }
  const readPage = async (offset:number) => pageSchema.parse(await read('/jobs',{
    appliedFacets:{locationHierarchy1:['2fcb99c455831013ea529fe151e3323c'],workerSubType:['0c40f6bd1d8f10adf6dae42e46d44a17']},
    searchText:'',limit:pageSize,offset,
  }));
  const first = await readPage(0);
  const seen = new Map<string,ListJob>();
  for(let offset=0;offset<Math.max(first.total,1);offset+=pageSize) {
    const page = offset===0?first:await readPage(offset);
    // Workday supplies the result total on page zero and may return zero thereafter.
    if((page.total!==0&&page.total!==first.total)||page.jobPostings.length!==Math.min(pageSize,first.total-offset))throw incomplete();
    for(const job of page.jobPostings) {
      if(seen.has(job.externalPath))throw incomplete();
      seen.set(job.externalPath,job);
    }
  }
  const rows = [...seen.values()];
  const jobs:ReturnType<typeof normalizeDetail>[] = [];
  const requisitions = new Set<string>();
  for(let offset=0;offset<rows.length;offset+=4) {
    const group = await Promise.allSettled(rows.slice(offset,offset+4).map(async row=>normalizeDetail(await read(row.externalPath),row)));
    for(const result of group) {
      if(result.status==='rejected')throw result.reason;
      if(requisitions.has(result.value.externalJobId))throw incomplete();
      requisitions.add(result.value.externalJobId);
      jobs.push(result.value);
    }
  }
  const current = await readPage(0);
  if(current.total!==first.total || current.jobPostings.map(job=>job.externalPath).join('\n')!==first.jobPostings.map(job=>job.externalPath).join('\n'))throw incomplete();
  return jobs;
}
