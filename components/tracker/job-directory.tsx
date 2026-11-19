"use client";
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowUpRight,Bookmark,BriefcaseBusiness,Loader2,RefreshCw,Search,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Sheet,SheetClose,SheetContent,SheetDescription,SheetTitle} from '@/components/ui/sheet';
import {api,statusLabels,type Status} from '@/lib/tracker';
import {sameFilters, type CatalogFilters} from '@/lib/catalog/filters';
type ApplicationProgress={applicationId:string;status:Status;appliedAt:string|null;archivedAt:string|null;hasInterview:boolean};
function progressLabel(progress:ApplicationProgress){
 if(progress.archivedAt)return '已归档';
 if(progress.status==='saved')return progress.appliedAt?'已投递':'已收藏';
 if(progress.status==='in_progress'&&progress.hasInterview)return '面试中';
 return statusLabels[progress.status];
}
type Job={applicationProgress:ApplicationProgress|null;id:string;isNew?:boolean;firstSeenAt:string;reopenedAt:string|null;closedAt:string|null;title:string;companyName:string;locations:string[];department:string;employmentType:string;programKind:string;graduationYear:number|null;graduationLabel:string;sourceCategory:string;availability:string;publishedAt:string|null;lastVerifiedAt:string;deadlineAt:string|null;originalUrl:string;applyUrl:string;savedApplicationId:string|null;jdText?:string;evidence?:{sourceStatus?:string;reason?:string;classification?:string;graduationEvidence?:string}};
type SyncRun={id:string;state:string;seenCount:number;startedAt:string;finishedAt:string|null};
type Source={label:string;id:string;companyId:string;companyName:string;entryUrl:string;lastSuccessAt:string|null;lastErrorMessage:string|null;lastErrorAt:string|null;running:boolean;selected:boolean;nextUpdateAt:string|null;due:boolean;latestRun:SyncRun|null};
type SavedFilter={id:string;name:string;revision:number;filters:CatalogFilters;viewedThrough:string;subscribedAt:string|null};
type Preferences={sourceIds:string[];intervalHours:number;activeFilterId:string|null;savedFilters:SavedFilter[]};
type Health={preferences:Preferences;canSchedule:boolean;autoRefresh:boolean;sources:Source[];canSync:boolean};
type Company={companyId:string;companyName:string;open:number;intern:number;autumn:number;recent:number;matching:number;stale:number;firstSeenAt:string|null;lastVerifiedAt:string|null};
const discoveryStorageKey="job-tracker.company-discovery.viewed";
type Result={discoverySince:string;newCount:number;filterCounts:{id:string;newCount:number}[];observedAt:string;companyTotals:Company[];items:Job[];nextCursor:string|null;sourceHealth:Health};
const labels:Record<string,string>={accepting:'官网标记开放',visible_unverified:'待核实',closed:'已关闭',stale:'数据过期',unknown:'未注明',autumn:'秋招',summer_internship:'暑期实习',daily_internship:'日常实习',other:'其他'};
function time(value:string|null|undefined){return value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'尚无成功同步';}
function message(e:unknown){return e instanceof Error?e.message:'操作失败，请重试';}
export default function JobDirectory({onSaved,onViewApplications,jobRequest}:{onSaved:()=>void;onViewApplications:()=>void;jobRequest:{id:string}|null}){
 const [result,setResult]=useState<Result|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[syncing,setSyncing]=useState<string|null>(null),[saving,setSaving]=useState(''),[detail,setDetail]=useState<Job|null>(null);
 useEffect(()=>{
  if(!jobRequest)return;
  const controller=new AbortController();
  void api<Job>('/api/jobs/'+encodeURIComponent(jobRequest.id),{signal:controller.signal})
   .then(job=>{if(!controller.signal.aborted)setDetail(job);})
   .catch(e=>{if(!controller.signal.aborted)setError(message(e));});
  return()=>controller.abort();
 },[jobRequest]);
 const [draftQuery,setDraftQuery]=useState(''),[q,setQ]=useState(''),[companyId,setCompany]=useState(''),[city,setCity]=useState(''),[programKind,setProgram]=useState(''),[employmentType,setEmployment]=useState(''),[graduationYear,setYear]=useState(''),[availability,setAvailability]=useState(''),[refresh,setRefresh]=useState(0);
 const generation=useRef(0), restored=useRef(false);
 const [discoverySince,setDiscoverySince]=useState('');
 useEffect(()=>{
  try{
   const value=localStorage.getItem(discoveryStorageKey);
   if(value&&Number.isFinite(Date.parse(value)))setDiscoverySince(new Date(value).toISOString());
  }catch{/* The current session still supports marking discoveries as viewed. */}
 },[]);
 const [sourceDraft,setSourceDraft]=useState<Pick<Preferences,'sourceIds'|'intervalHours'>|null>(null);
 const [updating,setUpdating]=useState(false),[newOnly,setNewOnly]=useState(false);
 const filters={q,companyId,city:city.trim(),programKind,employmentType,graduationYear,availability} as CatalogFilters;
 const [filterName,setFilterName]=useState(''),[confirmDelete,setConfirmDelete]=useState(false);
 const preferences=result?.sourceHealth.preferences;
 const savedFilter=preferences?.savedFilters.find(filter=>filter.id===preferences.activeFilterId);
 const savedActive=!!savedFilter&&sameFilters(savedFilter.filters,filters);
 function applyFilters(f:CatalogFilters){
  setQ(f.q);setDraftQuery(f.q);setCompany(f.companyId);setCity(f.city);setProgram(f.programKind);
  setEmployment(f.employmentType);setYear(f.graduationYear);setAvailability(f.availability);setNewOnly(false);
 }

 function query(cursor=''){const params=new URLSearchParams({...filters,limit:'20',sort:'recent',newOnly:newOnly&&savedActive?'1':'0'});if(discoverySince)params.set('discoverySince',discoverySince);if(savedFilter)params.set('filterId',savedFilter.id);if(cursor)params.set('cursor',cursor);return params.toString();}
 useEffect(()=>{const controller=new AbortController(),sequence=++generation.current;setLoading(true);setError('');void api<Result>('/api/jobs?'+query(),{signal:controller.signal}).then(r=>{if(sequence!==generation.current)return;
  setResult(r);
  if(!restored.current){
   restored.current=true;
   const pref=r.sourceHealth.preferences;
   const saved=pref.savedFilters.find(filter=>filter.id===pref.activeFilterId);
   if(saved){applyFilters(saved.filters);setFilterName(saved.name);}
  }}).catch(e=>{if(!controller.signal.aborted)setError(message(e));}).finally(()=>{if(sequence===generation.current)setLoading(false);});return()=>controller.abort();},[q,companyId,city,programKind,employmentType,graduationYear,availability,newOnly,savedFilter?.id,discoverySince,refresh]);
 const healthSignature=JSON.stringify(result?.sourceHealth.sources.map(s=>[s.id,s.lastSuccessAt,s.lastErrorAt,s.running,s.latestRun?.id,s.due]));
 useEffect(()=>{
  if(!result?.sourceHealth.autoRefresh)return;
  const controller=new AbortController();
  async function check(){
   try {
    const health=await api<Health>('/api/companies',{signal:controller.signal});
    const latest=JSON.stringify(health.sources.map(s=>[s.id,s.lastSuccessAt,s.lastErrorAt,s.running,s.latestRun?.id,s.due]));
    if(latest!==healthSignature&&!controller.signal.aborted)setRefresh(v=>v+1);
   } catch { /* Keep the last catalogue while the local server is unavailable. */ }
  }
  const timer=window.setInterval(()=>void check(),15000);
  window.addEventListener('focus',check);
  return()=>{controller.abort();window.clearInterval(timer);window.removeEventListener('focus',check);};
 },[healthSignature,result?.sourceHealth.autoRefresh]);

 async function updatePreferences(body:{action:string;[key:string]:unknown},initial=false){
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
    const active=preferences.savedFilters.find(filter=>filter.id===preferences.activeFilterId);
    if(body.action==='select'||body.action==='create'||body.action==='edit'||body.action==='delete'){
     setFilterName(active?.name??'');setNewOnly(false);
     if(active)applyFilters(active.filters);
     if(body.action==='select'&&!active)clear();
    }
    setConfirmDelete(false);
    if(body.action==='viewed')setNotice('已更新这组筛选的查看进度。');
   }
  } catch(e){setError(message(e));}
  finally{setUpdating(false);setRefresh(v=>v+1);}
 }
 async function more(){if(!result?.nextCursor)return;const sequence=generation.current;setLoading(true);try{const r=await api<Result>('/api/jobs?'+query(result.nextCursor));if(sequence===generation.current)setResult(prev=>({...r,items:[...(prev?.items||[]),...r.items]}));}catch(e){setError(message(e));}finally{if(sequence===generation.current)setLoading(false);}}
 async function sync(id:string){setSyncing(id);setError('');setNotice('正在从官网核验列表和每条职位详情，请稍候…');try{const r=await api<{state:string;seenCount:number}>('/api/catalog/sources/'+id+'/sync',{method:'POST'});setNotice(`同步成功，本次官网返回 ${r.seenCount} 个真实岗位。`);}catch(e){setError(message(e));setNotice('本次同步未成功，保留上次成功目录。');}finally{setSyncing(null);setRefresh(v=>v+1);}}
 async function show(job:Job){setError('');try{setDetail(await api<Job>('/api/jobs/'+encodeURIComponent(job.id)));}catch(e){setError(message(e));}}
 async function save(job:Job){
  setSaving(job.id);setError('');
  try{
   const result=await api<{applicationId:string;replayed:boolean}>('/api/jobs/'+encodeURIComponent(job.id)+'/save',{method:'POST'});
   if(!result.replayed){
    const applicationProgress:ApplicationProgress={applicationId:result.applicationId,status:'saved',appliedAt:null,archivedAt:null,hasInterview:false};
    const withProgress=(item:Job)=>item.id===job.id?{...item,savedApplicationId:result.applicationId,applicationProgress}:item;
    setDetail(prev=>prev&&withProgress(prev));
    setResult(prev=>prev?{...prev,items:prev.items.map(withProgress)}:prev);
    setNotice('已加入我的申请，状态为待投递。');
   } else {
    setRefresh(value=>value+1);
    if(detail?.id===job.id)await show(job);
   }
   onSaved();
  }catch(e){setError(message(e));}finally{setSaving('');}
 }
 function search(e:FormEvent){e.preventDefault();setQ(draftQuery.trim());}
 function clear(){setQ('');setDraftQuery('');setCompany('');setCity('');setProgram('');setEmployment('');setYear('');setAvailability('');setNewOnly(false);}
 const health=result?.sourceHealth,sourceSettings=sourceDraft??health?.preferences,hasFilters=!!(q||companyId||city||programKind||employmentType||graduationYear||availability),notSynced=health?.sources.every(s=>!s.lastSuccessAt);
 const companies=(result?.companyTotals??[]).filter(company=>company.open>0)
  .sort((a,b)=>b.matching-a.matching||b.recent-a.recent||b.open-a.open||a.companyName.localeCompare(b.companyName,'zh-CN'));
 const recent=companies.filter(company=>company.recent>0);
 const unverified=health?.sources.filter(source=>!source.lastSuccessAt||source.lastErrorAt
  ||Date.now()-Date.parse(source.lastSuccessAt)>=86400000).length??0;
 function showCompany(company:Company){
  clear();
  setCompany(company.companyId);
  setAvailability('accepting');
  document.getElementById('job-search')?.scrollIntoView({block:'start'});
 }
 function toggleFollow(source:Source){
  if(!health)return;
  const {sourceIds,intervalHours}=health.preferences;
  const updated=source.selected?sourceIds.filter(id=>id!==source.id):[...sourceIds,source.id];
  void updatePreferences({action:'sources',settings:{sourceIds:updated,intervalHours}});
 }
 function companyCard(company:Company,recentOnly=false){
  const source=health?.sources.find(candidate=>candidate.companyId===company.companyId);
  const newlyDiscovered=recentOnly&&company.firstSeenAt&&result&&company.firstSeenAt>result.discoverySince;
  return <article className="catalog-source" key={company.companyId}>
   <div>
    <strong>{company.companyName}</strong>{newlyDiscovered&&<> <span className="badge">首次发现</span></>}
    <p>{company.open} 个开放岗位{recentOnly&&` · ${company.recent} 个新收录或重新开放`}
      {savedFilter&&company.matching>0&&` · ${company.matching} 个匹配「${savedFilter.name}」`}</p>
    <small>{company.intern} 个实习 · {company.autumn} 个明确标注秋招 · 核验 {time(company.lastVerifiedAt)}</small>
    {source?.lastErrorAt&&<p><small className="catalog-source-error">最近更新失败，显示上次核验结果</small></p>}
   </div>
   <div className="catalog-job-actions">
    {health?.canSchedule&&source&&<Button size="sm" variant="ghost" disabled={updating} aria-pressed={source.selected} onClick={()=>toggleFollow(source)}>{source.selected?'已关注':'关注'}</Button>}
    <Button size="sm" variant="outline" onClick={()=>showCompany(company)}>查看开放岗位</Button>
   </div>
  </article>;
 }
 return <section className="job-directory"><div className="section-toolbar"><div><h2>发现真实岗位</h2><p>直接核验公司公开招聘页，查看职位与原文。</p></div><Button variant="outline" size="sm" onClick={onViewApplications}>我的申请</Button></div>
 <section className="records-panel" aria-label="正在招聘">
  <h3>正在招聘</h3>
  {companies.length?companies.map(company=>companyCard(company)):<p>{!health?'正在读取岗位目录…':unverified?'等待官网核验，已确认开放的公司会出现在这里。':'最近核验中暂无开放岗位。'}</p>}
  {!!unverified&&<p className="muted-note">{unverified} 个来源待核验或更新失败，详情见招聘源同步状态。</p>}
 </section>
 <section className="records-panel" aria-label="最近新开">
  <div className="section-toolbar"><div><h3>最近新开</h3><p>{discoverySince?'自上次标记已查看后':'近 7 天'}新收录或重新开放、目前仍开放的岗位。</p></div>
   <Button size="sm" variant="ghost" disabled={!recent.length||loading} onClick={()=>{
    if(!result)return;
    try{localStorage.setItem(discoveryStorageKey,result.observedAt);}catch{/* Keep the marker for this session. */}
    setDiscoverySince(result.observedAt);
   }}>标记已查看</Button>
  </div>
  {recent.length?recent.map(company=>companyCard(company,true)):<p>{loading?'正在读取…':'暂无新的开放岗位。'}</p>}
 </section>
 {health?.canSchedule&&sourceSettings&&<section className="records-panel" aria-label="本地招聘源设置">
  <h3>关注的公司</h3>
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
  <p className="muted-note">本地服务每天检查未关注的公司。已关注的公司按设定频率更新，关闭网页仍可同步。</p>
 </section>}
 {health&&<section className="records-panel" aria-label="招聘源同步状态">
  <h3>招聘源同步状态</h3>
  {health.sources.map(source=>{
   const run=source.latestRun;
   const status=source.running?'同步中':run?.state==='failed'?'同步失败':run?.state==='succeeded'?(run.seenCount?`成功 · ${run.seenCount} 个岗位`:'暂无开放岗位'):'尚未同步';
   const next=source.nextUpdateAt?(source.running?'本次同步结束后计算':source.due?'已到期，等待后台检查':time(source.nextUpdateAt)):
    health.canSchedule?'定时更新已暂停':health.autoRefresh?'等待后台核验':'未启用自动更新';
   return <article className="catalog-source" key={source.id}>
    <div>
     <strong>{source.companyName} · {source.label}</strong> <span className="badge">{status}</span>
     <p>最近同步：{run?time(run.finishedAt??run.startedAt):'尚未同步'} · 最近成功：{time(source.lastSuccessAt)}</p>
     <p>下次更新：{next} <a href={source.entryUrl} target="_blank" rel="noreferrer">官网来源 ↗</a></p>
     {source.lastErrorMessage&&<small className="catalog-source-error">{source.lastErrorMessage}</small>}
    </div>
    {health.canSync&&<Button size="sm" variant="outline" disabled={syncing!==null||source.running} onClick={()=>void sync(source.id)}>
     {syncing===source.id||source.running?<><Loader2 size={13} className="spin"/> 同步中</>:<><RefreshCw size={13}/> {run?.state==='failed'?'重试同步':'同步官网岗位'}</>}
    </Button>}
   </article>;
  })}
 </section>}
 {error&&<div className="error-banner" role="alert">{error}<Button size="xs" variant="outline" onClick={()=>setRefresh(v=>v+1)}>重新读取目录</Button></div>}{notice&&<div className="save-notice" role="status">{notice}</div>}
 <form id="job-search" className="catalog-search" onSubmit={search}><Search size={15}/><input aria-label="搜索真实岗位" value={draftQuery} maxLength={100} placeholder="职位或 JD 关键词，多个用逗号分隔" onChange={e=>setDraftQuery(e.target.value)}/><Button size="sm" type="submit">搜索岗位</Button></form>
 <div className="catalog-filters"><fieldset className="catalog-company-filter"><legend>公司</legend>
 {health?.sources.map(source=><label className="catalog-toggle" key={source.companyId}>
  <input type="checkbox" checked={companyId.split(',').includes(source.companyId)}
   onChange={e=>{const ids=companyId.split(',').filter(Boolean);setCompany((e.target.checked?[...ids,source.companyId]:ids.filter(id=>id!==source.companyId)).join(','));setNewOnly(false);}}/>
  {source.companyName}
 </label>)}
 </fieldset><label>城市<input aria-label="岗位城市" value={city} maxLength={100} placeholder="多个城市用逗号分隔" onChange={e=>setCity(e.target.value)}/></label><label>招聘项目<select aria-label="招聘项目" value={programKind} onChange={e=>setProgram(e.target.value)}><option value="">全部项目</option><option value="autumn">秋招</option><option value="summer_internship">暑期实习</option><option value="daily_internship">日常实习</option><option value="unknown">未注明批次</option></select></label><label>职位性质<select aria-label="职位性质" value={employmentType} onChange={e=>setEmployment(e.target.value)}><option value="">全部性质</option><option value="intern">标题或栏目注明实习</option><option value="full_time">全职</option><option value="unknown">未注明性质</option></select></label><label>毕业年份<select aria-label="毕业年份" value={graduationYear} onChange={e=>setYear(e.target.value)}><option value="">全部年份</option><option value="2027">2027</option><option value="2028">2028</option></select></label><label>有效性<select aria-label="岗位有效性" value={availability} onChange={e=>setAvailability(e.target.value)}><option value="">全部状态</option><option value="accepting">官网标记开放</option><option value="stale">数据过期</option><option value="closed">已关闭</option><option value="reopened">重新开放</option></select></label><Button size="xs" variant="ghost" disabled={!hasFilters} onClick={clear}>清除筛选</Button></div>
 <section className="records-panel" aria-label="我的筛选">
  <h3>我的筛选</h3>
  <div className="catalog-filters" aria-label="筛选组">
   <Button size="sm" variant="outline" aria-pressed={!savedFilter} disabled={updating||!preferences}
    onClick={()=>void updatePreferences({action:'select',filterId:null})}>临时筛选</Button>
   {preferences?.savedFilters.map(filter=><Button key={filter.id} size="sm" variant={filter.id===savedFilter?.id?'default':'outline'}
    aria-pressed={filter.id===savedFilter?.id} disabled={updating}
    onClick={()=>void updatePreferences({action:'select',filterId:filter.id})}>
    {filter.name}（{result?.filterCounts.find(count=>count.id===filter.id)?.newCount??0} 个新增）
   </Button>)}
  </div>
  <div className="catalog-filters">
   <label>筛选名称<input value={filterName} maxLength={40} placeholder="例如 后端实习" onChange={e=>setFilterName(e.target.value)}/></label>
   <Button size="sm" variant="outline" disabled={!result||updating||loading||!filterName.trim()||draftQuery.trim()!==q}
    onClick={()=>void updatePreferences({action:'create',name:filterName,filters})}>保存为新筛选</Button>
   {savedFilter&&<>
    <Button size="sm" variant="outline" aria-pressed={!!savedFilter.subscribedAt} disabled={updating}
     onClick={()=>void updatePreferences({action:'subscribe',filterId:savedFilter.id,revision:savedFilter.revision,enabled:!savedFilter.subscribedAt})}>
     {savedFilter.subscribedAt?'取消订阅新岗位':'订阅新岗位'}
    </Button>
    <Button size="sm" variant="outline" disabled={updating||loading||!filterName.trim()||draftQuery.trim()!==q||(savedActive&&filterName.trim()===savedFilter.name)}
     onClick={()=>void updatePreferences({action:'edit',filterId:savedFilter.id,revision:savedFilter.revision,name:filterName,filters})}>更新这组筛选</Button>
    <Button size="sm" variant="ghost" disabled={updating} onClick={()=>setConfirmDelete(!confirmDelete)}>{confirmDelete?'取消删除':'删除这组筛选'}</Button>
    {confirmDelete&&<Button size="sm" variant="destructive" disabled={updating}
     onClick={()=>void updatePreferences({action:'delete',filterId:savedFilter.id,revision:savedFilter.revision})}>确认删除 {savedFilter.name}</Button>}
   </>}
  </div>
  {savedActive&&result&&<div className="catalog-filters">
   <label className="catalog-toggle"><input type="checkbox" checked={newOnly} onChange={e=>setNewOnly(e.target.checked)}/> 仅看新增（{result.newCount}）</label>
   <Button size="sm" variant="ghost" disabled={loading||updating||!result.newCount} onClick={()=>void updatePreferences({action:'viewed',filterId:savedFilter.id,revision:savedFilter.revision,through:result.observedAt})}>标记本组新增为已查看</Button>
  </div>}
 </section>
 <p className="muted-note">“实习”不等于“暑期实习”。官网未明确的批次、年份和截止时间保留未知；超过 24 小时未核验的开放岗位标为过期。</p>
 {loading&&!result?<div className="table-empty">正在读取真实岗位目录…</div>:result&&!result.items.length?<div className="table-empty"><BriefcaseBusiness size={25}/><h3>{notSynced?'尚未取得官网岗位数据':newOnly&&savedActive?'没有新增匹配岗位':hasFilters?'没有符合筛选条件的岗位':'官网本次没有返回岗位'}</h3><p>{notSynced?'已接入的官网会陆续核验，完成后岗位自动显示。':hasFilters?'可调整筛选；未标注届别的岗位不会匹配具体毕业年份。':'请查看最近成功核验时间和来源状态。'}</p>{hasFilters&&<Button size="sm" variant="outline" onClick={clear}>清除筛选条件</Button>}</div>:<div className="catalog-job-list" aria-busy={loading}>{result?.items.map(job=><article key={job.id}><div className="catalog-job-main"><button className="catalog-job-title" onClick={()=>void show(job)}>{job.title}</button><p>{job.companyName} · {job.locations.join(' / ')||'地点未注明'} · {job.department||'部门未注明'}</p><div className="catalog-badges">{job.applicationProgress&&<span className="badge">我的进度：{progressLabel(job.applicationProgress)}</span>}{savedActive&&job.isNew&&<span className="badge job-accepting">新增匹配</span>}<span className={`badge job-${job.availability}`}>{job.availability==='accepting'&&job.reopenedAt?'官网已重新开放':labels[job.availability]}</span><span className="badge">批次：{labels[job.programKind]}</span>{job.graduationLabel&&<span className="badge">官网标题：{job.graduationLabel}</span>}<span className="muted-note">核验 {time(job.lastVerifiedAt)}</span></div></div><div className="catalog-job-actions"><Button size="xs" variant="outline" onClick={()=>void show(job)}>查看职位</Button><Button size="xs" variant="ghost" disabled={saving===job.id||!!job.savedApplicationId} onClick={()=>void save(job)}><Bookmark size={12}/>{job.savedApplicationId?'已记录':'加入待投递'}</Button><a className="small-link" href={job.originalUrl} target="_blank" rel="noreferrer">官网 <ArrowUpRight size={12}/></a></div></article>)}</div>}
 {result?.nextCursor&&<Button size="sm" variant="outline" disabled={loading} onClick={()=>void more()}>{loading?'读取中…':'加载更多岗位'}</Button>}
 <Sheet open={!!detail} onOpenChange={v=>{if(!v)setDetail(null);}}><SheetContent className="detail-sheet job-detail" showCloseButton={false}><div className="drawer-header"><div><SheetTitle>{detail?.title}</SheetTitle><SheetDescription>{detail?.companyName} · {detail?.locations.join(' / ')}</SheetDescription></div><SheetClose asChild><Button size="icon-sm" variant="ghost" aria-label="关闭职位详情"><X size={17}/></Button></SheetClose></div>{detail&&<div className="drawer-fields"><div className="catalog-badges">{detail.applicationProgress&&<span className="badge">我的进度：{progressLabel(detail.applicationProgress)}</span>}<span className="badge">{labels[detail.availability]}</span><span className="badge">批次：{labels[detail.programKind]}</span></div><dl className="job-facts"><div><dt>首次收录</dt><dd>{time(detail.firstSeenAt)}</dd></div>{detail.reopenedAt&&<div><dt>最近重新开放</dt><dd>{time(detail.reopenedAt)}</dd></div>}{detail.closedAt&&<div><dt>本次关闭</dt><dd>{time(detail.closedAt)}</dd></div>}<div><dt>官网栏目</dt><dd>{detail.sourceCategory||'未注明'}</dd></div><div><dt>毕业届别</dt><dd>{detail.graduationLabel||'未注明'}{!detail.graduationYear&&detail.graduationLabel?'（按原文保留，不补齐年份）':''}</dd></div><div><dt>截止时间</dt><dd>{detail.deadlineAt?time(detail.deadlineAt):'官网未注明'}</dd></div><div><dt>最近核验</dt><dd>{time(detail.lastVerifiedAt)}</dd></div></dl><h3>职位描述</h3><div className="job-jd">{detail.jdText||'官网未提供职位正文'}</div><div className="info-banner">开放状态依据官网职位详情；不代表你符合资格或已提交申请。正式投递前仍需复核官网要求。</div><div className="catalog-job-actions"><a className="download-button" href={detail.originalUrl} target="_blank" rel="noreferrer">查看官网原文 ↗</a><Button size="sm" disabled={!!detail.savedApplicationId||saving===detail.id} onClick={()=>void save(detail)}>{detail.savedApplicationId?'已记录':'加入我的待投递'}</Button></div><p className="muted-note">可收藏岗位，并在投递台账记录实际进度。{detail.evidence?.reason==='absent_from_complete_public_list'?'此岗位已不在最近完整官网列表中。':''}</p></div>}</SheetContent></Sheet>
 </section>;
}
