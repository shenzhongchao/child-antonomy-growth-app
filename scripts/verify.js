// 一键回归验证：语法检查 + 桩测试（逻辑）
// 用法：node scripts/verify.js
// 桩测试覆盖：V2 本地账本 / 备份恢复 / 徽章升级 / 今日大满贯 / 夜间自动切换 / 星星滚动上账 / 事件合并
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// 核心静态资源 ?v= 版本：HTTP/CDN/浏览器缓存 busting。只能向前递增，绝不复用历史版本号
// （v=13 曾发布过，回退会让旧缓存命中旧文件，新旧核心脚本混装）。当前指定版本。
const APP_ASSET_V = 19;
// Service Worker Cache Storage 命名空间（growth-vXX），与 ?v=xx 职责不同、不必相等，同样只递增。
const SW_CACHE_V = 'growth-v18';
const SRC = fs.readFileSync(path.join(DIST, 'app.js'), 'utf8');
const EVENTS = require(path.join(DIST, 'growth-events.js'));
const RealDate = Date;

// localStoreTests（跑在真正的全局作用域里）取回 app.js 默认值，供 eventTests 比对
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

const RealURL = require('url').URL;

async function until(cond) { while (!cond()) await Promise.resolve(); }

// CloudBase rdb 桩：PostgREST 风格链式查询，server_seq 升序 + 分页 + ignoreDuplicates upsert。
// 要求查询显式 .order('server_seq', {ascending:true})，否则直接抛错（P2-2 不许依赖默认顺序）。
function makeFakeCloud(opts = {}) {
  const events = (opts.events || []).map(r => Object.assign({}, r));
  let seq = events.reduce((m, r) => Math.max(m, Number(r.server_seq) || 0), 0);
  const profile = { id: opts.profileId || 'p_test', user_id: 'u_test', name: '小小探险家', phone: '', updated_at: 1 };
  const log = { queries: [], uploadedIds: [] };
  let failUpsert = opts.failUpsertTimes || 0;
  const addEvent = (type, payload, day) => {
    seq++;
    events.push({
      id: 'fake-' + seq, user_id: 'u_test', profile_id: profile.id, device_id: 'other',
      type, day: day || null, t: seq, payload: payload || {}, server_seq: seq,
    });
    return seq;
  };
  const eventChain = () => {
    const q = { eq: null, gt: null };
    const chain = {
      select() { return chain; },
      eq(k, v) { q.eq = { k, v }; return chain; },
      gt(k, v) { q.gt = { k, v }; return chain; },
      order(col, o) {
        if (col !== 'server_seq' || !o || o.ascending !== true) {
          throw new Error('events 查询必须显式 .order("server_seq", {ascending:true})');
        }
        return chain;
      },
      range(from, to) {
        let rows = events.filter(r => (!q.eq || r[q.eq.k] === q.eq.v));
        if (q.gt) rows = rows.filter(r => Number(r[q.gt.k]) > q.gt.v);
        rows = rows.slice().sort((a, b) => Number(a.server_seq) - Number(b.server_seq));
        log.queries.push({ gt: q.gt ? q.gt.v : null, from, matched: rows.length });
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
      },
      upsert(rowsIn, o) {
        if (!o || o.onConflict !== 'id') throw new Error('upsert 必须声明 onConflict: "id"');
        const ids = new Set(events.map(r => r.id));
        const resp = { error: null };
        if (failUpsert > 0) { failUpsert--; resp.error = new Error('模拟网络失败'); return Promise.resolve(resp); }
        (Array.isArray(rowsIn) ? rowsIn : [rowsIn]).forEach(r => {
          log.uploadedIds.push(r.id);
          if (ids.has(r.id)) { if (!o.ignoreDuplicates) throw new Error('重复 upsert 且未声明忽略'); return; }
          ids.add(r.id);
          seq++;
          events.push(Object.assign({}, r, { server_seq: seq }));
        });
        return Promise.resolve({ error: null });
      },
    };
    return chain;
  };
  const profileChain = () => {
    const chain = {
      select() { return chain; }, eq() { return chain; }, limit() { return chain; }, order() { return chain; },
      upsert(row) { Object.assign(profile, row); return Promise.resolve({ error: null }); },
      then(resolve, reject) { return Promise.resolve({ data: [profile], error: null }).then(resolve, reject); },
    };
    return chain;
  };
  const app = {
    auth: () => ({
      getLoginState: () => Promise.resolve(opts.loggedIn ? { user: { uid: 'u_test' } } : null),
      signOut: () => Promise.resolve({}),
    }),
    rdb: () => ({ from: t => (String(t).indexOf('profile') !== -1 ? profileChain() : eventChain()) }),
  };
  return { app, profile, events, log, addEvent, set failUpsertTimes(v) { failUpsert = v; } };
}

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
  if (seed) store['self-growth-v2'] = JSON.stringify({
    version: 2, deviceId: 'd_test', profileId: 'p_test', userId: null,
    sequence: 0, lastServerSeq: 0, lastSync: 0, state: seed, pending: [],
  });
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
  globalThis.GrowthEvents = EVENTS;
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
  console.log('\n== 桩测试：家长中心与备份恢复 ==');
  runCase({ seed: mkSeed({ stars: 7, counts: [1, 0, 0, 0, 0, 0] }) }, `
parentOpen = false; parents();
let html = document.getElementById('modal').innerHTML;
assert(html.includes('不登录也能用') && html.includes('cloudBox') && html.includes('pwaBox'), '家长中心首屏先说明无需登录、云端同步与桌面安装');
assert(html.includes('孩子与成长') && html.includes('奖励规则') && html.includes('技能管理') && html.includes('记录与数据'), '家长中心按任务分模块展示');
assert(!html.includes('kidName') && !html.includes('backupData()'), '家长中心首页不堆叠具体设置表单与高级数据操作');
openParentSection('child');
assert(document.getElementById('modal').innerHTML.includes('请家长确认') && document.getElementById('modal').innerHTML.includes('1234'), '修改成长规则前才要求家长确认');
parentOpen = true; openParentSection('data');
html = document.getElementById('modal').innerHTML;
assert(html.includes('导出记录文件') && html.includes('backupData()') && html.includes('restoreFile'), '记录与数据二级页提供备份与未登录恢复');
backupData();
const data = JSON.parse(__blob.parts[0]);
assert(data.version === 2 && data.state.stars === 7 && data.state.name === '测试宝宝', 'V2 记录文件内容完整');
restoreData({ files: [{ content: JSON.stringify({ version: 2, state: { days: {}, stars: 42, counts: [1,2,3,4,5,6], rewards: [], name: '恢复宝宝', goal: 5, graduated: [1], prices: [5,8,10,15,12,15] } }) }], value: 'x' });
assert(s.name === '恢复宝宝' && s.stars === 42 && s.goal === 5, '恢复后状态替换为备份');
assert(JSON.parse(localStorage.getItem('self-growth-v2')).state.name === '恢复宝宝', '恢复后已持久化到 V2 数据包');
assert(JSON.parse(localStorage.getItem('self-growth-v2')).pending.map(e => e.type).join() === 'state.import', '本机恢复以单一基线事件开始，不混入旧待上传操作');
restoreData({ files: [{ content: 'not json{{' }], value: 'x' });
assert(s.stars === 42 && document.getElementById('notice').innerHTML.includes('无法识别'), '非法 JSON 被拒绝且不动数据');
restoreData({ files: [{ content: JSON.stringify({ stars: 'abc' }) }], value: 'x' });
assert(s.stars === 42, '结构不符的备份被拒绝');
growthStore.userId = 'u_bound'; parentData();
assert(!document.getElementById('modal').innerHTML.includes('restoreFile') && document.getElementById('modal').innerHTML.includes('退出家长账号'), '绑定账号后隐藏文件恢复并提供受 PIN 保护的退出入口');
restoreData({ files: [{ content: JSON.stringify({ version: 2, state: blank() }) }], value: 'x' });
assert(s.stars === 42, '绑定账号后文件恢复不生效');
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

  console.log('\n== 桩测试：增量合并（GrowthStore.merge） ==');
  runCase({ seed: mkSeed() }, `
const evs = [
  { id: 'i1', type: 'state.import', serverSeq: 1, payload: Object.assign(blank(), { stars: 10 }) },
  { id: 'd1', type: 'task.done', serverSeq: 2, day: '2026-09-14', task: 0, mode: 'self' },
  { id: 'd2', type: 'reward.redeem', serverSeq: 3, day: '2026-09-14', reward: 0, cost: 5 },
  { id: 'd3', type: 'settings.name', serverSeq: 4, value: '增量合并' },
];
const full = EVENTS.replay(evs);
const GrowthStore = window.GrowthStore;
const sd = x => { const y = JSON.parse(JSON.stringify(x)); delete y.days[dayKey()]; return JSON.stringify(y); };
GrowthStore.merge(evs.slice(0, 2), [], 'p1', 'u1', 2);
GrowthStore.merge(evs.slice(2), [], 'p1', 'u1', 4);
assert(sd(s) === sd(full), '分批增量合并与全量重放逐字段一致');
assert(growthStore.lastServerSeq === 4 && growthStore.pending.length === 0, 'lastServerSeq 已推进且无遗留待传');
GrowthStore.merge([], [], 'p1', 'u1', 4);
assert(sd(s) === sd(full), '网络重试后的空增量不改变状态（幂等）');
`);
}

// ---------- V2 本地账本：一个账号一个孩子 ----------
async function localStoreTests() {
  console.log('\n== 桩测试：V2 本地账本 ==');
  const store = {};
  const elements = {};
  globalThis.window = globalThis;
  globalThis.GrowthEvents = EVENTS;
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
  globalThis.addEventListener = () => {};
  globalThis.innerWidth = 400; globalThis.innerHeight = 800;
  globalThis.setInterval = () => 0;
  globalThis.setTimeout = () => 0;
  globalThis.Date = RealDate;
  globalThis.GROWTH_CLOUD = { envId: '' };   // 未配置云端：纯本机单孩子

  vm.runInThisContext(fs.readFileSync(path.join(DIST, 'app.js'), 'utf8'), { filename: 'app.js' });
  vm.runInThisContext(fs.readFileSync(path.join(DIST, 'auth.js'), 'utf8'), { filename: 'auth.js' });
  appBlankJson = vm.runInThisContext('JSON.stringify(blank())');
  appDayJson = vm.runInThisContext('JSON.stringify(today())');
  let pack = JSON.parse(localStorage.getItem('self-growth-v2'));
  assert(pack.version === 2 && pack.deviceId && pack.profileId, '首次启动建立唯一 V2 数据包和孩子档案');
  assert(!localStorage.getItem('self-growth-v1') && !localStorage.getItem('self-growth-archive-v1'), '不再创建旧活动数据与多孩子归档');

  elements.kidName = mkEl(); elements.kidName.value = '朵朵';
  elements.goal = mkEl(); elements.goal.value = '5';
  elements.note = mkEl(); elements.note.value = '今天自己开始学习了';
  parentOpen = true; saveParent();
  pack = JSON.parse(localStorage.getItem('self-growth-v2'));
  assert(pack.state.name === '朵朵' && pack.state.goal === 5, '孩子设置写入唯一状态投影');
  assert(pack.pending.map(e => e.type).join() === 'settings.name,settings.goal,note', '每项设置产生细粒度待上传事件');
  assert(typeof Cloud === 'object' && Cloud.configured() === false, '未配置云端时仍可纯本机使用');
  assert(!('kids' in Cloud) && !('switchChild' in Cloud) && !('addChild' in Cloud), '多孩子档案 API 已移除');

  elements.cloudBox = mkEl(); Cloud.mount('cloudBox');
  assert(elements.cloudBox.innerHTML.includes('尚未配置云端同步'), '未配置云端时家长看到明确的云端同步状态；不出现旧的“保护”措辞');
  ['记录保护', '自动保护', '保护记录'].forEach(word => {
    assert(!elements.cloudBox.innerHTML.includes(word), '家长面板不出现旧措辞「' + word + '」');
  });
}

// ---------- 事件账本：文件基线恢复 + reducer 语义 ----------
function eventTests() {
  console.log('\n== 桩测试：事件账本 ==');

  // 1) 默认值不许与 app.js 漂移（app.js 改了计划/价格表而这里没跟，要立刻炸出来）
  assert(JSON.stringify(EVENTS.blank()) === appBlankJson, 'blank() 与 app.js 的默认结构逐字段一致');
  assert(JSON.stringify(EVENTS.blankDay()) === appDayJson, 'blankDay() 与 app.js 的 today() 默认逐字段一致');

  // 2) 文件恢复等价性：任意复杂 state → 一条 import 基线 → 重放，必须逐字段相同
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
  const back = EVENTS.replay([{ id: 'imp1', type: 'state.import', t: 1000, payload: messy }]);
  assert(JSON.stringify(back) === JSON.stringify(EVENTS.norm(messy)), '文件基线恢复无损：state → 事件 → 重放逐字段相同');
  assert(back.stars === 37 && back.name === '朵朵' && back.goal === 5, '恢复后星星/昵称/目标不变');
  assert(Object.keys(back.days).length === 3 && back.days['2026-09-10'].done['2'] === 'self', '恢复后每日记录完整');
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
    { id: 'e10', type: 'reward.use', t: 10, rewardId: 'e9' },
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

  // 7) 恢复基线之上可以继续追加日常事件
  const after = EVENTS.replay([{ id: 'imp1', type: 'state.import', t: 1000, payload: messy }].concat([
    { id: 'n1', type: 'task.done', t: 2000, day: '2026-09-14', task: 1, mode: 'self' },
  ]));
  assert(after.stars === 38 && after.counts[1] === 2, '恢复基线之上可以继续追加事件');

  // 8) 两台设备各自追加，不会互相覆盖（这是当前整包覆盖方案丢数据的根因）
  const A = [{ id: 'a1', type: 'task.done', t: 100, day: '2026-09-14', task: 0, mode: 'self' }];
  const B = [{ id: 'b1', type: 'task.done', t: 200, day: '2026-09-14', task: 1, mode: 'self' }];
  const merged = EVENTS.replay(A.concat(B));
  assert(merged.counts[0] === 1 && merged.counts[1] === 1 && merged.stars === 2, '两台设备各自的改动都被保留（整包覆盖做不到）');

  // 9) 云端序号覆盖错误的客户端时间，所有设备按同一顺序收敛
  const ordered = EVENTS.replay([
    { id: 'late-clock', type: 'settings.name', t: 999999, serverSeq: 1, value: '先到云端' },
    { id: 'early-clock', type: 'settings.name', t: 1, serverSeq: 2, value: '后到云端' },
  ]);
  assert(ordered.name === '后到云端', '跨设备以 server_seq 为权威顺序，不依赖客户端时钟');

  // 10) 两台设备同时花同一批星星，只让云端顺序中的第一笔生效
  const wallet = EVENTS.blank(); wallet.stars = 5;
  const concurrentRewards = EVENTS.replay([
    { id: 'base', type: 'state.import', serverSeq: 1, payload: wallet },
    { id: 'redeem-a', type: 'reward.redeem', serverSeq: 2, day: '2026-09-14', reward: 0, cost: 5 },
    { id: 'redeem-b', type: 'reward.redeem', serverSeq: 3, day: '2026-09-14', reward: 1, cost: 5 },
  ]);
  assert(concurrentRewards.stars === 0 && concurrentRewards.rewards.length === 1, '并发兑换不会把余额扣成负数');

  // 11) pick 与已完成任务保持一致：另一台设备重新选择，已经 done 的任务不能从可见挑战里消失
  const pickFix = EVENTS.replay([
    { id: 'b1', type: 'state.import', serverSeq: 1, payload: EVENTS.blank() },
    { id: 'd1', type: 'task.done', serverSeq: 2, day: '2026-09-14', task: 1, mode: 'self' },
    { id: 'p1', type: 'pick', serverSeq: 3, day: '2026-09-14', selected: [0, 2] },
  ]);
  const pickDay = pickFix.days['2026-09-14'];
  assert(pickDay.selected.indexOf(1) !== -1 && pickDay.selected.length === 3
    && pickDay.done['1'] === 'self', 'pick 保留当天已完成的任务（selected = done ∪ 新选择）');
  assert(pickDay.plan && pickFix.stars === 1, 'pick 兜底不改写完成与星星');

  // 12) syncPlan 纯策略：<云端有历史 + 本机 pending 含 state.import> → 云端权威
  const remoteRows = Array.from({ length: 10 }, (_, i) => ({ id: 'rr' + (i + 1), type: 'note', day: '2026-09-01', t: i + 1 }));
  const planA = EVENTS.syncPlan(remoteRows, [{ id: 'imp', type: 'state.import', t: 9e13, payload: {} }]);
  assert(planA.mode === 'adopt-cloud' && planA.dropIds.length === 1
    && planA.dropIds.includes('imp'), '云端已有历史：整包恢复基线不进入云端');
  assert(/未覆盖云端/.test(planA.message), '给家长提示覆盖被拒绝');
  const planB = EVENTS.syncPlan([], [{ id: 'imp', type: 'state.import', t: 9e13, payload: {} }]);
  assert(planB.mode === 'normal' && planB.dropIds.length === 0, '新账号无云端历史：允许作为初始基线上传');
  const planC = EVENTS.syncPlan(remoteRows, [{ id: 'n1', type: 'note', t: 9e13, day: '2026-09-01', text: 'x' }]);
  assert(planC.mode === 'normal' && planC.dropIds.length === 0, '普通 pending 不受备份保护策略影响');
}

// ---------- 云同步端到端：增量拉取 + 旧备份不覆盖云端 ----------
async function cloudSyncTests() {
  console.log('\n== 桩测试：云同步（增量与备份保护） ==');
  globalThis.GROWTH_CLOUD = { envId: 'env-test', pushDelay: 5 };
  vm.runInThisContext('window.__seedStore=function(p){growthStore=p;s=GrowthEvents.norm(p.state||GrowthEvents.blank())};'
    + 'window.__appState=function(){return s};window.__appPack=function(){return growthStore};');

  const backupState = { days: {}, stars: 42, counts: [1, 2, 2, 0, 0, 0], rewards: [], name: '本地备份', goal: 4, graduated: [1], prices: [5, 8, 10, 15, 12, 15] };
  const importEvent = { id: 'imp-backup', type: 'state.import', t: Date.now(), payload: backupState };
  const remoteBase = (n) => {
    const rows = [{ id: 'r1', server_seq: 1, user_id: 'u_test', profile_id: 'p_test', device_id: 'other', type: 'state.import', day: null, t: 1, payload: { payload: { days: {}, stars: 50, counts: [0, 0, 0, 0, 0, 0], rewards: [], name: '云端', goal: 3, graduated: [], prices: [5, 8, 10, 15, 12, 15] } } }];
    for (let i = 2; i <= n; i++) rows.push({ id: 'r' + i, server_seq: i, user_id: 'u_test', profile_id: 'p_test', device_id: 'other', type: 'note', day: '2026-09-01', t: i, payload: { text: '第' + i + '条云端记录' } });
    return rows;
  };

  // 场景 A：云端 1001 条历史 + 本机旧备份 import → 云端权威，备份不覆盖
  const fake1 = makeFakeCloud({ events: remoteBase(1001) });
  globalThis.__fake1 = fake1;
  const seedPackA = {
    version: 2, deviceId: 'd_local', profileId: 'p_local', userId: null,
    sequence: 0, lastServerSeq: 0, lastSync: 0, confirmedState: null,
    state: EVENTS.norm(backupState), pending: [Object.assign({}, importEvent)],
  };
  globalThis.localStorage.setItem('self-growth-v2', JSON.stringify(seedPackA));
  vm.runInThisContext('window.__seedStore(JSON.parse(localStorage.getItem("self-growth-v2")))');
  const t1 = await vm.runInThisContext('Cloud.__test(window.__fake1.app, "u_test")');
  const resA = await t1.syncNow(true);
  await until(() => resA !== null);
  assert(resA === 'ok', '场景 A 同步完成');
  assert(!fake1.events.some(e => e.id === 'imp-backup'),
    '云端已有历史（server_seq 1..1001）：旧备份 state.import 未上传');
  const packA = globalThis.__appPack();
  const stA = globalThis.__appState();
  assert(stA.stars === 50 && stA.name === '云端' && stA.goal === 3, '云端状态保持原来的最新 projection');
  assert(packA.pending.length === 0, '本机待上传里的旧备份 pending 已清理');
  const noticeA = String((document.getElementById('notice') || {}).innerHTML || '');
  assert(noticeA.includes('旧备份未覆盖云端'), '家长被明确提示本机旧备份未覆盖云端');
  // 分页：两次拉取各 2 页（1000 + 1），无遗漏无重复
  const pageMatches = fake1.log.queries.map(q => q.matched);
  assert(pageMatches.slice(0, 4).every(m => m === 1001), '1001 条事件都按 server_seq 显式排序分页拉取');
  const listed = await t1.listEvents('p_test', 0);
  const listedIds = listed.map(e => e.id);
  assert(listed.length === 1001 && new Set(listedIds).size === 1001, '远端 1001 条事件全部拉回、无重复');
  const listedSeqs = listed.map(e => e.serverSeq);
  assert(listedSeqs.every((v, i) => i === 0 || v > listedSeqs[i - 1]), '事件严格按 server_seq 升序');

  // 场景 B：增量同步只拉 server_seq > lastServerSeq 的新事件
  fake1.addEvent('note', { text: '新备注' }, '2026-09-02');
  fake1.addEvent('settings.goal', { value: 5 });
  fake1.addEvent('task.done', { task: 0, mode: 'self' }, '2026-09-02');
  const qBefore = fake1.log.queries.length;
  const resB = await t1.syncNow(true);
  assert(resB === 'ok', '场景 B 正常同步');
  const deltaQueries = fake1.log.queries.slice(qBefore);
  assert(deltaQueries.length === 2, '后续同步两次 listEvents 各只打 1 页');
  assert(deltaQueries.every(q => q.gt === 1001), '查询条件为 server_seq > lastServerSeq');
  assert(deltaQueries.every(q => q.matched === 3), '增量只命中 3 条新事件（不再全量拉两遍）');
  assert(globalThis.__appPack().lastServerSeq === 1004, '增量后 lastServerSeq = 1004');
  assert(globalThis.__appState().goal === 5 && globalThis.__appState().stars === 51,
    '远端增量事件进入本机投影');

  // 场景 C：新账号（云端无历史）用本机备份初始化
  const seedPackC = {
    version: 2, deviceId: 'd_local2', profileId: 'p_new', userId: null,
    sequence: 0, lastServerSeq: 0, lastSync: 0, confirmedState: null,
    state: EVENTS.norm(backupState), pending: [Object.assign({}, importEvent, { id: 'imp-fresh' })],
  };
  globalThis.localStorage.setItem('self-growth-v2', JSON.stringify(seedPackC));
  vm.runInThisContext('window.__seedStore(JSON.parse(localStorage.getItem("self-growth-v2")))');
  const fakeC = makeFakeCloud({ events: [] });
  globalThis.__fakeC = fakeC;
  const tC = await vm.runInThisContext('Cloud.__test(window.__fakeC.app, "u_test")');
  const resC = await tC.syncNow(true);
  assert(resC === 'ok', '场景 C 同步成功');
  const colC = fakeC.events[0] && fakeC.events[0].payload;
  assert(fakeC.events.length === 1 && fakeC.events[0].type === 'state.import'
    && (colC.payload || colC).stars === 42, '新账号：本机备份成功成为初始云端状态');
  assert(globalThis.__appState().stars === 42 && globalThis.__appState().name === '本地备份',
    '初始化后本机状态与备份一致');
  assert(globalThis.__appPack().lastServerSeq === 1, '场景 C lastServerSeq = 1');

  // 场景 D：上传网络失败 pending 不丢失，恢复后重传成功
  globalThis.localStorage.setItem('self-growth-v2', JSON.stringify(seedPackC));
  vm.runInThisContext('window.__seedStore(JSON.parse(localStorage.getItem("self-growth-v2")))');
  const fakeD = makeFakeCloud({ events: [] });
  fakeD.failUpsertTimes = 1;
  globalThis.__fakeD = fakeD;
  const tD = await vm.runInThisContext('Cloud.__test(window.__fakeD.app, "u_test")');
  const resD1 = await tD.syncNow(true);
  assert(resD1 === null, '场景 D 上传失败时不上报成功');
  assert(String(globalThis.__appPack().pending.map(e => e.type)).includes('state.import'),
    '网络失败后本机备份事件仍在待上传队列');
  assert(fakeD.events.length === 0, '网络失败：云端没有任何数据进入');
  fakeD.failUpsertTimes = 0;
  const resD2 = await tD.syncNow(true);
  assert(resD2 === 'ok', '场景 D 恢复后重传成功');
  const colD = fakeD.events[0] && fakeD.events[0].payload;
  assert(fakeD.events.length === 1 && ((colD.payload || colD).stars === 42), '重传后云端账本收到备份基线');

  // 场景 E：验证码 UX——发送成功后面板内有可见反馈 + 60 秒重发倒计时，按钮禁用等倒计时
  globalThis.__fakeE = makeFakeCloud({ events: [] });
  globalThis.__fakeE.app.auth = () => ({
    getLoginState: () => Promise.resolve(null),
    getVerification: v => { globalThis.__lastVerification = v; return Promise.resolve({ verification: { vid: 'vid_e' } }); },
    signOut: () => Promise.resolve({}),
  });
  await vm.runInThisContext('window.__seedStore(JSON.parse(localStorage.getItem("self-growth-v2")))');
  const tE = await vm.runInThisContext('Cloud.__test(window.__fakeE.app, null)');
  await vm.runInThisContext('Cloud.logout()');
  await until(() => vm.runInThisContext('Cloud.status()') === 'login');
  vm.runInThisContext('Cloud.mount("clBoxE")');
  const boxE = document.getElementById('clBoxE');
  assert(String(boxE.innerHTML).includes('获取验证码') && String(boxE.innerHTML).includes('id="clCodeStatus"'),
    '登录面板提供获取验证码按钮与面板内状态节点');
  const btnE = document.getElementById('clSendCode');
  const msgE = document.getElementById('clCodeStatus');
  document.getElementById('clPhone').value = '13800138000';
  assert(!msgE.textContent, '发送前面板内无提示反馈');
  await tE.sendCode();
  await until(() => String(msgE.textContent).includes('验证码已发送到'));
  assert(msgE.textContent.includes('验证码已发送到 138****8000'), '发送成功后面板内显示脱敏手机号反馈（clCodeStatus）');
  assert(btnE.disabled === true, '发送成功后按钮 disabled（倒计时期间不可重发）');
  assert(/重新发送（60s）/.test(String(btnE.textContent)), '按钮显示 60 秒重发倒计时');
  const verE = globalThis.__lastVerification;
  assert(verE && verE.phone_number === '+86 13800138000', '验证码请求使用 +86 前缀手机号');
}

// ---------- Service Worker：带 ?v=xx 的请求命中预缓存 + 导航断网兜底 ----------
async function swTests() {
  console.log('\n== 桩测试：Service Worker 缓存 ==');
  const src = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');
  assert(/const VERSION = 'growth-v\d+'/.test(src), 'SW 使用版本号 VERSION');
  assert(src.includes('{ ignoreSearch: true }'), 'SW 静态匹配用 ignoreSearch 兜底带 ?v=xx 的请求');
  const core = /const CORE = \[([\s\S]*?)\];/.exec(src)[1];
  assert(!core.includes('cloudbase'), '预缓存不包含 CloudBase SDK');
  assert(new RegExp("const VERSION = '" + SW_CACHE_V + "';").test(src), 'SW Cache Storage 版本推进到 ' + SW_CACHE_V + '（不复用历史命名空间）');

  // 资源 query 版本防回退/复用
  const idx = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  for (const f of ['styles.css', 'growth-events.js', 'history.css', 'history.js', 'app.js', 'config.js', 'auth.js']) {
    assert(idx.includes(f + '?v=' + APP_ASSET_V), f + ' 使用当前指定版本 ?v=' + APP_ASSET_V);
  }
  const vs = (idx.match(/v=(\d+)/g) || []).map(x => Number(x.slice(2)));
  assert(vs.length && Math.min.apply(null, vs) >= APP_ASSET_V, 'index.html 资源 query 版本未回退/复用历史版本');
  const authSrc = fs.readFileSync(path.join(DIST, 'auth.js'), 'utf8');
  assert(authSrc.includes('cloudbase.esm.js?v=' + APP_ASSET_V), 'cloudbase.esm.js 使用 ?v=' + APP_ASSET_V);

  // 家长区文案统一为「云端同步」表达（产品决策：不再使用“保护”系列措辞））
  const appSrcFull = fs.readFileSync(path.join(DIST, 'app.js'), 'utf8');
  ['记录保护', '自动保护', '保护记录'].forEach(word => {
    assert(!appSrcFull.includes(word) && !authSrc.includes(word), '家长区文案不再出现「' + word + '」');
  });
  assert(appSrcFull.includes('☁️ 云端同步'), '家长面板 section 标题为「☁️ 云端同步」');

  // 模拟 Cache API：预缓存键不带 query；ignoreSearch 按文件名匹配
  const entries = {
    'https://x.test/index.html': 'B-HTML',
    'https://x.test/styles.css': 'B-CSS',
    'https://x.test/app.js': 'B-APP',
    'https://x.test/growth-events.js': 'B-EVENTS',
  };
  const cacheStub = {
    async match(req, opts) {
      const url = String(typeof req === 'string' ? req : req.url);
      const u = new RealURL(url, 'https://x.test/sw.js');
      if (opts && opts.ignoreSearch) {
        for (const k of Object.keys(entries)) {
          const ku = new RealURL(k);
          if (ku.origin === u.origin && ku.pathname === u.pathname) return makeRes(k, entries[k]);
        }
        return undefined;
      }
      const full = u.href;
      if (full in entries) return makeRes(full, entries[full]);
      return undefined;
    },
    async put(req, res) { entries[String(typeof req === 'string' ? req : req.url)] = res.body; },
  };
  function makeRes(url, body) {
    return { url, status: 200, type: 'basic', body, clone() { return this; } };
  }
  const handlers = {};
  const network = { calls: 0 };
  const sandbox = {
    console,
    URL: RealURL,
    setTimeout, clearTimeout,
    AbortController,
    self: {
      location: { origin: 'https://x.test', href: 'https://x.test/sw.js' },
      addEventListener: (n, f) => { handlers[n] = f; },
      skipWaiting: () => {},
    },
    caches: { open: async () => cacheStub, match: async (req) => cacheStub.match(req) },
    fetch: async (req) => {
      network.calls++;
      return Promise.reject(new Error('离线'));
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);

  async function serveReq(req) {
    let out;
    if (!handlers['fetch']) throw new Error('sw 未注册 fetch 监听：' + Object.keys(handlers).join(','));
    try {
      handlers['fetch']({ request: req, respondWith: (p) => { out = p; } });
    } catch (syncErr) {
      console.error('sw fetch 同步错误：', syncErr && syncErr.message);
      throw syncErr;
    }
    if (out === undefined) throw new Error('sw fetch 监听未调用 respondWith（提前 return）');
    return out;
  }
  const req = (url, mode) => ({ url, method: 'GET', mode: mode || 'cors', headers: { get: () => null } });

  // 1) runtime 请求 app.js?v=99 命中无 query 的预缓存
  const before = network.calls;
  const hit1 = await serveReq(req('https://x.test/app.js?v=99'));
  assert((await hit1).body === 'B-APP' && network.calls === before, 'runtime app.js?v=99 命中预缓存');
  const hit2 = await serveReq(req('https://x.test/styles.css?v=13'));
  assert((await hit2).body === 'B-CSS', 'styles.css?v=13 命中预缓存');
  const hit3 = await serveReq(req('https://x.test/growth-events.js?v=13'));
  assert((await hit3).body === 'B-EVENTS', 'growth-events.js?v=13 命中预缓存');
  const hit4 = await serveReq(req('https://x.test/app.js'));
  assert((await hit4).body === 'B-APP', '无 query 的 app.js 精确命中');

  // 2) 离线路径：导航网快失败也能回到缓存 index.html，核心资源不白屏
  const navFallback = await serveReq({ url: 'https://x.test/index.html?from=pwa', method: 'GET', mode: 'navigate', headers: { get: () => null } });
  assert((await navFallback).body === 'B-HTML', '离线导航回退到缓存的 index.html');

  // 3) 不在 CORE_FILES 清单里的资源（如 CloudBase SDK 带 ?v=xx）不去蹭精确缓存之外的内容
  const sdkHit = serveReq(req('https://x.test/cloudbase.esm.js?v=13'));
  assert(network.calls > before, '未预缓存的资源仍走网络（SDK 版本更新不受兜底污染）');
  try { await sdkHit; } catch (e) {}
}

// ---------- 主流程 ----------
(async () => {
  console.log('== 语法检查 ==');
  for (const f of ['growth-events.js', 'history.js', 'app.js', 'auth.js', 'config.js', 'sw.js']) {
    try {
      execFileSync(process.execPath, ['--check', path.join(DIST, f)], { stdio: 'pipe' });
      console.log('ok - node --check dist/' + f);
    } catch (e) { assert(false, f + ' 语法检查失败'); }
  }

  stubTests();

  console.log('\n== 成长足迹纯逻辑回归 ==');
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'verify-history.js')], { stdio: 'inherit' });
    console.log('ok - verify-history ALL_PASS');
  } catch (e) {
    assert(false, 'verify-history.js 存在失败项');
  }

  console.log('\n== 安全回归 ==');
  try {
    execFileSync(
      process.execPath,
      [path.join(ROOT, 'scripts', 'verify-security.js')],
      { stdio: 'inherit' }
    );
    console.log('ok - verify-security SECURITY_ALL_PASS');
  } catch (e) {
    assert(false, 'verify-security.js 存在失败项');
  }

  await localStoreTests();
  await cloudSyncTests();
  await swTests();
  eventTests();

  console.log('\n' + (failures ? `共 ${failures} 项失败` : 'ALL_PASS'));
  process.exit(failures ? 1 : 0);
})();
