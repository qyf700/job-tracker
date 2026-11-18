import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {MAX_PDF_BYTES,validatePdf,safeFilename,sha256,parseRange,limitedBody,contactSuggestions} from '../lib/m1/files.ts';
import {getDocumentProxy} from 'unpdf';
import {fixture,multiPageFixture} from './pdf-fixture.mjs';
test('PDF validation rejects empty, disguised and oversized files; names cannot become paths',async()=>{
 const bytes=fixture();validatePdf(bytes,'original.pdf');assert.equal(safeFilename('../private\\resume.pdf'),'resume.pdf');assert.equal(safeFilename('a\u0000.pdf'),'a.pdf');
 assert.throws(()=>validatePdf(new Uint8Array(),'a.pdf'),e=>e.status===422);assert.throws(()=>validatePdf(bytes,'a.exe'),e=>e.status===415);assert.throws(()=>validatePdf(new TextEncoder().encode('fake'),'a.pdf'),e=>e.status===415);assert.throws(()=>validatePdf(new Uint8Array(MAX_PDF_BYTES+1),'a.pdf'),e=>e.status===413);assert.equal((await sha256(bytes)).length,64);
});
test('Range includes suffix/open end and rejects multiple, unsafe, reversed or out of bounds ranges',()=>{
 assert.deepEqual(parseRange('bytes=5-9',100),{offset:5,length:5,end:9});assert.deepEqual(parseRange('bytes=-10',100),{offset:90,length:10,end:99});assert.deepEqual(parseRange('bytes=95-',100),{offset:95,length:5,end:99});assert.equal(parseRange(null,100),null);
 for(const range of ['bytes=100-','bytes=9-2','bytes=0-1,3-4','bytes=-0','bytes=9007199254740992-'])assert.throws(()=>parseRange(range,100),e=>e.status===416);
});
test('streamed body cap applies without content-length; contact suggestions are explicit and deduplicated',async()=>{
 const request=new Request('https://example.invalid',{method:'POST',body:new ReadableStream({start(c){c.enqueue(new Uint8Array(8));c.enqueue(new Uint8Array(8));c.close();}}),duplex:'half'});
 await assert.rejects(()=>limitedBody(request,10),e=>e.status===413);
 assert.deepEqual(contactSuggestions('a@example.invalid a@example.invalid 13900000000 2139000000001'),{emails:['a@example.invalid'],phones:['13900000000']});
});
test('real PDF parser extracts actual fixture text without external service',async()=>{
 const bytes=fixture();const pdf=await getDocumentProxy(bytes,{useWorkerFetch:false,useSystemFonts:false,disableFontFace:true});try{assert.equal(pdf.numPages,1);const content=await (await pdf.getPage(1)).getTextContent();const text=content.items.map(x=>x.str||'').join(' ');assert.match(text,/test@example.invalid/);assert.match(text,/M1 Acceptance Fixture/);}finally{await pdf.loadingTask.destroy();}
 if(process.env.M1_WRITE_FIXTURE)writeFileSync('/private/tmp/m1-acceptance.pdf',fixture());
});
test('actual SQLite migrations and transactional snapshot CAS preserve prior revisions',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
 db.prepare('INSERT INTO profiles(owner_id,data_json,version,updated_at) VALUES(?,?,?,?)').run('owner','{"name":"old"}',1,'now');
 function save(expected,data,id){db.exec('BEGIN');try{const changed=db.prepare('UPDATE profiles SET data_json=?,version=version+1 WHERE owner_id=? AND version=?').run(data,'owner',expected).changes;db.prepare("INSERT INTO profile_versions(id,owner_id,revision,label,data_json,change_kind,created_at) SELECT ?,?,?,?,?,'manual','now' WHERE changes()=1").run(id,'owner',expected+1,'snapshot',data);db.exec('COMMIT');return changed;}catch(e){db.exec('ROLLBACK');throw e;}}
 assert.equal(save(1,'{"name":"new"}','v2'),1);assert.equal(save(1,'{"name":"stale"}','bad'),0);assert.equal(db.prepare('SELECT count(*) AS n FROM profile_versions').get().n,1);assert.equal(save(2,'{"name":"restored"}','v3'),1);assert.equal(db.prepare('SELECT data_json FROM profile_versions WHERE revision=2').get().data_json,'{"name":"new"}');assert.equal(db.prepare('SELECT version FROM profiles').get().version,3);db.close();
});

test('production snapshot query prepares for Drizzle D1 batch and persists correct fields',async()=>{
 const {drizzle}=await import('drizzle-orm/d1');const {profiles,profileVersions}=await import('../db/schema.ts');const {snapshotQuery}=await import('../lib/m1/snapshot-query.mjs');
 const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
 // Run the real D1 adapter against SQLite statements, including an atomic batch.
 const client={prepare(query){return {bind(...args){return {query,args};}};},async batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(({query,args})=>({results:sqlite.prepare(query).all(...args),success:true,meta:{}}));sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const db=drizzle(client);const next={id:'snapshot',ownerId:'owner',revision:1,label:'first',dataJson:'{"name":"retained"}',sourceResumeId:null,changeKind:'manual',restoredFromId:null,createdAt:'now'};
 const insert=db.insert(profiles).values({ownerId:next.ownerId,dataJson:next.dataJson,version:1,updatedAt:'now'}).onConflictDoNothing().returning();
 const saved=await db.batch([insert,snapshotQuery(db,profileVersions,profiles,next)]);assert.equal(saved[0].length,1);assert.equal(sqlite.prepare('SELECT label FROM profile_versions').get().label,'first');
 const stale=await db.batch([db.insert(profiles).values({ownerId:'owner',dataJson:'bad',version:1,updatedAt:'now'}).onConflictDoNothing().returning(),snapshotQuery(db,profileVersions,profiles,{...next,id:'stale'})]);assert.equal(stale[0].length,0);assert.equal(sqlite.prepare('SELECT count(*) n FROM profile_versions').get().n,1);sqlite.close();
});

test('preview fixture contains distinct actual pages',async()=>{const pdf=await getDocumentProxy(multiPageFixture());try{assert.equal(pdf.numPages,2);for(let page=1;page<=2;page++){const content=await(await pdf.getPage(page)).getTextContent();assert.match(content.items.map(x=>x.str||'').join(' '),new RegExp('Page '+page+' of 2'));}}finally{await pdf.loadingTask.destroy();}});
