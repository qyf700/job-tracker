import {SITE,secret,targetUrl,labels} from './shared.mjs';
import {mokaAdapter} from './moka-adapter.mjs';
import {mapFields,mappingSummary,mappingSignature} from './mapping.mjs';
const harden=Promise.all([chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})]);
async function stored(){return (await chrome.storage.local.get(['device','pending']));}
async function context(){return (await chrome.storage.session.get('active')).active||null;}
async function api(path,{method='POST',body={},authenticated=true,binary=false}={}){
 const tabs=await chrome.tabs.query({url:SITE+'/*'}),tab=tabs.find(t=>{try{return new URL(t.url).pathname==='/';}catch{return false;}});if(!tab)throw new Error('请先打开并登录工作台，保持此标签页打开');
 const {device}=await stored();if(authenticated&&!device)throw new Error('尚未完成设备配对');
 let result;try{result=await chrome.tabs.sendMessage(tab.id,{type:'JT_CONNECTOR_API',path,method,body,binary,authorization:authenticated?`Bearer ${device.id}.${device.secret}`:undefined});}catch{throw new Error('请刷新工作台标签页以加载连接桥');}
 if(!result?.ok){const error=new Error(result?.error||'连接失败');error.status=result?.status||0;if(error.status===401&&authenticated&&!String(result?.error).includes('登录')){await chrome.storage.local.remove('device');await chrome.storage.session.remove(['active','claim','report']);}throw error;}return binary?result:result.data;
}
async function pulse(){const {device}=await stored();if(!device)return;const active=await context();try{const result=await api('device/heartbeat',{body:active?{lease:active.proof}:{}});if(active&&result.lease){active.expiresAt=result.lease.expiresAt;await chrome.storage.session.set({active});}}catch(error){if(error.status===409||error.status===404)await chrome.storage.session.remove(['active','claim','report']);throw error;}}
async function pendingStatus(){const {pending}=await stored();if(!pending)return;let result;try{result=await api('pairings/status',{authenticated:false,body:{pairingId:pending.id,deviceSecret:pending.secret}});}catch(error){if([401,404,422].includes(error.status))await chrome.storage.local.remove('pending');throw error;}if(result.pairing.state==='approved'){await chrome.storage.local.set({device:{id:result.pairing.deviceId,secret:pending.secret,name:result.pairing.deviceName}});await chrome.storage.local.remove('pending');await pulse();}else if(['expired','cancelled'].includes(result.pairing.state)){await chrome.storage.local.remove('pending');throw new Error('配对已过期或取消，请生成新配对码');}}
async function status(){await pendingStatus();const {device,pending}=await stored();let connectionError='';if(device)try{await pulse();}catch(error){connectionError=error.message;}const active=await context();const adapterPending=(await chrome.storage.session.get('adapterPending')).adapterPending;if(adapterPending)connectionError='官网操作结果待核对，禁止重复填写或上传；请检查官网记录。';return {paired:!!(await stored()).device,pending:!!pending,deviceName:device?.name||'',connectionError,active:active?{id:active.task.id,title:active.task.title,state:active.task.state,version:active.task.version,expiresAt:active.expiresAt}:null};}
async function claim(taskId){if(!taskId)throw new Error('请先刷新并选择一个可领取任务');let active=await context();if(active)throw new Error('本机仍有活动任务，请先释放或回工作台核对');let pending=(await chrome.storage.session.get('claim')).claim;if(!pending){pending={taskId,requestId:crypto.randomUUID(),leaseSecret:secret()};await chrome.storage.session.set({claim:pending});}if(pending.taskId!==taskId)throw new Error('上一次领取结果未知，请先重试同一任务');
 let result;try{result=await api('device/claim',{body:pending});}catch(error){if([400,403,404,409,422].includes(error.status))await chrome.storage.session.remove('claim');throw error;}const proof={taskId,leaseId:result.lease.id,leaseSecret:pending.leaseSecret};active={proof,task:result.task,expiresAt:result.lease.expiresAt};await chrome.storage.session.set({active});await chrome.storage.session.remove(['claim','report']);const url=targetUrl(result.task.applyUrl,result.task.externalJobId);if(!url)throw new Error('目标页面不在支持范围，已停止');const tab=await chrome.tabs.create({url});active.tabId=tab.id;await chrome.storage.session.set({active});return {message:'任务已领取并打开官网；未填写或提交材料'};
}
async function report(type,pageUrl){const active=await context();if(!active)throw new Error('没有有效任务');let pending=(await chrome.storage.session.get('report')).report;if(!pending){pending={...active.proof,eventId:crypto.randomUUID(),version:active.task.version,type,...(pageUrl?{pageUrl}:{})};await chrome.storage.session.set({report:pending});}if(pending.type!==type)throw new Error('上次状态回传结果未知，请先重试同一操作');let result;try{result=await api('device/events',{body:pending});}catch(error){if([400,403,404,409,422].includes(error.status)){await chrome.storage.session.remove('report');if(error.status===409){try{const fresh=await api('device/materials',{body:active.proof});active.task={...active.task,state:fresh.task.state,version:fresh.task.version};await chrome.storage.session.set({active});}catch(refreshError){if([401,404,409].includes(refreshError.status))await chrome.storage.session.remove('active');}}}throw error;}await chrome.storage.session.remove('report');active.task={...active.task,state:result.state,version:result.version};if(['needs_review','cancelled'].includes(result.state))await chrome.storage.session.remove('active');else await chrome.storage.session.set({active});return {message:labels[result.state]||result.state};}
async function inspect(){const active=await context();if(!active||!active.tabId)throw new Error('请先领取任务并打开官网');let tab;try{tab=await chrome.tabs.get(active.tabId);}catch{return report('page_mismatch');}const url=targetUrl(tab.url,active.task.externalJobId);if(!url)return report('page_mismatch');
 const result=await chrome.scripting.executeScript({target:{tabId:active.tabId,frameIds:[0]},world:'ISOLATED',func:(expected,title)=>{
  const url=new URL(location.href),path=url.hash.split('?')[0];if(url.origin!=='https://app.mokahr.com'||url.pathname!=='/campus_apply/zhihu/3818'||path!==`#/job/${expected}/apply`)return {mismatch:true};
  const visible=e=>!!e&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
  const inputs=[...document.querySelectorAll('input')];if(!document.body?.innerText.includes(title)||!inputs.length)return {loading:true};
  if(inputs.some(e=>visible(e)&&e.type==='password'))return {state:'needs_login'};
  if(inputs.some(e=>visible(e)&&(/验证码/.test(e.placeholder||'')||e.autocomplete==='one-time-code')))return {state:'needs_verification'};
  const privacy=inputs.filter(e=>e.type==='checkbox'&&/隐私|我已同意/.test(e.closest('label')?.textContent||e.parentElement?.parentElement?.textContent||''));if(privacy.some(e=>!e.checked))return {state:'needs_consent'};
  return {state:'page_verified'};
 },args:[active.task.externalJobId,active.task.title]});const observed=result[0]?.result;if(!observed||observed.loading)return {message:'官网页面仍在加载，或尚未识别到申请表，请稍后重新核对'};if(observed.mismatch)return report('page_mismatch');return report(observed.state,observed.state==='page_verified'?url:undefined);
}
async function materials(){const active=await context();if(!active)throw new Error('没有有效任务');const result=await api('device/materials',{body:active.proof});const payload=result.snapshot.payload;active.task.state=result.task.state;active.task.version=result.task.version;await chrome.storage.session.set({active});return {message:`已读取本任务冻结材料：${payload.resume.originalName}；资料v${payload.profile.revision}。未读取当前资料档案，未向官网填入。`};}
async function verifyFile(){const active=await context();if(!active)throw new Error('没有有效任务');const material=await api('device/materials',{body:active.proof});const response=await api('device/file',{body:active.proof,binary:true});const bytes=Uint8Array.from(atob(response.binary),c=>c.charCodeAt(0)),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');if(digest!==material.snapshot.payload.resume.sha256||response.sha256!==digest)throw new Error('原件哈希不匹配，已停止');return {message:'冻结原件字节和SHA-256核验一致；文件未上传至官网。'};}
async function runAdapter(active,plan,mode,extra={}){
 if(!active.tabId)throw new Error('目标标签页已丢失，请先回工作台核对任务');
 const tab=await chrome.tabs.get(active.tabId);if(!targetUrl(tab.url,plan.job.externalJobId))throw new Error('目标页面发生变化，已停止');
 const results=await chrome.scripting.executeScript({target:{tabId:active.tabId,frameIds:[0]},world:'ISOLATED',func:mokaAdapter,args:[{mode,job:plan.job,fields:plan.fields,...extra}]});
 const result=results[0]?.result;if(!result)throw new Error('官网未返回操作结果');if(result.gate&&mode!=='scan')throw new Error(labels[result.gate]||'请本人处理官网验证');return result;
}
async function adapterPreview(){
 const active=await context();if(!active)throw new Error('请先领取并核对目标页');
 const plan=await api('device/adapter-plan',{body:active.proof});
 const scan=await runAdapter(active,plan,'scan');
 const mapping=mapFields(scan.schema,plan.fields);
 const preview={schemaSignature:scan.schemaSignature,id:crypto.randomUUID(),taskId:active.proof.taskId,leaseId:active.proof.leaseId,snapshotHash:plan.snapshotHash,expiresAt:Date.now()+300000,tabId:active.tabId};
 await chrome.storage.session.set({adapterPreview:preview});
 return {plan,scan,mapping,summary:mappingSummary(mapping),previewId:preview.id,message:'请核对岗位、冻结资料与原件；填写或上传会把相应材料传给知乎/Moka，上传可能触发官网简历解析。'};
}
async function finishPendingAdapter(){
 const pending=(await chrome.storage.session.get('adapterPending')).adapterPending;if(!pending?.outcome)return;
 await api('device/adapter-result',{body:{...pending.proof,actionId:pending.actionId,outcome:pending.outcome}});
 await chrome.storage.session.remove('adapterPending');
}
async function executeAdapter(message){
 if(message.acknowledged!==true||!['fill','upload'].includes(message.kind))throw new Error('请先核对并确认此次材料传输');
 const active=await context(),preview=(await chrome.storage.session.get('adapterPreview')).adapterPreview;
 if(!active||!preview||preview.id!==message.previewId||preview.taskId!==active.proof.taskId||preview.leaseId!==active.proof.leaseId||preview.tabId!==active.tabId||preview.expiresAt<Date.now())throw new Error('预览已失效，请重新读取并确认材料');
 const pending=(await chrome.storage.session.get('adapterPending')).adapterPending;if(pending)throw new Error('上次官网操作结果待核对，禁止自动重做；请检查官网及工作台记录');
 const plan=await api('device/adapter-plan',{body:active.proof});if(plan.snapshotHash!==preview.snapshotHash)throw new Error('材料快照已变化，请重新预览');
 if(plan.actions.some(action=>action.kind===message.kind))throw new Error('本任务已经授权过该操作，不会重复填写或上传；请核对官网记录');
 const scan=await runAdapter(active,plan,'scan');if(scan.gate)throw new Error(labels[scan.gate]||'请本人处理官网验证');if(scan.schemaSignature!==preview.schemaSignature||mappingSignature(scan.schema)!==scan.schemaSignature)throw new Error('页面结构变化，请重新预览后确认');const mapping=mapFields(scan.schema,plan.fields),assignments=mapping.filter(row=>row.status==='fillable').map(row=>({fieldId:row.fieldId,sourceKey:row.sourceKey}));if(message.kind==='fill'&&!assignments.length)throw new Error('没有可自动填写的空白字段，请检查缺失资料、已有值和待适配控件');if(message.kind==='upload'&&!scan.resumeWritable)throw new Error(scan.resumePresent?'官网已有简历，请本人核对；不会上传覆盖，也不会消耗本次上传授权':'官网上传状态无法确认，请本人核对；未获得上传授权');
 let file;
 if(message.kind==='upload'){
  const response=await api('device/file',{body:active.proof,binary:true});
  const bytes=Uint8Array.from(atob(response.binary),c=>c.charCodeAt(0));const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==plan.resume.sha256||response.sha256!==hash||bytes.length!==plan.resume.sizeBytes)throw new Error('冻结简历校验失败，禁止上传');
  file={base64:response.binary,name:plan.resume.originalName,sizeBytes:plan.resume.sizeBytes,sha256:hash};
 }
 const actionId=crypto.randomUUID();
 // Durable local marker is saved BEFORE server authorization. Lost replies or
 // worker shutdown never cause a second website mutation on retry.
 await chrome.storage.session.set({adapterPending:{actionId,proof:active.proof,kind:message.kind}});
 let permit;try{permit=await api('device/adapter-start',{body:{...active.proof,actionId,version:plan.task.version,kind:message.kind,snapshotHash:plan.snapshotHash,pageUrl:targetUrl((await chrome.tabs.get(active.tabId)).url,plan.job.externalJobId),acknowledged:true}});}catch(error){if([400,403,404,409,422].includes(error.status))await chrome.storage.session.remove('adapterPending');throw error;}
 let result;try{result=await runAdapter(active,plan,message.kind,{schemaSignature:scan.schemaSignature,assignments,executeBefore:permit.executeBefore,...(file?{file}:{})});}catch{
  await chrome.storage.session.set({adapterPending:{actionId,proof:active.proof,kind:message.kind,outcome:'uncertain'}});
  try{await finishPendingAdapter();}catch{}throw new Error('官网操作未能确认结果；可能已有部分字段或文件传输，请本人核对，禁止自动重试');
 }
 await chrome.storage.session.set({adapterPending:{actionId,proof:active.proof,kind:message.kind,outcome:result.outcome}});
 try{await finishPendingAdapter();}catch{throw new Error('官网操作已经触发，但状态回传失败；不要再次操作，保持工作台打开以重试状态回传');}
 await chrome.storage.session.remove('adapterPreview');
 const fresh=await api('device/adapter-plan',{body:active.proof});active.task={...active.task,state:fresh.task.state,version:fresh.task.version};await chrome.storage.session.set({active});
 return result;
}
async function adapterReview(message){
 if(message.acknowledged!==true)throw new Error('请先在官网核对所有必填项和已上传原件');
 const active=await context();if(!active)throw new Error('没有有效任务');
 const plan=await api('device/adapter-plan',{body:active.proof});const scan=await runAdapter(active,plan,'scan');if(scan.gate)throw new Error(labels[scan.gate]||'请本人处理官网验证');
 const result=await api('device/adapter-review',{body:{...active.proof,version:plan.task.version,acknowledged:true}});active.task={...active.task,...result};await chrome.storage.session.set({active});
 return {message:'已停在最终提交前。请在知乎官网再次核对岗位、全部字段及附件，由你本人确认并点击官网提交。工作台尚未标记已投递。'};
}
async function handle(message,sender){await harden;if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html'))throw new Error('仅接受连接器弹窗操作');
 switch(message.action){case 'STATUS':try{await finishPendingAdapter();}catch{}return status();case 'ADAPTER_PREVIEW':return adapterPreview();case 'ADAPTER_RUN':return executeAdapter(message);case 'ADAPTER_REVIEW':return adapterReview(message);case 'ADAPTER_CLEAR':if(message.acknowledged!==true)throw new Error('请先本人核对官网操作');await chrome.storage.session.remove(['adapterPending','adapterPreview']);return {message:'本机提示已清理；服务端操作记录保留，旧任务不能重复执行同一操作'};case 'OPEN_SITE':await chrome.tabs.create({url:SITE});return {message:'请在此浏览器登录工作台，登录、验证码由你处理'};
 case 'PAIR':{const name=String(message.name||'').trim(),code=String(message.code||'').trim();if(!name||name.length>60)throw new Error('请填写设备名称（最多60字）');const current=await stored();if(current.device)throw new Error('本机已经配对，请先撤销后重新配对');let pending=current.pending;if(!pending){const id=code.split('.')[0];pending={id,secret:secret(),name};await chrome.storage.local.set({pending});}if(pending.id!==code.split('.')[0])throw new Error('请先取消本机待处理配对');const result=await api('pairings/request',{authenticated:false,body:{code,deviceName:pending.name,deviceSecret:pending.secret}});return {message:'配对请求已发送，请在工作台核对设备名称与权限后批准'};}
 case 'CANCEL_LOCAL_PAIR':await chrome.storage.local.remove('pending');return {message:'本机待处理配对已清除；旧请求可在工作台取消'};
 case 'TASKS':await pulse();return api('device/tasks',{method:'GET'});case 'CLAIM':return claim(message.taskId);case 'INSPECT':return inspect();case 'MATERIALS':return materials();case 'FILE':return verifyFile();
 case 'WAIT':if(!['needs_login','needs_verification','needs_consent'].includes(message.reason))throw new Error('未知等待原因');return report(message.reason);
 case 'RELEASE':{const active=await context();if(!active)throw new Error('没有活动租约');await api('device/release',{body:active.proof});await chrome.storage.session.remove(['active','claim','report']);await chrome.storage.session.remove(['adapterPreview','adapterPending']);return {message:'租约已释放；若已触发官网操作，任务保留待核对，不会自动重新投递'};}
 case 'DISCONNECT':await api('device/revoke',{body:{}});await chrome.storage.local.remove(['device','pending']);await chrome.storage.session.clear();return {message:'设备授权已撤销'};
 default:throw new Error('未知操作');}
}
let queue=Promise.resolve();chrome.runtime.onMessage.addListener((message,sender,respond)=>{if(!message?.action)return;queue=queue.then(()=>handle(message,sender)).then(data=>respond({ok:true,data})).catch(error=>respond({ok:false,error:error.message}));return true;});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='connector-heartbeat')queue=queue.then(()=>harden).then(()=>pulse()).catch(()=>{});});
void chrome.alarms.get('connector-heartbeat').then(alarm=>{if(!alarm)chrome.alarms.create('connector-heartbeat',{periodInMinutes:.5});});
