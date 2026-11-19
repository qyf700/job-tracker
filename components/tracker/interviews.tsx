"use client";
import { useEffect,useState,type FormEvent } from 'react';
import { CalendarDays,ChevronLeft,ChevronRight,Clock,History,Mail,Plus,RefreshCw,X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet,SheetContent,SheetDescription,SheetTitle,SheetClose } from '@/components/ui/sheet';
import { api,isActive,shanghaiDate,type Application } from '@/lib/tracker';
import {maxInterviewMailLength, parseInterviewMail, possibleMailDuplicates} from '@/lib/interview-mail';
import { kindLabels,stateLabels,outcomeLabels,localDateTime,overlaps,type Interview } from '@/lib/interviews';

type Props={applications:Application[];applicationId?:string};
type HistoryRow={id:string;action:string;before:Interview|null;after:Interview;createdAt:string};
const kinds=Object.entries(kindLabels),states=Object.entries(stateLabels),outcomes=Object.entries(outcomeLabels);
function blank(applicationId:string){const start=new Date(Date.now()+3600000);start.setUTCMinutes(0,0,0);return {applicationId,kind:'interview',round:'技术一面',start:localDateTime(start.toISOString()),end:localDateTime(new Date(start.valueOf()+3600000).toISOString()),state:'scheduled',outcome:'pending',format:'online',location:'',meetingUrl:'',interviewer:'',preparation:'',questions:'',review:''};}
function fromEvent(e:Interview){return {applicationId:e.applicationId,kind:e.kind,round:e.round,start:localDateTime(e.startsAt),end:localDateTime(e.endsAt),state:e.state,outcome:e.outcome,format:e.format,location:e.location,meetingUrl:e.meetingUrl,interviewer:e.interviewer,preparation:e.preparation,questions:e.questions,review:e.review};}
function payload(f:ReturnType<typeof blank>){return {applicationId:f.applicationId,kind:f.kind,round:f.round,startsAt:new Date(f.start+':00+08:00').toISOString(),endsAt:new Date(f.end+':00+08:00').toISOString(),timezone:'Asia/Shanghai',state:f.state,outcome:f.outcome,format:f.format,location:f.location,meetingUrl:f.meetingUrl,interviewer:f.interviewer,preparation:f.preparation,questions:f.questions,review:f.review};}
function message(e:unknown){return e instanceof Error?e.message:'操作失败';}
export default function InterviewPanel({applications,applicationId}:Props){
 const [events,setEvents]=useState<Interview[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [open,setOpen]=useState(false),[editing,setEditing]=useState<Interview|null>(null),[form,setForm]=useState(()=>blank(applicationId||applications[0]?.id||'')),[saving,setSaving]=useState(false),[formError,setFormError]=useState('');
 const [filter,setFilter]=useState('all'),[mode,setMode]=useState<'list'|'month'>('list'),[month,setMonth]=useState(shanghaiDate().slice(0,7)),[day,setDay]=useState(''),[history,setHistory]=useState<HistoryRow[]|null>(null);
 const [mailOpen,setMailOpen]=useState(false),[mailText,setMailText]=useState('');
 const [mailDraft,setMailDraft]=useState<ReturnType<typeof parseInterviewMail>|null>(null);
 const [timeConfirmed,setTimeConfirmed]=useState(false),[duplicateConfirmed,setDuplicateConfirmed]=useState('');
 const today=shanghaiDate();
 async function load(){setLoading(true);setError('');try{setEvents((await api<{items:Interview[]}>('/api/interviews')).items);}catch(e){setError(message(e));}finally{setLoading(false);}}
 useEffect(()=>{
  const controller=new AbortController();
  void api<{items:Interview[]}>('/api/interviews',{signal:controller.signal})
   .then(({items})=>{if(!controller.signal.aborted)setEvents(items);})
   .catch(e=>{if(!controller.signal.aborted)setError(message(e));})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[]);
 const scoped=events.filter(e=>!applicationId||e.applicationId===applicationId);
 const tasks=applications.filter(a=>(!applicationId||a.id===applicationId)&&isActive(a)&&a.nextAction&&a.dueDate);
 const shown=scoped.filter(e=>(filter==='all'||e.state===filter)&&(!day||localDateTime(e.startsAt).slice(0,10)===day));
 const tasksShown=tasks.filter(a=>!day||a.dueDate===day);
 const groups=[...new Set([...shown.map(e=>localDateTime(e.startsAt).slice(0,10)),...tasksShown.map(a=>a.dueDate!)])].sort();
 function resetMail() {
  setMailOpen(false);
  setMailText('');
  setMailDraft(null);
  setTimeConfirmed(false);
  setDuplicateConfirmed('');
 }
 function start(e?:Interview, fromMail=false) {
  resetMail();
  setEditing(e??null);
  const initial=e?fromEvent(e):blank(applicationId||applications[0]?.id||'');
  setForm(fromMail ? {...initial, applicationId:applicationId??'', start:'', end:'', round:''} : initial);
  setMailOpen(fromMail);
  setHistory(null);
  setFormError('');
  setOpen(true);
 }
 function prepareMail() {
  const draft=parseInterviewMail(mailText);
  const slot=draft.slots.length===1 ? draft.slots[0] : undefined;
  setMailDraft(draft);
  setMailOpen(false);
  setTimeConfirmed(false);
  setDuplicateConfirmed('');
  setForm(previous=>({...previous,kind:draft.kind,round:draft.round,format:draft.format||previous.format,
   location:draft.location,meetingUrl:draft.meetingUrl,interviewer:draft.interviewer,
   start:slot?.start??'',end:slot?.end??''}));
 }
 function closeDrawer() {
  if(saving)return;
  setOpen(false);
  resetMail();
 }
 function chooseExisting(event:Interview) {
  setEditing(event);
  setHistory(null);
  setFormError('');
  setDuplicateConfirmed('');
  setForm({...fromEvent(event),start:form.start,end:form.end,
   location:form.location||event.location,meetingUrl:form.meetingUrl||event.meetingUrl,
   interviewer:form.interviewer||event.interviewer,format:mailDraft?.format||event.format});
 }
 const duplicates=mailDraft ? possibleMailDuplicates(events,form,mailDraft.rescheduled,editing?.id) : [];
 const fingerprint=(items:Interview[], draft:typeof form)=>JSON.stringify([
  draft.applicationId,draft.start,draft.end,draft.kind,draft.round,items.map(item=>[item.id,item.version]).sort(),
 ]);
 const duplicateKey=fingerprint(duplicates,form);
 async function save(e:FormEvent<HTMLFormElement>) {
  e.preventDefault();
  if(saving||mailOpen)return;
  const fd=new FormData(e.currentTarget);
  const actual={...form,start:String(fd.get('start')??''),end:String(fd.get('end')??'')};
  if(!actual.start||!actual.end)return;
  if(mailDraft?.warnings.length&&!timeConfirmed){
   setFormError('请先确认邮件里需要核对的信息。');
   return;
  }
  setSaving(true);
  setFormError('');
  try {
   if(mailDraft){
    const {items}=await api<{items:Interview[]}>('/api/interviews');
    setEvents(items);
    const current=possibleMailDuplicates(items,actual,mailDraft.rescheduled,editing?.id);
    if(current.length&&duplicateConfirmed!==fingerprint(current,actual)){
     setFormError('发现疑似重复日程。请选择修改已有记录，或确认仍要保存。');
     return;
    }
   }
   const row=await api<Interview>(editing?`/api/interviews/${editing.id}`:'/api/interviews',{
    method:editing?'PATCH':'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...payload(actual),...(editing?{version:editing.version}:{})}),
   });
   setEvents(prev=>[...prev.filter(x=>x.id!==row.id),row].sort((a,b)=>a.startsAt.localeCompare(b.startsAt)));
   setOpen(false);
   resetMail();
   setNotice(editing?'面试记录已更新，历史已保留':'日程已添加');
  }catch(e){setFormError(message(e));}finally{setSaving(false);}
 }
 async function loadHistory(){if(!editing)return;try{setHistory((await api<{items:HistoryRow[]}>(`/api/interviews/${editing.id}`)).items);}catch(e){setFormError(message(e));}}
 let conflicts:Interview[]=[];try{const proposed={...payload(form),id:editing?.id||'new',state:form.state as Interview['state']};conflicts=events.filter(e=>overlaps(proposed as Interview,e));}catch{/* incomplete datetime input */}
 const count=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
 // UTC date is the prior afternoon for +08:00; calculate weekday from the civil date instead.
 const weekday=(new Date(month+'-01T00:00:00Z').getUTCDay()+6)%7;
 function moveMonth(n:number){const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);setMonth(d.toISOString().slice(0,7));setDay('');}
 return <section className={applicationId?'interview-section embedded':'interview-section'}>
 <div className="section-toolbar"><div><h2>{applicationId?'面试与笔试记录':'面试与日程'}</h2><p>支持多轮安排、改期、面试结果与复盘 · Asia/Shanghai</p></div><div className="button-group"><Button variant="ghost" size="icon-sm" aria-label="刷新日程" onClick={()=>void load()} disabled={loading}><RefreshCw size={14}/></Button>{!applicationId&&<a className="small-link" href="/api/calendar" download="interviews.ics">导出日历</a>}<Button size="sm" variant="outline" disabled={!applications.length} onClick={()=>start(undefined,true)}><Mail size={14}/>粘贴邮件</Button><Button size="sm" disabled={!applications.length} onClick={()=>start()}><Plus size={14}/>新增日程</Button></div></div>
 {!applications.length&&<div className="info-banner">先添加一个岗位，再为该岗位安排笔试或多轮面试。</div>}
 <div className="schedule-filters"><div className="segmented"><button className={mode==='list'?'active':''} onClick={()=>setMode('list')}>日程列表</button><button className={mode==='month'?'active':''} onClick={()=>setMode('month')}>月历</button></div><select aria-label="筛选日程状态" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部安排</option>{states.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>{day&&<button className="small-link" onClick={()=>setDay('')}>{day} <X size={12}/></button>}</div>
 {error&&<div className="error-banner" role="alert">{error}</div>}{notice&&<div className="save-notice" role="status">{notice}</div>}
 {mode==='month'&&<div className="month-calendar"><div className="month-controls"><Button variant="ghost" size="icon-sm" aria-label="上个月" onClick={()=>moveMonth(-1)}><ChevronLeft size={16}/></Button><strong>{month.replace('-',' 年 ')} 月</strong><Button variant="ghost" size="icon-sm" aria-label="下个月" onClick={()=>moveMonth(1)}><ChevronRight size={16}/></Button></div><div className="month-grid">{['一','二','三','四','五','六','日'].map(x=><div className="weekday" key={x}>{x}</div>)}{Array.from({length:weekday},(_,i)=><div className="blank-day" key={`b${i}`}/>)}{Array.from({length:count},(_,i)=>{const date=`${month}-${String(i+1).padStart(2,'0')}`,n=scoped.filter(e=>(filter==='all'||e.state===filter)&&localDateTime(e.startsAt).slice(0,10)===date).length,t=tasks.filter(a=>a.dueDate===date).length;return <button key={date} aria-label={`${date}，${n}场面试笔试，${t}项行动`} onClick={()=>setDay(day===date?'':date)} className={`calendar-day ${date===today?'today':''} ${day===date?'selected':''}`}><span>{i+1}</span>{n>0&&<small>{n} 场安排</small>}{t>0&&<small className="task-count">{t} 项行动</small>}</button>})}</div></div>}
 {loading?<div className="table-empty"><p>正在读取日程…</p></div>:groups.length===0?<div className="table-empty"><CalendarDays size={23}/><h2>暂无{day?'当日':''}日程记录</h2><p>添加笔试、技术面、HR 面或 Offer 沟通，分别保存每一轮结果。</p></div>:<div className="agenda">{groups.map(date=><section key={date} className="agenda-day"><h3>{date}<span>{date===today?'今天':date<today?'已过去':''}</span></h3>{shown.filter(e=>localDateTime(e.startsAt).slice(0,10)===date).sort((a,b)=>a.startsAt.localeCompare(b.startsAt)).map(event=><article key={event.id} className={`agenda-event ${event.state}`}><div className="event-time"><Clock size={13}/>{localDateTime(event.startsAt).slice(11)}<small>至 {localDateTime(event.endsAt).slice(11)}</small></div><button className="event-content" onClick={()=>start(event)}><strong>{event.company} · {event.round}</strong><span>{event.title} · {kindLabels[event.kind]}</span><small>{[event.format==='online'?'线上':event.format==='phone'?'电话':'现场',event.location,event.interviewer&&`面试官：${event.interviewer}`].filter(Boolean).join(' · ')}</small></button><div className="event-badges"><span className={`badge ${event.state}`}>{stateLabels[event.state]}</span><span className="badge">{outcomeLabels[event.outcome]}</span>{events.some(other=>overlaps(event,other))&&<span className="conflict-label">时间冲突</span>}</div><Button variant="ghost" size="sm" onClick={()=>start(event)}>记录 / 改期</Button></article>)}{tasksShown.filter(a=>a.dueDate===date).map(a=><article key={a.id} className="agenda-task"><FileIcon/><div><strong>{a.company} · 投递行动</strong><p>{a.nextAction}</p></div><span>当日截止</span></article>)}</section>)}</div>}
 {!applicationId&&<p className="calendar-note">日历文件包含提前 30 分钟提醒；需导入你的日历应用。改期后请重新导出。</p>}
 <Sheet open={open} onOpenChange={value=>{if(!value)closeDrawer();}}><SheetContent className="detail-sheet" showCloseButton={false}><div className="drawer-header"><div><SheetTitle>{editing?'面试记录与改期':'新增面试 / 笔试'}</SheetTitle><SheetDescription>每轮单独记录，修改自动保留历史 · 北京时间</SheetDescription></div><SheetClose asChild><Button variant="ghost" size="icon-sm" aria-label="关闭日程详情" disabled={saving}><X size={17}/></Button></SheetClose></div><form className="detail-form" onSubmit={save}><div className="drawer-fields"><label>关联岗位<select aria-label="关联岗位" required disabled={!!editing||!!applicationId} value={form.applicationId} onChange={e=>setForm({...form,applicationId:e.target.value})}><option value="">请选择岗位</option>{applications.map(a=><option value={a.id} key={a.id}>{a.company} · {a.title}</option>)}</select></label>
 {mailOpen&&<div className="mail-import">
  <label>中文面试或笔试邮件<textarea rows={7} maxLength={maxInterviewMailLength} value={mailText}
   onChange={event=>setMailText(event.target.value)} placeholder="粘贴邀请正文，可包含邮件标题"/></label>
  <p className="muted-note">邮件在当前浏览器中预填。保存时仅提交表单里的日程字段。</p>
  <Button type="button" size="sm" disabled={!mailText.trim()} onClick={prepareMail}>预填日程</Button>
 </div>}
 {mailDraft&&<div className="mail-import">
  <details><summary>查看邮件原文</summary><pre className="mail-source">{mailText}</pre></details>
  {mailDraft.slots.length===1&&<p>邮件时间原文：{mailDraft.slots[0].source}</p>}
  {mailDraft.slots.length>1&&<label>选择邮件里的候选时段<select defaultValue="" onChange={event=>{
    const slot=event.target.value===''?undefined:mailDraft.slots[Number(event.target.value)];
    setForm(previous=>({...previous,start:slot?.start??'',end:slot?.end??''}));
    setTimeConfirmed(false);
   }}>
    <option value="">请选择，或手动填写</option>
    {mailDraft.slots.map((slot,index)=><option key={slot.start+slot.end} value={index}>{slot.source}</option>)}
   </select></label>}
  {mailDraft.warnings.length>0&&<div className="warning-banner">
    <ul>{mailDraft.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul>
    <label className="catalog-toggle"><input type="checkbox" checked={timeConfirmed}
     onChange={event=>setTimeConfirmed(event.target.checked)}/>我已对照邮件核对待确认的信息</label>
   </div>}
  {duplicates.length>0&&<div className="warning-banner">
   <p>同一投递下有疑似重复的日程。改期时可选择更新已有记录。</p>
   {duplicates.map(event=><Button key={event.id} type="button" size="sm" variant="outline" onClick={()=>chooseExisting(event)}>
    更新 {event.round}（{localDateTime(event.startsAt).replace('T',' ')}）
   </Button>)}
   <label className="catalog-toggle"><input type="checkbox" checked={duplicateConfirmed===duplicateKey}
    onChange={event=>setDuplicateConfirmed(event.target.checked?duplicateKey:'')}/>已核对，仍要保存此日程</label>
  </div>}
 </div>}
 {!mailOpen&&<><div className="form-grid"><label>安排类型<select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}>{kinds.map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label><label>面试轮次 / 名称<input required maxLength={100} value={form.round} onChange={e=>setForm({...form,round:e.target.value})}/></label><label>开始时间<input required name="start" type="datetime-local" value={form.start} onInput={e=>setForm({...form,start:e.currentTarget.value})} onChange={e=>setForm({...form,start:e.target.value})}/></label><label>结束时间<input required name="end" type="datetime-local" value={form.end} onInput={e=>setForm({...form,end:e.currentTarget.value})} onChange={e=>setForm({...form,end:e.target.value})}/></label><label>进行状态<select value={form.state} onChange={e=>setForm({...form,state:e.target.value})}>{states.map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label><label>面试结果<select value={form.outcome} onChange={e=>setForm({...form,outcome:e.target.value})}>{outcomes.map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label><label>面试形式<select value={form.format} onChange={e=>setForm({...form,format:e.target.value})}><option value="online">线上会议</option><option value="onsite">现场</option><option value="phone">电话</option></select></label><label>面试官<input maxLength={200} value={form.interviewer} onChange={e=>setForm({...form,interviewer:e.target.value})}/></label></div>{conflicts.length>0&&<div className="warning-banner">与 {conflicts.map(e=>`${e.company} ${e.round}`).join('、')} 时间重叠。仍可保存，请确认安排。</div>}<label>会议链接<input type="url" maxLength={2000} value={form.meetingUrl} onChange={e=>setForm({...form,meetingUrl:e.target.value})}/></label><label>地点 / 联系方式<input maxLength={1000} value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label><label>准备事项<textarea rows={3} maxLength={20000} value={form.preparation} onChange={e=>setForm({...form,preparation:e.target.value})}/></label><label>面试题与过程记录<textarea rows={4} maxLength={20000} value={form.questions} onChange={e=>setForm({...form,questions:e.target.value})}/></label><label>复盘与改进<textarea rows={4} maxLength={20000} value={form.review} onChange={e=>setForm({...form,review:e.target.value})}/></label>{editing&&<><Button type="button" variant="outline" size="sm" onClick={()=>void loadHistory()}><History size={13}/>查看修改历史</Button>{history&&<div className="history-list">{history.map(h=><div key={h.id}><strong>{{created:'创建',updated:'更新',rescheduled:'改期',cancelled:'取消'}[h.action]||h.action}</strong><time>{new Date(h.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</time>{h.before&&<p>{localDateTime(h.before.startsAt).replace('T',' ')} → {localDateTime(h.after.startsAt).replace('T',' ')}</p>}</div>)}</div>}</>}</>}{formError&&<div role="alert" className="drawer-error">{formError}</div>}</div><div className="drawer-footer"><span>Asia/Shanghai · 修改留痕</span><Button variant="outline" type="button" disabled={saving} onClick={closeDrawer}>取消</Button><Button type="submit" disabled={saving||mailOpen}>{saving?'保存中…':'保存日程'}</Button></div></form></SheetContent></Sheet>
 </section>;
}
function FileIcon(){return <CalendarDays size={15}/>;}
