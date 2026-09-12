// 一键回归验证：语法检查 + 桩测试（逻辑） + WebView2 真实渲染验证（视觉/DOM）
// 用法：node scripts/verify.js          全部验证
//       node scripts/verify.js --stub   只跑语法检查 + 桩测试（无 WebView2 环境时用）
// 桩测试覆盖：备份恢复 / 徽章升级 / 今日大满贯 / 夜间自动切换 / 星星滚动上账
// WebView2 覆盖：首页渲染 / 普通得星滚动 / 大满贯得星滚动 / 夜间模式，截图存 scripts/shots/
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SHOTS = path.join(ROOT, 'scripts', 'shots');
const SRC = fs.readFileSync(path.join(DIST, 'app.js'), 'utf8');
const RealDate = Date;

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
function makeStubs(opts = {}) {
  const { seed, stored = {}, hour = 12, dark = false, reduced = false } = opts;
  const store = Object.assign({}, stored);
  if (seed) store['self-growth-v1'] = JSON.stringify(seed);
  const elements = {}, qels = {};
  const mkClassList = () => {
    const set = new Set();
    return {
      add: c => set.add(c), remove: c => set.delete(c),
      toggle: (c, f) => { if (f === undefined) f = !set.has(c); f ? set.add(c) : set.delete(c); },
      contains: c => set.has(c),
    };
  };
  const mkEl = () => ({
    innerHTML: '', value: '', open: false, textContent: '', _kids: [],
    classList: mkClassList(),
    showModal() { this.open = true; }, close() { this.open = false; },
    appendChild(c) { this._kids.push(c); }, remove() {}, click() {},
    setAttribute() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    animate() { const a = {}; Object.defineProperty(a, 'onfinish', { set(fn) { a._f = fn; } }); globalThis.__lastAnim = a; return a; },
    style: {},
  });
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

// ---------- WebView2 真实渲染验证 ----------
function ensureHarness() {
  const dir = path.join(ROOT, 'scripts', 'wv2');
  const exe = path.join(dir, 'Harness.exe');
  const cs = path.join(dir, 'Harness.cs');
       if (fs.existsSync(exe) && fs.statSync(exe).mtimeMs >= fs.statSync(cs).mtimeMs) return exe;
  const dlls = [
    ['Microsoft.Web.WebView2.Core.dll', path.join('desktop', 'packages', 'core', 'lib', 'net45')],
    ['Microsoft.Web.WebView2.WinForms.dll', path.join('desktop', 'packages', 'core', 'lib', 'net45')],
    ['WebView2Loader.dll', path.join('desktop', 'packages', 'core', 'runtimes', 'win-x64', 'native')],
  ];
  for (const [f, fallback] of dlls) {
    let src = path.join(ROOT, 'desktop', 'GrowthApp', f);
    if (!fs.existsSync(src)) src = path.join(ROOT, fallback, f);
    if (!fs.existsSync(src)) { console.error('缺少 ' + f + '，请先运行 desktop/build.ps1 一次'); return null; }
    fs.copyFileSync(src, path.join(dir, f));
  }
  const windir = process.env.WINDIR || 'C:\\Windows';
  let csc = path.join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  if (!fs.existsSync(csc)) csc = path.join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe');
  if (!fs.existsSync(csc)) { console.error('未找到 csc.exe'); return null; }
  try {
    execFileSync(csc, ['-nologo', '-target:exe', '-out:Harness.exe',
      '-r:Microsoft.Web.WebView2.Core.dll', '-r:Microsoft.Web.WebView2.WinForms.dll',
      '-r:System.dll', '-r:System.Core.dll', '-r:System.Drawing.dll', '-r:System.Windows.Forms.dll',
      'Harness.cs'], { cwd: dir, stdio: 'pipe' });
  } catch (e) { console.error('Harness 编译失败: ' + e.message); return null; }
  return fs.existsSync(exe) ? exe : null;
}

function runWv2(harness, page, outName, waitMs) {
  return new Promise((resolve) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const out = path.join(SHOTS, outName + '.json');
    const url = 'file:///' + path.join(DIST, page).replace(/\\/g, '/');
    const proc = spawn(harness, [url, out, String(waitMs)]);
    proc.on('close', () => {
      let dom = '';
      try { dom = JSON.parse(fs.readFileSync(out, 'utf8')); } catch {}
      resolve(dom);
    });
    proc.on('error', () => resolve(''));
  });
}

async function wv2Tests() {
  console.log('\n== WebView2 真实渲染验证 ==');
  const harness = ensureHarness();
  if (!harness) { console.error('WebView2 验证跳过（环境不可用），仅桩测试生效'); return; }

  const idx = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const seedScript = seed => `<script>localStorage.setItem('self-growth-v1','${JSON.stringify(seed).replace(/'/g, "\\'")}');</script>`;
  const probeJs = `setTimeout(()=>{const d=document.createElement('div');d.id='probe';d.textContent='rollFrom='+String(starRollFrom)+' stars='+s.stars+' num='+(document.querySelector('.balance-num')||{}).textContent;document.body.appendChild(d)},1500)`;
  const mkPage = (name, head, tail) => fs.writeFileSync(path.join(DIST, name),
    idx.replace('<script src="app.js', head + '<script src="app.js').replace('</body></html>', tail + '</body></html>'));

  // 普通得星（另一项提醒后完成，不触发大满贯）
  mkPage('__v_roll.html', seedScript(mkSeed({ stars: 5, days: daySeed({ selected: [0, 1], done: { 1: 'help' } }) })),
    `<script>window.addEventListener('load',()=>{finish(0,'self');${probeJs}});</script>`);
  // 大满贯得星（回归：修复前此路径钱包数字卡死）
  mkPage('__v_grand.html', seedScript(mkSeed({ stars: 5, days: daySeed({ selected: [0] }) })),
    `<script>window.addEventListener('load',()=>{finish(0,'self');${probeJs}});</script>`);
  // 夜间模式
  mkPage('__v_night.html', `<script>localStorage.setItem('growth-theme','night');</script>`, '');

  // 云端账号区块：未配置 envId 时应正常挂载、提示未配置，且不能有任何 JS 报错
  mkPage('__v_cloud.html', '', `<script>
window.__err='';
window.addEventListener('error',e=>{window.__err+='ERR:'+e.message+';'});
window.addEventListener('load',()=>{setTimeout(()=>{
  try{ parentOpen=true; parents();
    var t=[].slice.call(document.querySelectorAll('summary')).filter(function(x){return x.textContent.indexOf('云端账号')>=0})[0];
    if(t) t.click(); else window.__err+='NO_SUMMARY;';
  }catch(e){ window.__err+='PARENT:'+e.message+';'; }
  setTimeout(()=>{
    var box=document.getElementById('cloudBox');
    var d=document.createElement('div');d.id='probe';
    d.textContent='ERROR=['+window.__err+'] STATUS='+(window.Cloud?Cloud.status():'no-cloud')+' BOX='+(box?box.textContent.slice(0,80):'MISSING');
    document.body.appendChild(d);
  },1200);
},600)});
</script>`);

  const probeOf = dom => { const m = dom.match(/<div id="probe">([^<]*)<\/div>/); return m ? m[1] : '(no probe)'; };
  try {
    const smoke = await runWv2(harness, 'index.html', 'smoke', 2500);
    assert(smoke.includes('今天我做主') && smoke.includes('balance-num'), '首页正常渲染');

    const domA = await runWv2(harness, '__v_roll.html', 'roll', 3000);
    const pA = probeOf(domA);
    console.log('  普通得星探针:', pA);
    assert(/rollFrom=null stars=6 num=6/.test(pA), '普通得星滚动定格新数字');
    assert(!domA.includes('今日大满贯'), '普通得星不触发大满贯');

    const domB = await runWv2(harness, '__v_grand.html', 'grand', 3000);
    const pB = probeOf(domB);
    console.log('  大满贯探针:', pB);
    assert(domB.includes('今日大满贯'), '大满贯弹窗出现');
    assert(/rollFrom=null stars=6 num=6/.test(pB), '大满贯得星滚动定格新数字');

    const domN = await runWv2(harness, '__v_night.html', 'night', 2500);
    assert(/<body class="[^"]*night/.test(domN), '夜间模式星空渲染');

    const domC = await runWv2(harness, '__v_cloud.html', 'cloud', 3000);
    const pC = probeOf(domC);
    console.log('  云端区块探针:', pC);
    assert(/ERROR=\[\]/.test(pC), '云端账号区块挂载无 JS 报错');
    assert(/STATUS=off/.test(pC) && /BOX=未配置云端/.test(pC), '未配置 envId 时提示未配置云端');
    console.log('  截图已保存到 scripts/shots/（smoke/roll/grand/night .json.png）');
  } finally {
    for (const f of ['__v_roll.html', '__v_grand.html', '__v_night.html', '__v_cloud.html']) {
      try { fs.unlinkSync(path.join(DIST, f)); } catch {}
    }
  }
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
  if (!process.argv.includes('--stub')) await wv2Tests();

  console.log('\n' + (failures ? `共 ${failures} 项失败` : 'ALL_PASS'));
  process.exit(failures ? 1 : 0);
})();
