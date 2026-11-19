import {boundedText,CatalogError} from './moka';

export function createCampusSession(origin:string,label:string,fetcher:typeof fetch,timeoutMs=65_000){
  const deadline=Date.now()+timeoutMs;
  return async function request(path:string,init:RequestInit={}){
    const remaining=deadline-Date.now();
    if(remaining<=0)throw new CatalogError('source_timeout',label+'同步超时，保留上次目录');
    const response=await fetcher(origin+path,{...init,redirect:'manual',signal:AbortSignal.timeout(Math.min(12_000,remaining))});
    if(!response.ok){
      await response.body?.cancel();
      throw new CatalogError('source_unavailable',`${label}返回 HTTP ${response.status}，保留上次目录`);
    }
    return response;
  };
}

export async function readCampusJson(response:Response):Promise<unknown>{
  return JSON.parse(await boundedText(response));
}

export async function readCampusPages<T>(
  pageSize:number, read:(page:number)=>Promise<{total:number;items:T[]}>, id:(row:T)=>string, label:string,
){
  const incomplete=()=>new CatalogError('source_incomplete',label+'分页不完整，保留上次目录');
  const first=await read(1);
  const rows=new Map<string,T>();
  for(let index=1;index<=Math.max(1,Math.ceil(first.total/pageSize));index++){
    const page=index===1?first:await read(index);
    if(page.total!==first.total||page.items.length!==Math.min(pageSize,first.total-(index-1)*pageSize))throw incomplete();
    for(const row of page.items){
      const key=id(row);
      if(rows.has(key))throw incomplete();
      rows.set(key,row);
    }
  }
  return rows;
}
