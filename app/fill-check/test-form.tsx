"use client";
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
type Field={token:string;fingerprint:string;label:string;suggestion:string;existing:boolean;supported:boolean};
type Result={label:string;state:string;reason?:string};
declare global{interface Window{JobFillRules:{flattenProfile:(p:unknown)=>{key:string;label:string;value:string}[]};JobFillEngine:{scan:(fields:unknown[],mapping?:Record<string,string>)=>{fields:Field[]};fill:(entries:unknown[])=>Promise<Result[]>;undo:()=>number};}}
function read(selector:string){return (document.querySelector(selector) as unknown as {value:string}|null)?.value;}
export default function FillCheck(){
 const [ready,setReady]=useState(false),[name,setName]=useState(''),[results,setResults]=useState<string[]>([]),[running,setRunning]=useState(false),[submitted,setSubmitted]=useState(false);
 useEffect(()=>{function script(src:string){return new Promise<void>((resolve,reject)=>{const el=document.createElement('script');el.src=src;el.onload=()=>resolve();el.onerror=()=>reject(new Error('加载失败'));document.head.appendChild(el);});}void script('/downloads/quickfill/rules.js').then(()=>script('/downloads/quickfill/engine.js')).then(()=>setReady(true)).catch(()=>setResults(['FAIL：引擎加载失败']));},[]);
 async function run(){setRunning(true);const output:string[]=[];const check=(label:string,ok:boolean)=>output.push(`${ok?'PASS':'FAIL'}：${label}`);try{
 const fields=window.JobFillRules.flattenProfile({name:'控件验收示例',phone:'00000000000',email:'new@example.invalid',summary:'控件验收自我介绍',education:[{school:'示例大学A',degree:'本科'},{school:'示例大学B'}]});
 const scan=window.JobFillEngine.scan(fields),school=scan.fields.filter(f=>f.label==='学校名称');check('重复学校字段不自动猜测',school.length===2&&school.every(f=>!f.suggestion));
 const selections=scan.fields.filter(f=>f.suggestion&&f.supported&&!f.existing).map(f=>({...f,value:fields.find(x=>x.key===f.suggestion)!.value}));school.forEach((f,i)=>selections.push({...f,value:i?'示例大学B':'示例大学A'}));
 const result=await window.JobFillEngine.fill(selections);
 check('React 受控姓名输入框',read('#test-name')==='控件验收示例');
 check('原生下拉框匹配',read('#test-degree')==='bachelor');
 check('文本域填写',read('#test-summary')==='控件验收自我介绍');
 check('原生手机号输入框',read('#test-phone')==='00000000000');
 check('已有邮箱不覆盖',read('#test-email')==='existing@example.invalid');
 check('重复经历按手动映射填入',read('#school-1')==='示例大学A'&&read('#school-2')==='示例大学B');
 check('验证码未填写',read('#test-code')==='');
 check('特殊控件标记需手动处理',scan.fields.some(f=>f.label==='工作城市'&&!f.supported));
 check('实际报告填写六项',result.filter(x=>x.state==='filled').length===6);
 check('没有自动提交',!submitted);
 window.JobFillEngine.scan(fields);const stale=await window.JobFillEngine.fill([selections[0]]);check('旧扫描标识不盲填',stale[0]?.state==='skipped');
 }catch(e){output.push('FAIL：'+String(e));}finally{setResults(output);setRunning(false);}}
 return <main className="feature-page" style={{maxWidth:800,margin:'20px auto'}}><div className="section-toolbar"><div><h2>填表引擎控件验收</h2><p>只使用本页虚构测试资料，不向公司官网发送内容；不代表官网适配已通过。</p></div><a href="/" className="small-link">返回工作台</a></div><form className="detail-form" onSubmit={e=>{e.preventDefault();setSubmitted(true);}}><div className="form-grid"><label>姓名<input id="test-name" value={name} onChange={e=>setName(e.target.value)}/></label><label>手机号码<input id="test-phone"/></label><label>电子邮箱<input id="test-email" defaultValue="existing@example.invalid"/></label><label>学校名称<input id="school-1"/></label><label>学校名称<input id="school-2"/></label><label>学历<select id="test-degree" defaultValue=""><option value="">请选择</option><option value="bachelor">本科</option><option value="master">硕士</option></select></label><label>自我介绍<textarea id="test-summary"/></label><label>验证码<input id="test-code"/></label><input type="password" hidden/><div role="combobox" aria-label="工作城市" aria-expanded="false" style={{border:'1px solid #eee',padding:10}}>自定义城市选择器</div></div><Button type="submit" variant="outline">测试表单提交（不应自动点击）</Button></form><Button style={{marginTop:20}} disabled={!ready||running} onClick={()=>void run()}>{running?'验收中…':'运行填表控件验收'}</Button><pre style={{fontSize:12,lineHeight:2,whiteSpace:'pre-wrap',padding:16,background:'#f7f9fc',marginTop:20}} role="status">{results.join('\n')||'尚未执行'}</pre></main>;
}
