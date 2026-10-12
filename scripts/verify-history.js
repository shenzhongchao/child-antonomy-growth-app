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
    '2026-09-02': { selected: [0, 'w_abc'], done: { 0: 'self' }, customDone: { 'w_abc': 'self' }, plan: [], planned: false, mood: null, note: '' },
    '2026-09-15': { selected: [5], done: { 5: 'self' }, plan: [], planned: false, mood: 0, note: '' },
  },
  rewards: [{ id: 0, date: '2026-09-01', used: false }, { id: 'w_abc', date: '2026-09-02', used: true }],
  wishes: [{ id: 'w_abc', kind: 'task', title: '自己叠被子', desc: '', status: 'approved', price: null, proposedDay: '2026-09-01', decidedDay: '2026-09-01' }],
};

const d = H.daySummary(state, '2026-09-01');
assert(d.recorded && d.selfCount === 1 && d.helpCount === 1, '单日统计区分自主/提醒');
assert(d.starsEarned === 1 && d.rewards.length === 1 && d.rewards[0].label === '故事我来选', '单日统计包含得星与兑换');
assert(d.planned && d.mood === 1 && d.note.includes('整理'), '单日详情保留计划/心情/鼓励');
assert(H.daySummary(state, '2026-09-03').recorded === false, '空白日只表示无记录');

const d2 = H.daySummary(state, '2026-09-02');
assert(d2.selfCount === 2 && d2.starsEarned === 2, '自定义挑战自主完成计入单日得星');
assert(d2.custom.length === 1 && d2.custom[0].title === '自己叠被子' && d2.custom[0].mode === 'self', '单日详情解析自定义挑战标题与完成方式');
assert(d2.rewards.length === 1 && d2.rewards[0].label === '自己叠被子' && d2.rewards[0].used === true, '自定义奖励券显示愿望标题');

const m = H.monthModel(state, 2026, 8);
assert(m.year === 2026 && m.month === 9, '月历月份正确');
const sep1 = m.cells.find(x => x && x.key === '2026-09-01');
assert(sep1 && sep1.summary.selfCount === 1 && sep1.summary.helpCount === 1, '月历单元使用真实日记录');
assert(m.cells.filter(Boolean).length === 30, '九月生成 30 个日期单元');

const t = H.trend(state, new Date(2026, 8, 15), 28);
assert(t.selfTotal === 4 && t.helpTotal === 1, '近 4 周统计自主/提醒总数（含自定义挑战）');
assert(t.activeDays === 3, '近 4 周只统计有记录的天数');
assert(t.tasks[0].self === 2 && t.tasks[1].help === 1 && t.tasks[5].self === 1, '趋势按能力拆分正确');
const customRow = t.tasks.find(x => x.task === 'custom');
assert(customRow && customRow.self === 1 && customRow.help === 0, '自定义挑战聚合成「我的专属练习」趋势行');

console.log('\n' + (failures ? `共 ${failures} 项失败` : 'ALL_PASS'));
process.exit(failures ? 1 : 0);
