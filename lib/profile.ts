import { z } from 'zod';
const short=z.string().max(500).default('');
const long=z.string().max(20000).default('');
const month=z.string().regex(/^(|\d{4}-(0[1-9]|1[0-2]))$/).default('');
const web=z.union([z.literal(''),z.string().url().max(2000).refine(v=>['https:','http:'].includes(new URL(v).protocol))]).default('');
export const profileSchema=z.object({
 name:short,phone:z.string().max(30).default(''),email:z.union([z.literal(''),z.string().email().max(200)]).default(''),
 city:short,website:web,github:web,summary:long,
 education:z.array(z.object({school:short,major:short,degree:short,start:month,end:month,gpa:short})).max(10).default([]),
 experience:z.array(z.object({company:short,title:short,start:month,end:month,description:long})).max(20).default([]),
 projects:z.array(z.object({name:short,role:short,url:web,start:month,end:month,description:long})).max(20).default([]),
 skills:long,graduationMonth:month,internshipAvailability:short,expectedCities:short,jobSource:short,
}).strict();
export type Profile=z.infer<typeof profileSchema>;
export const emptyProfile:Profile=profileSchema.parse({});
export function profileFields(profile:Profile){
 const fields:{key:string;label:string;value:string}[]=[];
 const base:Record<string,string>={name:'姓名',phone:'手机',email:'邮箱',city:'所在地',website:'个人网站',github:'GitHub',summary:'自我介绍',skills:'技能',graduationMonth:'毕业月份',internshipAvailability:'是否可以实习',expectedCities:'期望城市',jobSource:'招聘信息来源'};
 for(const [key,label] of Object.entries(base)){const value=profile[key as keyof Profile];if(typeof value==='string'&&value)fields.push({key,label,value});}
 const groups=[['education','教育经历',{school:'学校',major:'专业',degree:'学历',start:'开始时间',end:'结束时间',gpa:'GPA'}],['experience','工作 / 实习',{company:'公司',title:'职位',start:'开始时间',end:'结束时间',description:'工作描述'}],['projects','项目经历',{name:'项目名称',role:'项目角色',url:'项目链接',start:'开始时间',end:'结束时间',description:'项目描述'}]] as const;
 for(const [group,label,names] of groups)profile[group].forEach((row,index)=>Object.entries(names).forEach(([key,fieldLabel])=>{const value=(row as Record<string,string>)[key];if(value)fields.push({key:`${group}.${index}.${key}`,label:`${label} ${index+1} · ${fieldLabel}`,value});}));
 return fields;
}
