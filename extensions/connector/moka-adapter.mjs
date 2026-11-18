// Serialized by chrome.scripting into an ISOLATED world. Self-contained; no
// page messages, network proxy, submit click, OTP handling or agreement changes.
export async function mokaAdapter(request){
 const expected=request.job,origin='https://app.mokahr.com',path='/campus_apply/zhihu/3818';
 const visible=e=>!!e&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
 const normalize=s=>String(s||'').replace(/\s+/g,' ').trim();
 const guard=()=>{
  const url=new URL(location.href);if(url.origin!==origin||url.pathname!==path||url.hash.split('?')[0]!==`#/job/${expected.externalJobId}/apply`)throw new Error('目标岗位发生变化，已停止');
  if(!document.body?.innerText.includes(expected.title))throw new Error('未识别到目标岗位名称，已停止');
  const dialogs=[...document.querySelectorAll('[role="dialog"],.ReactModal__Content')].filter(visible);
  if(dialogs.some(e=>/登录|扫码|验证码|验证身份|隐私政策/.test(e.innerText)))return 'needs_login';
  const inputs=[...document.querySelectorAll('input')].filter(visible);
  if(inputs.some(e=>e.type==='password'))return 'needs_login';
  if(inputs.some(e=>/验证码/.test(e.placeholder)||e.autocomplete==='one-time-code')||[...document.querySelectorAll('iframe')].filter(visible).some(e=>/captcha|verify|geetest/i.test(e.src)))return 'needs_verification';
  const privacy=[...document.querySelectorAll('input')].filter(e=>e.type==='checkbox'&&(visible(e)||visible(e.parentElement))&&/隐私|我已同意|阅读并同意/.test(e.closest('label')?.textContent||e.parentElement?.parentElement?.textContent||''));
  if(privacy.some(e=>!e.checked))return 'needs_consent';
  if([...document.querySelectorAll('[aria-busy="true"],[role="progressbar"]')].some(visible))return 'page_loading';
  return null;
 };
 const gate=guard();if(gate&&request.mode!=='scan')return {gate};
 const groups=()=>[...document.querySelectorAll('[class*="apply-field-"]')].filter(visible);
 // Structural form IR: public labels/control metadata only. Existing values
 // stay in the page; occupied is a boolean, never a copied profile value.
 const discover=()=>{
  const entries=groups().map((group,index)=>{
   const section=normalize(group.closest?.('[class*="apply-block-"]')?.querySelector('[class*="blockTitle-"]')?.textContent).replace(/添加$/,'').trim();
   const label=normalize(group.querySelector('[class^="title-"]')?.textContent).replace(/\s*\*$/,'')||section;
   const controls=[...group.querySelectorAll('input,textarea,select')];
   const text=controls.filter(e=>e.type!=='hidden'&&e.type!=='file'&&e.type!=='checkbox');
   const first=text[0];let control='unknown';
   if(controls.some(e=>e.type==='file'))control='file';
   else if(controls.some(e=>e.type==='checkbox'))control='checkbox';
   else if(text.length===4)control='range';else if(text.length===2)control='month';
   else if(first){
    if((first.placeholder||'').includes('就读学校'))control='school';
    else if((first.placeholder||'').includes('专业名称'))control='major';
    else if(first.tagName==='SELECT'||first.closest?.('label')?.className?.includes('sd-Select-container-'))control='select';
    else if(first.type==='password')control='password';else if(['text','email','tel'].includes(first.type)||first.tagName==='TEXTAREA')control='text';
   }
   const occupied=controls.some(e=>e.type==='file'?!!e.files?.length:e.type==='checkbox'?e.checked:!!normalize(e.value||e.closest?.('label')?.querySelector('[class*="sd-Input-display-value-"]')?.textContent));
   return {group,descriptor:{id:`moka:${index}`,label,section,control,required:!!group.querySelector('[class*="required-asterisk-"]'),disabled:!!text.length&&text.some(e=>e.disabled),occupied,occurrence:0,occurrences:1}};
  });
  for(const entry of entries){const peers=entries.filter(other=>other.descriptor.label===entry.descriptor.label&&other.descriptor.section===entry.descriptor.section);entry.descriptor.occurrence=peers.indexOf(entry);entry.descriptor.occurrences=peers.length;}
  return entries;
 };
 const signature=()=>JSON.stringify(discover().map(({descriptor:{id,label,section,control,required,disabled,occurrence,occurrences}})=>({id,label,section,control,required,disabled,occurrence,occurrences})));
 const find=field=>{
  if(field.targetId)return discover().find(entry=>entry.descriptor.id===field.targetId)?.group||null;
  const matches=groups().filter(group=>normalize(group.querySelector('[class^="title-"]')?.textContent).replace(/\s*\*$/,'')===field.label);
  // No positional global inputs: occurrence is scoped to an exact field label.
  return matches.length===(field.occurrences||1)?matches[field.occurrence]||null:null;
 };
 const resumeState=()=>{const input=document.querySelector('input#resumeKey[type="file"][name="resumeKey"]'),container=input?.closest('.file_upload'),trigger=container?.querySelector('[class*="file_upload-btn"]');if(input?.files?.length||container?.querySelector('a[href]')||container&&/\.(pdf|docx?|pptx?|wps)\b/i.test(container.innerText)||trigger&&normalize(trigger.textContent)!=='上传简历')return 'present';return input&&container&&trigger?'empty':'unknown';};
 const resumePresent=()=>resumeState()==='present';
 const inspect=()=>({gate,schema:discover().map(entry=>entry.descriptor),schemaSignature:signature(),resumeState:resumeState(),resumeWritable:resumeState()==='empty',resumePresent:resumePresent(),fields:request.fields.map(field=>({key:field.key,label:field.label,status:!find(field)?'not_found':'available'})),resumeAvailable:document.querySelectorAll('input#resumeKey[type="file"][name="resumeKey"]').length===1});
 if(request.mode==='scan')return inspect();
 const check=()=>{if(request.schemaSignature&&signature()!==request.schemaSignature)throw new Error('页面结构已变化，请重新扫描并确认');if(!Number.isFinite(Date.parse(request.executeBefore))||Date.now()>Date.parse(request.executeBefore))throw new Error('操作授权已过期，已停止');const gate=guard();if(gate)throw new Error('请本人处理官网登录、验证码或协议后再核对');};
 if(request.mode==='upload'){
  check();const matches=document.querySelectorAll('input#resumeKey[type="file"][name="resumeKey"]');if(matches.length!==1)throw new Error('简历上传入口不唯一或已变化，已停止');const input=matches[0];
  if(input.disabled||!input.accept.split(',').includes('.pdf'))throw new Error('简历控件不接受PDF，已停止');
  const container=input.closest('.file_upload');if(!container||!visible(container))throw new Error('简历控件结构已变化，已停止');
  if(resumeState()!=='empty')throw new Error(resumePresent()?'官网已有附件或上传记录，请手动核对，不自动覆盖':'官网上传状态无法确认，请手动核对');
  const file=request.file;if(!file||file.sizeBytes>5*1024*1024)throw new Error('简历材料不合法');
  const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  if(bytes.length!==file.sizeBytes||hash!==file.sha256||new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw new Error('简历原件校验失败，已停止');
  check();const transfer=new DataTransfer();transfer.items.add(new File([bytes],file.name,{type:'application/pdf'}));
  // The native website change handler performs its real upload. Once dispatched,
  // never retry automatically; DOM selection is not a server upload receipt.
  input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  return {outcome:'upload_dispatched',message:'原件已交给官网上传控件；请等待官网显示文件名并核对。尚未提交申请。'};
 }
 if(request.mode!=='fill')throw new Error('未知官网操作');
 const fields=request.assignments?request.assignments.map(assignment=>{const field=request.fields.find(field=>field.key===assignment.sourceKey);return field?{...field,targetId:assignment.fieldId}:null;}).filter(Boolean):request.fields;
 const pause=(ms=40)=>new Promise(resolve=>setTimeout(resolve,ms));
 const waitFor=async(predicate,limit=700)=>{const until=Math.min(Date.now()+limit,Date.parse(request.executeBefore));while(Date.now()<until){check();const value=predicate();if(value)return value;await pause();}return null;};
 const setText=async(input,value)=>{
  check();if(input.disabled||input.readOnly||!['text','email','tel'].includes(input.type)||input.closest('[role="dialog"]'))return 'manual';
  if(input.value)return normalize(input.value)===normalize(value)?'already_matches':'preserved';
  if(input.maxLength>0&&value.length>input.maxLength)return 'manual';
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));await pause(80);check();return input.isConnected&&input.value===value?'filled':'manual';
 };
 const select=async(input,value)=>{
  check();const label=input.closest('label');if(!label?.className.includes('sd-Select-container-'))return 'manual';
  const shown=()=>normalize(label.querySelector('[class*="sd-Input-display-value-"]')?.textContent||input.value);
  if(shown())return shown()===normalize(value)?'already_matches':'preserved';
  if(input.disabled)return 'manual';
  const dropdown=input.closest('[class*="sd-Dropdown-container-"]');if(!dropdown)return 'manual';
  const matches=()=>[...dropdown.querySelectorAll('[role="option"],[class*="sd-Menu-content-item-"]')].filter(e=>visible(e)&&normalize(e.textContent)===normalize(value)&&!e.disabled&&e.getAttribute?.('aria-disabled')!=='true'&&!e.closest('[role="dialog"]')&&!e.matches('button,a,input,label'));
  label.click();await waitFor(()=>matches().length>0);check();const options=matches();
  if(options.length!==1)return 'manual';
  options[0].click();const verified=await waitFor(()=>input.isConnected!==false&&shown()===normalize(value));
  // An option disappearing or a panel closing is not evidence of a chosen value.
  return verified?'filled':'manual';
 };
 const results=[];
 for(const field of fields){
  check();const group=find(field);if(!group){results.push({key:field.key,label:field.label,status:'not_found'});continue;}
  const inputs=[...group.querySelectorAll('input')].filter(visible);let status='manual';
  if(field.kind==='text'&&inputs.length===1)status=await setText(inputs[0],field.value);
  else if(field.kind==='select'&&inputs.length===1)status=await select(inputs[0],field.value);
  else if(['month','range'].includes(field.kind)){
   const values=field.value.split(/[/-]/);if(values.length===inputs.length&&values.every(v=>/^\d{2,4}$/.test(v))){const existing=inputs.map(input=>normalize(input.closest('label')?.querySelector('[class*="sd-Input-display-value-"]')?.textContent||input.value));if(existing.some(Boolean)){status=existing.every((value,i)=>value&&Number(value)===Number(values[i]))?'already_matches':'preserved';}else if(!inputs.some(input=>input.disabled)){const statuses=[];for(let i=0;i<inputs.length;i++)statuses.push(await select(inputs[i],i%2===1?String(Number(values[i])):values[i]));status=statuses.every(s=>['filled','already_matches'].includes(s))?'filled':'manual';}}
  }else if(['school','major'].includes(field.kind)&&inputs.length===1){
   // Autocomplete text alone does not establish an official selected school/major.
   // Preserve current values; leave option selection for the user until verified.
   const value=await setText(inputs[0],field.value);status=value==='preserved'?'preserved':'manual';
  }
  results.push({key:field.key,label:field.label,status});
 }
 return {outcome:'fill_observed',fields:results,message:'已填写能精确匹配的空白字段；其余字段和官网校验请本人核对。未执行提交。'};
}
