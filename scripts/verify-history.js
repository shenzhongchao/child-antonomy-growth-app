// 成长足迹纯逻辑回归：不依赖 DOM / CloudBase。
// 用法：node scripts/verify-history.js
const H = require('../dist/history.js');
let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.error('FAIL: ' + msg); }
  else console.log('ok - ' + msg);
}
const state = {
  days: {
    '2026-09-01': { selected: [0, 1], done: { 0: 'self', 1: 'help' }, plan: ['吃点心', '学习时间'], planned: true, mood: 1, note: '今天自己先整理了书包' },
    '2026-09-02': { selected: [0], done: { 0: 'self' }, plan: [], planned: false, mood: null, note: '' },
    '2026-09-15': { selected: [5], done: { 5: 'self' }, plan: [], planned: false, mood: 0, note: '' },
  },
  rewards: [{ id: 0, date: '2026-09-01', used: false }],
};

const d = H.daySummary(state, '2026-09-01');
assert(d.recorded && d.selfCount === 1 && d.helpCount === 1, '单日统计区分自主/提醒');
assert(d.starsEarned === 1 && d.rewards.length === 1, '单日统计包含得星与兑换');
assert(d.planned && d.mood === 1 && d.note.includes('整理'), '单日详情保留计划/心情/鼓励');
assert(H.daySummary(state, '2026-09-03').recorded === false, '空白日只表示无记录');

const m = H.monthModel(state, 2026, 8);
assert(m.year === 2026 && m.month === 9, '月历月份正确');
const sep1 = m.cells.find(x => x && x.key === '2026-09-01');
assert(sep1 && sep1.summary.selfCount === 1 && sep1.summary.helpCount === 1, '月历单元使用真实日记录');
assert(m.cells.filter(Boolean).length === 30, '九月生成 30 个日期单元');

const t = H.trend(state, new Date(2026, 8, 15), 28);
assert(t.selfTotal === 3 && t.helpTotal === 1, '近 4 周统计自主/提醒总数');
assert(t.activeDays === 3, '近 4 周只统计有记录的天数');
assert(t.tasks[0].self === 2 && t.tasks[1].help === 1 && t.tasks[5].self === 1, '趋势按能力拆分正确');

console.log('\n' + (failures ? `共 ${failures} 项失败` : 'ALL_PASS'));
process.exit(failures ? 1 : 0);
