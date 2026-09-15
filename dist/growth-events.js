/* 成长事件账本：同一账号只对应一个孩子，云端只追加事件，本机保存状态投影。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GrowthEvents = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TASK_COUNT = 6;
  var REWARD_COUNT = 6;
  var DEFAULT_PRICES = [5, 8, 10, 15, 12, 15];
  var DEFAULT_PLAN = ['吃点心', '玩20分钟', '学习时间', '自由时间', '整理书包'];
  var EVENT_TYPES = ['state.import', 'task.done', 'pick', 'plan', 'mood', 'note', 'reward.redeem', 'reward.use', 'skill.graduate', 'settings.name', 'settings.goal', 'settings.prices'];
  var MAX_COUNTER = 1000000;

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
  function intIn(x, min, max) { return Number.isInteger(x) && x >= min && x <= max; }
  function taskId(x) { return intIn(x, 0, TASK_COUNT - 1); }
  function rewardId(x) { return intIn(x, 0, REWARD_COUNT - 1); }
  function cleanText(x, max, fallback) {
    if (typeof x !== 'string') return fallback == null ? '' : fallback;
    x = x.slice(0, max);
    return x || (fallback == null ? '' : fallback);
  }
  function validDayKey(key) {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    var p = key.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2]);
    return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2];
  }
  function uniqTasks(list, max) {
    var out = [];
    if (!Array.isArray(list)) return out;
    list.forEach(function (x) { if (taskId(x) && out.indexOf(x) < 0 && out.length < max) out.push(x); });
    return out;
  }
  function safePlan(list) {
    if (!Array.isArray(list) || !list.length) return DEFAULT_PLAN.slice();
    var out = list.slice(0, 10).filter(function (x) { return typeof x === 'string' && x.length > 0; })
      .map(function (x) { return x.slice(0, 40); });
    return out.length ? out : DEFAULT_PLAN.slice();
  }
  function validPrices(list) {
    return Array.isArray(list) && list.length === REWARD_COUNT && list.every(function (x) { return intIn(x, 1, 99); });
  }

  function norm(st) {
    var s = st && typeof st === 'object' && !Array.isArray(st) ? st : {}, out = blank(), i;
    out.name = cleanText(s.name, 12, out.name);
    if (intIn(s.stars, 0, MAX_COUNTER)) out.stars = s.stars;
    if ([3, 5, 7].indexOf(s.goal) >= 0) out.goal = s.goal;
    if (Array.isArray(s.counts)) out.counts = s.counts.slice(0, TASK_COUNT).map(function (x) { return intIn(x, 0, MAX_COUNTER) ? x : 0; });
    while (out.counts.length < TASK_COUNT) out.counts.push(0);
    if (validPrices(s.prices)) out.prices = s.prices.slice();
    out.graduated = uniqTasks(s.graduated, TASK_COUNT).sort(function (a, b) { return a - b; });
    if (Array.isArray(s.rewards)) {
      out.rewards = s.rewards.slice(0, 10000).map(function (r) {
        r = r && typeof r === 'object' ? r : {};
        if (!rewardId(r.id) || !validDayKey(r.date)) return null;
        return { id: r.id, date: r.date, used: !!r.used, eventId: cleanText(r.eventId, 200, '') };
      }).filter(Boolean);
    }
    var keys = (s.days && typeof s.days === 'object' && !Array.isArray(s.days)) ? Object.keys(s.days).sort() : [];
    for (i = 0; i < keys.length; i++) {
      if (!validDayKey(keys[i])) continue;
      var d = s.days[keys[i]] || {}, o = blankDay();
      o.selected = uniqTasks(d.selected, 3);
      if (d.done && typeof d.done === 'object' && !Array.isArray(d.done)) {
        o.done = {};
        Object.keys(d.done).forEach(function (k) {
          var n = Number(k);
          if (taskId(n) && (d.done[k] === 'self' || d.done[k] === 'help')) o.done[n] = d.done[k];
        });
      }
      o.plan = safePlan(d.plan);
      o.planned = !!d.planned;
      if (intIn(d.mood, 0, 4)) o.mood = d.mood;
      o.note = cleanText(d.note, 80, '');
      out.days[keys[i]] = o;
    }
    return out;
  }

  function validEvent(e) {
    if (!e || typeof e !== 'object' || EVENT_TYPES.indexOf(e.type) < 0) return false;
    switch (e.type) {
      case 'state.import': return !!e.payload && typeof e.payload === 'object' && !Array.isArray(e.payload);
      case 'task.done': return validDayKey(e.day) && taskId(e.task) && (e.mode === 'self' || e.mode === 'help');
      case 'pick': return validDayKey(e.day) && Array.isArray(e.selected) && e.selected.length <= 3 && e.selected.every(taskId);
      case 'plan': return validDayKey(e.day) && Array.isArray(e.plan) && e.plan.length >= 1 && e.plan.length <= 10 && e.plan.every(function (x) { return typeof x === 'string' && x.length >= 1 && x.length <= 40; }) && typeof e.planned === 'boolean';
      case 'mood': return validDayKey(e.day) && intIn(e.mood, 0, 4);
      case 'note': return validDayKey(e.day) && typeof e.text === 'string' && e.text.length <= 80;
      case 'reward.redeem': return validDayKey(e.day) && rewardId(e.reward) && intIn(e.cost, 1, 99);
      case 'reward.use': return typeof e.rewardId === 'string' && e.rewardId.length >= 1 && e.rewardId.length <= 200;
      case 'skill.graduate': return taskId(e.task) && typeof e.on === 'boolean';
      case 'settings.name': return typeof e.value === 'string' && e.value.length >= 1 && e.value.length <= 12;
      case 'settings.goal': return [3, 5, 7].indexOf(e.value) >= 0;
      case 'settings.prices': return validPrices(e.value);
      default: return false;
    }
  }

  function apply(s, e) {
    if (!validEvent(e)) return s;
    if (e.type === 'state.import') return norm(e.payload);
    var d, at, cost, rewardKey;
    switch (e.type) {
      case 'task.done':
        d = day(s, e.day);
        if (d.done[e.task]) return s;
        d.done[e.task] = e.mode;
        if (e.mode === 'self') { s.stars++; s.counts[e.task]++; }
        return s;
      case 'pick': {
        var pd = day(s, e.day), pick = uniqTasks(e.selected, 3);
        Object.keys(pd.done).map(Number).sort(function (a, b) { return a - b; })
          .forEach(function (n) { if (pick.indexOf(n) < 0) pick.unshift(n); });
        pd.selected = pick.slice(0, 3);
        return s;
      }
      case 'plan': d = day(s, e.day); d.plan = e.plan.slice(); d.planned = e.planned; return s;
      case 'mood': day(s, e.day).mood = e.mood; return s;
      case 'note': day(s, e.day).note = e.text; return s;
      case 'reward.redeem':
        cost = e.cost;
        if (s.stars < cost) return s;
        s.stars -= cost;
        s.rewards.push({ id: e.reward, date: e.day, used: false, eventId: cleanText(String(e.id || ''), 200, '') });
        return s;
      case 'reward.use':
        rewardKey = e.rewardId;
        at = s.rewards.findIndex(function (r) { return rewardKey && r.eventId === rewardKey; });
        if (at >= 0) s.rewards[at].used = true;
        return s;
      case 'skill.graduate':
        at = s.graduated.indexOf(e.task);
        if (e.on && at < 0) s.graduated.push(e.task);
        if (!e.on && at >= 0) s.graduated.splice(at, 1);
        s.graduated.sort(function (a, b) { return a - b; });
        return s;
      case 'settings.name': s.name = e.value; return s;
      case 'settings.goal': s.goal = e.value; return s;
      case 'settings.prices': s.prices = e.value.slice(); return s;
      default: return s;
    }
  }

  function day(s, key) {
    if (!validDayKey(key)) return blankDay();
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
      if (!validEvent(e)) continue;
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

  function advance(confirmed, newEvents) {
    var events = (newEvents || []).filter(validEvent);
    var seen = {}, list = [], i;
    for (i = 0; i < events.length; i++) {
      var id = String(events[i].id == null ? '' : events[i].id);
      if (id && seen[id]) continue;
      if (id) seen[id] = true;
      list.push(events[i]);
    }
    list.sort(function (a, b) {
      var oa = orderOf(a), ob = orderOf(b);
      if (oa !== ob) return oa - ob;
      return String(a.id) < String(b.id) ? -1 : 1;
    });
    var st = confirmed ? norm(confirmed) : blank();
    for (i = 0; i < list.length; i++) st = apply(st, list[i]);
    return norm(st);
  }

  function project(confirmed, pending) {
    var base = { id: '__confirmed__', type: 'state.import', t: 0, payload: confirmed || blank() };
    return replay([base].concat(pending || []));
  }

  function syncPlan(remote, pending) {
    var list = Array.isArray(pending) ? pending : [];
    var hasRemote = Array.isArray(remote) && remote.length > 0;
    var hasImport = list.some(function (e) { return e && e.type === 'state.import'; });
    if (!hasRemote || !hasImport) return { mode: 'normal', dropIds: [], message: '' };
    return {
      mode: 'adopt-cloud',
      dropIds: list.map(function (e) { return String(e.id); }),
      message: '发现账号已有成长记录，已恢复云端记录；本机导入的旧备份未覆盖云端',
    };
  }

  function newId(device, seq) {
    return String(device || 'd').slice(0, 120) + '-' + num(seq, 0) + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  return {
    TASK_COUNT: TASK_COUNT,
    EVENT_TYPES: EVENT_TYPES.slice(),
    DEFAULT_PLAN: DEFAULT_PLAN,
    DEFAULT_PRICES: DEFAULT_PRICES,
    blank: blank,
    blankDay: blankDay,
    validDayKey: validDayKey,
    validEvent: validEvent,
    norm: norm,
    apply: apply,
    replay: replay,
    advance: advance,
    project: project,
    syncPlan: syncPlan,
    newId: newId,
  };
});
