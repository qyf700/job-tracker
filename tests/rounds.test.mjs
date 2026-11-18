import test from 'node:test';
import assert from 'node:assert/strict';
import {interviewInput,interviewUpdate,overlaps,localDateTime} from '../lib/interviews.ts';
import {calendar,escapeIcs,foldIcs} from '../lib/calendar.ts';
import {profileSchema,profileFields} from '../lib/profile.ts';
import '../extensions/quickfill/rules.js';
const Rules=globalThis.JobFillRules;
const draft={applicationId:'354714c3-5865-4479-ab0b-2963434e78e9',round:'技术一面',startsAt:'2027-08-01T14:00:00+08:00',endsAt:'2027-08-01T15:00:00+08:00'};
test('interview timestamps normalize and invalid ranges are rejected',()=>{
 assert.equal(interviewInput.parse(draft).startsAt,'2027-08-01T06:00:00.000Z');
 assert.equal(interviewInput.safeParse({...draft,endsAt:draft.startsAt}).success,false);
 assert.equal(interviewInput.safeParse({...draft,endsAt:'2027-07-01T15:00:00+08:00'}).success,false);
 assert.equal(interviewInput.safeParse({...draft,meetingUrl:'javascript:alert(1)'}).success,false);
 assert.equal(interviewUpdate.safeParse({...draft,version:0}).success,false);
 assert.equal(interviewUpdate.safeParse({...draft,version:1}).success,true);
});
test('conflicts are half-open intervals and exclude cancelled or same event',()=>{
 const a={id:'a',state:'scheduled',startsAt:'2027-08-01T06:00:00Z',endsAt:'2027-08-01T07:00:00Z'};
 assert.equal(overlaps(a,{...a,id:'b',startsAt:'2027-08-01T06:30:00Z'}),true);
 assert.equal(overlaps(a,{...a,id:'b',startsAt:a.endsAt,endsAt:'2027-08-01T08:00:00Z'}),false);
 assert.equal(overlaps(a,{...a,id:'b',state:'cancelled'}),false);
 assert.equal(overlaps(a,a),false);
 assert.equal(localDateTime(a.startsAt),'2027-08-01T14:00');
});
test('calendar escapes content, preserves UID/version/cancel and folds UTF-8 safely',()=>{
 const e={id:'fixed',version:3,startsAt:draft.startsAt,endsAt:draft.endsAt,updatedAt:'2027-07-01T00:00:00Z',company:'测试,公司',round:'二面',title:'开发',preparation:'准备\n项目',meetingUrl:'',location:'上海',state:'scheduled'};
 const result=calendar([e]);assert.match(result,/UID:fixed@jobtracker/);assert.match(result,/SEQUENCE:3/);assert.match(result,/DTSTART:20270801T060000Z/);assert.match(result,/TRIGGER:-PT30M/);
 assert.equal(escapeIcs('a,b;c\nd\\e'),'a\\,b\\;c\\nd\\\\e');
 const folded=foldIcs('SUMMARY:'+ '中文'.repeat(80));for(const line of folded.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);assert.equal(folded.replace(/\r\n /g,''),'SUMMARY:'+'中文'.repeat(80));
 const cancelled=calendar([{...e,state:'cancelled'}]);assert.match(cancelled,/STATUS:CANCELLED/);assert.doesNotMatch(cancelled,/BEGIN:VALARM/);
});
test('profile validates public links, email and repeated sections',()=>{
 assert.equal(profileSchema.safeParse({email:'invalid'}).success,false);
 assert.equal(profileSchema.safeParse({github:'javascript:alert(1)'}).success,false);
 assert.equal(profileSchema.safeParse({education:[{school:'A',start:'2020-13'}]}).success,false);
 const p=profileSchema.parse({name:'示例',education:[{school:'A'},{school:'B'}]});
 assert.equal(profileFields(p).filter(x=>x.key.endsWith('.school')).length,2);
});
test('autofill matches unique exact labels, preserves ambiguity for manual mapping',()=>{
 const fields=Rules.flattenProfile({name:'示例',phone:'00000000000',email:'example@example.invalid',education:[{school:'A'},{school:'B'}]});
 assert.equal(Rules.guessField({label:'姓名 *'},fields),'name');
 assert.equal(Rules.guessField({label:'学校名称'},fields),'');
 assert.equal(Rules.guessField({label:'公司名称'},fields),'');
 assert.equal(Rules.guessField({label:'电子邮箱'},fields),'email');
 assert.match(Rules.detectSite('jobs.bytedance.com'),/未完成实测/);
 assert.match(Rules.detectSite('jobs.bytedance.com.evil.example'),/其他网站/);
});
