/* 成长事件账本：同一账号只对应一个孩子，云端只追加事件，本机保存状态投影。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GrowthEvents = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TASK_COUNT = 6;
  var DEFAULT_PRICES = [5, 8, 10, 15, 12, 15];
  var DEFAULT_PLAN = ['吃点心', '玩20分钟', '学习时间', '自由时间', '整理书包'];

  function blank() {
    return {
      days: {}, stars: 0, counts: zeros(TASK_COUNT), rewards: [],
      name: '小小探险家', goal: 3, graduated: [], prices: DEFAULT_PRICES.slice(),
    };
  }

  function blankDay() {
    return { selected: [], done: {}, plan: DEFAULT_PLAN.slice(), planned: false, mood: null, note: '' };
  }

  function zeros(n) { var a = [], i; for (i = 0; i < n; i++) a.push(0); return a; }
  function num(x, d) { return typeof x === 'number' && isFinite(x) ? x : d; }
  function copy(x) { return JSON.parse(JSON.stringify(x)); }

  function norm(st) {
    var s = st || {}, out = blank(), i;
    if (typeof s.name === 'string' && s.name) out.name = s.name;
    if (typeof s.stars === 'number' && isFinite(s.stars)) out.stars = s.stars;
    if (typeof s.goal === 'number' && isFinite(s.goal)) out.goal = s.goal;
    if (Array.isArray(s.counts)) out.counts = s.counts.slice(0, TASK_COUNT).map(function (x) { return num(x, 0); });
    while (out.counts.length < TASK_COUNT) out.counts.push(0);
    if (Array.isArray(s.prices) && s.prices.length) out.prices = s.prices.map(function (x) { return num(x, 0); });
    if (Array.isArray(s.graduated)) out.graduated = s.graduated.slice().sort(function (a, b) { return a - b; });
    if (Array.isArray(s.rewards)) {
      out.rewards = s.rewards.map(function (r) {
        r = r || {};
        return { id: num(r.id, 0), date: String(r.date || ''), used: !!r.used, eventId: String(r.eventId || '') };
      });
    }
    var keys = (s.days && typeof s.days === 'object' && !Array.isArray(s.days)) ? Object.keys(s.days).sort() : [];
    for (i = 0; i < keys.length; i++) {
      var d = s.days[keys[i]] || {}, o = blankDay();
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

  function apply(s, e) {
    if (!e || typeof e.type !== 'string') return s;
    if (e.type === 'state.import') return norm(e.payload);
    var d, at, cost, rewardId;
    switch (e.type) {
      case 'task.done':
        if (e.mode !== 'self' && e.mode !== 'help') return s;
        if (!isFinite(e.task)) return s;
        d = day(s, e.day);
        if (d.done[e.task]) return s;
        d.done[e.task] = e.mode;
        if (e.mode === 'self') { s.stars++; s.counts[e.task]++; }
        return s;
      case 'pick': day(s, e.day).selected = (e.selected || []).slice(0, 3); return s;
      case 'plan':
        d = day(s, e.day); d.plan = (e.plan || []).slice(); d.planned = !!e.planned; return s;
      case 'mood': day(s, e.day).mood = typeof e.mood === 'number' ? e.mood : null; return s;
      case 'note': day(s, e.day).note = String(e.text || ''); return s;
      case 'reward.redeem':
        cost = num(e.cost, 0);
        if (cost < 1 || s.stars < cost) return s;
        s.stars -= cost;
        s.rewards.push({ id: num(e.reward, 0), date: String(e.day || ''), used: false, eventId: String(e.id || '') });
        return s;
      case 'reward.use':
        rewardId = String(e.rewardId || '');
        at = s.rewards.findIndex(function (r) { return rewardId && r.eventId === rewardId; });
        if (at >= 0) s.rewards[at].used = true;
        return s;
      case 'skill.graduate':
        if (!isFinite(e.task)) return s;
        at = s.graduated.indexOf(e.task);
        if (e.on && at < 0) s.graduated.push(e.task);
        if (!e.on && at >= 0) s.graduated.splice(at, 1);
        s.graduated.sort(function (a, b) { return a - b; });
        return s;
      case 'settings.name': s.name = String(e.value || '小小探险家'); return s;
      case 'settings.goal': s.goal = num(e.value, 3); return s;
      case 'settings.prices': s.prices = (e.value || []).map(function (x) { return num(x, 0); }); return s;
      default: return s;
    }
  }

  function day(s, key) {
    key = String(key || '');
    if (!s.days[key]) s.days[key] = blankDay();
    return s.days[key];
  }

  function orderOf(e) {
    var n = Number(e && (e.order != null ? e.order : e.serverSeq));
    return isFinite(n) ? n : num(e && e.t, 0);
  }

  function replay(events) {
    var list = [], seen = {}, i;
    for (i = 0; i < (events || []).length; i++) {
      var e = events[i];
      if (!e || typeof e.type !== 'string') continue;
      var id = String(e.id == null ? '' : e.id);
      if (id && seen[id]) continue;
      if (id) seen[id] = true;
      list.push(e);
    }
    list.sort(function (a, b) {
      var oa = orderOf(a), ob = orderOf(b);
      if (oa !== ob) return oa - ob;
      return String(a.id) < String(b.id) ? -1 : 1;
    });
    var s = blank();
    for (i = 0; i < list.length; i++) s = apply(s, list[i]);
    return norm(s);
  }

  function newId(device, seq) {
    return String(device || 'd') + '-' + num(seq, 0) + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
    newId: newId,
  };
});
