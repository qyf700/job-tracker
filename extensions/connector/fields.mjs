export const ADAPTER_VERSION='zhihu-moka-2026-11-18-v2';
// Values and provenance are always resolved from the frozen snapshot. Empty
// entries remain in the catalog so a matching required field can report a gap.
export function buildFields(payload){
 const p=payload.profile.data,a=payload.answers||{},fields=[];
 const add=(key,label,value,kind='text',occurrence=0,aliases=[])=>{const answer=key==='internshipAvailability'||key==='jobSource'||key==='jobSourceRemark';fields.push({key,label,value:typeof value==='string'?value.trim():'',kind,occurrence,occurrences:key.startsWith('education.')?(p.education||[]).length:1,aliases,source:{kind:answer&&Object.prototype.hasOwnProperty.call(a,key)?'job_answer':'profile_version',revision:payload.profile.revision||null,path:answer&&Object.prototype.hasOwnProperty.call(a,key)?`answers.${key}`:`profile.data.${key.endsWith('.dates')?key.slice(0,-6):key}`}});};
 add('name','姓名',p.name,'text',0,['真实姓名','中文姓名']);
 add('phone','手机号码',p.phone,'text',0,['手机','联系电话','手机号']);
 add('email','邮箱',p.email,'text',0,['电子邮箱','电子邮件','email']);
 add('graduationMonth','毕业时间',p.graduationMonth,'month',0,['毕业年月','毕业月份']);
 add('expectedCities','期望城市',p.expectedCities,'text',0,['意向城市','意向工作城市','期望工作城市']);
 add('internshipAvailability','是否可以实习？',a.internshipAvailability||p.internshipAvailability,'select',0,['是否可以实习']);
 add('jobSource','你在哪里看到知乎的招聘信息？',a.jobSource||p.jobSource,'select',0,['招聘信息来源','招聘来源']);
 add('jobSourceRemark','其他请备注',a.jobSourceRemark);
 for(const [i,row]of ((p.education||[]).length?p.education:[{}]).entries()){
  add(`education.${i}.school`,'学校名称',row.school,'school',i,['毕业院校','就读学校']);
  add(`education.${i}.major`,'专业名称',row.major,'major',i,['所学专业','专业']);
  add(`education.${i}.degree`,'学历',row.degree,'select',i,['学历层次']);
  add(`education.${i}.dates`,'就读时间',row.start&&row.end?`${row.start}/${row.end}`:'','range',i,['教育起止时间']);
 }
 return fields;
}
