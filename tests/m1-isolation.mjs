// Integration against the production build in actual workerd, D1 SQLite and R2 local emulators.
// Identities are injected at the trusted Worker boundary ONLY by this test process.
// This is not a production sign-in test and adds no auth override to the deployed code.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {resolve} from 'node:path';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {fixture,multiPageFixture} from './pdf-fixture.mjs';
const dir=await mkdtemp(resolve('.sites-runtime/m1-isolation-'));
const config=resolve('dist/server/wrangler.json');
const wrangler=resolve('node_modules/wrangler/bin/wrangler.js');
let worker,logs='',checks=0;
function command(args){return new Promise((res,rej)=>{const p=spawn(process.execPath,[wrangler,...args],{env:process.env,stdio:['ignore','pipe','pipe']});let output='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);p.on('error',rej);p.on('exit',code=>code===0?res(output):rej(new Error(output)));});}
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
const origin=`http://127.0.0.1:${port}`;
const A={'oai-authenticated-user-id':'m1-test-owner-A','oai-authenticated-user-email':'a@example.invalid'};
const B={'oai-authenticated-user-id':'m1-test-owner-B','oai-authenticated-user-email':'b@example.invalid'};
async function call(identity,path,method='GET',body,expected=200,extra={}){
 const json=body!==undefined&&!(body instanceof FormData);
 const signal=AbortSignal.timeout(path.startsWith('/api/catalog/')?120_000:20_000);
 try {
  const r=await fetch(origin+path,{method,headers:{...identity,...(json?{'Content-Type':'application/json'}:{}),...extra},body:body===undefined?undefined:json?JSON.stringify(body):body,redirect:'manual',signal});
  assert.equal(r.status,expected,`${method} ${path} expected ${expected}, got ${r.status}: ${r.status===expected?'':await r.text()}`);
  const bytes=r.body?await r.arrayBuffer():null;
  checks++;
  return new Response(bytes,{status:r.status,headers:r.headers});
 } catch (error) {
  if(signal.aborted)throw new Error(`${method} ${path} timed out`,{cause:error});
  throw error;
 }
}
async function data(...args){return(await call(...args)).json();}
function upload(id,label='isolation fixture',bytes=fixture(),name='fixture.pdf'){const form=new FormData();form.append('id',id);form.append('label',label);form.append('file',new File([bytes],name,{type:'application/pdf'}));return form;}
try{
 const migrations=(await readdir('drizzle')).filter(x=>x.endsWith('.sql')).sort();
 const legacyFilterId=randomUUID();
 const legacySettings=`INSERT INTO catalog_preferences
  (owner_id,source_ids_json,interval_hours,filter_json,filter_id,viewed_through)
  VALUES ('local_seedy','["zhihu-moka-campus","xunlei-moka-campus"]',6,'{"companyId":"zhihu"}','${legacyFilterId}','2000-01-01T00:00:00.000Z');`;
 const schema=await Promise.all(migrations.map(x=>readFile('drizzle/'+x,'utf8')));
 schema.splice(migrations.findIndex(x=>x.startsWith('0008_')),0,legacySettings);
 await writeFile(dir+'/schema.sql',schema.join('\n'));
 await command(['d1','execute','DB','--local','--config',config,'--persist-to',dir,'--file',dir+'/schema.sql']);
 worker=spawn(process.execPath,[wrangler,'dev','--config',config,'--local','--persist-to',dir,'--ip','127.0.0.1','--port',String(port),'--inspector-port','0','--var','CATALOG_ADMIN_USER_ID:m1-test-owner-A',...((process.env.CATALOG_LOCAL_LIVE==='1'||process.env.CATALOG_DISCOVERY_LIVE==='1')?['--var','LOCAL_CATALOG:1']:[])],{env:{...process.env,BROWSER:'none'},stdio:['ignore','pipe','pipe']});
 worker.stdout.on('data',b=>logs+=b);worker.stderr.on('data',b=>logs+=b);
 let ready=false;for(let i=0;i<120;i++){try{await fetch(origin+'/api/health');ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}assert.ok(ready,'workerd failed to start: '+logs);
 const preferencePath='/api/catalog/preferences';
 const saveFilter={action:'create',name:'后端',filters:{companyId:'zhihu',q:'后端'}};
 await call({},preferencePath,'PUT',saveFilter,401);
 await call(A,preferencePath,'PUT',{action:'sources',settings:{sourceIds:['zhihu-moka-campus'],intervalHours:6}},403);
 await call(A,'/api/catalog/local-sync','POST',undefined,403);
 const firstPreferences=await data(A,preferencePath,'PUT',saveFilter);
 const ownFilter=firstPreferences.savedFilters[0];
 assert.equal(firstPreferences.activeFilterId,ownFilter.id);
 assert.equal((await data(A,'/api/companies')).preferences.activeFilterId,ownFilter.id);
 assert.deepEqual((await data(B,'/api/companies')).preferences.savedFilters,[]);
 await call(B,preferencePath,'PUT',{action:'viewed',filterId:ownFilter.id,revision:ownFilter.revision,through:ownFilter.viewedThrough},409);
 await call(B,preferencePath,'PUT',{action:'select',filterId:ownFilter.id},409);
 await call(A,'/api/jobs?companyId=zhihu&newOnly=1','GET',undefined,409);
 assert.equal((await data(A,'/api/jobs?companyId=zhihu&q=%E5%90%8E%E7%AB%AF&newOnly=1')).newCount,0);
 const renamed=(await data(A,preferencePath,'PUT',{action:'edit',filterId:ownFilter.id,revision:1,name:'后端开发',filters:ownFilter.filters})).savedFilters[0];
 assert.equal(renamed.viewedThrough,ownFilter.viewedThrough);
 await call(A,preferencePath,'PUT',{action:'delete',filterId:ownFilter.id,revision:1},409);
 assert.equal((await data(A,preferencePath,'PUT',{action:'delete',filterId:ownFilter.id,revision:2})).activeFilterId,null);

 const local={'oai-authenticated-user-id':'local_seedy','oai-authenticated-user-email':'local@example.invalid'};
 const migrated=(await data(local,'/api/companies')).preferences;
 assert.deepEqual(migrated.sourceIds,['zhihu-moka-campus','xunlei-moka-campus']);
 assert.equal(migrated.intervalHours,6);
 assert.equal(migrated.activeFilterId,legacyFilterId);
 assert.equal(migrated.savedFilters[0].name,'原有筛选');
 assert.equal(migrated.savedFilters[0].viewedThrough,'2000-01-01T00:00:00.000Z');
 if(process.env.CATALOG_DISCOVERY_LIVE==='1'){
  await data(local,preferencePath,'PUT',{action:'sources',settings:{sourceIds:[],intervalHours:6}});
  const empty=await data(local,'/api/jobs?limit=1');
  assert.equal(empty.companyTotals.length,0);
  assert.deepEqual(empty.sourceHealth.preferences.sourceIds,[]);
  const batch=await data(local,'/api/catalog/local-sync','POST');
  assert.equal(batch.runs.length,2);
  assert.ok(batch.runs.every(run=>run.state==='succeeded'),JSON.stringify(batch));
  const overview=await data(local,'/api/jobs?limit=1');
  assert.equal(overview.items.length,1);
  for(const run of batch.runs){
   const source=overview.sourceHealth.sources.find(item=>item.id===run.sourceId);
   const company=overview.companyTotals.find(item=>item.companyId===source.companyId);
   assert.equal(source.selected,false);
   assert.equal(Date.parse(source.nextUpdateAt)-Date.parse(source.lastSuccessAt),86400000);
   assert.equal(company.open,run.seenCount);
   assert.equal(company.recent,company.open);
   assert.equal(company.matching,source.companyId==='zhihu'?company.open:0);
  }
  const viewed=await data(local,'/api/jobs?limit=1&discoverySince='+encodeURIComponent(overview.observedAt));
  assert.ok(viewed.companyTotals.every(company=>company.recent===0));
  assert.equal(viewed.companyTotals.reduce((sum,company)=>sum+company.open,0),batch.runs.reduce((sum,run)=>sum+run.seenCount,0));
  await data(local,preferencePath,'PUT',{action:'sources',settings:{sourceIds:[],intervalHours:0}});
  assert.deepEqual((await data(local,'/api/catalog/local-sync','POST')).runs,[]);
  console.log('Automatic discovery:',JSON.stringify(batch.runs.map(({sourceId,seenCount})=>({sourceId,seenCount}))));
 }
 if(process.env.CATALOG_LOCAL_LIVE==='1'){
  const added=await data(local,preferencePath,'PUT',{action:'create',name:'迅雷',filters:{companyId:'xunlei'}});
  const secondId=added.activeFilterId;
  const first=await data(local,'/api/catalog/local-sync?initial=1','POST');
  assert.equal(first.runs.length,2);
  assert.ok(first.runs.every(run=>run.state==='succeeded'&&run.seenCount>0),JSON.stringify(first));
  const results=await data(local,`/api/jobs?companyId=xunlei&filterId=${secondId}&newOnly=1&limit=1`);
  assert.ok(results.items[0].isNew);
  assert.equal(results.newCount,first.runs.find(run=>run.sourceId==='xunlei-moka-campus').seenCount);
  assert.ok(results.filterCounts.find(count=>count.id===legacyFilterId).newCount>0);
  const detail=await data(local,'/api/jobs/'+encodeURIComponent(results.items[0].id));
  assert.equal(new URL(detail.originalUrl).hostname,'app.mokahr.com');
  assert.ok(detail.jdText&&detail.lastVerifiedAt);
  const viewed=await data(local,preferencePath,'PUT',{action:'viewed',filterId:secondId,revision:1,through:results.observedAt});
  assert.equal(viewed.activeFilterId,secondId);
  const updated=await data(local,`/api/jobs?companyId=xunlei&filterId=${secondId}&newOnly=1`);
  assert.equal(updated.newCount,0);
  assert.equal(updated.filterCounts.find(count=>count.id===legacyFilterId).newCount,results.filterCounts.find(count=>count.id===legacyFilterId).newCount);
  const multiple=await data(local,'/api/jobs?companyId=xunlei%2Czhihu&limit=100');
  assert.equal(multiple.items.length,first.runs.reduce((total,run)=>total+run.seenCount,0));
  const scheduled=updated.sourceHealth.sources.filter(source=>source.selected);
  assert.ok(scheduled.every(source=>source.latestRun?.state==='succeeded'&&Date.parse(source.nextUpdateAt)-Date.parse(source.lastSuccessAt)===6*3600000));
  assert.deepEqual((await data(local,'/api/catalog/local-sync?initial=1','POST')).runs,[]);
  const failedRunId=randomUUID();
  const failureTime=new Date().toISOString();
  await command(['d1','execute','DB','--local','--config',config,'--persist-to',dir,'--command',
   `INSERT INTO catalog_sync_runs (id,source_id,state,started_at,finished_at,error_code,error_message)
    VALUES ('${failedRunId}','xunlei-moka-campus','failed','${failureTime}','${failureTime}','test_failure','retry test');
    UPDATE company_sources SET last_run_id='${failedRunId}',last_error_at='${failureTime}',last_error_message='retry test',
    last_success_at='2000-01-01T00:00:00.000Z' WHERE id='xunlei-moka-campus';`]);
  const beforeRetry=(await data(local,'/api/companies')).sources.find(source=>source.id==='xunlei-moka-campus');
  assert.equal(beforeRetry.latestRun.state,'failed');
  assert.equal(Date.parse(beforeRetry.nextUpdateAt)-Date.parse(failureTime),15*60000);
  assert.deepEqual((await data(local,'/api/catalog/local-sync?initial=1','POST')).runs,[]);
  const retried=await data(local,'/api/catalog/sources/xunlei-moka-campus/sync','POST');
  assert.equal(retried.state,'succeeded');
  const afterRetry=await data(local,`/api/jobs?companyId=xunlei&filterId=${secondId}&newOnly=1`);
  assert.equal(afterRetry.newCount,0,'Re-sync must preserve each existing job’s first discovery time.');
  const saved=await data(local,'/api/jobs/'+encodeURIComponent(detail.id)+'/save','POST');
  const application=async()=> (await data(local,'/api/applications')).items.find(item=>item.id===saved.applicationId);
  const beforeClose=await application();
  assert.equal(beforeClose.officialJob.availability,detail.availability);
  const jobPath='/api/jobs/'+encodeURIComponent(detail.id);
  const appPath='/api/applications/'+saved.applicationId;
  assert.equal((await data(local,jobPath)).applicationProgress.status,'saved');
  assert.equal((await data(B,jobPath)).applicationProgress,null);
  const applied=await data(local,appPath,'PATCH',{version:beforeClose.version,status:'applied',appliedAt:'2026-01-15T09:30:00+08:00'});
  assert.equal(applied.appliedAt,'2026-01-15T01:30:00.000Z');
  await call(local,appPath,'PATCH',{version:applied.version,appliedAt:'9999-01-01T01:00:00Z'},422);
  await call(local,appPath,'PATCH',{version:applied.version,appliedAt:null},422);
  await call(local,appPath,'PATCH',{version:beforeClose.version,appliedAt:'2026-01-15T02:00:00Z'},409);
  const listed=await data(local,'/api/jobs?companyId=xunlei&limit=100');
  assert.equal(listed.items.find(job=>job.id===detail.id).applicationProgress.status,'applied');
  await data(local,'/api/interviews','POST',{applicationId:saved.applicationId,kind:'interview',round:'一面',startsAt:'2026-01-20T03:00:00Z',endsAt:'2026-01-20T04:00:00Z'},201);
  const inProgress=await data(local,appPath,'PATCH',{version:applied.version,status:'in_progress',nextAction:'准备一面'});
  const interviewProgress=(await data(local,jobPath)).applicationProgress;
  assert.equal(interviewProgress.status,'in_progress');
  assert.equal(interviewProgress.hasInterview,true);
  assert.equal(inProgress.appliedAt,applied.appliedAt);
  // Change the status of the real catalog row in this temporary D1 database only.
  assert.match(detail.id,/^[a-z0-9:_-]+$/i);
  await command(['d1','execute','DB','--local','--config',config,'--persist-to',dir,'--command',
   `UPDATE jobs SET availability='closed',closed_at=last_verified_at WHERE id='${detail.id}'`]);
  const afterClose=await application();
  assert.equal(afterClose.officialJob.availability,'closed');
  assert.equal(afterClose.status,'in_progress');
  assert.equal(afterClose.appliedAt,inProgress.appliedAt);
  assert.deepEqual((await data(B,'/api/applications')).items,[]);
  console.log('Verified real sources:',JSON.stringify(first.runs.map(({sourceId,seenCount})=>({sourceId,seenCount}))));
 }
 if(process.env.CATALOG_NVIDIA_LIVE==='1'){
  const sourceId='nvidia-workday-china-internships';
  const health=await data(A,'/api/companies');
  assert.equal(health.sources.find(source=>source.id===sourceId).label,'Workday 中国实习');
  const run=await data(A,'/api/catalog/sources/'+sourceId+'/sync','POST');
  assert.equal(run.state,'succeeded');
  assert.ok(run.seenCount>20,'The live source must span multiple pages for this check');
  const directory=[];
  let cursor;
  do {
   const query=new URLSearchParams({companyId:'nvidia',limit:'20',...(cursor?{cursor}:{})});
   const page=await data(A,'/api/jobs?'+query);
   directory.push(...page.items);
   cursor=page.nextCursor;
   assert.ok(directory.length<=run.seenCount);
  } while(cursor);
  assert.equal(directory.length,run.seenCount);
  assert.equal(new Set(directory.map(job=>job.externalJobId)).size,run.seenCount);
  assert.ok(directory.every(job=>job.employmentType==='intern'));
  for(const job of [directory[0],directory.at(-1)]){
   const detail=await data(A,'/api/jobs/'+encodeURIComponent(job.id));
   assert.ok(detail.jdText.length>50);
   assert.equal(new URL(detail.originalUrl).hostname,'nvidia.wd5.myworkdayjobs.com');
   assert.equal(detail.availability,detail.evidence.posted&&detail.evidence.canApply?'accepting':'closed');
  }
  const stored=await command(['d1','execute','DB','--local','--config',config,'--persist-to',dir,'--json',
   '--command',"SELECT availability, count(*) AS count FROM jobs WHERE source_id='nvidia-workday-china-internships' GROUP BY availability"]);
  const counts=JSON.parse(stored)[0].results;
  assert.equal(counts.reduce((sum,row)=>sum+row.count,0),run.seenCount);
  console.log('NVIDIA directory D1 counts:',JSON.stringify(counts));
 }
 const aid=randomUUID(),bid=randomUUID();
 const a=(await data(A,'/api/resumes','POST',upload(aid),201)).item;
 const b=(await data(B,'/api/resumes','POST',upload(bid),201)).item;
 assert.equal(a.id,aid);assert.equal(b.id,bid);
 // Auth required on every M1 endpoint, including Range/download and mutations.
 for(const [path,method,body] of [['/api/resumes','GET'],['/api/resumes','POST'],[`/api/resumes/${aid}`,'GET'],[`/api/resumes/${aid}/file`,'GET'],[`/api/resumes/${aid}/extract`,'POST'],[`/api/resumes/${aid}/archive`,'POST',{version:1}],[`/api/resumes/${aid}/restore`,'POST',{version:1}],['/api/material-settings','PUT',{version:0,defaultResumeId:aid}],['/api/profile','GET'],['/api/profile','PUT',{data:{},version:0}],['/api/profile-versions','GET']])await call({},path,method,body,401);
 // Lists and download bytes belong only to the caller. Query spoofing cannot change ownership.
 for(const [who,own,foreign] of [[A,aid,bid],[B,bid,aid]]){
  const list=await data(who,'/api/resumes?ownerId=other');assert.deepEqual(list.items.map(x=>x.id),[own]);assert.equal(list.defaultResumeId,own);assert.ok(!('objectKey'in list.items[0]));assert.ok(!('ownerId'in list.items[0]));assert.ok(!('extractionText'in list.items[0]));
  for(const [suffix,method,body] of [['','GET'],['/file','GET'],['/extract','POST'],['/archive','POST',{version:1}],['/restore','POST',{version:1}]])await call(who,`/api/resumes/${foreign}${suffix}`,method,body,404);
  await call(who,`/api/resumes/${foreign}/file`,'GET',undefined,404,{Range:'bytes=0-5'});
  await call(who,'/api/material-settings','PUT',{version:1,defaultResumeId:foreign},404);
  await call(who,'/api/profile','PUT',{data:{name:'should not persist'},version:0,sourceResumeId:foreign},404);
 }
 const binary=new Uint8Array(await(await call(A,`/api/resumes/${aid}/file`)).arrayBuffer());assert.equal(createHash('sha256').update(binary).digest('hex'),createHash('sha256').update(fixture()).digest('hex'));
 const ranged=await call(A,`/api/resumes/${aid}/file`,'GET',undefined,206,{Range:'bytes=0-4'});assert.equal(await ranged.text(),'%PDF-');assert.match(ranged.headers.get('Content-Range'),/^bytes 0-4\//);
 await call(A,`/api/resumes/${aid}/file`,'GET',undefined,416,{Range:'bytes=999999-'});
 assert.equal((await data(A,'/api/resumes','POST',upload(aid))).replayed,true);
 await call(A,'/api/resumes','POST',upload(aid,'isolation fixture',multiPageFixture()),409);
 await call(B,'/api/resumes','POST',upload(aid),409);await call(A,'/api/resumes','POST',upload(aid,'different label'),409);
 for(const [bytes,name,status] of [[new Uint8Array(),'empty.pdf',422],[new TextEncoder().encode('fake PDF'),'fake.pdf',415],[new Uint8Array(5*1024*1024+1),'large.pdf',413]])await call(A,'/api/resumes','POST',upload(randomUUID(),'invalid',bytes,name),status);
 assert.equal((await data(A,'/api/resumes')).total,1);
 const extracted=(await data(A,`/api/resumes/${aid}/extract`,'POST')).item;assert.equal(extracted.extractionStatus,'extracted');assert.match(extracted.extractionText,/M1 Acceptance Fixture/);assert.deepEqual(extracted.suggestions.emails,['test@example.invalid']);
 const malformed=randomUUID();await call(A,'/api/resumes','POST',upload(malformed,'malformed parser fixture',new TextEncoder().encode('%PDF-1.7\ninvalid\n%%EOF')),201);const failed=(await data(A,`/api/resumes/${malformed}/extract`,'POST')).item;assert.equal(failed.extractionStatus,'manual_required');await call(A,`/api/resumes/${malformed}/file`);
 const v1=await data(A,'/api/profile','PUT',{data:{name:'owner A'},version:0,label:'a1',sourceResumeId:aid});
 const bv1=await data(B,'/api/profile','PUT',{data:{name:'owner B'},version:0,label:'b1',sourceResumeId:bid});
 for(const [who,own,foreign] of [[A,v1,bv1],[B,bv1,v1]]){
  const versions=await data(who,'/api/profile-versions');assert.deepEqual(versions.items.map(x=>x.id),[own.currentVersionId]);
  await call(who,`/api/profile-versions/${foreign.currentVersionId}`,'GET',undefined,404);await call(who,`/api/profile-versions/${foreign.currentVersionId}/restore`,'POST',{version:1},404);
 }
 for(const [method,body,suffix] of [['GET',undefined,''],['POST',{version:1},'/restore']])await call({},`/api/profile-versions/${v1.currentVersionId}${suffix}`,method,body,401);
 await call(A,'/api/profile','PUT',{data:{name:'spoof'},version:1,ownerId:'m1-test-owner-B'},422);
 const concurrent=await Promise.all([1,2].map(i=>fetch(origin+'/api/profile',{method:'PUT',headers:{...A,'Content-Type':'application/json'},body:JSON.stringify({data:{name:'concurrent '+i},version:1,label:'a2'})})));assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);checks+=2;
 assert.equal((await data(A,`/api/profile-versions/${v1.currentVersionId}`)).data.name,'owner A');
 const restored=await data(A,`/api/profile-versions/${v1.currentVersionId}/restore`,'POST',{version:2});assert.equal(restored.version,3);assert.equal(restored.data.name,'owner A');await call(A,'/api/profile','PUT',{data:{name:'stale'},version:1},409);
 assert.equal((await data(B,'/api/profile')).data.name,'owner B');assert.equal((await data(B,'/api/profile')).version,1);
 await call(A,'/api/material-settings','PUT',{version:1,defaultResumeId:null});await call(A,'/api/material-settings','PUT',{version:1,defaultResumeId:aid},409);await call(A,'/api/material-settings','PUT',{version:2,defaultResumeId:aid});
 const archived=(await data(A,`/api/resumes/${aid}/archive`,'POST',{version:1})).item;assert.ok(archived.archivedAt);assert.equal((await data(A,'/api/resumes')).defaultResumeId,null);assert.equal((await data(B,'/api/resumes')).defaultResumeId,bid);
 assert.equal((await data(A,'/api/resumes?archived=1')).items[0].id,aid);assert.equal((await data(B,'/api/resumes?archived=1')).items.length,0);await call(B,`/api/resumes/${aid}/file`,'GET',undefined,404);await call(A,`/api/resumes/${aid}/file`);
 // Historical references survive archive; a new source from another owner is always rejected.
 await call(A,`/api/profile-versions/${v1.currentVersionId}/restore`,'POST',{version:3});await call(A,`/api/resumes/${aid}/restore`,'POST',{version:2});assert.equal((await data(A,'/api/resumes')).defaultResumeId,null);
 assert.equal((await data(A,'/api/profile-versions')).items.length,4);assert.equal((await data(B,'/api/profile-versions')).items.length,1);
 if(process.env.M2_LIVE==='1'||(process.env.M3_LIVE==='1'||process.env.M4_LIVE==='1')){
  await call({},'/api/jobs','GET',undefined,401);await call({},'/api/companies','GET',undefined,401);await call({},'/api/catalog/sources/zhihu-moka-campus/sync','POST',undefined,401);
  await call(B,'/api/catalog/sources/zhihu-moka-campus/sync','POST',undefined,403);await call(A,'/api/catalog/sources/unlisted/sync','POST',undefined,404);await call(A,'/api/catalog/sources/zhihu-moka-campus/sync','POST',{url:'http://127.0.0.1'},422);
  const run=await data(A,'/api/catalog/sources/zhihu-moka-campus/sync','POST');assert.equal(run.state,'succeeded');
  const catalog=await data(A,'/api/jobs');assert.equal(catalog.items.length,run.seenCount);assert.equal(catalog.sourceHealth.canSync,true);assert.equal((await data(B,'/api/jobs')).sourceHealth.canSync,false);
  await call(A,'/api/catalog/sources/zhihu-moka-campus/sync','POST',undefined,429);
  if(catalog.items.length){
   const job=catalog.items[0],path='/api/jobs/'+encodeURIComponent(job.id);const details=await data(A,path);assert.ok(details.jdText.length>0);assert.match(details.originalUrl,/^https:\/\/app\.mokahr\.com\/campus_apply\/zhihu\/3818/);assert.equal(details.programKind,'unknown');
   const search=await data(A,'/api/jobs?q='+encodeURIComponent(job.title));assert.ok(search.items.some(x=>x.id===job.id));assert.equal((await data(A,'/api/jobs?q=UNLIKELY_NO_JOB_8fb9823')).items.length,0);
   assert.equal((await data(A,'/api/jobs?programKind=summer_internship')).items.length,0);
   assert.equal((await data(A,'/api/jobs?companyId=zhihu')).items.length,run.seenCount);assert.equal((await data(A,'/api/jobs?companyId=not-configured')).items.length,0);
   const cityMatches=await data(A,'/api/jobs?city='+encodeURIComponent(details.locations[0]?.split('·')[0]||'北京市'));assert.ok(cityMatches.items.some(x=>x.id===job.id));
   assert.ok((await data(A,'/api/jobs?employmentType='+details.employmentType)).items.some(x=>x.id===job.id));
   assert.ok((await data(A,'/api/jobs?availability='+details.availability)).items.some(x=>x.id===job.id));
   assert.ok((await data(A,'/api/jobs?graduationYear=2027')).items.every(x=>x.graduationYear===2027));await call(A,'/api/jobs?cursor=invalid','GET',undefined,422);await call(A,'/api/jobs?limit=1000','GET',undefined,422);
   if(run.seenCount>1){const page=await data(A,'/api/jobs?limit=1');assert.ok(page.nextCursor);const next=await data(A,'/api/jobs?limit=1&cursor='+encodeURIComponent(page.nextCursor));assert.notEqual(page.items[0].id,next.items[0].id);}
   const saved=await data(A,path+'/save','POST');assert.equal((await data(A,path+'/save','POST')).applicationId,saved.applicationId);assert.equal((await data(B,path)).savedApplicationId,null);const other=await data(B,path+'/save','POST');assert.notEqual(other.applicationId,saved.applicationId);
   const app=(await data(A,'/api/applications')).items.find(x=>x.id===saved.applicationId);assert.equal(app.status,'saved');assert.equal(app.appliedAt,null);await call(B,'/api/applications/'+saved.applicationId,'PATCH',{version:1,status:'applied'},404);await call({},path+'/save','POST',undefined,401);
  }
  if((process.env.M3_LIVE==='1'||process.env.M4_LIVE==='1')){
   const target=catalog.items.find(x=>x.externalJobId==='276cde6c-124e-4059-b656-3d2636317338');assert.ok(target,'verified real target must still be available');
   const prep=await data(A,'/api/preparations','POST',{jobId:target.id}),base='/api/preparations/'+prep.id;
   assert.equal((await data(A,'/api/preparations','POST',{jobId:target.id})).id,prep.id);
   assert.equal((await data(A,base+'/preview','POST',{version:prep.version})).canConfirm,false);assert.equal((await data(A,'/api/submissions')).items.length,0);
   const complete={name:'M3 isolated acceptance fixture',phone:'13900000000',email:'fixture@example.invalid',graduationMonth:'2027-06',expectedCities:'北京',internshipAvailability:'是',jobSource:'招聘网站',education:[{school:'Test school',major:'CS',degree:'硕士',start:'2024-09',end:'2027-06'}]};
   const profile=await data(A,'/api/profile','PUT',{data:complete,version:(await data(A,'/api/profile')).version,label:'M3 isolated test only'});
   const chosen={version:prep.version,resumeId:aid,profileVersionId:profile.currentVersionId,answers:{internshipAvailability:'是',jobSource:'招聘网站',jobSourceRemark:''}};
   await call(A,base,'PUT',{...chosen,state:'submitted'},422);await call(A,base,'PUT',{...chosen,resumeId:bid},404);await call(A,base,'PUT',{...chosen,profileVersionId:bv1.currentVersionId},404);
   const selected=await data(A,base,'PUT',chosen);await call(A,base,'PUT',chosen,409);
   for(const [path,method,body]of [['/api/preparations','GET'],['/api/preparations','POST',{jobId:target.id}],[base,'GET'],[base,'PUT',chosen],[base+'/preview','POST',{version:selected.version}],[base+'/confirm','POST',{}],['/api/submissions','GET']])await call({},path,method,body,401);
   for(const [suffix,method,body]of [['','GET'],['','PUT',{...chosen,version:selected.version}],['/preview','POST',{version:selected.version}],['/confirm','POST',{previewId:randomUUID(),contentHash:'a'.repeat(64),acknowledged:true}]])await call(B,base+suffix,method,body,404);
   assert.equal((await data(B,'/api/preparations')).items.length,0);
   const expired=await data(A,base+'/preview','POST',{version:selected.version});assert.equal(expired.canConfirm,true);assert.ok(!('objectKey' in expired.payload.resume));
   await command(['d1','execute','DB','--local','--config',config,'--persist-to',dir,'--command',`UPDATE submission_previews SET expires_at='2000-01-01T00:00:00Z' WHERE id='${expired.previewId}'`]);
   await call(A,base+'/confirm','POST',{previewId:expired.previewId,contentHash:expired.contentHash,acknowledged:true},409);
   const preview=await data(A,base+'/preview','POST',{version:selected.version});
   await call(A,base+'/confirm','POST',{previewId:preview.previewId,contentHash:preview.contentHash,acknowledged:false},422);await call(A,base+'/confirm','POST',{previewId:preview.previewId,contentHash:'a'.repeat(64),acknowledged:true},409);
   const bprep=await data(B,'/api/preparations','POST',{jobId:target.id});await call(B,'/api/preparations/'+bprep.id+'/confirm','POST',{previewId:preview.previewId,contentHash:preview.contentHash,acknowledged:true},404);
   const body={previewId:preview.previewId,contentHash:preview.contentHash,acknowledged:true};const confirmations=await Promise.all([1,2].map(()=>data(A,base+'/confirm','POST',body)));assert.equal(confirmations[0].task.id,confirmations[1].task.id);
   const frozen=confirmations[0],taskPath='/api/submissions/'+frozen.task.id;assert.equal(frozen.task.state,'needs_connector');assert.equal(frozen.snapshot.payload.preparedProfile.name,complete.name);assert.equal((await data(A,base+'/confirm','POST',body)).replayed,true);
   for(const [suffix,method,body]of [['','GET'],['/file','GET'],['/cancel','POST',{version:1}]]){await call(B,taskPath+suffix,method,body,404);await call({},taskPath+suffix,method,body,401);}
   await call(A,taskPath,'PATCH',{state:'submitted'},405);await call(A,taskPath+'/cancel','POST',{version:1,state:'submitted'},422);
   const currentProfile=await data(A,'/api/profile');await call(A,'/api/profile','PUT',{data:{...complete,name:'changed after confirmation'},version:currentProfile.version});
   const asset=(await data(A,'/api/resumes/'+aid)).item;await call(A,'/api/resumes/'+aid+'/archive','POST',{version:asset.version});
   const bytes=new Uint8Array(await(await call(A,taskPath+'/file')).arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),frozen.snapshot.payload.resume.sha256);assert.equal((await data(A,taskPath)).snapshot.payload.preparedProfile.name,complete.name);assert.equal((await data(A,taskPath)).snapshot.contentHash,frozen.snapshot.contentHash);
   const confirmedPrep=await data(A,base);await call(A,base,'PUT',{...chosen,version:confirmedPrep.version,resumeId:null});assert.equal((await data(A,taskPath)).task.state,'cancelled');assert.ok((await data(A,taskPath)).events.some(x=>x.action==='materials_changed'));await call(A,taskPath+'/cancel','POST',{version:1},409);
   const archivedAsset=(await data(A,'/api/resumes/'+aid)).item;await call(A,'/api/resumes/'+aid+'/restore','POST',{version:archivedAsset.version});const draft=await data(A,base);const changed=await data(A,base,'PUT',{...chosen,version:draft.version});
   const oldPreview=await data(A,base+'/preview','POST',{version:changed.version});const moved=await data(A,base,'PUT',{...chosen,version:changed.version,answers:{...chosen.answers,internshipAvailability:'否'}});await call(A,base+'/confirm','POST',{previewId:oldPreview.previewId,contentHash:oldPreview.contentHash,acknowledged:true},409);
   const newPreview=await data(A,base+'/preview','POST',{version:moved.version});const second=await data(A,base+'/confirm','POST',{previewId:newPreview.previewId,contentHash:newPreview.contentHash,acknowledged:true});const cancelled=await data(A,'/api/submissions/'+second.task.id+'/cancel','POST',{version:1});assert.equal(cancelled.task.state,'cancelled');assert.equal((await data(A,'/api/submissions')).items.length,2);assert.equal((await data(B,'/api/submissions')).items.length,0);
   assert.equal((await data(A,'/api/applications')).items.find(x=>x.id===frozen.task.applicationId).appliedAt,null);
   const oldApp=(await data(A,'/api/applications')).items.find(x=>x.id===frozen.task.applicationId);await call(A,'/api/applications/'+oldApp.id,'PATCH',{version:oldApp.version,status:'applied'});const afterCancel=await data(A,base);const blockedPreview=await data(A,base+'/preview','POST',{version:afterCancel.version});await call(A,base+'/confirm','POST',{previewId:blockedPreview.previewId,contentHash:blockedPreview.contentHash,acknowledged:true},409);assert.equal((await data(A,'/api/submissions')).items.length,2);
   if(process.env.M4_LIVE==='1'){
    const root='/api/browser-connector',makeSecret=()=>randomBytes(32).toString('base64url');
    await call({},root+'/manage','GET',undefined,401);await call(B,root+'/device/tasks','GET',undefined,401);
    async function pairDevice(name){const start=await data(B,root+'/pairings/start','POST',{}),deviceSecret=makeSecret();await call(A,root+'/pairings/request','POST',{code:start.code,deviceName:name,deviceSecret},404);const request=await data(B,root+'/pairings/request','POST',{code:start.code,deviceName:name,deviceSecret});assert.equal(request.pairing.state,'awaiting_approval');await call(B,root+'/device/tasks','GET',undefined,401,{Authorization:'Bearer '+request.pairing.deviceId+'.'+deviceSecret});await call(B,root+'/pairings/'+start.id+'/approve','POST',{version:request.pairing.version,acknowledged:false},422);await call(A,root+'/pairings/'+start.id+'/approve','POST',{version:request.pairing.version,acknowledged:true},404);await call(A,root+'/pairings/'+start.id+'/cancel','POST',{version:request.pairing.version},404);const approved=await data(B,root+'/pairings/'+start.id+'/approve','POST',{version:request.pairing.version,acknowledged:true});return {id:approved.device.id,secret:deviceSecret,headers:{...B,Authorization:'Bearer '+approved.device.id+'.'+deviceSecret}};}
    const d1=await pairDevice('isolated Chrome 1'),d2=await pairDevice('isolated Chrome 2');
    await call({Authorization:d1.headers.Authorization},root+'/device/tasks','GET',undefined,401);await call({...A,Authorization:d1.headers.Authorization},root+'/device/tasks','GET',undefined,401);
    await call({...d1.headers,Origin:'https://evil.invalid'},root+'/device/heartbeat','POST',{},403);await call(d1.headers,root+'/device/heartbeat','POST',{});assert.ok((await data(B,root+'/manage')).devices.find(x=>x.id===d1.id).online);
    const bp=await data(B,'/api/profile');const bv=await data(B,'/api/profile','PUT',{data:{...complete,name:'M4 isolated lease fixture'},version:bp.version,label:'M4 isolated only'});let prepB=await data(B,'/api/preparations','POST',{jobId:target.id});prepB=await data(B,'/api/preparations/'+prepB.id,'PUT',{version:prepB.version,resumeId:bid,profileVersionId:bv.currentVersionId,answers:chosen.answers});
    const pv=await data(B,'/api/preparations/'+prepB.id+'/preview','POST',{version:prepB.version});const confirmed=await data(B,'/api/preparations/'+prepB.id+'/confirm','POST',{previewId:pv.previewId,contentHash:pv.contentHash,acknowledged:true});const taskId=confirmed.task.id;
    await call(d1.headers,root+'/device/materials','POST',{taskId,leaseId:randomUUID(),leaseSecret:makeSecret()},404);
    const requests=[{taskId,requestId:randomUUID(),leaseSecret:makeSecret()},{taskId,requestId:randomUUID(),leaseSecret:makeSecret()}];const attempts=await Promise.all([d1,d2].map((device,i)=>fetch(origin+root+'/device/claim',{method:'POST',headers:{...device.headers,'Content-Type':'application/json'},body:JSON.stringify(requests[i])})));assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);checks+=2;const winnerIndex=attempts.findIndex(r=>r.status===200),winner=[d1,d2][winnerIndex],loser=[d1,d2][1-winnerIndex],lease=await attempts[winnerIndex].json();let proof={taskId,leaseId:lease.lease.id,leaseSecret:requests[winnerIndex].leaseSecret};
    assert.equal((await data(winner.headers,root+'/device/claim','POST',requests[winnerIndex])).lease.id,proof.leaseId);await call(loser.headers,root+'/device/materials','POST',proof,404);
    const material=await data(winner.headers,root+'/device/materials','POST',proof);assert.equal(material.snapshot.payload.preparedProfile.name,'M4 isolated lease fixture');assert.ok(!('objectKey' in material.snapshot.payload.resume));const binary=new Uint8Array(await(await call(winner.headers,root+'/device/file','POST',proof)).arrayBuffer());assert.equal(createHash('sha256').update(binary).digest('hex'),material.snapshot.payload.resume.sha256);
    let version=lease.task.version;const event={...proof,eventId:randomUUID(),version,type:'needs_login'};const reported=await data(winner.headers,root+'/device/events','POST',event);version=reported.version;assert.equal(reported.state,'needs_login');assert.equal((await data(winner.headers,root+'/device/events','POST',event)).replayed,true);await call(winner.headers,root+'/device/events','POST',{...event,type:'needs_consent'},409);await call(winner.headers,root+'/device/events','POST',{...event,eventId:randomUUID()},409);await call(winner.headers,root+'/device/events','POST',{...proof,eventId:randomUUID(),version,type:'submitted'},422);
    for(const type of ['needs_verification','needs_consent']){const result=await data(winner.headers,root+'/device/events','POST',{...proof,eventId:randomUUID(),version,type});assert.equal(result.state,type);version=result.version;}
    await call(winner.headers,root+'/device/events','POST',{...proof,eventId:randomUUID(),version,type:'page_verified',pageUrl:'https://evil.invalid'},422);
    const ready=await data(winner.headers,root+'/device/events','POST',{...proof,eventId:randomUUID(),version,type:'page_verified',pageUrl:confirmed.snapshot.payload.job.applyUrl});assert.equal(ready.state,'ready_for_adapter');await call(B,root+'/tasks/'+taskId+'/resume','POST',{version:ready.version,acknowledged:true},409);
    await call(winner.headers,root+'/device/heartbeat','POST',{lease:proof});await call(winner.headers,root+'/device/release','POST',proof);await call(winner.headers,root+'/device/materials','POST',proof,409);assert.equal((await data(B,'/api/submissions/'+taskId)).task.state,'needs_connector');
    let claimed=await data(winner.headers,root+'/device/claim','POST',{taskId,requestId:randomUUID(),leaseSecret:'x'.repeat(43)});proof={taskId,leaseId:claimed.lease.id,leaseSecret:'x'.repeat(43)};
    await command(['d1','execute','DB','--local','--config',config,'--persist-to',dir,'--command',`UPDATE browser_leases SET expires_at='2000-01-01T00:00:00Z' WHERE id='${proof.leaseId}'`]);await call(winner.headers,root+'/device/heartbeat','POST',{lease:proof},409);const expiredTask=await data(B,'/api/submissions/'+taskId);assert.equal(expiredTask.task.state,'needs_review');assert.ok(!(await data(loser.headers,root+'/device/tasks')).items.some(x=>x.id===taskId));await call(A,root+'/tasks/'+taskId+'/resume','POST',{version:expiredTask.task.version,acknowledged:true},404);await call(B,root+'/tasks/'+taskId+'/resume','POST',{version:expiredTask.task.version,acknowledged:false},422);await call(B,root+'/tasks/'+taskId+'/resume','POST',{version:expiredTask.task.version,acknowledged:true});await call(winner.headers,root+'/device/file','POST',proof,409);
    claimed=await data(loser.headers,root+'/device/claim','POST',{taskId,requestId:randomUUID(),leaseSecret:'y'.repeat(43)});proof={taskId,leaseId:claimed.lease.id,leaseSecret:'y'.repeat(43)};await call(A,root+'/devices/'+loser.id+'/revoke','POST',{version:1},404);await call(B,root+'/devices/'+loser.id+'/revoke','POST',{version:1});await call(loser.headers,root+'/device/materials','POST',proof,401);await call(loser.headers,root+'/device/events','POST',{...proof,eventId:randomUUID(),version:claimed.task.version,type:'needs_login'},401);
    const reviewed=await data(B,'/api/submissions/'+taskId);assert.equal(reviewed.task.state,'needs_review');await call(B,root+'/tasks/'+taskId+'/resume','POST',{version:reviewed.task.version,acknowledged:true});claimed=await data(winner.headers,root+'/device/claim','POST',{taskId,requestId:randomUUID(),leaseSecret:'z'.repeat(43)});proof={taskId,leaseId:claimed.lease.id,leaseSecret:'z'.repeat(43)};
    const selectedB=await data(B,'/api/preparations/'+prepB.id);await call(B,'/api/preparations/'+prepB.id,'PUT',{version:selectedB.version,resumeId:bid,profileVersionId:bv.currentVersionId,answers:{...chosen.answers,internshipAvailability:'否'}});await call(winner.headers,root+'/device/materials','POST',proof,409);assert.equal((await data(B,'/api/submissions/'+taskId)).task.state,'cancelled');
    const bapp=(await data(B,'/api/applications')).items.find(x=>x.id===confirmed.task.applicationId);assert.equal(bapp.status,'saved');assert.equal(bapp.appliedAt,null);
    // M5 protocol tests operate only in this temporary D1/R2. They do not
    // execute employer DOM scripts, upload a test resume or create an application.
    let m5prep=await data(B,'/api/preparations/'+prepB.id);const m5pv=await data(B,'/api/preparations/'+m5prep.id+'/preview','POST',{version:m5prep.version});const m5confirmed=await data(B,'/api/preparations/'+m5prep.id+'/confirm','POST',{previewId:m5pv.previewId,contentHash:m5pv.contentHash,acknowledged:true});
    const m5secret=makeSecret(),m5claim=await data(winner.headers,root+'/device/claim','POST',{taskId:m5confirmed.task.id,requestId:randomUUID(),leaseSecret:m5secret}),m5proof={taskId:m5confirmed.task.id,leaseId:m5claim.lease.id,leaseSecret:m5secret};
    await call({},root+'/device/adapter-plan','POST',m5proof,401);await call({...A,Authorization:winner.headers.Authorization},root+'/device/adapter-plan','POST',m5proof,401);
    const plan=await data(winner.headers,root+'/device/adapter-plan','POST',m5proof);assert.equal(plan.actions.length,0);assert.ok(plan.fields.some(f=>f.key==='expectedCities'));assert.equal(plan.fields.find(f=>f.key==='expectedCities').source.kind,'profile_version');assert.equal(plan.fields.find(f=>f.key==='jobSource').source.kind,'job_answer');assert.ok(plan.fields.find(f=>f.key==='phone').aliases.includes('联系电话'));assert.ok(!JSON.stringify(plan).includes('objectKey'));
    const startBody={...m5proof,actionId:randomUUID(),version:m5claim.task.version,kind:'fill',snapshotHash:plan.snapshotHash,pageUrl:plan.job.applyUrl,acknowledged:true};
    await call(winner.headers,root+'/device/adapter-start','POST',{...startBody,acknowledged:false},422);await call(winner.headers,root+'/device/adapter-start','POST',{...startBody,pageUrl:'https://evil.invalid'},409);await call(winner.headers,root+'/device/adapter-start','POST',startBody,409);
    const verified=await data(winner.headers,root+'/device/events','POST',{...m5proof,eventId:randomUUID(),version:m5claim.task.version,type:'page_verified',pageUrl:plan.job.applyUrl});startBody.version=verified.version;
    await call(winner.headers,root+'/device/adapter-start','POST',{...startBody,snapshotHash:'0'.repeat(64)},409);
    const startResponses=await Promise.all([startBody,{...startBody,actionId:randomUUID()}].map(body=>fetch(origin+root+'/device/adapter-start',{method:'POST',headers:{...winner.headers,'Content-Type':'application/json'},body:JSON.stringify(body)})));assert.deepEqual(startResponses.map(r=>r.status).sort(),[200,409]);checks+=2;const permit=await startResponses.find(r=>r.status===200).json();assert.ok(permit.executeBefore);
    await call(winner.headers,root+'/device/heartbeat','POST',{lease:m5proof});await call(winner.headers,root+'/device/adapter-start','POST',{...startBody,version:permit.version},409);
    const resultBody={...m5proof,actionId:permit.actionId,outcome:'fill_observed'};
    await call(winner.headers,root+'/device/adapter-result','POST',{...resultBody,outcome:'submitted'},422);await call(winner.headers,root+'/device/adapter-result','POST',{...resultBody,outcome:'upload_dispatched'},422);await call(winner.headers,root+'/device/adapter-result','POST',{...resultBody,text:'private'},422);
    const concurrentResults=await Promise.all([1,2].map(()=>data(winner.headers,root+'/device/adapter-result','POST',resultBody)));assert.ok(concurrentResults.every(r=>r.state==='needs_manual_fields'));assert.equal((await data(winner.headers,root+'/device/adapter-result','POST',resultBody)).replayed,true);await call(winner.headers,root+'/device/adapter-result','POST',{...resultBody,outcome:'uncertain'},409);
    let currentPlan=await data(winner.headers,root+'/device/adapter-plan','POST',m5proof);
    await call(winner.headers,root+'/device/adapter-review','POST',{...m5proof,version:currentPlan.task.version,acknowledged:true},409);
    const up=await data(winner.headers,root+'/device/adapter-start','POST',{...startBody,actionId:randomUUID(),version:currentPlan.task.version,kind:'upload'});
    await call(winner.headers,root+'/device/adapter-review','POST',{...m5proof,version:up.version,acknowledged:true},409);
    await call(winner.headers,root+'/device/adapter-result','POST',{...m5proof,actionId:up.actionId,outcome:'upload_dispatched'});
    currentPlan=await data(winner.headers,root+'/device/adapter-plan','POST',m5proof);assert.equal(currentPlan.actions.length,2);
    await call(winner.headers,root+'/device/adapter-review','POST',{...m5proof,version:currentPlan.task.version,acknowledged:false},422);
    assert.equal((await data(winner.headers,root+'/device/adapter-review','POST',{...m5proof,version:currentPlan.task.version,acknowledged:true})).state,'awaiting_final_confirmation');
    await call(winner.headers,root+'/device/heartbeat','POST',{lease:m5proof});assert.equal((await data(B,'/api/applications')).items.find(x=>x.id===m5confirmed.task.applicationId).appliedAt,null);
    await call(winner.headers,root+'/device/release','POST',m5proof);const afterUpload=await data(B,'/api/submissions/'+m5proof.taskId);assert.equal(afterUpload.task.state,'needs_review');await call(winner.headers,root+'/device/adapter-plan','POST',m5proof,409);
    await call(B,root+'/tasks/'+m5proof.taskId+'/resume','POST',{version:afterUpload.task.version,acknowledged:true});const nextClaim=await data(winner.headers,root+'/device/claim','POST',{taskId:m5proof.taskId,requestId:randomUUID(),leaseSecret:m5secret}),nextProof={...m5proof,leaseId:nextClaim.lease.id};
    const nextVerified=await data(winner.headers,root+'/device/events','POST',{...nextProof,eventId:randomUUID(),version:nextClaim.task.version,type:'page_verified',pageUrl:plan.job.applyUrl});await call(winner.headers,root+'/device/adapter-start','POST',{...startBody,...nextProof,actionId:randomUUID(),kind:'upload',version:nextVerified.version},409);
    await command(['d1','execute','DB','--local','--config',config,'--persist-to',dir,'--command',`SELECT count(*) FROM browser_actions`]);
    console.log('LIVE M5: explicit action consent, frozen hash/target binding, atomic single-use start, strict/replayed outcomes, review gate, active heartbeat, no-repeat after release/reclaim, owner isolation passed. Employer upload/DOM is NOT exercised by this test.');
    console.log('LIVE M4: pairing approval, dual-principal/device isolation, exclusive lease, scoped materials/file, heartbeat, event replay/CAS, wait gates, expiry/review/resume, revoke and material invalidation passed. No employer submission.');
   }
   console.log('LIVE M3: actual job revalidation, R2 byte-hash, immutable snapshot, replay/CAS/expiry, cancellation and account isolation passed; no employer submission.');
  }
  if(process.env.V1_CATALOG==='1'){
   const added=await data(A,'/api/applications','POST',{company:'隔离验收',title:'状态测试',status:'saved'},201);
   const url='/api/applications/'+added.id;
   const ended=await data(A,url,'PATCH',{version:added.version,status:'closed'});
   assert.equal(ended.appliedAt,null);
   const applied=await data(A,url,'PATCH',{version:ended.version,status:'applied'});
   assert.ok(applied.appliedAt);
   const interview=await data(A,url,'PATCH',{version:applied.version,status:'in_progress'});
   assert.equal(interview.appliedAt,applied.appliedAt);
   for(const [source,company] of [['xunlei-moka-campus','xunlei'],['luster-moka-campus','lusterinc'],['shengqu-moka-campus','shengqu'],['agora-moka-campus','agora'],['sohu-moka-campus','sohu'],['aobi-moka-campus','aobi']]){
    const synced=await data(A,'/api/catalog/sources/'+source+'/sync','POST');assert.equal(synced.state,'succeeded');
    const result=await data(A,'/api/jobs?companyId='+company+'&limit=1');
    assert.ok(result.companyTotals.some(row=>row.companyId===company));
    if(synced.seenCount)assert.equal(result.items[0].companyId,company);
    console.log(company,synced.seenCount);
   }
  }
  console.log(`LIVE CATALOG: ${run.seenCount} real official jobs verified, persisted, queried and isolated.`);
 }
 console.log(`PASS: ${checks} HTTP checks against actual production Worker build, two isolated principals, D1 SQLite and R2; no production records changed.`);
}catch(e){console.error(logs.slice(-6000));throw e;}finally{
 if(worker&&worker.exitCode===null){worker.kill('SIGTERM');await Promise.race([new Promise(r=>worker.once('exit',r)),new Promise(r=>setTimeout(r,2000))]);if(worker.exitCode===null)worker.kill('SIGKILL');}
 await rm(dir,{recursive:true,force:true});
}
