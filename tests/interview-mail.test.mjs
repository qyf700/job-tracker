import assert from 'node:assert/strict';
import test from 'node:test';
import {parseInterviewMail, possibleMailDuplicates} from '../lib/interview-mail.ts';

test('Chinese interview invite extracts local appointment and skips reply deadline', () => {
  const draft = parseInterviewMail(`主题：技术一面
面试时间：2026年11月20日（周五）北京时间 下午2:00–3:00
会议链接：
https://meeting.example.test/room?q=abc
面试官：李老师
请于 2026-11-19 18:00 前回复。`);
  assert.equal(draft.kind, 'interview');
  assert.equal(draft.round, '一面');
  assert.equal(draft.format, 'online');
  assert.equal(draft.meetingUrl, 'https://meeting.example.test/room?q=abc');
  assert.equal(draft.interviewer, '李老师');
  assert.deepEqual(draft.warnings, []);
  assert.deepEqual(draft.slots.map(({start,end}) => [start,end]), [['2026-11-20T14:00','2026-11-20T15:00']]);
});

test('written test recognises explicit offset and a cross-midnight end', () => {
  const draft = parseInterviewMail(`主题：线上笔试邀请
考试时间：2026年11月20日 20:00至2026年11月21日 1:00 UTC+08:00
笔试链接：https://exam.example.test/room`);
  assert.equal(draft.kind, 'written_test');
  assert.equal(draft.format, 'online');
  assert.deepEqual(draft.warnings, []);
  assert.equal(draft.slots[0].end, '2026-11-21T01:00');
  const utc = parseInterviewMail('请于 2026-11-20 20:00-21:00 GMT+0 参加面试');
  assert.equal(utc.slots[0].start, '2026-11-21T04:00');
});

test('separate date and time labels compose a slot, and multiple options require review', () => {
  const separate = parseInterviewMail('北京时间\n面试日期：2026年11月20日\n开始时间：09:00 至 10:00');
  assert.equal(separate.slots[0].end, '2026-11-20T10:00');
  const options = parseInterviewMail('面试时间任选：\n2026-11-20 10:00–11:00\n2026-11-21 14:00');
  assert.equal(options.slots.length, 2);
  assert.equal(options.slots[1].end, '');
  assert.ok(options.warnings.some(value => value.includes('多个候选时段')));
  assert.ok(options.warnings.some(value => value.includes('时区')));
  assert.ok(options.warnings.some(value => value.includes('结束时间')));
});

test('deadline-only, invalid dates and ambiguous zones leave times for manual review', () => {
  for (const text of [
    '在线笔试。请于 2026-11-20 18:00 前完成，预计 60 分钟。',
    '面试时间：下周五上午10:00（北京时间）',
    '面试时间：2026年2月30日 10:00-11:00',
    '面试时间：2026-11-20 20:00-21:00 CST',
  ]) {
    const draft = parseInterviewMail(text);
    assert.deepEqual(draft.slots, []);
    assert.ok(draft.warnings.length, text);
  }
});

test('repeat and reschedule hints are scoped to the selected application and editable event', () => {
  const base = {id:'original', applicationId:'application', kind:'interview', round:'技术一面',
    startsAt:'2026-11-20T06:00:00.000Z', state:'scheduled'};
  const events = [base, {...base,id:'cancelled',state:'cancelled'}, {...base,id:'other',applicationId:'other'}];
  const proposal = {applicationId:'application',kind:'interview',round:'一面',start:'2026-11-21T14:00'};
  assert.deepEqual(possibleMailDuplicates(events,proposal).map(event=>event.id), ['original']);
  assert.deepEqual(possibleMailDuplicates(events,proposal,false,'original'), []);
  assert.deepEqual(possibleMailDuplicates(events,{...proposal,round:'面试'},true).map(event=>event.id), ['original']);
  assert.deepEqual(possibleMailDuplicates(events,{...proposal,kind:'written_test'}), []);
});
