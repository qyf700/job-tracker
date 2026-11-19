import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {drizzle} from 'drizzle-orm/d1';
import {companies,companySources,jobs} from '../db/schema.ts';
import {guardedJobUpsert} from '../lib/catalog/queries.mjs';
import {parseBootstrap,decodeEnvelope,normalizeJob,htmlToText,createPublicSession,readZhihuJobs} from '../lib/catalog/moka.ts';
const id='354714c3-5865-4479-ab0b-2963434e78e9';
const iv='abcdefghijklmnop';
const boot='<input type="hidden" id="init-data" value="{&quot;org&quot;:{&quot;id&quot;:&quot;zhihu&quot;},&quot;siteId&quot;:&quot;3818&quot;,&quot;aesIv&quot;:&quot;abcdefghijklmnop&quot;}">';
const raw={id,orgId:'zhihu',title:'算法实习生（27届）',status:'open',jobDescription:'<p>职责</p><script>bad()</script><p>经验 &amp; 技能</p>',locations:[{provinceName:'北京市',cityName:'海淀区'}],zhineng:{name:'校招生'},publishedAt:'2026-05-06T13:49:26'};
test('public bootstrap/envelope decode uses the same public payload framing; rejects foreign source',async()=>{
 assert.equal(parseBootstrap(boot).aesIv,iv);assert.throws(()=>parseBootstrap(boot.replace('zhihu','other')));
 const plain={code:0,success:true,data:{value:'actual payload'}},key='1234567890123456',cipher=createCipheriv('aes-128-cbc',Buffer.from(key),Buffer.from(iv));const encrypted=Buffer.concat([cipher.update(JSON.stringify(plain)),cipher.final()]).toString('base64');
 assert.deepEqual(await decodeEnvelope({data:encrypted,necromancer:key},iv),plain.data);await assert.rejects(()=>decodeEnvelope({code:403,data:{}},iv));
});
test('normalization keeps ambiguous campaigns/years unknown, converts site time, strips active HTML',()=>{
 const job=normalizeJob(raw);assert.equal(job.programKind,'unknown');assert.equal(job.graduationYear,null);assert.equal(job.graduationLabel,'27届');assert.equal(job.sourceCategory,'校招生');assert.equal(job.employmentType,'intern');assert.equal(job.publishedAt,'2026-05-06T05:49:26.000Z');assert.deepEqual(job.locations,['北京市·海淀区']);assert.doesNotMatch(job.jdText,/script|bad\(/);assert.match(job.jdText,/经验 & 技能/);assert.equal(normalizeJob({...raw,title:'2027届开发'}).graduationYear,2027);assert.throws(()=>normalizeJob({...raw,jobDescription:undefined}));assert.equal(htmlToText('&lt;script&gt;sample&lt;/script&gt;'),'<script>sample</script>');
});
test('public session accepts only fixed read paths and same-URL anonymous cookie handshake',async()=>{
 const seen=[];const request=createPublicSession(async(url,options)=>{seen.push({url,options});return seen.length===1?new Response(null,{status:302,headers:{Location:'/campus_apply/zhihu/3818','Set-Cookie':'connect.sid=anonymous; HttpOnly; Path=/'}}):new Response('public');});
 assert.equal(await request('/campus_apply/zhihu/3818'),'public');assert.equal(seen[1].options.headers.Cookie,'connect.sid=anonymous');await assert.rejects(()=>request('https://127.0.0.1/internal'),e=>e.code==='source_not_allowed');
 const redirect=createPublicSession(async()=>new Response(null,{status:302,headers:{Location:'http://127.0.0.1/'}}));await assert.rejects(()=>redirect('/campus_apply/zhihu/3818'),e=>e.code==='source_redirected');
});
test('incomplete lists and detail mismatch fail rather than closing or inventing jobs',async()=>{
 const fake=async(url,options)=>new Response(url.endsWith('/3818')?boot:JSON.stringify({code:0,data:url.endsWith('/jobs')?{jobStats:{orgId:'zhihu',total:2},jobs:[raw]}:raw}));
 await assert.rejects(()=>readZhihuJobs(fake),e=>e.code==='source_incomplete');
 const mismatch=async(url)=>new Response(url.endsWith('/3818')?boot:JSON.stringify({code:0,data:url.endsWith('/jobs')?{jobStats:{orgId:'zhihu',total:1},jobs:[raw]}:{...raw,id:crypto.randomUUID()}}));
 await assert.rejects(()=>readZhihuJobs(mismatch),e=>e.code==='source_changed_during_sync');
});
test('lease-guarded actual D1 prepared upsert deduplicates and preserves first observation',async()=>{
 const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
 sqlite.prepare('INSERT INTO companies VALUES(?,?,?,?,?)').run('zhihu','知乎','https://example.invalid','first','first');sqlite.prepare('INSERT INTO company_sources(id,company_id,adapter_key,entry_url,lease_run_id) VALUES(?,?,?,?,?)').run('s','zhihu','test','https://example.invalid','lease');
 const client={prepare(query){return{bind(...args){return{query,args};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=statements.map(({query,args})=>({results:sqlite.prepare(query).all(...args),success:true,meta:{}}));sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const db=drizzle(client),row={id:'job',sourceId:'s',externalJobId:id,companyId:'zhihu',programId:null,title:'one',department:'',locationsJson:'[]',employmentType:'unknown',programKind:'unknown',graduationYear:null,graduationLabel:'',sourceCategory:'',jdText:'test',originalUrl:'https://example.invalid',applyUrl:'https://example.invalid',deadlineAt:null,publishedAt:null,availability:'accepting',evidenceJson:'{}',contentHash:'hash',firstSeenAt:'first',lastSeenAt:'first',lastVerifiedAt:'first',closedAt:null,lastSeenRunId:'lease',reopenedAt:null};
 await db.batch([guardedJobUpsert(db,jobs,companySources,row,'lease')]);await db.batch([guardedJobUpsert(db,jobs,companySources,{...row,title:'updated',firstSeenAt:'second'},'lease')]);assert.equal(sqlite.prepare('SELECT count(*) n FROM jobs').get().n,1);assert.equal(sqlite.prepare('SELECT first_seen_at FROM jobs').get().first_seen_at,'first');
 await db.batch([guardedJobUpsert(db,jobs,companySources,{...row,title:'stale overwrite'},'expired')]);assert.equal(sqlite.prepare('SELECT title FROM jobs').get().title,'updated');
 const observe=changes=>db.batch([guardedJobUpsert(db,jobs,companySources,{...row,...changes},'lease')]);
 const state=()=>({...sqlite.prepare('SELECT first_seen_at, closed_at, reopened_at FROM jobs').get()});
 await observe({availability:'closed',closedAt:'third',lastVerifiedAt:'third'});
 await observe({availability:'closed',closedAt:'fourth',lastVerifiedAt:'fourth'});
 assert.deepEqual(state(),{first_seen_at:'first',closed_at:'third',reopened_at:null});
 await observe({lastVerifiedAt:'fifth'});
 await observe({lastVerifiedAt:'sixth'});
 assert.deepEqual(state(),{first_seen_at:'first',closed_at:null,reopened_at:'fifth'});
 sqlite.close();
});
