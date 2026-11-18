import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildFields} from '../extensions/connector/fields.mjs';
import {mapFields,mappingSummary,mappingSignature} from '../extensions/connector/mapping.mjs';
const payload=(data={},answers={})=>({profile:{revision:7,data:{education:[],...data}},answers});
const field=(label,extra={})=>({id:'moka:0',label,section:'个人信息',control:'text',required:true,occupied:false,occurrence:0,occurrences:1,...extra});
test('same-section verified aliases match frozen paths and preserve explicit answer provenance',()=>{
 const catalog=buildFields(payload({phone:'123456789',expectedCities:'北京',jobSource:'招聘网站'},{jobSource:'知乎校招网站'}));
 const [phone,city,source]=mapFields([field('联系电话'),field('意向工作城市',{section:'求职意向'}),field('招聘信息来源',{control:'select'})],catalog);
 assert.equal(phone.sourceKey,'phone');assert.equal(phone.status,'fillable');assert.equal(phone.confidence,0.98);assert.equal(city.value,'北京');assert.equal(source.value,'知乎校招网站');assert.equal(source.source.kind,'job_answer');assert.equal(source.source.path,'answers.jobSource');assert.equal(phone.source.revision,7);
});
test('missing profile and answers remain explicit gaps instead of fabricated defaults',()=>{
 const catalog=buildFields(payload());assert.ok(catalog.some(f=>f.key==='phone'&&f.value===''));
 const rows=mapFields([field('手机号码'),field('是否可以实习？',{control:'select'})],catalog);
 assert.ok(rows.every(row=>row.status==='missing_value'));assert.ok(rows.every(row=>row.value===''));
});
test('family/referrer/consent fields and unknown controls never receive candidate personal values',()=>{
 const catalog=buildFields(payload({name:'Private name',phone:'123'}));
 for(const target of [field('推荐人电话'),field('我已同意隐私说明',{control:'checkbox'}),field('验证码'),field('姓名',{section:'家庭信息'}),field('姓名',{section:'工作经历'})])assert.notEqual(mapFields([target],catalog)[0].status,'fillable');
 assert.equal(mapFields([field('姓名',{control:'unknown'})],catalog)[0].status,'unsupported');
});
test('ambiguity and repeated education count mismatch are held for review',()=>{
 const catalog=buildFields(payload({name:'Candidate',education:[{school:'School',degree:'本科'}]}));
 assert.equal(mapFields([field('姓名',{occurrences:2})],catalog)[0].status,'ambiguous');
 const row=mapFields([field('学校名称',{section:'教育背景',control:'school',occurrences:2})],catalog)[0];assert.equal(row.status,'repeat_mismatch');
 assert.equal(mapFields([field('学校名称',{section:'教育背景',control:'school',occurrences:2,occupied:true})],catalog)[0].status,'preserved');
});
test('fingerprint changes with structure and never includes frozen values or page current values',()=>{
 const schema=[field('手机号')],signature=mappingSignature(schema);assert.equal(signature,mappingSignature([{...schema[0],occupied:true}]));assert.notEqual(signature,mappingSignature([field('手机号',{control:'select'})]));assert.ok(!signature.includes('occupied'));
});
test('actual sanitized Zhihu schema exposes three pending required answers and preserves existing rows',()=>{
 const fixture=JSON.parse(readFileSync('tests/fixtures/zhihu-moka-schema.json','utf8'));assert.equal(fixture.containsValues,false);assert.equal(fixture.schema.length,18);
 const mapping=mapFields(fixture.schema,buildFields(payload()));assert.equal(mappingSummary(mapping).requiredPending,3);assert.equal(mappingSummary(mapping).preserved,9);assert.equal(mappingSummary(mapping).fillable,0);
 assert.deepEqual(mapping.filter(row=>row.status==='missing_value').map(row=>row.sourceKey).sort(),['expectedCities','internshipAvailability','jobSource']);
 for(const row of fixture.schema){assert.ok(!('value' in row));assert.ok(!('currentValue' in row));assert.ok(!('textContent' in row));}
});

test('partly populated education records never borrow missing fields by row order alone',()=>{
 const catalog=buildFields(payload({education:[{school:'School from snapshot',major:'Major from snapshot'}]}));
 const schema=[field('学校名称',{id:'school',section:'教育背景',control:'school',occupied:true}),field('专业名称',{id:'major',section:'教育背景',control:'major'})];
 const result=mapFields(schema,catalog);assert.equal(result[0].status,'preserved');assert.equal(result[1].status,'record_needs_review');assert.equal(mappingSummary(result).fillable,0);
});
