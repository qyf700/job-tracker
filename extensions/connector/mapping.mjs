// Local, deterministic semantic matching. Only structural labels are matched;
// values come exclusively from the selected immutable material snapshot.
export const MAPPING_VERSION='local-semantic-v1';
export function normalizeLabel(value){return String(value||'').normalize('NFKC').replace(/[\s*＊:：?？()（）]/g,'').toLowerCase();}
export const mappingLabels={fillable:'可填写',missing_value:'资料缺失',preserved:'保留官网已有值',ambiguous:'匹配不唯一',unmapped:'尚未映射',unsupported:'控件待适配',blocked:'本人处理',repeat_mismatch:'经历数量不一致',record_needs_review:'已有经历需核对'};
const blocked=/隐私|协议|验证码|密码|推荐人|紧急联系人|家庭|身份证|护照|民族|性别|政治面貌/;
const education=new Set(['教育背景','教育经历','学历信息']);
export function mapFields(schema,catalog){
 return schema.map(target=>{
  const base={fieldId:target.id,label:target.label,section:target.section||'',control:target.control,required:!!target.required,occupied:!!target.occupied,sourceKey:null,source:null,value:'',confidence:0,reason:'没有已核验的字段关系',status:'unmapped'};
  if(blocked.test(target.label)||['file','checkbox','password'].includes(target.control))return {...base,status:'blocked',reason:'附件单独确认；协议、身份或他人资料不参与普通填表'};
  const candidates=catalog.filter(field=>{
   if(![field.label,...(field.aliases||[])].some(label=>normalizeLabel(label)===normalizeLabel(target.label)))return false;
   if(field.key.startsWith('education.'))return education.has(target.section)&&field.occurrence===(target.occurrence||0);
   return !education.has(target.section)&&!(/工作|实习经历|项目经历|家庭|紧急/.test(target.section));
  });
  if(!candidates.length)return {...base,status:target.occupied?'preserved':'unmapped',reason:target.occupied?'官网已有值，未读取或改写':'未找到同分组的已核验别名，请补充映射'};
  if(candidates.length!==1)return {...base,status:'ambiguous',reason:'多个资料路径竞争同一个页面字段，停止填写'};
  if(!candidates[0].key.startsWith('education.')&&(target.occurrences||1)>1)return {...base,status:target.occupied?'preserved':'ambiguous',reason:'同分组出现多个同名字段，不按位置猜测'};
  const field=candidates[0],exact=normalizeLabel(field.label)===normalizeLabel(target.label),value=field.value||'';
  const result={...base,sourceKey:field.key,source:field.source,value,confidence:exact?1:0.98,reason:exact?'同分组字段名精确匹配':'同分组已核验别名匹配'};
  if(target.occupied)return {...result,status:'preserved',reason:value?'官网已有值；保留原值，不以匹配分数覆盖':'官网已有值且工具资料缺失；保留原值，不反向导入'};
  if(!value)return {...result,status:'missing_value',reason:'冻结资料或本岗位答案为空，请回工具补齐并确认新快照'};
  if(field.key.startsWith('education.')&&schema.some(peer=>peer.section===target.section&&peer.occurrence===target.occurrence&&peer.occupied))return {...result,status:'record_needs_review',reason:'该段官网经历已有其他值，不按序号补入不同资料；请本人核对整段对应关系'};
  if(field.key.startsWith('education.')&&field.occurrences!==target.occurrences)return {...result,status:'repeat_mismatch',reason:'官网经历数量与冻结资料不一致，不按位置猜测对应关系'};
  if(target.disabled)return {...result,status:'unsupported',reason:'官网控件被禁用，保留并请本人处理'};
  if(!['text','select','month','range','school','major'].includes(target.control))return {...result,status:'unsupported',reason:'控件类型尚未核验'};
  const allowed=field.kind===target.control||field.kind==='text'&&target.control==='text';
  if(!allowed)return {...result,status:'unsupported',reason:'字段含义匹配，但控件类型不同，停止自动写入'};
  return {...result,status:'fillable'};
 });
}
export function mappingSummary(rows){return {total:rows.length,fillable:rows.filter(r=>r.status==='fillable').length,preserved:rows.filter(r=>r.status==='preserved').length,requiredPending:rows.filter(r=>r.required&&!['fillable','preserved'].includes(r.status)).length};}
export function mappingSignature(schema){return JSON.stringify(schema.map(({id,label,section,control,required,disabled,occurrence,occurrences})=>({id,label,section,control,required:!!required,disabled:!!disabled,occurrence,occurrences})));}
