// 一键回归验证：语法检查 + 桩测试（逻辑）
// 用法：node scripts/verify.js
// 桩测试覆盖：备份恢复 / 徽章升级 / 今日大满贯 / 夜间自动切换 / 星星滚动上账 / 多孩子档案
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SRC = fs.readFileSync(path.join(DIST, 'app.js'), 'utf8');
const EVENTS = require(path.join(__dirname, 'growth-events.js'));
const RealDate = Date;

// archiveTests（跑在真正的全局作用域里）取回的 app.js 默认值，供 eventTests 比对
let appBlankJson = null, appDayJson = null;

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.error('FAIL: ' + msg); }
  else console.log('ok - ' + msg);
}
function dayKey() {
  const d = new RealDate();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const mkSeed = (over = {}) => Object.assign({
  days: {}, stars: 0, counts: [0, 0, 0, 0, 0, 0], rewards: [],
  name: '测试宝宝', goal: 3, graduated: [], prices: [5, 8, 10, 15, 12, 15],
}, over);
const daySeed = (dayOver = {}) => ({
  [dayKey()]: Object.assign({ selected: [], done: {}, plan: ['吃点心'], planned: false, mood: null, note: '' }, dayOver),
});

// ---------- 桩环境 ----------
const mkClassList = () => {
  const set = new Set();
  return {
    add: c => set.add(c), remove: c => set.delete(c),
    toggle: (c, f) => { if (f === undefined) f = !set.has(c); f ? set.add(c) : set.delete(c); },
    contains: c => set.has(c),
  };
};
const mkEl = () => ({
  innerHTML: '', value: '', open: false, textContent: '', hidden: false, title: '', _kids: [],
  classList: mkClassList(),
  showModal() { this.open = true; }, close() { this.open = false; },
  appendChild(c) { this._kids.push(c); }, remove() {}, click() {},
  setAttribute() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
  animate() { const a = {}; Object.defineProperty(a, 'onfinish', { set(fn) { a._f = fn; } }); globalThis.__lastAnim = a; return a; },
  style: {},
});
function makeStubs(opts = {}) {
  const { seed, stored = {}, hour = 12, dark = false, reduced = false } = opts;
  const store = Object.assign({}, stored);
  if (seed) store['self-growth-v1'] = JSON.stringify(seed);
  const elements = {}, qels = {};
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
  globalThis.document = {
    getElementById: id => (elements[id] ??= mkEl()),
    createElement: () => mkEl(),
    querySelector: sel => (qels[sel] ??= mkEl()),
    addEventListener() {},
    body: { appendChild() {}, classList: mkClassList() },
    hidden: false,
  };
  globalThis.window = {
    scrollTo() {}, addEventListener() {},
    matchMedia: q => ({ matches: q.includes('reduce') ? reduced : dark, addEventListener() {} }),
  };
  globalThis.matchMedia = globalThis.window.matchMedia;
  globalThis.innerWidth = 400; globalThis.innerHeight = 800;
  globalThis.setInterval = () => 0;
  globalThis.setTimeout = (fn, ms) => { if ((ms || 0) < 800) fn(); return 0; };
  globalThis.__hour = hour;
  globalThis.Date = class extends RealDate { getHours() { return globalThis.__hour; } };
  globalThis.Blob = class { constructor(parts) { this.parts = parts; globalThis.__blob = this; } };
  globalThis.URL = { createObjectURL: () => 'blob:mock', revokeObjectURL() {} };
  globalThis.FileReader = class { readAsText(f) { this.result = f.content; this.onload(); } };
  return { elements, qels, store };
}
function runCase(opts, testSrc) {
  const ctx = makeStubs(opts);
  globalThis.assert = assert;
  eval(SRC + '\n;' + testSrc);
  return ctx;
}

// ---------- 桩测试用例 ----------
function stubTests() {
  console.log('\n== 桩测试：备份与恢复 ==');
  runCase({ seed: mkSeed({ stars: 7, counts: [1, 0, 0, 0, 0, 0] }) }, `
parentOpen = true; parents();
const html = document.getElementById('modal').innerHTML;
assert(html.includes('备份与恢复') && html.includes('backupData()') && html.includes('restoreFile'), '面板含备份与恢复区块');
backupData();
const data = JSON.parse(__blob.parts[0]);
assert(data.stars === 7 && data.name === '测试宝宝' && Array.isArray(data.counts), '备份内容完整');
restoreData({ files: [{ content: JSON.stringify({ days: {}, stars: 42, counts: [1,2,3,4,5,6], rewards: [], name: '恢复宝宝', goal: 5, graduated: [1], prices: [5,8,10,15,12,15] }) }], value: 'x' });
assert(s.name === '恢复宝宝' && s.stars === 42 && s.goal === 5, '恢复后状态替换为备份');
assert(JSON.parse(localStorage.getItem('self-growth-v1')).name === '恢复宝宝', '恢复后已持久化');
restoreData({ files: [{ content: 'not json{{' }], value: 'x' });
assert(s.stars === 42 && document.getElementById('notice').innerHTML.includes('无法识别'), '非法 JSON 被拒绝且不动数据');
restoreData({ files: [{ content: JSON.stringify({ stars: 'abc' }) }], value: 'x' });
assert(s.stars === 42, '结构不符的备份被拒绝');
parentOpen = false;
const before = JSON.stringify(s);
backupData(); restoreData({ files: [{ content: '{}' }], value: 'x' });
assert(JSON.stringify(s) === before, '未过家长验证时备份/恢复不生效');
`);

  console.log('\n== 桩测试：徽章升级庆祝 ==');
  runCase({ seed: mkSeed({ stars: 10, counts: [2, 0, 9], days: daySeed({ selected: [0, 1, 2] }) }) }, `
finish(0, 'self');
let m = document.getElementById('modal');
assert(m.open && m.innerHTML.includes('徽章升级啦') && m.innerHTML.includes('Lv. 1') && m.innerHTML.includes('整理小达人') && m.innerHTML.includes('初次解锁'), '跨级触发升级弹窗');
assert(s.counts[0] === 3 && s.stars === 11, '升级时计数与星星正常');
closeModal();
finish(1, 'self');
assert(m.open === false && document.getElementById('notice').innerHTML.includes('我看到你的主动啦'), '普通完成走常规庆祝');
finish(2, 'self');
assert(!m.innerHTML.includes('徽章升级啦'), '满级后不再弹升级窗（触发的是大满贯）');
const d = today(); d.done = {}; d.selected = [0];
finish(0, 'self');
assert(!document.getElementById('modal').innerHTML.includes('徽章升级啦') && s.counts[0] === 4, '非升级线不弹升级窗');
assert(typeof sfx.levelup === 'function', 'sfx.levelup 已注册');
`);

  console.log('\n== 桩测试：今日大满贯 ==');
  runCase({ seed: mkSeed({ stars: 5, counts: [1, 0, 0, 0, 0, 0], days: daySeed({ selected: [0, 1], done: { 0: 'self' } }) }) }, `
const m = document.getElementById('modal');
finish(1, 'self');
assert(m.open && m.innerHTML.includes('今日大满贯') && m.innerHTML.includes('2 项挑战'), '全部自主完成触发大满贯');
closeModal();
const d = today(); d.done = {}; d.selected = [0, 1];
finish(0, 'help'); finish(1, 'self');
assert(m.open === false, '含提醒后完成不触发');
d.done = {}; d.selected = [1]; s.counts[1] = 2;
finish(1, 'self');
assert(m.open && m.innerHTML.includes('徽章升级啦') && m.innerHTML.includes('closeModal();grandSlam()'), '升级窗按钮链到大满贯');
closeModal(); grandSlam();
assert(m.innerHTML.includes('今日大满贯'), '连播到大满贯');
assert(typeof sfx.grandslam === 'function', 'sfx.grandslam 已注册');
`);

  console.log('\n== 桩测试：夜间模式自动切换 ==');
  const themeCase = (opts, expectNight, msg) => runCase(opts, `assert(document.body.classList.contains('night') === ${expectNight}, '${msg}')`);
  themeCase({ hour: 22 }, true, '22 点无手动选择自动夜间');
  themeCase({ hour: 22, stored: { 'growth-theme': 'day' } }, false, '手动选白天优先于时间');
  themeCase({ hour: 10, stored: { 'growth-theme': 'night' } }, true, '手动选夜间优先于时间');
  themeCase({ hour: 10, dark: true }, true, '白天但系统深色跟随系统');
  themeCase({ hour: 10 }, false, '白天且系统浅色保持白天');
  themeCase({ hour: 5 }, true, '凌晨 5 点自动夜间');
  themeCase({ hour: 19 }, true, '19 点整进入夜间');
  themeCase({ hour: 7 }, false, '7 点整回到白天');
  runCase({ hour: 18 }, `
assert(!document.body.classList.contains('night'), '18 点初始白天');
let tc = 0; const ot = toast; toast = x => { tc++; ot(x); };
__hour = 20; syncTheme();
assert(document.body.classList.contains('night') && tc === 1, '跨 19 点自动切夜间并提示一次');
assert(document.getElementById('notice').innerHTML.includes('天黑啦'), '自动切换提示拟人');
syncTheme();
assert(tc === 1, '无变化不重复提示');
__hour = 8; syncTheme();
assert(!document.body.classList.contains('night') && tc === 2, '到早晨自动回白天');
`);

  console.log('\n== 桩测试：星星滚动上账 ==');
  let ctx = runCase({ seed: mkSeed({ stars: 5, days: daySeed({ selected: [0, 1] }) }) }, `
finish(0, 'self');
assert(s.stars === 6, '得星加到 6');
assert(document.getElementById('main').innerHTML.includes('<span class="balance-num">5</span>'), '飞星未落地显示旧数字');
assert(starRollFrom === 5, 'starRollFrom 记录旧值');
__lastAnim._f();
assert(starRollFrom === null, '落地后 starRollFrom 复位');
`);
  assert(ctx.qels['.balance-num']._kids.length === 1 && ctx.qels['.balance-num']._kids[0].className === 'num-roll', '落地创建滚动元素');
  assert(String(ctx.qels['.balance-num'].textContent) === '6', '滚动结束定格新数字');
  runCase({ seed: mkSeed({ stars: 5, days: daySeed({ selected: [0] }) }), reduced: true }, `
finish(0, 'self');
assert(starRollFrom === null && document.getElementById('main').innerHTML.includes('<span class="balance-num">6</span>'), '减少动态下直接显示新数字');
`);
  ctx = runCase({ seed: mkSeed({ stars: 5, days: daySeed({ selected: [0] }) }) }, `
finish(0, 'self');
assert(document.getElementById('modal').innerHTML.includes('今日大满贯'), '大满贯弹窗出现');
assert(starRollFrom === 5 && typeof __lastAnim._f === 'function', '大满贯路径 flyStar 已启动（回归：修复前钱包卡死）');
__lastAnim._f();
assert(starRollFrom === null, '大满贯落地后 starRollFrom 复位');
`);
  assert(String(ctx.qels['.balance-num'].textContent) === '6', '大满贯路径数字定格新值');
}

// ---------- auth.js：多孩子档案（本机缓存 + 切换保险） ----------
// auth.js 是 IIFE，且要拿到 app.js 的 window.render，所以这里用 runInThisContext
// 让两个脚本跑在真正的全局作用域里（window 直接指向 globalThis）。
async function archiveTests() {
  console.log('\n== 桩测试：多孩子档案 ==');
  const store = { 'self-growth-v1': JSON.stringify(mkSeed({ name: '哥哥', stars: 5, counts: [1, 0, 0, 0, 0, 0] })) };
  const elements = {};
  globalThis.window = globalThis;
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
  globalThis.document = {
    readyState: 'complete',
    getElementById: id => (elements[id] ??= mkEl()),
    createElement: () => mkEl(),
    querySelector: () => mkEl(),
    addEventListener() {},
    body: { appendChild() {}, classList: mkClassList() },
    hidden: false,
  };
  globalThis.location = { protocol: 'https:', href: 'https://localhost/' };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
  globalThis.scrollTo = () => {};
  globalThis.innerWidth = 400; globalThis.innerHeight = 800;
  globalThis.setInterval = () => 0;
  globalThis.setTimeout = () => 0;
  globalThis.Date = RealDate;
  globalThis.GROWTH_CLOUD = { envId: '' };   // 未配置云端：纯本机多档案

  vm.runInThisContext(fs.readFileSync(path.join(DIST, 'app.js'), 'utf8'), { filename: 'app.js' });
  vm.runInThisContext(fs.readFileSync(path.join(DIST, 'auth.js'), 'utf8'), { filename: 'auth.js' });
  // 必须在改动 state 之前取：app.js 的 blank() 与 today() 的默认形态
  appBlankJson = vm.runInThisContext('JSON.stringify(blank())');
  appDayJson = vm.runInThisContext('JSON.stringify(today())');
  const tick = () => new Promise(r => process.nextTick(r));
  const state = () => JSON.parse(localStorage.getItem('self-growth-v1'));

  assert(typeof Cloud === 'object' && Cloud.configured() === false, '未配置云端时 Cloud 可用');
  assert(Cloud.kids().length === 0, '尚无档案时 kids() 为空');

  elements.kidName = mkEl(); elements.kidName.value = '哥哥';
  Cloud.renameCurrent();
  await tick();
  assert(Cloud.kids().length === 1, '改昵称后建立第 1 份档案');
  const pid1 = JSON.parse(localStorage.getItem('self-growth-cloud-v1')).profileId;
  assert(!!pid1, '第 1 份档案拿到 id');

  elements.clNew = mkEl(); elements.clNew.value = '弟弟';
  await Cloud.addChild();
  assert(Cloud.kids().length === 2, '添加后共 2 份档案');
  assert(state().name === '弟弟', '已切到新档案');
  const arch = JSON.parse(localStorage.getItem('self-growth-archive-v1'));
  assert(!!(arch[pid1] && arch[pid1].state.stars === 5), '哥哥的 5 颗星完整留在本机缓存');
  const kid1 = Cloud.kids().find(k => k.id === pid1);
  assert(!!(kid1 && kid1.cur === false), '哥哥不再是当前档案');

  await Cloud.switchChild(pid1);
  assert(state().stars === 5 && state().name === '哥哥', '切回哥哥后星星完好');
  const kid2 = Cloud.kids().find(k => k.id !== pid1);
  assert(!!(kid2 && !kid2.cur), '弟弟仍在档案列表里');

  await Cloud.switchChild(kid2.id);
  assert(state().name === '弟弟' && state().stars === 0 && !state().counts.some(x => x > 0), '两兄弟的记录互不污染');

  assert(elements.who.hidden === false && elements.who.innerHTML.includes('弟弟'), '顶部胶囊显示当前孩子');
  assert(typeof Cloud.guard === 'function' && typeof Cloud.openKidPicker === 'function', '切换保护与选人入口已注册');
}

// ---------- 事件账本：迁移无损 + reducer 语义 ----------
function eventTests() {
  console.log('\n== 桩测试：事件账本 ==');

  // 1) 默认值不许与 app.js 漂移（app.js 改了计划/价格表而这里没跟，要立刻炸出来）
  assert(JSON.stringify(EVENTS.blank()) === appBlankJson, 'blank() 与 app.js 的默认结构逐字段一致');
  assert(JSON.stringify(EVENTS.blankDay()) === appDayJson, 'blankDay() 与 app.js 的 today() 默认逐字段一致');

  // 2) 迁移等价性：任意复杂 state → 一条 import 事件 → 重放，必须逐字段相同
  const messy = {
    days: {
      '2026-09-10': { selected: [2, 0], done: { 2: 'self', 0: 'help' }, plan: ['学习时间', '吃点心'], planned: true, mood: 3, note: '今天自己想起来两次' },
      '2026-09-11': { selected: [], done: {}, plan: ['吃点心'], planned: false, mood: null, note: '' },
      '2026-09-12': { selected: [5], done: { 5: 'self' }, mood: 0 },
    },
    stars: 37,
    counts: [3, 1, 0, 2, 0, 5],
    rewards: [{ id: 1, date: '2026-09-12', used: true }, { id: 0, date: '2026-09-12', used: false }],
    name: '朵朵', goal: 5, graduated: [5, 0], prices: [6, 8, 12, 15, 12, 20],
  };
  const back = EVENTS.replay(EVENTS.toEvents(messy, { t: 1000, id: 'imp1' }));
  assert(JSON.stringify(back) === JSON.stringify(EVENTS.norm(messy)), '迁移无损：state → 事件 → 重放 逐字段相同');
  assert(back.stars === 37 && back.name === '朵朵' && back.goal === 5, '迁移后星星/昵称/目标不变');
  assert(Object.keys(back.days).length === 3 && back.days['2026-09-10'].done['2'] === 'self', '迁移后每日记录完整');
  assert(back.days['2026-09-12'].plan.length === 5 && back.days['2026-09-12'].note === '', '缺字段的旧日期被补全为默认值');

  // 3) 细粒度事件语义（与 app.js 的 finish/pick/mood/confirmReward/graduate 对齐）
  const base = EVENTS.blank(); base.stars = 10;
  const ev = [
    { id: 'e0', type: 'state.import', t: 0, payload: base },
    { id: 'e1', type: 'settings.name', t: 1, value: '哥哥' },
    { id: 'e2', type: 'settings.goal', t: 2, value: 3 },
    { id: 'e3', type: 'pick', t: 3, day: '2026-09-14', selected: [0, 3] },
    { id: 'e4', type: 'task.done', t: 4, day: '2026-09-14', task: 0, mode: 'self' },
    { id: 'e5', type: 'task.done', t: 5, day: '2026-09-14', task: 3, mode: 'help' },
    { id: 'e6', type: 'task.done', t: 6, day: '2026-09-14', task: 0, mode: 'self' },
    { id: 'e7', type: 'mood', t: 7, day: '2026-09-14', mood: 1 },
    { id: 'e8', type: 'note', t: 8, day: '2026-09-14', text: '今天自己整理书包了' },
    { id: 'e9', type: 'reward.redeem', t: 9, day: '2026-09-14', reward: 0, cost: 5 },
    { id: 'e10', type: 'reward.use', t: 10, seq: 0 },
    { id: 'e11', type: 'skill.graduate', t: 11, task: 4, on: true },
  ];
  const st = EVENTS.replay(ev);
  assert(st.name === '哥哥' && st.goal === 3, '设置类事件生效');
  assert(st.stars === 6, '星星 = 10(基线) + 1(自主完成) − 5(兑换)');
  assert(st.counts[0] === 1 && st.counts[3] === 0, '只有「自己想起来」才计入能力');
  assert(Object.keys(st.days['2026-09-14'].done).length === 2 && st.days['2026-09-14'].done['0'] === 'self', '同一天同一任务的重复记录被忽略');
  assert(st.days['2026-09-14'].selected.join() === '0,3' && st.days['2026-09-14'].mood === 1, '选挑战与心情生效');
  assert(st.days['2026-09-14'].note === '今天自己整理书包了', '家长鼓励生效');
  assert(st.rewards.length === 1 && st.rewards[0].used === true, '兑换与兑现生效');
  assert(st.graduated.join() === '4', '毕业事件生效');

  // 4) 幂等：整批重发（网络重试 / 换设备补传）不改变结果
  const twice = EVENTS.replay(ev.concat(ev.map(e => Object.assign({}, e))));
  assert(JSON.stringify(twice) === JSON.stringify(st), '同一批事件重发是幂等的');

  // 5) 乱序到达也能收敛（replay 内部按 t 再按 id 排序）
  const shuffled = ev.slice().sort(() => 0.5 - Math.random());
  assert(JSON.stringify(EVENTS.replay(shuffled)) === JSON.stringify(st), '乱序到达后结果一致');

  // 6) 未知事件忽略 —— 以后加新玩法时，老客户端不会崩
  assert(JSON.stringify(EVENTS.replay(ev.concat([{ id: 'zz', type: 'future.thing', t: 99 }]))) === JSON.stringify(st), '未知事件被忽略');

  // 7) 迁移基线之上继续追加（真实上线后的形态）
  const after = EVENTS.replay(EVENTS.toEvents(messy, { t: 1000, id: 'imp1' }).concat([
    { id: 'n1', type: 'task.done', t: 2000, day: '2026-09-14', task: 1, mode: 'self' },
  ]));
  assert(after.stars === 38 && after.counts[1] === 2, '迁移基线之上可以继续追加事件');

  // 8) 两台设备各自追加，不会互相覆盖（这是当前整包覆盖方案丢数据的根因）
  const A = [{ id: 'a1', type: 'task.done', t: 100, day: '2026-09-14', task: 0, mode: 'self' }];
  const B = [{ id: 'b1', type: 'task.done', t: 200, day: '2026-09-14', task: 1, mode: 'self' }];
  const merged = EVENTS.replay(A.concat(B));
  assert(merged.counts[0] === 1 && merged.counts[1] === 1 && merged.stars === 2, '两台设备各自的改动都被保留（整包覆盖做不到）');
}

// ---------- 主流程 ----------
(async () => {
  console.log('== 语法检查 ==');
  for (const f of ['app.js', 'auth.js', 'config.js', 'sw.js']) {
    try {
      execFileSync(process.execPath, ['--check', path.join(DIST, f)], { stdio: 'pipe' });
      console.log('ok - node --check dist/' + f);
    } catch (e) { assert(false, f + ' 语法检查失败'); }
  }

  stubTests();
  await archiveTests();
  eventTests();

  console.log('\n' + (failures ? `共 ${failures} 项失败` : 'ALL_PASS'));
  process.exit(failures ? 1 : 0);
})();
