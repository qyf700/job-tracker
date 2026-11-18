import { contactSuggestions } from './files';

export const resumeFieldLabels = {
  name: '姓名', email: '邮箱', phone: '手机', graduationMonth: '毕业月份',
  expectedCities: '期望城市', skills: '技能', website: '个人网站', github: 'GitHub',
};
export type ResumeField = keyof typeof resumeFieldLabels;

export function resumeCandidates(text: string) {
  const result: Partial<Record<ResumeField, string[]>> = {};
  function add(key: ResumeField, value: string) {
    const list = result[key] ??= [];
    if (!list.includes(value) && list.length < 5) list.push(value);
  }
  const contacts = contactSuggestions(text);
  contacts.emails.forEach(value => add('email', value));
  contacts.phones.forEach(value => add('phone', value));
  const labels: [ResumeField, RegExp][] = [
    ['name', /^(?:姓名|Name)[:：]\s*(.{1,60})$/i],
    ['graduationMonth', /^(?:毕业月份|毕业时间|预计毕业|Graduation)[:：]\s*(\d{4})[-./年\s]+(0?[1-9]|1[0-2])月?$/i],
    ['expectedCities', /^(?:期望城市|意向城市)[:：]\s*(.{1,100})$/],
    ['skills', /^(?:技能|专业技能|Skills)[:：]\s*(.{1,500})$/i],
    ['website', /^(?:个人网站|作品集|Portfolio|Website)[:：]\s*(https?:\/\/\S{1,1900})$/i],
    ['github', /^GitHub[:：]\s*(https?:\/\/github\.com\/[\w-]+\/?)[\s]*$/i],
  ];
  for (const line of text.split(/\r?\n/)) {
    for (const [key, pattern] of labels) {
      const match = pattern.exec(line.trim());
      if (!match) continue;
      const value = key === 'graduationMonth' ? match[1] + '-' + match[2].padStart(2, '0') : match[1].trim();
      if (value) add(key, value);
    }
  }
  return result;
}
