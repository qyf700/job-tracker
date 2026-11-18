import {CANCELLABLE_STATES} from '../browser-connector/state.mjs';
import {z} from 'zod';
export const VERIFIED_JOB='276cde6c-124e-4059-b656-3d2636317338';
export const POLICY_VERSION='zhihu-276cde6c-2026-11-18-v1';
export const SOURCE_OPTIONS=['学校就业官网','学校微信公众号','学校BBS网站','校内微信/QQ群','院系老师推荐','海报宣传','知乎校招网站','知乎官方公众号','知乎官方微博','知乎内部员工推荐','招聘网站','抖音、快手、小红书等资讯媒体','其他请备注'] as const;
export const answersSchema=z.object({internshipAvailability:z.enum(['','是','否']).default(''),jobSource:z.union([z.literal(''),z.enum(SOURCE_OPTIONS)]).default(''),jobSourceRemark:z.string().trim().max(500).default('')}).strict();
export type Answers=z.infer<typeof answersSchema>;
export const selectionSchema=z.object({version:z.number().int().positive(),resumeId:z.string().uuid().nullable(),profileVersionId:z.string().uuid().nullable(),answers:answersSchema}).strict();
export type PreparationIssue={key:string;label:string;source:'tool'|'official';message:string;editIn?:'resume'|'profile'|'preparation'};
// Structural interface keeps domain validation independent of Worker bindings.
type Profile={name:string;phone:string;email:string;graduationMonth:string;internshipAvailability:string;jobSource:string;expectedCities:string;education:{school:string;major:string;degree:string;start:string;end:string}[];experience:{start:string;end:string}[];projects:{start:string;end:string}[]};
export function validateMaterials(profile:Profile|null,answers:Answers,hasResume:boolean,externalJobId:string){
 const missing:PreparationIssue[]=[];const warnings=['官网登录/验证码、隐私说明、特殊控件及其他附件仍须本人核对；本轮不执行官网提交。','资料完整不代表符合岗位资格，请本人复核JD与实际经历。'];
 const add=(key:string,label:string,source:PreparationIssue['source'],message='请补齐后重新预览')=>missing.push({key,label,source,message,editIn:key==='resume'?'resume':['internshipAvailability','jobSource','jobSourceRemark'].includes(key)?'preparation':key==='form'?undefined:'profile'});
 if(externalJobId!==VERIFIED_JOB)add('form','此岗位申请表尚未核验','official','当前仅已核验的推荐算法岗位允许确认，其他岗位暂只保存准备单');
 if(!hasResume)add('resume','简历原件','tool');if(!profile)add('profile','资料版本','tool');
 const resolved={...answers};
 if(profile){
  if(!resolved.internshipAvailability&&['是','否'].includes(profile.internshipAvailability))resolved.internshipAvailability=profile.internshipAvailability as '是'|'否';
  if(!resolved.jobSource&&SOURCE_OPTIONS.includes(profile.jobSource as typeof SOURCE_OPTIONS[number]))resolved.jobSource=profile.jobSource as typeof SOURCE_OPTIONS[number];
  for(const [key,label]of [['name','姓名'],['phone','手机'],['email','邮箱']] as const)if(!profile[key].trim())add(key,label,'tool');
  if(profile.phone&&(!/^\+?[\d\s()-]+$/.test(profile.phone)||profile.phone.replace(/\D/g,'').length<7||profile.phone.replace(/\D/g,'').length>15))add('phone','手机格式','tool','请填写有效联系电话');
  if(!profile.graduationMonth)add('graduationMonth','毕业时间','official');if(!profile.expectedCities.trim())add('expectedCities','期望城市','official');
  if(!profile.education.length)add('education','至少一段教育经历','official');
  profile.education.forEach((row,i)=>{for(const [key,label]of [['school','学校'],['major','专业'],['degree','学历'],['start','入学月份'],['end','毕业月份']] as const)if(!row[key].trim())add(`education.${i}.${key}`,`教育经历${i+1} · ${label}`,'official');});
  for(const group of ['education','experience','projects'] as const)profile[group].forEach((row,i)=>{if(row.start&&row.end&&row.start>row.end)add(`${group}.${i}.dates`,'经历起止月份顺序','tool','结束月份不能早于开始月份');});
 }
 if(!resolved.internshipAvailability)add('internshipAvailability','是否可以实习（是/否）','official');
 if(!resolved.jobSource)add('jobSource','招聘信息来源（官网选项）','official');
 if(resolved.jobSource==='其他请备注'&&!resolved.jobSourceRemark)add('jobSourceRemark','其他来源说明','tool');
 if(resolved.internshipAvailability==='否')warnings.push('你选择了不能实习，请核对该实习岗位是否适合你。');
 return {missing,warnings,answers:resolved};
}
export function canCancelTask(state:string){return CANCELLABLE_STATES.includes(state as typeof CANCELLABLE_STATES[number]);}
