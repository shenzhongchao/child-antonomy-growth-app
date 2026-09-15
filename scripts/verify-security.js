// 安全回归：备份输入清洗 + 事件白名单/边界校验 + SQL 安全迁移存在性。
// 用法：node scripts/verify-security.js
const fs = require('fs');
const path = require('path');
const E = require('../dist/growth-events.js');
let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.error('FAIL: ' + msg); }
  else console.log('ok - ' + msg);
}

const malicious = {
  days: {
    '2026-09-15': {
      selected: [0, 99, 0],
      done: { 0: 'self', 99: 'self' },
      plan: ['学习时间', '<img onerror=1>'],
      planned: true,
      mood: 99,
      note: 'x'.repeat(200),
    },
    '2026-02-31': { done: { 0: 'self' } },
  },
  stars: -9,
  counts: [1, -1, 2.5, 3, 4, 5, 6],
  rewards: [
    { id: 0, date: '<img src=x onerror=alert(1)>', used: false },
    { id: 1, date: '2026-09-15', used: false, eventId: 'e1' },
  ],
  name: '<img src=x onerror=alert(1)>',
  goal: 999,
  graduated: [0, 0, 99],
  prices: [5, 8, 10, 15, 12, 15],
};

const n = E.norm(malicious);
assert(n.rewards.length === 1 && n.rewards[0].date === '2026-09-15', '恶意 reward.date 被丢弃，阻断备份存储型 XSS');
assert(!n.days['2026-02-31'] && n.days['2026-09-15'].selected.join() === '0', '非法日期/任务 id 不进入状态');
assert(Object.keys(n.days['2026-09-15'].done).join() === '0' && n.days['2026-09-15'].mood === null, 'done/mood 严格限定');
assert(n.name.length <= 12 && n.stars === 0 && n.goal === 3, '字符串/数值边界被规范化');
assert(E.validEvent({ type: 'task.done', day: '2026-09-15', task: 0, mode: 'self' }), '合法 task.done 通过');
assert(!E.validEvent({ type: 'task.done', day: '2026-09-15', task: 99, mode: 'self' }), '越界 task.done 被拒绝');
assert(!E.validEvent({ type: 'note', day: '2026-09-15', text: 'x'.repeat(81) }), '超长 note 被拒绝');
assert(!E.validEvent({ type: 'settings.prices', value: [0, 8, 10, 15, 12, 15] }), '非法价格被拒绝');
const forged = E.replay([{ id: 'x', type: 'task.done', day: '2026-09-15', task: 99, mode: 'self' }]);
assert(forged.stars === 0 && Object.keys(forged.days).length === 0, 'replay 忽略伪造越界事件');
const clean = E.replay([{ id: 'x', type: 'task.done', day: '2026-09-15', task: 0, mode: 'self' }]);
assert(clean.stars === 1 && clean.counts[0] === 1, '合法事件语义保持');

const migration = fs.readFileSync(path.join(__dirname, '..', 'cloud', 'migrations', '2026-09-15-security-hardening.sql'), 'utf8');
assert(migration.includes('pg_advisory_xact_lock'), '数据库迁移对同一 profile 写入加事务级 advisory lock');
assert(migration.includes("state.import is only allowed as the first profile event"), '数据库限制 state.import 只能作为首条事件');
assert(migration.includes('event type not allowed'), '数据库事件类型使用白名单');
assert(migration.includes('event payload too large') && migration.includes('import payload too large'), '数据库限制普通事件和导入基线 payload 大小');
assert(migration.includes('CREATE TRIGGER growth_events_validate_v1'), '数据库校验触发器已定义');

console.log('\n' + (failures ? `SECURITY_FAIL (${failures})` : 'SECURITY_ALL_PASS'));
process.exit(failures ? 1 : 0);
