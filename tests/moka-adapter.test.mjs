import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {mokaAdapter} from '../extensions/connector/moka-adapter.mjs';
import {buildFields} from '../extensions/connector/fields.mjs';
const id='276cde6c-124e-4059-b656-3d2636317338',job={externalJobId:id,title:'Target job'};
function harness({url=`https://app.mokahr.com/campus_apply/zhihu/3818#/job/${id}/apply`,dialog=false,consent=false,existing=false,existingButton=false}={}){
 let changed=0;const box={type:'checkbox',checked:false,parentElement:{parentElement:{textContent:'我已同意 隐私说明'}},closest:()=>null,getBoundingClientRect:()=>({width:20,height:20})};
 const container={getBoundingClientRect:()=>({width:100,height:40}),innerText:'上传简历 支持pdf、doc等格式',querySelector:selector=>selector.includes('file_upload-btn')?{textContent:existingButton?'Existing resume':'上传简历'}:null};const input={type:'file',name:'resumeKey',accept:'.pdf,.doc',disabled:false,files:existing?[{}]:[],closest:()=>container,dispatchEvent:e=>{if(e.type==='change')changed++;}};
 const document={querySelector:()=>input,body:{innerText:'Target job'},querySelectorAll:selector=>selector==='input#resumeKey[type="file"][name="resumeKey"]'?[input]:selector==='[role="dialog"],.ReactModal__Content'&&dialog?[{innerText:'请先登录',getBoundingClientRect:()=>({width:200,height:200})}]:selector==='input'&&consent?[box]:[]};
 class Transfer{constructor(){this.files=[];this.items={add:f=>this.files.push(f)};}}
 const context={URL,location:{href:url},document,getComputedStyle:()=>({visibility:'visible'}),crypto,Date,Uint8Array,TextDecoder,DataTransfer:Transfer,File,Event,atob,setTimeout};
 return {input,changed:()=>changed,run:request=>vm.runInNewContext('('+mokaAdapter.toString()+')(request)',{...context,request:{job,fields:[],executeBefore:new Date(Date.now()+10000).toISOString(),...request}})};
}
test('adapter refuses wrong org/job and stops at user login/consent without mutating',async()=>{
 await assert.rejects(harness({url:'https://evil.invalid'}).run({mode:'upload'}),/目标岗位/);
 for(const [options,gate]of [[{dialog:true},'needs_login'],[{consent:true},'needs_consent']]){const h=harness(options);assert.equal((await h.run({mode:'upload'})).gate,gate);assert.equal(h.changed(),0);}
});
test('adapter verifies frozen PDF bytes and dispatches exact resume input once; existing file blocks',async()=>{
 const bytes=new TextEncoder().encode('%PDF-1.7 fixture only'),sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');const file={base64:Buffer.from(bytes).toString('base64'),sizeBytes:bytes.length,sha256,name:'fixture.pdf'};
 const h=harness();await assert.rejects(h.run({mode:'upload',file:{...file,sha256:'0'.repeat(64)}}),/校验失败/);assert.equal(h.changed(),0);
 assert.equal((await h.run({mode:'upload',file})).outcome,'upload_dispatched');assert.equal(h.changed(),1);assert.equal(h.input.files[0].name,'fixture.pdf');await assert.rejects(h.run({mode:'upload',file}),/已有附件/);assert.equal(h.changed(),1);
 await assert.rejects(harness({existing:true}).run({mode:'upload',file}),/已有附件/);
 const named=harness({existingButton:true});assert.equal((await named.run({mode:'scan'})).resumePresent,true);await assert.rejects(named.run({mode:'upload',file}),/已有附件/);assert.equal(named.changed(),0);
});
test('adapter field plan uses only frozen explicit fields and never credentials or invented answers',()=>{
 const fields=buildFields({profile:{data:{name:'Frozen',phone:'123',email:'a@example.invalid',expectedCities:'北京',password:'do not use',education:[{school:'School',major:'Major',degree:'本科',start:'2023-09',end:'2027-06'}]}},answers:{internshipAvailability:'是',jobSource:'知乎校招网站'}});
 assert.ok(fields.some(f=>f.key==='education.0.dates'&&f.value==='2023-09/2027-06'));assert.ok(!JSON.stringify(fields).includes('do not use'));assert.ok(!fields.some(f=>/privacy|otp|password/i.test(f.key)));
});
test('actual migration prevents browser action deletion, overwrite and task/kind duplicate',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=OFF');db.exec(readFileSync('drizzle/0006_chilly_marauders.sql','utf8'));
 db.exec("INSERT INTO browser_actions(id,owner_id,device_id,lease_id,task_id,snapshot_id,kind,created_at) VALUES('a','owner','dev','lease','task','snap','upload','now')");
 assert.throws(()=>db.exec("INSERT INTO browser_actions(id,owner_id,device_id,lease_id,task_id,snapshot_id,kind,created_at) VALUES('b','owner','dev','lease','task','snap','upload','now')"));
 assert.throws(()=>db.exec("UPDATE browser_actions SET owner_id='other' WHERE id='a'"));db.exec("UPDATE browser_actions SET state='upload_dispatched',result_hash='hash',finished_at='later' WHERE id='a'");assert.throws(()=>db.exec("UPDATE browser_actions SET state='uncertain' WHERE id='a'"));assert.throws(()=>db.exec("DELETE FROM browser_actions WHERE id='a'"));db.close();
});

test('actual text adapter writes only unique blank matching fields and preserves existing values',async()=>{
 class Input{constructor(value=''){this.current=value;this.type='text';this.disabled=false;this.readOnly=false;this.maxLength=255;this.isConnected=true;this.events=[];}get value(){return this.current;}set value(value){this.current=value;}getBoundingClientRect(){return {width:100,height:30};}closest(){return null;}dispatchEvent(event){this.events.push(event.type);}}
 async function run(value='',duplicates=1){const input=new Input(value),group={getBoundingClientRect:()=>({width:200,height:70}),querySelector:()=>({textContent:'期望城市'}),querySelectorAll:()=>[input]};const document={querySelector:()=>null,body:{innerText:'Target job'},querySelectorAll:selector=>selector==='input'?[input]:selector==='[class*="apply-field-"]'?Array.from({length:duplicates},()=>group):[]};const request={mode:'fill',job,fields:[{key:'expectedCities',label:'期望城市',kind:'text',value:'北京',occurrence:0,occurrences:1}],executeBefore:new Date(Date.now()+5000).toISOString()};const result=await vm.runInNewContext('('+mokaAdapter.toString()+')(request)',{request,document,location:{href:`https://app.mokahr.com/campus_apply/zhihu/3818#/job/${id}/apply`},URL,Date,getComputedStyle:()=>({visibility:'visible'}),HTMLInputElement:Input,Event,setTimeout});return {result,input};}
 const blank=await run();assert.equal(blank.input.value,'北京');assert.equal(blank.result.fields[0].status,'filled');assert.deepEqual(blank.input.events,['input','change']);
 const existing=await run('上海');assert.equal(existing.input.value,'上海');assert.equal(existing.result.fields[0].status,'preserved');assert.equal(existing.input.events.length,0);
 const ambiguous=await run('',2);assert.equal(ambiguous.input.value,'');assert.equal(ambiguous.result.fields[0].status,'not_found');assert.equal(ambiguous.input.events.length,0);
});

test('Moka custom select uses the verified menu item only inside its own dropdown',async()=>{
 let selected='',clicks=0,opened=false;const visible=()=>({width:100,height:30});
 const option={textContent:'是',getBoundingClientRect:visible,closest:()=>null,matches:()=>false,click:()=>{clicks++;selected='是';}};
 const dropdown={querySelectorAll:()=>opened?[option]:[]};
 const label={className:'sd-Select-container-7ui5W',querySelector:()=>({textContent:selected}),click:()=>{opened=true;}};
 const input={type:'text',value:'',getBoundingClientRect:visible,closest:selector=>selector==='label'?label:selector.includes('sd-Dropdown-container-')?dropdown:null};
 const group={getBoundingClientRect:visible,querySelector:()=>({textContent:'是否可以实习？'}),querySelectorAll:()=>[input]};
 const document={querySelector:()=>null,body:{innerText:'Target job'},querySelectorAll:selector=>selector==='input'?[input]:selector==='[class*="apply-field-"]'?[group]:[]};
 const request={mode:'fill',job,fields:[{key:'internshipAvailability',label:'是否可以实习？',kind:'select',value:'是',occurrence:0,occurrences:1}],executeBefore:new Date(Date.now()+5000).toISOString()};
 const result=await vm.runInNewContext('('+mokaAdapter.toString()+')(request)',{request,document,location:{href:`https://app.mokahr.com/campus_apply/zhihu/3818#/job/${id}/apply`},URL,Date,getComputedStyle:()=>({visibility:'visible'}),setTimeout});
 assert.equal(result.fields[0].status,'filled');assert.equal(clicks,1);assert.equal(selected,'是');
});

test('semantic assignments fill an alias-bound field and reject a changed form fingerprint',async()=>{
 const {buildFields}=await import('../extensions/connector/fields.mjs');const {mapFields,mappingSignature}=await import('../extensions/connector/mapping.mjs');
 class Input{constructor(){this.valueText='';this.type='text';this.placeholder='意向城市';this.disabled=false;this.readOnly=false;this.maxLength=255;this.isConnected=true;}get value(){return this.valueText;}set value(value){this.valueText=value;}getBoundingClientRect(){return {width:100,height:30};}closest(){return null;}dispatchEvent(){}}
 const input=new Input(),visible=()=>({width:100,height:30});const block={querySelector:()=>({textContent:'求职意向'})};
 const group={getBoundingClientRect:visible,closest:()=>block,querySelector:selector=>selector.includes('title-')?{textContent:'意向城市'}:null,querySelectorAll:()=>[input]};
 const document={querySelector:()=>null,body:{innerText:'Target job'},querySelectorAll:selector=>selector==='input'?[input]:selector==='[class*="apply-field-"]'?[group]:[]};
 const fields=buildFields({profile:{revision:2,data:{expectedCities:'北京',education:[]}},answers:{}});
 const context={document,location:{href:`https://app.mokahr.com/campus_apply/zhihu/3818#/job/${id}/apply`},URL,Date,getComputedStyle:()=>({visibility:'visible'}),HTMLInputElement:Input,Event,setTimeout};
 const run=request=>vm.runInNewContext('('+mokaAdapter.toString()+')(request)',{...context,request:{job,fields,executeBefore:new Date(Date.now()+3000).toISOString(),...request}});
 const scan=await run({mode:'scan'});assert.equal(scan.schemaSignature,mappingSignature(scan.schema));const assignment=mapFields(scan.schema,fields).filter(row=>row.status==='fillable').map(row=>({fieldId:row.fieldId,sourceKey:row.sourceKey}));assert.equal(assignment.length,1);
 await assert.rejects(run({mode:'fill',assignments:assignment,schemaSignature:'outdated'}),/页面结构/);assert.equal(input.value,'');
 const result=await run({mode:'fill',assignments:assignment,schemaSignature:scan.schemaSignature});assert.equal(input.value,'北京');assert.equal(result.fields[0].status,'filled');
});

test('SD option selection waits for readback and refuses duplicate candidates',async()=>{
 const visible=()=>({width:100,height:30});
 async function run(duplicates=false){let selected='',clicks=0,opened=false;const option={textContent:'是',getBoundingClientRect:visible,closest:()=>null,matches:()=>false,getAttribute:()=>null,click:()=>{clicks++;setTimeout(()=>selected='是',65);}};const dropdown={querySelectorAll:()=>opened?(duplicates?[option,{...option}]:[option]):[]};const label={className:'sd-Select-container-7ui5W',querySelector:()=>({textContent:selected}),click:()=>opened=true};const input={type:'text',value:'',getBoundingClientRect:visible,closest:selector=>selector==='label'?label:selector.includes('sd-Dropdown-container-')?dropdown:null};const group={getBoundingClientRect:visible,querySelector:()=>({textContent:'是否可以实习？'}),querySelectorAll:()=>[input]};const document={querySelector:()=>null,body:{innerText:'Target job'},querySelectorAll:selector=>selector==='input'?[input]:selector==='[class*="apply-field-"]'?[group]:[]};const request={mode:'fill',job,fields:[{key:'internshipAvailability',label:'是否可以实习？',value:'是',kind:'select',occurrence:0,occurrences:1}],executeBefore:new Date(Date.now()+3000).toISOString()};const result=await vm.runInNewContext('('+mokaAdapter.toString()+')(request)',{request,document,location:{href:`https://app.mokahr.com/campus_apply/zhihu/3818#/job/${id}/apply`},URL,Date,getComputedStyle:()=>({visibility:'visible'}),setTimeout});return {result,clicks,selected};}
 const valid=await run();assert.equal(valid.result.fields[0].status,'filled');assert.equal(valid.selected,'是');assert.equal(valid.clicks,1);const ambiguous=await run(true);assert.equal(ambiguous.clicks,0);assert.equal(ambiguous.result.fields[0].status,'manual');
});

test('invalid operation deadline is rejected before file transmission',async()=>{
 const h=harness();await assert.rejects(h.run({mode:'upload',executeBefore:'invalid'}),/授权已过期/);assert.equal(h.changed(),0);
});
