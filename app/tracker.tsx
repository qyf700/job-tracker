"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Archive, ArrowDownUp, ArrowUpRight, BriefcaseBusiness, CalendarDays, Check, ChevronLeft, ChevronRight, Circle, FileText, ListFilter, Loader2, PanelLeftClose, Plus, RefreshCw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { localDateTime } from '@/lib/interviews';
import { officialJobLabel } from "@/lib/catalog/job-status";
import { api, emptyForm, followUpBucket, isDue, shanghaiDate, statusLabels, toForm, type Application, type ApplicationForm, type Status } from '@/lib/tracker';

import InterviewPanel from '@/components/tracker/interviews';
import {ProfilePanel} from '@/components/tracker/profile';
import JobDirectory from '@/components/tracker/job-directory';
import ResumeCenter from '@/components/tracker/resumes';
import type {ProfileDraft} from '@/components/tracker/profile-history';

const PAGE_SIZE = 15;
type View = 'companies' | 'discover' | 'all' | 'today' | 'schedule' | 'resume' | 'profile';
type Sort = 'updated' | 'deadline' | 'company';
function errorMessage(e: unknown) { return e instanceof Error ? e.message : '操作失败，请重试。'; }

export default function Tracker() {
  const [items, setItems] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>('discover');
  const [detailTab,setDetailTab]=useState<'info'|'interviews'>('info');
  const [profileDirty,setProfileDirty]=useState(false);
  const [profileDraft,setProfileDraft]=useState<ProfileDraft|null>(null);
  const viewTitles={companies:'已投企业',discover:'发现岗位',all:'投递台账',today:'今日待办',schedule:'面试日程',resume:'简历中心',profile:'个人资料'};
  function switchView(next:View){if(profileDirty&&!confirm('有未保存的资料或材料选择，放弃修改并切换？'))return;setProfileDirty(false);setView(next);resetFilters();if(view==='discover'&&next!=='discover')void load();}
  const [companyFilter,setCompanyFilter]=useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [city, setCity] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [appliedTime, setAppliedTime] = useState('');

  const [sort, setSort] = useState<Sort>('updated');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);
  const hasUnsavedAppliedTime = appliedTime !== (editing?.appliedAt ? localDateTime(editing.appliedAt) : '');
  const [form, setForm] = useState<ApplicationForm>({...emptyForm});
  const [initialForm, setInitialForm] = useState('');
  const [drawerError, setDrawerError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [actionEdit, setActionEdit] = useState<string | null>(null);
  const [actionDraft, setActionDraft] = useState({nextAction:'',dueDate:''});
  const [notice, setNotice] = useState('');
  const [today, setToday] = useState(shanghaiDate);

  async function load() {
    setLoading(true); setError('');
    try { const result = await api<{items:Application[]}>('/api/applications'); setItems(result.items); setLoaded(true); }
    catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { const timer = setInterval(() => setToday(shanghaiDate()), 60_000); return () => clearInterval(timer); }, []);
  useEffect(() => { setPage(1); }, [query,status,city,view,sort,followUp]);

  const scope = useMemo(() => items.filter(item => view === 'all' || (view==='companies' ? !!item.appliedAt : isDue(item,today))), [items,view,today]);
  const rows = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    return scope.filter(item => (!companyFilter || item.company.trim()===companyFilter) && (!status || item.status === status) && (!city || item.city === city) &&
      (!followUp || (followUp==='pending' ? !!followUpBucket(item,today) : followUpBucket(item,today)===followUp)) &&
      (!text || `${item.company} ${item.title} ${item.city} ${item.batch} ${item.nextAction}`.toLocaleLowerCase().includes(text)))
      .sort((a,b) => {
        if (sort === 'deadline') return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || b.updatedAt.localeCompare(a.updatedAt);
        if (sort === 'company') return a.company.localeCompare(b.company,'zh-CN') || a.title.localeCompare(b.title,'zh-CN');
        return b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id);
      });
  }, [scope,status,city,query,sort,companyFilter,followUp,today]);
  const pageCount = Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
  const currentPage = Math.min(page,pageCount);
  const visible = rows.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
  const dueCount = items.filter(item => isDue(item,today)).length;
  const cities = [...new Set(items.map(item => item.city).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  const filtersActive = !!query || !!status || !!city || !!companyFilter || !!followUp;

  function start(item?:Application) {
    const next = item ? toForm(item) : {...emptyForm};
    setDetailTab('info'); setEditing(item ?? null); setAppliedTime(item?.appliedAt ? localDateTime(item.appliedAt) : ''); setForm(next); setInitialForm(JSON.stringify(next));
    setDrawerError(''); setActionEdit(null); setOpen(true);
  }
  function changeOpen(value:boolean) {
    if (saving) return;
    if (!value && (JSON.stringify(form) !== initialForm || hasUnsavedAppliedTime) && !confirm('放弃尚未保存的修改？')) return;
    setOpen(value);
  }
  function replace(item:Application) { setItems(previous => previous.map(row => row.id===item.id ? {...row,...item} : row)); }
  async function save(e:FormEvent) {
    e.preventDefault(); if (saving) return;
    const dueDate = String(new FormData(e.currentTarget as HTMLFormElement).get('dueDate') || '') || null;
    setSaving(true); setDrawerError('');
    try {
      const result = await api<Application>(editing ? `/api/applications/${editing.id}` : '/api/applications', {
        method:editing ? 'PATCH' : 'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...form,dueDate,...(editing ? {version:editing.version,...(hasUnsavedAppliedTime ? {appliedAt:appliedTime ? appliedTime+':00+08:00' : null} : {})} : {})}),
      });
      if (editing) replace(result); else setItems(previous => [result,...previous]);
      setLoaded(true); setOpen(false); setNotice(editing ? '修改已保存' : '岗位已添加');
    } catch(e) { setDrawerError(errorMessage(e)); } finally { setSaving(false); }
  }
  async function patch(item:Application, fields:Partial<Application>) {
    if (busyRef.current) return;
    busyRef.current=true; setBusyId(item.id); setError('');
    try {
      const updated=await api<Application>(`/api/applications/${item.id}`,{
        method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,version:item.version}),
      });
      replace(updated); setActionEdit(null); setNotice('修改已保存');
    } catch(e) { setError(errorMessage(e)); } finally { busyRef.current=false; setBusyId(null); }
  }
  async function archive(item:Application) {
    if (busyRef.current || !confirm(`归档「${item.company} · ${item.title}」？归档后将从当前列表隐藏。`)) return;
    busyRef.current=true; setBusyId(item.id); setError('');
    try { await api<void>(`/api/applications/${item.id}`,{method:'DELETE'}); setItems(previous=>previous.filter(row=>row.id!==item.id)); setNotice('记录已归档'); }
    catch(e){setError(errorMessage(e));} finally {busyRef.current=false;setBusyId(null);}
  }
  function resetFilters(){setCompanyFilter('');setQuery('');setStatus('');setCity('');setFollowUp('');}

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="workspace-name" href="/"><span className="workspace-icon"><BriefcaseBusiness size={16}/></span><strong>求职工作台</strong><span className="personal-label">个人</span></a>
      <div className="nav-section-label">工作空间</div>
      <nav aria-label="主导航"><button className={view==='discover'?'nav-item selected':'nav-item'} onClick={()=>switchView('discover')}><Search size={16}/>发现岗位</button>
        <button aria-current={view==='all'?'page':undefined} className={view==='all'?'nav-item selected':'nav-item'} onClick={()=>{switchView('all');}}><BriefcaseBusiness size={16}/>投递台账<span>{loaded?items.length:'—'}</span></button>
        <button className={view==='companies'?'nav-item selected':'nav-item'} onClick={()=>switchView('companies')}><BriefcaseBusiness size={16}/>已投企业</button>
        <button aria-current={view==='today'?'page':undefined} className={view==='today'?'nav-item selected':'nav-item'} onClick={()=>{switchView('today');}}><CalendarDays size={16}/>今日待办<span>{loaded?dueCount:'—'}</span></button>
        <button className={view==='schedule'?'nav-item selected':'nav-item'} onClick={()=>switchView('schedule')}><CalendarDays size={16}/>面试日程</button>
        <button className={view==='resume'?'nav-item selected':'nav-item'} onClick={()=>switchView('resume')}><FileText size={16}/>简历中心</button>
        <button className={view==='profile'?'nav-item selected':'nav-item'} onClick={()=>switchView('profile')}><FileText size={16}/>个人资料</button>
      </nav>
      <div className="sidebar-note"><FileText size={15}/><p>岗位、进度与跟进记录<br/><span>集中在一个工作空间</span></p></div>
      <div className="workspace-footer"><span className="avatar">我</span><span>个人空间<small>Asia/Shanghai</small></span><PanelLeftClose size={15} aria-hidden="true"/></div>
    </aside>

    <main className="main-area">
      <header className="breadcrumb"><span>工作空间</span><ChevronRight size={13}/><strong>{viewTitles[view]}</strong></header>
      {(view==='all'||view==='today'||view==='companies')&&<><section className="page-title"><div><h1>{viewTitles[view]}</h1><p>{view==='companies'?'查看已经投过的企业及其岗位进度。':view==='all'?'管理岗位与申请进度，记录每次跟进。':'显示今日到期和逾期的未结束岗位行动。'}</p></div><Button size="sm" onClick={()=>start()}><Plus size={15}/>新增岗位</Button></section>

      {view==='companies'&&loaded&&<section className="records-panel" aria-label="已投企业汇总">
        <p>根据你在台账记录的投递历史统计。点击企业查看岗位和当前进度。</p>
        {[...new Set(scope.map(item=>item.company.trim()))].map(company=><Button key={company} size="sm" variant={companyFilter===company?"default":"outline"} onClick={()=>{resetFilters();setCompanyFilter(companyFilter===company?"":company);}}>{company} · {scope.filter(item=>item.company.trim()===company).length} 个岗位</Button>)}
        {!scope.length&&<p>暂无已投企业。实际投递后，在台账更新对应岗位的状态。</p>}
      </section>}
      <div className="status-tabs" role="tablist" aria-label="按状态查看">
        {([['','全部'],['saved','待投递'],['applied','已投递'],['in_progress','流程中'],['offer','Offer']] as const).map(([key,label])=><button key={key} role="tab" aria-selected={status===key} onClick={()=>setStatus(key)} className={status===key?'tab active':'tab'}>{label}<span>{loaded?(key?scope.filter(i=>i.status===key).length:scope.length):'—'}</span></button>)}
        <select className="other-status" aria-label="其他申请状态" value={['rejected','withdrawn','closed'].includes(status)?status:''} onChange={e=>setStatus(e.target.value)}><option value="">其他状态</option>{(['rejected','withdrawn','closed'] as const).map(key=><option key={key} value={key}>{statusLabels[key]}</option>)}</select>
      </div>

      <section className="records-panel" aria-label="投递记录">
        <div className="toolbar"><label className="search-field"><Search size={15}/><input aria-label="搜索投递" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索公司、岗位或行动…"/>{query&&<button aria-label="清空搜索" onClick={()=>setQuery('')}><X size={13}/></button>}</label>
          <div className="filter-control"><ListFilter size={14}/><select aria-label="筛选城市" value={city} onChange={e=>setCity(e.target.value)}><option value="">全部城市</option>{cities.map(value=><option key={value}>{value}</option>)}</select></div>
          {view!=='today'&&<div className="filter-control"><select aria-label="筛选待跟进事项" value={followUp} onChange={e=>setFollowUp(e.target.value)}><option value="">全部跟进</option><option value="pending">全部待跟进</option><option value="overdue">已逾期</option><option value="today">今天到期</option><option value="upcoming">未来到期</option><option value="undated">未设截止日期</option></select></div>}
          <div className="filter-control sort-control"><ArrowDownUp size={14}/><select aria-label="排序方式" value={sort} onChange={e=>setSort(e.target.value as Sort)}><option value="updated">最近更新</option><option value="deadline">截止日期</option><option value="company">公司名称</option></select></div>
          <span className="toolbar-spacer"/><Button variant="ghost" size="icon-sm" aria-label="刷新记录" disabled={loading||!!busyId||saving} onClick={()=>void load()}><RefreshCw size={15} className={loading?'spin':''}/></Button>
        </div>
        {error&&<div className="error-banner" role="alert"><span>{error}</span><Button size="xs" variant="outline" onClick={()=>void load()}>重新加载</Button></div>}
        {notice&&<div className="save-notice" role="status"><Check size={13}/>{notice}<button onClick={()=>setNotice('')} aria-label="关闭提示"><X size={12}/></button></div>}
        <Table className="application-table"><TableHeader><TableRow><TableHead className="company-column">公司 / 岗位</TableHead><TableHead>城市</TableHead><TableHead>批次</TableHead><TableHead>状态</TableHead><TableHead className="action-column">下一步行动</TableHead><TableHead>截止日期</TableHead><TableHead className="row-tools-head"><span className="sr-only">操作</span></TableHead></TableRow></TableHeader>
        <TableBody>{loading&&!loaded?<TableRow><TableCell colSpan={7}><div className="table-empty"><Loader2 size={21} className="spin"/><p>正在加载投递记录…</p></div></TableCell></TableRow>:!visible.length?<TableRow><TableCell colSpan={7}><div className="table-empty"><BriefcaseBusiness size={24}/><h2>{!loaded&&error?'暂时无法读取记录':filtersActive?'没有符合条件的记录':view==='today'?'今天没有到期或逾期行动':'还没有投递记录'}</h2><p>{!loaded&&error?'请重新加载，现有记录不会被清空。':filtersActive?'调整状态、城市或搜索条件后重试。':view==='today'?'在岗位中设置下一步行动和截止日期后，会在这里展示。':'添加岗位后，可在列表里更新状态和下一步行动。'}</p>{filtersActive?<Button variant="outline" size="sm" onClick={resetFilters}>清除筛选</Button>:view==='all'&&loaded?<Button variant="outline" size="sm" onClick={()=>start()}><Plus size={14}/>添加岗位</Button>:null}</div></TableCell></TableRow>:visible.map(item=><TableRow key={item.id} className={busyId===item.id?'saving-row':''}>
          <TableCell><button className="record-link" onClick={()=>start(item)} disabled={!!busyId}><span className="company-avatar">{item.company.slice(0,1)}</span><span><strong>{item.company}</strong><small>{item.title}</small>{item.appliedAt&&<small>实际投递 {localDateTime(item.appliedAt).replace('T',' ')}</small>}{item.officialJob&&<small title={`核验时间 ${new Date(item.officialJob.lastVerifiedAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}`}>{officialJobLabel(item.officialJob)}</small>}</span></button></TableCell>
          <TableCell><span className="secondary-cell">{item.city||'—'}</span></TableCell><TableCell><span className="batch-cell">{item.batch||'—'}</span></TableCell>
          <TableCell><div className={`status-control ${item.status}`}><Circle size={7} fill="currentColor"/><select aria-label={`${item.company}申请状态`} value={item.status} disabled={!!busyId} onChange={e=>void patch(item,{status:e.target.value as Status})}>{Object.entries(statusLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div></TableCell>
          <TableCell>{actionEdit===item.id?<form className="quick-action" onSubmit={e=>{e.preventDefault();const date=String(new FormData(e.currentTarget).get('dueDate')||'');void patch(item,{nextAction:actionDraft.nextAction,dueDate:date||null});}}><input aria-label="快捷编辑下一步行动" autoFocus maxLength={500} value={actionDraft.nextAction} onChange={e=>setActionDraft({...actionDraft,nextAction:e.target.value})}/><input aria-label="快捷编辑截止日期" name="dueDate" type="date" value={actionDraft.dueDate} onInput={e=>setActionDraft({...actionDraft,dueDate:e.currentTarget.value})} onChange={e=>setActionDraft({...actionDraft,dueDate:e.target.value})}/><div><Button size="xs" type="submit" disabled={!!busyId}>保存</Button><Button size="xs" variant="ghost" type="button" disabled={!!busyId} onClick={()=>setActionEdit(null)}>取消</Button></div></form>:<button className={item.nextAction?'action-link':'action-link muted'} disabled={!!busyId} onClick={()=>{setActionEdit(item.id);setActionDraft({nextAction:item.nextAction,dueDate:item.dueDate??''});}}>{item.nextAction||'+ 设置行动'}</button>}</TableCell>
          <TableCell><span className={isDue(item,today)&&(item.dueDate ?? '')<today?'due-date overdue':'due-date'}>{item.dueDate||'—'}{isDue(item,today)&&<small>{item.dueDate===today?'今天':'逾期'}</small>}</span></TableCell>
          <TableCell><div className="row-tools">{item.sourceUrl&&<a href={item.sourceUrl} target="_blank" rel="noreferrer" aria-label={`打开${item.company}岗位原文`}><ArrowUpRight size={15}/></a>}<button aria-label={`归档${item.company}岗位`} disabled={!!busyId} onClick={()=>void archive(item)}><Archive size={14}/></button></div></TableCell>
        </TableRow>)}</TableBody></Table>
        <div className="table-footer"><span>{loaded?`共 ${rows.length} 条${filtersActive?'筛选结果':''}`:'尚未加载'}{rows.length>0?` · 显示 ${(currentPage-1)*PAGE_SIZE+1}–${Math.min(currentPage*PAGE_SIZE,rows.length)} 条`:''}</span><div><span>{currentPage} / {pageCount}</span><Button variant="outline" size="icon-xs" aria-label="上一页" disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}><ChevronLeft size={13}/></Button><Button variant="outline" size="icon-xs" aria-label="下一页" disabled={currentPage>=pageCount} onClick={()=>setPage(currentPage+1)}><ChevronRight size={13}/></Button></div></div>
      </section></>}
      {view==='discover'&&<div className="feature-page"><JobDirectory onSaved={()=>void load()} onViewApplications={()=>switchView('all')}/></div>}
      {view==='schedule'&&<div className="feature-page"><InterviewPanel applications={items}/></div>}
      {view==='resume'&&<div className="feature-page"><ResumeCenter onEditProfile={()=>switchView('profile')} onImportDraft={draft=>{setProfileDraft(draft);switchView('profile');}}/></div>}
      {view==='profile'&&<div className="feature-page"><ProfilePanel onPrepare={()=>switchView('discover')} onOpenResumes={()=>switchView('resume')} onDirtyChange={setProfileDirty} initialDraft={profileDraft} onDraftConsumed={()=>setProfileDraft(null)}/></div>}
    </main>

    <Sheet open={open} onOpenChange={changeOpen}><SheetContent className="detail-sheet" showCloseButton={false}><div className="drawer-header"><div><SheetTitle>{editing?'岗位详情':'新增岗位'}</SheetTitle><SheetDescription>{editing?`${editing.company} / ${editing.title}`:'填写岗位信息，之后可随时补充。'}</SheetDescription></div><SheetClose asChild><Button variant="ghost" size="icon-sm" disabled={saving} aria-label="关闭岗位详情"><X size={18}/></Button></SheetClose></div>
      {editing&&<div className="drawer-tabs"><button className={detailTab==='info'?'active':''} onClick={()=>setDetailTab('info')}>岗位资料</button><button className={detailTab==='interviews'?'active':''} onClick={()=>{if((JSON.stringify(form)!==initialForm||hasUnsavedAppliedTime)&&!confirm('岗位资料尚未保存，仍查看面试记录？'))return;setDetailTab('interviews');}}>面试记录</button></div>}
      {editing&&detailTab==='interviews'?<div className="drawer-interviews"><InterviewPanel applicationId={editing.id} applications={items}/></div>:<form className="detail-form" onSubmit={save}><div className="drawer-fields"><div className="form-section-title">基本信息</div><div className="form-grid"><label>公司名称 <span>*</span><input required maxLength={200} value={form.company} onChange={e=>setForm({...form,company:e.target.value})} placeholder="公司名称"/></label><label>岗位名称 <span>*</span><input required maxLength={200} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="岗位名称"/></label><label>工作城市<input maxLength={200} value={form.city} onChange={e=>setForm({...form,city:e.target.value})} placeholder="如：上海"/></label><label>招聘批次<input maxLength={100} value={form.batch} onChange={e=>setForm({...form,batch:e.target.value})} placeholder="如：2027 秋招"/></label></div><label>岗位链接<div className="input-with-link"><input type="url" maxLength={2000} value={form.sourceUrl} onChange={e=>setForm({...form,sourceUrl:e.target.value})} placeholder="https://"/>{editing?.sourceUrl&&<a href={editing.sourceUrl} aria-label="打开岗位原文" target="_blank" rel="noreferrer"><ArrowUpRight size={16}/></a>}</div></label>
        <div className="form-section-title divided">申请与行动</div><div className="form-grid"><label>申请状态<select value={form.status} onChange={e=>setForm({...form,status:e.target.value as Status})}>{Object.entries(statusLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>{editing&&<label>实际投递时间（北京时间）<input type="datetime-local" value={appliedTime} onChange={e=>setAppliedTime(e.target.value)}/></label>}<label>行动截止日期<input name="dueDate" type="date" value={form.dueDate} onInput={e=>setForm({...form,dueDate:e.currentTarget.value})} onChange={e=>setForm({...form,dueDate:e.target.value})}/></label></div><label>下一步行动<input maxLength={500} value={form.nextAction} onChange={e=>setForm({...form,nextAction:e.target.value})} placeholder="如：完成官网投递、准备一面"/></label>
        <div className="form-section-title divided">岗位与跟进记录</div><label>岗位描述<textarea rows={5} maxLength={30000} value={form.jd} onChange={e=>setForm({...form,jd:e.target.value})} placeholder="粘贴岗位职责和要求"/></label><label>跟进笔记<textarea rows={5} maxLength={20000} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="记录沟通、笔试或面试情况"/></label>
        {editing&&<div className="record-timestamps"><span>创建于 {new Date(editing.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</span><span>更新于 {new Date(editing.updatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</span></div>}{drawerError&&<div className="drawer-error" role="alert">{drawerError}</div>}</div>
        <div className="drawer-footer"><span>{(JSON.stringify(form)!==initialForm||hasUnsavedAppliedTime)?'有未保存的修改':''}</span><Button variant="outline" type="button" disabled={saving} onClick={()=>changeOpen(false)}>取消</Button><Button type="submit" disabled={saving}>{saving&&<Loader2 size={14} className="spin"/>}{saving?'保存中…':'保存'}</Button></div>
      </form>}</SheetContent></Sheet>
  </div>;
}
