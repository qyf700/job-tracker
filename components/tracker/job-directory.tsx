"use client";
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowUpRight,Bookmark,BriefcaseBusiness,Loader2,RefreshCw,Search,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Sheet,SheetClose,SheetContent,SheetDescription,SheetTitle} from '@/components/ui/sheet';
import {api} from '@/lib/tracker';
import {sameFilters, type CatalogFilters} from '@/lib/catalog/filters';
type Job={id:string;isNew?:boolean;title:string;companyName:string;locations:string[];department:string;employmentType:string;programKind:string;graduationYear:number|null;graduationLabel:string;sourceCategory:string;availability:string;publishedAt:string|null;lastVerifiedAt:string;deadlineAt:string|null;originalUrl:string;applyUrl:string;savedApplicationId:string|null;jdText?:string;evidence?:{sourceStatus?:string;reason?:string;classification?:string;graduationEvidence?:string}};
type Source={id:string;companyName:string;entryUrl:string;lastSuccessAt?:string|null;lastErrorMessage?:string|null;lastErrorAt?:string|null;running:boolean;state:string};
type Preferences={sourceIds:string[];intervalHours:number;savedFilter:{id:string;filters:CatalogFilters;viewedThrough:string}|null};
type Health={preferences:Preferences;canSchedule:boolean;sources:Source[];canSync:boolean;runs:{id:string;state:string;seenCount:number;startedAt:string;finishedAt:string|null}[]};
type Result={newCount:number;observedAt:string;companyTotals:{companyId:string;companyName:string;open:number;stale:number;lastVerifiedAt:string|null}[];items:Job[];nextCursor:string|null;sourceHealth:Health};
const labels:Record<string,string>={accepting:'官网标记开放',visible_unverified:'待核实',closed:'已关闭',stale:'数据过期',unknown:'未注明',autumn:'秋招',summer_internship:'暑期实习',daily_internship:'日常实习',other:'其他'};
function time(value:string|null|undefined){return value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'尚无成功同步';}
function message(e:unknown){return e instanceof Error?e.message:'操作失败，请重试';}
export default function JobDirectory({onSaved,onViewApplications}:{onSaved:()=>void;onViewApplications:()=>void}){
 const [result,setResult]=useState<Result|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[syncing,setSyncing]=useState(false),[saving,setSaving]=useState(''),[detail,setDetail]=useState<Job|null>(null);
 const [draftQuery,setDraftQuery]=useState(''),[q,setQ]=useState(''),[companyId,setCompany]=useState(''),[city,setCity]=useState(''),[programKind,setProgram]=useState(''),[employmentType,setEmployment]=useState(''),[graduationYear,setYear]=useState(''),[availability,setAvailability]=useState(''),[refresh,setRefresh]=useState(0);
 const generation=useRef(0), restored=useRef(false);
 const [sourceDraft,setSourceDraft]=useState<Pick<Preferences,'sourceIds'|'intervalHours'>|null>(null);
 const [updating,setUpdating]=useState(false),[newOnly,setNewOnly]=useState(false);
 const filters={q,companyId,city:city.trim(),programKind,employmentType,graduationYear,availability} as CatalogFilters;
 const savedFilter=result?.sourceHealth.preferences.savedFilter;
 const savedActive=!!savedFilter&&sameFilters(savedFilter.filters,filters);
 function applyFilters(f:CatalogFilters){
  setQ(f.q);setDraftQuery(f.q);setCompany(f.companyId);setCity(f.city);setProgram(f.programKind);
  setEmployment(f.employmentType);setYear(f.graduationYear);setAvailability(f.availability);setNewOnly(false);
 }

 function query(cursor=''){const params=new URLSearchParams({...filters,limit:'20',newOnly:newOnly&&savedActive?'1':'0'});if(cursor)params.set('cursor',cursor);return params.toString();}
 useEffect(()=>{const controller=new AbortController(),sequence=++generation.current;setLoading(true);setError('');void api<Result>('/api/jobs?'+query(),{signal:controller.signal}).then(r=>{if(sequence!==generation.current)return;
  setResult(r);
  if(!restored.current){
   restored.current=true;
   if(r.sourceHealth.preferences.savedFilter)applyFilters(r.sourceHealth.preferences.savedFilter.filters);
  }}).catch(e=>{if(!controller.signal.aborted)setError(message(e));}).finally(()=>{if(sequence===generation.current)setLoading(false);});return()=>controller.abort();},[q,companyId,city,programKind,employmentType,graduationYear,availability,newOnly,refresh]);
 const healthSignature=JSON.stringify(result?.sourceHealth.sources.map(s=>[s.id,s.lastSuccessAt,s.lastErrorAt,s.running]));
 useEffect(()=>{
  if(!result?.sourceHealth.canSchedule)return;
  const controller=new AbortController();
  async function check(){
   try {
    const health=await api<Health>('/api/companies',{signal:controller.signal});
    const latest=JSON.stringify(health.sources.map(s=>[s.id,s.lastSuccessAt,s.lastErrorAt,s.running]));
    if(latest!==healthSignature&&!controller.signal.aborted)setRefresh(v=>v+1);
   } catch { /* Keep the last catalogue while the local server is unavailable. */ }
  }
  const timer=window.setInterval(()=>void check(),15000);
  window.addEventListener('focus',check);
  return()=>{controller.abort();window.clearInterval(timer);window.removeEventListener('focus',check);};
 },[healthSignature,result?.sourceHealth.canSchedule]);

 async function updatePreferences(body:unknown,initial=false){
  setUpdating(true);setError('');setNotice('');
  try {
   const preferences=await api<Preferences>('/api/catalog/preferences',{
    method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
   });
   setResult(prev=>prev?{...prev,sourceHealth:{...prev.sourceHealth,preferences}}:prev);
   if(initial){
    setSourceDraft(null);
    setNotice('来源已保存，正在检查是否需要首次同步…');
    const {runs}=await api<{runs:{state:string;seenCount?:number}[]}>('/api/catalog/local-sync?initial=1',{method:'POST'});
    const count=runs.reduce((n,run)=>n+(run.seenCount??0),0);
    const failed=runs.filter(run=>run.state==='failed').length;
    setNotice(runs.length?`首次同步收录 ${count} 个官网岗位。${failed?` ${failed} 个来源同步失败，请查看来源状态。`:''}`:'来源已保存。同步进度可在来源列表查看。');
   } else {
    setNewOnly(false);
    setNotice((body as {action:string}).action==='filter'?'筛选已保存。此后首次收录且符合条件的岗位会标为新增。':'已标记当前筛选的新增岗位为已查看。');
   }
  } catch(e){setError(message(e));}
  finally{setUpdating(false);setRefresh(v=>v+1);}
 }
 async function more(){if(!result?.nextCursor)return;const sequence=generation.current;setLoading(true);try{const r=await api<Result>('/api/jobs?'+query(result.nextCursor));if(sequence===generation.current)setResult(prev=>({...r,items:[...(prev?.items||[]),...r.items]}));}catch(e){setError(message(e));}finally{if(sequence===generation.current)setLoading(false);}}
 async function sync(id:string){setSyncing(true);setError('');setNotice('正在从官网核验列表和每条职位详情，请稍候…');try{const r=await api<{state:string;seenCount:number}>('/api/catalog/sources/'+id+'/sync',{method:'POST'});setNotice(`同步成功，本次官网返回 ${r.seenCount} 个真实岗位。`);}catch(e){setError(message(e));setNotice('本次同步未成功，保留上次成功目录。');}finally{setSyncing(false);setRefresh(v=>v+1);}}
 async function show(job:Job){setError('');try{setDetail(await api<Job>('/api/jobs/'+encodeURIComponent(job.id)));}catch(e){setError(message(e));}}
 async function save(job:Job){setSaving(job.id);setError('');try{const r=await api<{applicationId:string}>('/api/jobs/'+encodeURIComponent(job.id)+'/save',{method:'POST'});setNotice('已加入我的申请，状态为待投递；尚未向公司提交材料。');setDetail(prev=>prev?.id===job.id?{...prev,savedApplicationId:r.applicationId}:prev);setResult(prev=>prev?{...prev,items:prev.items.map(x=>x.id===job.id?{...x,savedApplicationId:r.applicationId}:x)}:prev);onSaved();}catch(e){setError(message(e));}finally{setSaving('');}}
 function search(e:FormEvent){e.preventDefault();setQ(draftQuery.trim());}
 function clear(){setQ('');setDraftQuery('');setCompany('');setCity('');setProgram('');setEmployment('');setYear('');setAvailability('');setNewOnly(false);}
 const health=result?.sourceHealth,sourceSettings=sourceDraft??health?.preferences,hasFilters=!!(q||companyId||city||programKind||employmentType||graduationYear||availability),notSynced=health?.sources.every(s=>!s.lastSuccessAt);
 return <section className="job-directory"><div className="section-toolbar"><div><h2>发现真实岗位</h2><p>直接核验公司公开招聘页，查看职位与原文。</p></div><Button variant="outline" size="sm" onClick={onViewApplications}>我的申请</Button></div>
 {health?.canSchedule&&sourceSettings&&<section className="records-panel" aria-label="本地招聘源设置">
  <h3>自动更新来源</h3>
  <div className="catalog-filters">
   {health.sources.map(source=><label className="catalog-toggle" key={source.id}>
    <input type="checkbox" checked={sourceSettings.sourceIds.includes(source.id)} disabled={updating}
     onChange={e=>setSourceDraft({intervalHours:sourceSettings.intervalHours,sourceIds:e.target.checked?[...sourceSettings.sourceIds,source.id]:sourceSettings.sourceIds.filter(id=>id!==source.id)})}/>
    {source.companyName}
   </label>)}
  </div>
  <div className="catalog-filters">
   <label>更新频率<select value={sourceSettings.intervalHours} disabled={updating}
    onChange={e=>setSourceDraft({sourceIds:sourceSettings.sourceIds,intervalHours:Number(e.target.value)})}>
    <option value={0}>暂停定时更新</option><option value={1}>每小时</option><option value={6}>每 6 小时</option>
    <option value={12}>每 12 小时</option><option value={24}>每天</option>
   </select></label>
   <Button size="sm" disabled={updating||!sourceDraft} onClick={()=>void updatePreferences({action:'sources',settings:sourceDraft},true)}>保存来源并首次同步</Button>
  </div>
  <p className="muted-note">只自动更新已选来源。本地服务运行时会检查更新，关闭网页仍可同步。</p>
 </section>}
 {health?.sources.map(source=><div className="catalog-source" key={source.id}><div><strong>{source.companyName} · Moka 校园招聘</strong><p>最近成功核验：{time(source.lastSuccessAt)} <a href={source.entryUrl} target="_blank" rel="noreferrer">官网来源 ↗</a></p>{source.lastErrorMessage&&<small className="catalog-source-error">最近同步失败：{source.lastErrorMessage}（{time(source.lastErrorAt)}）</small>}</div>{health.canSync&&<Button size="sm" variant="outline" disabled={syncing||source.running} onClick={()=>void sync(source.id)}>{syncing?<Loader2 size={13} className="spin"/>:<RefreshCw size={13}/>} {syncing?'正在核验官网…':source.running?'同步进行中':'同步官网岗位'}</Button>}</div>)}
 {error&&<div className="error-banner" role="alert">{error}<Button size="xs" variant="outline" onClick={()=>setRefresh(v=>v+1)}>重新读取目录</Button></div>}{notice&&<div className="save-notice" role="status">{notice}</div>}
 <section className="records-panel" aria-label="企业在招情况">
  <h3>企业在招情况</h3>
  <p>仅统计已接入官网，开放数以最近 24 小时内核验结果为准。</p>
  {result?.companyTotals.map(company=><article className="catalog-source" key={company.companyId}>
   <div><strong>{company.companyName}</strong><p>{company.open} 个已核验开放 · {company.stale} 个待重新核验</p><small>最近核验 {time(company.lastVerifiedAt)}</small></div>
   <Button size="sm" variant="outline" onClick={()=>{clear();setCompany(company.companyId);setAvailability(company.open?'accepting':'');}}>查看{company.open?'开放岗位':'已收录岗位'}</Button>
  </article>)}
 </section>
 <form className="catalog-search" onSubmit={search}><Search size={15}/><input aria-label="搜索真实岗位" value={draftQuery} maxLength={100} placeholder="搜索职位名称或 JD 关键词" onChange={e=>setDraftQuery(e.target.value)}/><Button size="sm" type="submit">搜索岗位</Button></form>
 <div className="catalog-filters"><label>公司<select aria-label="岗位公司" value={companyId} onChange={e=>setCompany(e.target.value)}><option value="">全部公司</option>{result?.companyTotals.map(company=><option key={company.companyId} value={company.companyId}>{company.companyName}</option>)}</select></label><label>城市<input aria-label="岗位城市" value={city} maxLength={100} placeholder="全部城市" onChange={e=>setCity(e.target.value)}/></label><label>招聘项目<select aria-label="招聘项目" value={programKind} onChange={e=>setProgram(e.target.value)}><option value="">全部项目</option><option value="autumn">秋招</option><option value="summer_internship">暑期实习</option><option value="daily_internship">日常实习</option><option value="unknown">未注明批次</option></select></label><label>职位性质<select aria-label="职位性质" value={employmentType} onChange={e=>setEmployment(e.target.value)}><option value="">全部性质</option><option value="intern">标题或栏目注明实习</option><option value="full_time">全职</option><option value="unknown">未注明性质</option></select></label><label>毕业年份<select aria-label="毕业年份" value={graduationYear} onChange={e=>setYear(e.target.value)}><option value="">全部年份</option><option value="2027">2027</option><option value="2028">2028</option></select></label><label>有效性<select aria-label="岗位有效性" value={availability} onChange={e=>setAvailability(e.target.value)}><option value="">全部状态</option><option value="accepting">官网标记开放</option><option value="stale">数据过期</option><option value="closed">已关闭</option></select></label><Button size="xs" variant="ghost" disabled={!hasFilters} onClick={clear}>清除筛选</Button></div>
 <div className="catalog-filters" aria-label="已保存筛选">
  <Button size="sm" variant="outline" disabled={updating||loading||savedActive||draftQuery.trim()!==q} onClick={()=>void updatePreferences({action:'filter',filters})}>保存当前筛选</Button>
  {savedFilter&&<Button size="sm" variant="ghost" disabled={savedActive} onClick={()=>applyFilters(savedFilter.filters)}>载入已保存筛选</Button>}
  {savedActive&&result&&<>
   <label className="catalog-toggle"><input type="checkbox" checked={newOnly} onChange={e=>setNewOnly(e.target.checked)}/> 仅看新增（{result.newCount}）</label>
   <Button size="sm" variant="ghost" disabled={loading||updating||!result.newCount} onClick={()=>void updatePreferences({action:'viewed',filterId:savedFilter.id,through:result.observedAt})}>标记新增为已查看</Button>
  </>}
 </div>
 <p className="muted-note">“实习”不等于“暑期实习”。官网未明确的批次、年份和截止时间保留未知；超过 24 小时未核验的开放岗位标为过期。</p>
 {loading&&!result?<div className="table-empty">正在读取真实岗位目录…</div>:result&&!result.items.length?<div className="table-empty"><BriefcaseBusiness size={25}/><h3>{notSynced?'尚未取得官网岗位数据':newOnly&&savedActive?'没有新增匹配岗位':hasFilters?'没有符合筛选条件的岗位':'官网本次没有返回岗位'}</h3><p>{notSynced?'点击同步官网岗位；同步失败不会生成示例职位。':hasFilters?'可调整筛选；未标注届别的岗位不会匹配具体毕业年份。':'请查看最近成功核验时间和来源状态。'}</p>{hasFilters&&<Button size="sm" variant="outline" onClick={clear}>清除筛选条件</Button>}</div>:<div className="catalog-job-list" aria-busy={loading}>{result?.items.map(job=><article key={job.id}><div className="catalog-job-main"><button className="catalog-job-title" onClick={()=>void show(job)}>{job.title}</button><p>{job.companyName} · {job.locations.join(' / ')||'地点未注明'} · {job.department||'部门未注明'}</p><div className="catalog-badges">{savedActive&&job.isNew&&<span className="badge job-accepting">新增匹配</span>}<span className={`badge job-${job.availability}`}>{labels[job.availability]}</span><span className="badge">批次：{labels[job.programKind]}</span>{job.graduationLabel&&<span className="badge">官网标题：{job.graduationLabel}</span>}<span className="muted-note">核验 {time(job.lastVerifiedAt)}</span></div></div><div className="catalog-job-actions"><Button size="xs" variant="outline" onClick={()=>void show(job)}>查看职位</Button><Button size="xs" variant="ghost" disabled={saving===job.id||!!job.savedApplicationId} onClick={()=>void save(job)}><Bookmark size={12}/>{job.savedApplicationId?'已加入申请':'加入待投递'}</Button><a className="small-link" href={job.originalUrl} target="_blank" rel="noreferrer">官网 <ArrowUpRight size={12}/></a></div></article>)}</div>}
 {result?.nextCursor&&<Button size="sm" variant="outline" disabled={loading} onClick={()=>void more()}>{loading?'读取中…':'加载更多岗位'}</Button>}
 <Sheet open={!!detail} onOpenChange={v=>{if(!v)setDetail(null);}}><SheetContent className="detail-sheet job-detail" showCloseButton={false}><div className="drawer-header"><div><SheetTitle>{detail?.title}</SheetTitle><SheetDescription>{detail?.companyName} · {detail?.locations.join(' / ')}</SheetDescription></div><SheetClose asChild><Button size="icon-sm" variant="ghost" aria-label="关闭职位详情"><X size={17}/></Button></SheetClose></div>{detail&&<div className="drawer-fields"><div className="catalog-badges"><span className="badge">{labels[detail.availability]}</span><span className="badge">批次：{labels[detail.programKind]}</span></div><dl className="job-facts"><div><dt>官网栏目</dt><dd>{detail.sourceCategory||'未注明'}</dd></div><div><dt>毕业届别</dt><dd>{detail.graduationLabel||'未注明'}{!detail.graduationYear&&detail.graduationLabel?'（按原文保留，不补齐年份）':''}</dd></div><div><dt>截止时间</dt><dd>{detail.deadlineAt?time(detail.deadlineAt):'官网未注明'}</dd></div><div><dt>最近核验</dt><dd>{time(detail.lastVerifiedAt)}</dd></div></dl><h3>职位描述</h3><div className="job-jd">{detail.jdText||'官网未提供职位正文'}</div><div className="info-banner">开放状态依据官网详情 status 字段；不代表你符合资格或已提交申请。正式投递前仍需复核官网要求。</div><div className="catalog-job-actions"><a className="download-button" href={detail.originalUrl} target="_blank" rel="noreferrer">查看官网原文 ↗</a><Button size="sm" disabled={!!detail.savedApplicationId||saving===detail.id} onClick={()=>void save(detail)}>{detail.savedApplicationId?'已加入待投递':'加入我的待投递'}</Button></div><p className="muted-note">可收藏岗位，并在投递台账记录实际进度。{detail.evidence?.reason==='absent_from_complete_public_list'?'此岗位已不在最近完整官网列表中。':''}</p></div>}</SheetContent></Sheet>
 </section>;
}
