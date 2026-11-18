import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {targetPage,eventInput,leaseInput,randomSecret} from '../lib/browser-connector/protocol.ts';
import {targetUrl} from '../extensions/connector/shared.mjs';
const id='276cde6c-124e-4059-b656-3d2636317338',url=`https://app.mokahr.com/campus_apply/zhihu/3818#/job/${id}/apply`;
test('target validation is pinned to exact org/site/job, strips queries and rejects deceptive URLs',()=>{
 assert.equal(targetPage(url,id),url);assert.equal(targetUrl(url+'?pure=1',id),url);
 for(const bad of [url.replace('app.mokahr.com','app.mokahr.com.evil.invalid'),url.replace('zhihu','other'),url.replace(id,crypto.randomUUID()),url.replace('https:','http:'),'https://example.invalid']){assert.equal(targetPage(bad,id),null);assert.equal(targetUrl(bad,id),null);}
 assert.equal(targetPage(url+'?token=do-not-send',id),url);
});
test('lease/event schemas reject arbitrary status, text, credentials or malformed proof',()=>{
 const proof={taskId:crypto.randomUUID(),leaseId:crypto.randomUUID(),leaseSecret:randomSecret()};assert.equal(proof.leaseSecret.length,43);assert.equal(leaseInput.safeParse(proof).success,true);
 assert.equal(eventInput.safeParse({...proof,version:1,eventId:crypto.randomUUID(),type:'needs_login'}).success,true);
 for(const extra of [{type:'submitted'},{type:'needs_login',cookie:'private'},{type:'needs_verification',otp:'000000'},{type:'needs_consent',text:'private'}])assert.equal(eventInput.safeParse({...proof,version:1,eventId:crypto.randomUUID(),...extra}).success,false);
});
test('real bridge code exposes neither generic proxy nor page/window messaging',async()=>{
 const source=readFileSync('extensions/connector/bridge.js','utf8');let listener,fetches=0;
 vm.runInNewContext(source,{chrome:{runtime:{id:'own',onMessage:{addListener(fn){listener=fn;}}}},location:{origin:'https://job-tracker.example.invalid',pathname:'/'},fetch:async()=>{fetches++;return Response.json({items:[]});},Uint8Array,String,JSON,Response});
 for(const path of ['https://evil.invalid','../profile','pairings/start','pairings/x/approve','devices/x/revoke','device/../profile']){let response;listener({type:'JT_CONNECTOR_API',method:'POST',path},{id:'own'},r=>response=r);assert.equal(response.status,403);}
 let called=false;listener({type:'JT_CONNECTOR_API',method:'GET',path:'device/tasks'},{id:'foreign'},()=>called=true);assert.equal(called,false);assert.equal(fetches,0);
 await new Promise(resolve=>listener({type:'JT_CONNECTOR_API',method:'GET',path:'device/tasks'},{id:'own'},response=>{assert.equal(response.ok,true);resolve();}));assert.equal(fetches,1);
 assert.doesNotMatch(source,/window\.addEventListener|postMessage/);
});
test('extension package has exact origins, isolated bridge, no cookie or external-message permission',()=>{
 const manifest=JSON.parse(readFileSync('extensions/connector/manifest.json','utf8'));assert.equal(manifest.manifest_version,3);assert.equal(manifest.content_scripts[0].world,'ISOLATED');assert.deepEqual(manifest.host_permissions,['https://job-tracker.example.invalid/*','https://app.mokahr.com/*']);assert.ok(!manifest.permissions.includes('cookies'));assert.ok(!manifest.permissions.includes('webRequest'));assert.ok(!manifest.externally_connectable);
});

async function backgroundHarness(respond,sessionSeed={}){
 const local={device:{id:crypto.randomUUID(),secret:randomSecret(),name:'test'}},session={...sessionSeed};let listener;
 const area=data=>({setAccessLevel:async()=>{},get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,data[key]])),set:async values=>Object.assign(data,values),remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete data[key];},clear:async()=>{for(const key of Object.keys(data))delete data[key];}});
 const chrome={storage:{local:area(local),session:area(session)},tabs:{query:async()=>[{id:1,url:'https://job-tracker.example.invalid/'}],sendMessage:async(_,message)=>respond(message),create:async()=>({id:2})},runtime:{id:'own',getURL:path=>'chrome-extension://own/'+path,onMessage:{addListener:fn=>listener=fn}},alarms:{onAlarm:{addListener(){}},get:async()=>({}),create(){}}};
 const source=readFileSync('extensions/connector/background.mjs','utf8').replace(/^import .*\n/gm,'');
 vm.runInNewContext(source,{chrome,SITE:'https://job-tracker.example.invalid',secret:randomSecret,targetUrl,labels:{},crypto,URL,Date,Error,Promise,Uint8Array,atob});
 return {session,local,send:message=>new Promise(resolve=>listener(message,{id:'own',url:'chrome-extension://own/popup.html'},resolve))};
}
test('background clears definitively rejected claim so another task can be selected',async()=>{
 const harness=await backgroundHarness(()=>({ok:false,status:409,error:'并发领取冲突'}));
 await harness.send({action:'CLAIM',taskId:'first'});assert.equal(harness.session.claim,undefined);
 const result=await harness.send({action:'CLAIM',taskId:'second'});assert.equal(result.error,'并发领取冲突');assert.equal(harness.session.claim,undefined);
});
test('background preserves unknown network claim and retries identical id and secret',async()=>{
 const requests=[];const harness=await backgroundHarness(message=>{requests.push({...message.body});throw new Error('network');});
 await harness.send({action:'CLAIM',taskId:'first'});assert.ok(harness.session.claim);
 await harness.send({action:'CLAIM',taskId:'first'});assert.deepEqual(requests[0],requests[1]);
 const result=await harness.send({action:'CLAIM',taskId:'second'});assert.match(result.error,/重试同一任务/);
});
test('background refreshes conflict version without replaying a changed event',async()=>{
 const active={proof:{taskId:crypto.randomUUID(),leaseId:crypto.randomUUID(),leaseSecret:randomSecret()},task:{title:'test',state:'leased',version:1}};const requests=[];
 const harness=await backgroundHarness(message=>{requests.push(message.path);return message.path==='device/events'?{ok:false,status:409,error:'版本冲突'}:{ok:true,data:{task:{state:'needs_login',version:3}}};},{active});
 await harness.send({action:'WAIT',reason:'needs_login'});assert.equal(harness.session.report,undefined);assert.equal(harness.session.active.task.version,3);assert.deepEqual(requests,['device/events','device/materials']);
});
test('background keeps unknown event result for idempotent retry and denies empty claim',async()=>{
 const active={proof:{taskId:crypto.randomUUID(),leaseId:crypto.randomUUID(),leaseSecret:randomSecret()},task:{state:'leased',version:1}};
 const harness=await backgroundHarness(()=>{throw new Error('network');},{active});
 await harness.send({action:'WAIT',reason:'needs_login'});const pending=harness.session.report;assert.ok(pending);
 await harness.send({action:'WAIT',reason:'needs_login'});assert.deepEqual(harness.session.report,pending);
 const empty=await backgroundHarness(()=>{throw new Error('must not call');});assert.match((await empty.send({action:'CLAIM',taskId:''})).error,/选择/);assert.equal(empty.session.claim,undefined);
});
