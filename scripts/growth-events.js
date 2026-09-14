/* 事件账本（纯函数，零副作用）
 * ---------------------------------------------------------------------------
 * 目的：让云端成为「唯一的权威账本」，同时不丢数据。
 *
 * 为什么不能直接存整包 state：两台设备各自把「最终状态」写回云端，后端无法判断
 * 谁是对的，只能 last-write-wins —— 先写那一边的改动就没了（现在这套就是这么丢的）。
 * 改成只记「做了什么」（只增不改的操作），后端只追加、不覆盖，就没有「覆盖」这回事：
 * 同一个操作重复上传也只算一次（按 id 去重）。
 *
 * 契约（scripts/verify.js 会验）：
 *   1. replay(toEvents(state)) 与 state 逐字段相同 —— 迁移无损，老记录一字不差
 *   2. blank() / blankDay() 的默认值必须与 app.js 的 blank() / today() 保持一致
 *
 * 现在放在 scripts/ 下，是因为还没切换线上行为；等 auth.js 切过来时整体搬到 dist/。
 * 同时兼容 Node（module.exports）与浏览器（window.GrowthEvents）。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GrowthEvents = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 必须与 dist/app.js 里的 tasks.length / rewards 价格表 / today() 默认计划一致
  var TASK_COUNT = 6;
  var DEFAULT_PRICES = [5, 8, 10, 15, 12, 15];
  var DEFAULT_PLAN = ['吃点心', '玩20分钟', '学习时间', '自由时间', '整理书包'];

  function blank() {
    return {
      days: {}, stars: 0, counts: zeros(TASK_COUNT),
      rewards: [], name: '小小探险家', goal: 3, graduated: [],
      prices: DEFAULT_PRICES.slice(),
    };
  }

  function blankDay() {
    return { selected: [], done: {}, plan: DEFAULT_PLAN.slice(), planned: false, mood: null, note: '' };
  }

  function zeros(n) { var a = [], i; for (i = 0; i < n; i++) a.push(0); return a; }
  function num(x, d) { return typeof x === 'number' && isFinite(x) ? x : d; }
  function copy(x) { return JSON.parse(JSON.stringify(x)); }

  /* ---------- 规整：把任意来源的 state 收成唯一形态 ----------
   * 键顺序也统一，否则「重放结果」和「原状态」JSON 比对会因键序不同而假失败。 */
  function norm(st) {
    var s = st || {}, out = blank(), i;
    if (typeof s.name === 'string' && s.name) out.name = s.name;
    if (typeof s.stars === 'number' && isFinite(s.stars)) out.stars = s.stars;
    if (typeof s.goal === 'number' && isFinite(s.goal)) out.goal = s.goal;
    if (Array.isArray(s.counts)) out.counts = s.counts.slice(0, TASK_COUNT).map(function (x) { return num(x, 0); });
    while (out.counts.length < TASK_COUNT) out.counts.push(0);
    if (Array.isArray(s.prices) && s.prices.length) out.prices = s.prices.map(function (x) { return num(x, 0); });
    if (Array.isArray(s.graduated)) {
      out.graduated = s.graduated.slice().sort(function (a, b) { return a - b; });
    }
    if (Array.isArray(s.rewards)) {
      out.rewards = s.rewards.map(function (r) {
        r = r || {};
        return { id: num(r.id, 0), date: String(r.date || ''), used: !!r.used };
      });
    }
    var keys = (s.days && typeof s.days === 'object' && !Array.isArray(s.days)) ? Object.keys(s.days).sort() : [];
    for (i = 0; i < keys.length; i++) {
      var d = s.days[keys[i]] || {}, o = blankDay(), k;
      if (Array.isArray(d.selected)) o.selected = d.selected.slice();
      if (d.done && typeof d.done === 'object') {
        o.done = {};
        Object.keys(d.done).map(Number).sort(function (a, b) { return a - b; })
          .forEach(function (n) { if (isFinite(n)) o.done[n] = d.done[n] === 'self' ? 'self' : 'help'; });
      }
      if (Array.isArray(d.plan) && d.plan.length) o.plan = d.plan.slice();
      o.planned = !!d.planned;
      if (typeof d.mood === 'number' && isFinite(d.mood)) o.mood = d.mood;
      if (typeof d.note === 'string') o.note = d.note;
      out.days[keys[i]] = o;
    }
    return out;
  }

  /* ---------- 单条事件的语义 ----------
   * 与 app.js 的 finish / pick / move / mood / confirmReward / graduate / saveParent
   * 一一对应。返回新的 s（state.import 会整体替换）。 */
  function apply(s, e) {
    if (!e || typeof e.type !== 'string') return s;
    if (e.type === 'state.import') return norm(e.payload);

    var d;
    switch (e.type) {
      case 'task.done':
        if (e.mode !== 'self' && e.mode !== 'help') return s;
        if (!isFinite(e.task)) return s;
        d = day(s, e.day);
        if (d.done[e.task]) return s;                 // 同一天同一任务只记一次
        d.done[e.task] = e.mode;
        if (e.mode === 'self') { s.stars++; s.counts[e.task]++; }
        return s;
      case 'pick':
        day(s, e.day).selected = (e.selected || []).slice(0, 3);
        return s;
      case 'plan':
        d = day(s, e.day);
        d.plan = (e.plan || []).slice();
        d.planned = !!e.planned;
        return s;
      case 'mood':
        day(s, e.day).mood = (typeof e.mood === 'number') ? e.mood : null;
        return s;
      case 'note':
        day(s, e.day).note = String(e.text || '');
        return s;
      case 'reward.redeem':
        // cost 必须由事件自带：prices 之后可能被改，用当下价格回算是错的
        s.stars -= num(e.cost, 0);
        s.rewards.push({ id: num(e.reward, 0), date: String(e.day || ''), used: false });
        return s;
      case 'reward.use':
        if (s.rewards[e.seq]) s.rewards[e.seq].used = true;
        return s;
      case 'skill.graduate':
        if (!isFinite(e.task)) return s;
        var at = s.graduated.indexOf(e.task);
        if (e.on && at < 0) s.graduated.push(e.task);
        if (!e.on && at >= 0) s.graduated.splice(at, 1);
        s.graduated.sort(function (a, b) { return a - b; });
        return s;
      case 'settings.name': s.name = String(e.value || '小小探险家'); return s;
      case 'settings.goal': s.goal = num(e.value, 3); return s;
      case 'settings.prices': s.prices = (e.value || []).map(function (x) { return num(x, 0); }); return s;
      default:
        return s;                                     // 未知事件忽略，向前兼容
    }
  }

  function day(s, key) {
    key = String(key || '');
    if (!s.days[key]) s.days[key] = blankDay();
    return s.days[key];
  }

  /* ---------- 重放：账本 → 状态 ----------
   * 按 (时间, id) 排序；state.import 出现在哪就把状态重置到那一刻，
   * 所以它既是「迁移基线」也是「备份恢复」的唯一入口。 */
  function replay(events) {
    var list = [], seen = {}, i;
    for (i = 0; i < (events || []).length; i++) {
      var e = events[i];
      if (!e || typeof e.type !== 'string') continue;
      var id = String(e.id == null ? '' : e.id);
      if (id && seen[id]) continue;                   // 同一操作只算一次
      if (id) seen[id] = true;
      list.push(e);
    }
    list.sort(function (a, b) {
      var ta = num(a.t, 0), tb = num(b.t, 0);
      if (ta !== tb) return ta - tb;
      return String(a.id) < String(b.id) ? -1 : 1;
    });
    var s = blank();
    for (i = 0; i < list.length; i++) s = apply(s, list[i]);
    return norm(s);
  }

  /* ---------- 迁移：现有 state → 初始事件 ----------
   * 一条 state.import，原样携带，保证逐字段无损。
   * 之后的日常操作才产生细粒度事件。 */
  function toEvents(state, opts) {
    opts = opts || {};
    var t = num(opts.t, Date.now());
    return [{ id: opts.id || ('imp_' + t), type: 'state.import', t: t, payload: copy(norm(state)) }];
  }

  /* 本机自增的操作 id：设备前缀 + 时间 + 随机，保证跨设备不撞 */
  function newId(device, seq) {
    return String(device || 'd') + '-' + num(seq, 0) + '-' + Date.now().toString(36) +
      Math.random().toString(36).slice(2, 6);
  }

  return {
    TASK_COUNT: TASK_COUNT,
    DEFAULT_PLAN: DEFAULT_PLAN,
    DEFAULT_PRICES: DEFAULT_PRICES,
    blank: blank,
    blankDay: blankDay,
    norm: norm,
    apply: apply,
    replay: replay,
    toEvents: toEvents,
    newId: newId,
  };
});
