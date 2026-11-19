import type {Interview} from './interviews';

export const maxInterviewMailLength = 20_000;
const beijingOffset = 8 * 60;

const date = String.raw`(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})(?:日|号)?`;
const time = String.raw`(?:(上午|早上|中午|下午|晚上|凌晨)\s*)?(\d{1,2})(?:[:时点](\d{1,2})分?|[时点])`;
const explicitOffset = /(?:UTC|GMT)\s*([+-])(\d{1,2})(?::?(\d{2}))?(?![\d:])/gi;
const slotPattern = new RegExp(
  date + String.raw`[\s,，]*(?:(?:[（(]?(?:星期|周)[一二三四五六日天][）)]?)\s*)?(?:北京时间\s*)?` +
  time + String.raw`(?:\s*(?:至|到|[-–—~～])\s*(?:` + date + String.raw`\s*)?` + time + ')?', 'g',
);

type Slot = {start: string; end: string; source: string};
type MailDraft = {
  kind: 'interview' | 'written_test' | 'hr';
  round: string;
  format: 'online' | 'onsite' | 'phone' | '';
  location: string;
  meetingUrl: string;
  interviewer: string;
  slots: Slot[];
  warnings: string[];
  rescheduled: boolean;
};

function toBeijingWallTime(year: string, month: string, day: string, period: string | undefined,
  hour: string, minute: string | undefined, offset: number) {
  let h = Number(hour);
  const m = Number(minute ?? 0);
  if (h > (period ? 12 : 23) || m > 59) return null;
  if (period === '下午' || period === '晚上' || (period === '中午' && h < 12)) h = h % 12 + 12;
  if (period === '凌晨' && h === 12) h = 0;
  const value = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), h, m));
  if (value.getUTCMonth() !== Number(month) - 1 || value.getUTCDate() !== Number(day)) return null;
  return new Date(value.getTime() + (beijingOffset - offset) * 60_000);
}

function timezoneOffset(text: string) {
  const offsets = new Set<number>();
  if (/北京时间|中国标准时间|Asia\/Shanghai/i.test(text)) offsets.add(beijingOffset);
  if (/\b(?:UTC|GMT)\b(?!\s*[+-])/i.test(text)) offsets.add(0);
  for (const match of text.matchAll(explicitOffset)) {
    const hours = Number(match[2]), minutes = Number(match[3] ?? 0);
    if (hours <= 14 && minutes < 60 && (hours < 14 || minutes === 0)) {
      offsets.add((match[1] === '+' ? 1 : -1) * (hours * 60 + minutes));
    }
  }
  if (/\b(?:PST|PDT|EST|EDT|CST|JST|KST|CET|CEST|BST|IST|SGT|HKT)\b|当地时间|美西时间|美东时间|日本时间|伦敦时间/i.test(text)
    || offsets.size > 1) return {offset: null, warning: '邮件时区有歧义，请按北京时间手动填写。'};
  if (!offsets.size) return {offset: beijingOffset, warning: '邮件未明确标注时区，预填暂按北京时间计算，请核对。'};
  return {offset: [...offsets][0], warning: ''};
}

function readSlots(lines: string[], offset: number) {
  const slots = new Map<string, Slot>();
  let unrecognized = false;
  const dateOnly = new RegExp('^(?:面试|笔试|考试)(?:日期|时间)\\s*:\\s*' + date + '$');
  const separateStart = /^(?:(?:面试|笔试|考试)?开始时间|时间段|时段)\s*:\s*/;
  for (const [index, originalLine] of lines.entries()) {
    let line = originalLine;
    // A standalone appointment date can supply the date for the next labelled start.
    const previousDate = dateOnly.exec(lines[index - 1] ?? '');
    if (previousDate && separateStart.test(line)) {
      line = previousDate[0] + ' ' + line.replace(separateStart, '');
    }
    // Reply deadlines, check-in times and old appointment times are not starts.
    if (/^(?:[•*\-]\s*)?(?:最晚|回复截止|确认截止|报名截止|签到|入场|登录|答题截止|截止|原(?:定)?(?:面试|笔试)?时间)[:：\s]*(?!.*(?:开始时间|面试时间|笔试时间)[:：])/.test(line)
      || /(?:前(?:回复|确认|完成|签到|入场|登录)|截止(?:时间)?[：:]|请于.*(?:前|内).*完成)/.test(line)) continue;
    const matches = [...line.matchAll(slotPattern)];
    // A second clock time on the same line without a full date is ambiguous.
    const residual = matches.reduce((value, match) => value.replace(match[0], ''), line).replace(explicitOffset, '');
    if (new RegExp(time).test(residual) ||
      (!matches.length && /\d{1,2}月\d{1,2}[日号]|(?:明天|后天|下周|本周).{0,12}(?:上午|下午|晚上)/.test(line))) {
      unrecognized = true;
    }
    for (const match of matches) {
      const [, year, month, day, period, hour, minute, endYear, endMonth, endDay, endPeriod, endHour, endMinute] = match;
      const start = toBeijingWallTime(year, month, day, period, hour, minute, offset);
      if (!start) { unrecognized = true; continue; }
      const end = endHour ? toBeijingWallTime(endYear ?? year, endMonth ?? month, endDay ?? day,
        endPeriod ?? (Number(endHour) <= 12 ? period : undefined), endHour, endMinute, offset) : null;
      const startValue = start.toISOString().slice(0, 16);
      const endValue = end && end > start ? end.toISOString().slice(0, 16) : '';
      slots.set(startValue + '|' + endValue, {start: startValue, end: endValue, source: match[0]});
    }
  }
  return {slots: [...slots.values()], unrecognized};
}

export function parseInterviewMail(input: string): MailDraft {
  const text = input.slice(0, maxInterviewMailLength).normalize('NFKC').replace(/\r\n?/g, '\n');
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const subject = lines.find(line => /^(主题|标题|subject)\s*:/i.test(line)) ?? lines[0] ?? '';
  const topic = /笔试|在线测评/.test(subject) ? subject
    : /面试/.test(subject) ? subject : text;
  const kind = /笔试|在线测评/.test(topic) ? 'written_test' : /HR\s*(?:面试|面谈|面)|人力(?:面试|面谈)/i.test(topic) ? 'hr' : 'interview';
  const round = text.match(/(?:[一二三四五六七八九十]面|第\s*[一二三四五六七八九十\d]+\s*轮(?:面试)?)/)?.[0]
    ?? (kind === 'written_test' ? '笔试' : kind === 'hr' ? 'HR 面试' : '面试');
  const value = (pattern: RegExp, max: number) =>
    (lines.find(line => pattern.test(line))?.replace(pattern, '').trim() ?? '').slice(0, max);
  const location = value(/^(?:(?:面试|笔试|考试)?地点|(?:面试|笔试)?地址)\s*:\s*/, 1000);
  const interviewer = value(/^面试官\s*:\s*/, 200);
  const linkLabels = /(?:会议|面试|笔试|考试|测评|入会|参加|答题).{0,12}(?:链接|地址)|腾讯会议|飞书会议|zoom/i;
  const links = [...new Set(lines.filter((line, index) => linkLabels.test(line)
    || (/^https?:\/\//i.test(line) && linkLabels.test(lines[index - 1] ?? ''))).flatMap(line =>
    [...line.matchAll(/https?:\/\/[^\s<>"，。；、】）]+/gi)].map(match => match[0].replace(/[),.;]+$/, ''))
  ))].filter(link => link.length <= 2000 && URL.canParse(link));
  const meetingUrl = links.length === 1 ? links[0] : '';
  const format = /电话面试|电话沟通/.test(text) ? 'phone'
    : meetingUrl || /线上面试|线上笔试|视频面试|在线笔试|腾讯会议|飞书会议/.test(text) ? 'online'
    : location || /线下面试|现场面试|现场笔试/.test(text) ? 'onsite' : '';
  const rescheduled = /改期|重新安排|时间调整|改为/.test(text);
  const zone = timezoneOffset(text);
  const {slots, unrecognized} = zone.offset === null ? {slots: [], unrecognized: false} : readSlots(lines, zone.offset);
  const warnings = [zone.warning];
  if (!slots.length) warnings.push('未找到唯一可用的完整日期和开始时间，请根据原邮件填写。');
  if (slots.length > 1) warnings.push('邮件中有多个候选时段，请选择实际安排。');
  if (unrecognized) warnings.push('还有无法确定归属的时间，请对照邮件核对。');
  if (slots.length && slots.some(slot => !slot.end)) warnings.push('部分时段缺少明确的结束时间，请补齐。');
  if (links.length > 1) warnings.push('邮件里有多个候选链接，请填写正确的会议或笔试链接。');
  return {kind, round, format, location, meetingUrl, interviewer, slots, warnings: warnings.filter(Boolean), rescheduled};
}

export function possibleMailDuplicates(
  events: Interview[],
  draft: {applicationId: string; kind: string; round: string; start: string},
  rescheduled = false,
  editingId?: string,
) {
  const start = Date.parse(draft.start + ':00+08:00');
  if (!Number.isFinite(start)) return [];
  const roundKey = (round: string) => round.normalize('NFKC').replace(/\s|技术|面试/g, '');
  const namedRound = roundKey(draft.round);
  const meaningfulRound = !['', '笔试', 'HR'].includes(namedRound.toUpperCase());
  return events.filter(event => {
    if (event.id === editingId || event.applicationId !== draft.applicationId || event.kind !== draft.kind
      || event.state === 'cancelled') return false;
    const distance = Math.abs(start - Date.parse(event.startsAt));
    return distance < 60 * 60_000 ||
      ((rescheduled || (meaningfulRound && roundKey(event.round) === namedRound)) && distance <= 7 * 86_400_000);
  });
}
