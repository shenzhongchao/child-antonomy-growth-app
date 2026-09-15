/* 成长足迹：只读历史面板。由当前状态投影计算，不新增业务事件、不修改历史。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.GrowthHistory = api;
    api.install();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TASKS = [
    ['自己整理书包', '整理小达人'],
    ['自己开始学习', '自主学习者'],
    ['按计划完成', '时间魔法师'],
    ['做完自己检查', '检查小侦探'],
    ['自己收好玩具', '物品管理师'],
    ['到点结束娱乐', '约定守护者'],
  ];
  var REWARD_NAMES = ['故事我来选', '家庭游戏我来选', '晚饭我来选', '周末去哪里', '家庭电影之夜', '专属活动我来定'];
  var MOODS = ['😄 开心', '🙂 不错', '😐 一般', '🙁 有点烦', '😴 好累'];
  var cursor = null;
  var installed = false;

  function pad(n) { return String(n).padStart(2, '0'); }
  function keyOf(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
  function fromKey(key) {
    var p = String(key || '').split('-').map(Number);
    if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return null;
    var d = new Date(p[0], p[1] - 1, p[2]);
    return isNaN(d.getTime()) ? null : d;
  }
  function copyDay(day) {
    day = day || {};
    return {
      selected: Array.isArray(day.selected) ? day.selected.slice() : [],
      done: day.done && typeof day.done === 'object' ? day.done : {},
      plan: Array.isArray(day.plan) ? day.plan.slice() : [],
      planned: !!day.planned,
      mood: typeof day.mood === 'number' ? day.mood : null,
      note: typeof day.note === 'string' ? day.note : '',
    };
  }
  function validTask(n) { return Number.isInteger(n) && n >= 0 && n < TASKS.length; }

  function daySummary(state, key) {
    state = state || {};
    var day = copyDay(state.days && state.days[key]);
    var done = [];
    Object.keys(day.done).map(Number).filter(validTask).sort(function (a, b) { return a - b; }).forEach(function (task) {
      done.push({ task: task, mode: day.done[task] === 'self' ? 'self' : 'help' });
    });
    var selected = day.selected.map(Number).filter(validTask);
    done.forEach(function (x) { if (selected.indexOf(x.task) < 0) selected.push(x.task); });
    selected = selected.slice(0, 3);
    var rewardList = (Array.isArray(state.rewards) ? state.rewards : []).filter(function (r) { return r && String(r.date || '') === key; });
    var selfCount = done.filter(function (x) { return x.mode === 'self'; }).length;
    var helpCount = done.length - selfCount;
    var recorded = selected.length > 0 || done.length > 0 || day.planned || day.mood !== null || !!day.note.trim() || rewardList.length > 0;
    return {
      key: key,
      recorded: recorded,
      selected: selected,
      done: done,
      selfCount: selfCount,
      helpCount: helpCount,
      starsEarned: selfCount,
      plan: day.plan,
      planned: day.planned,
      mood: day.mood,
      note: day.note,
      rewards: rewardList,
    };
  }

  function monthModel(state, year, monthIndex) {
    var first = new Date(year, monthIndex, 1);
    var days = new Date(year, monthIndex + 1, 0).getDate();
    var offset = (first.getDay() + 6) % 7;
    var cells = [];
    var i;
    for (i = 0; i < offset; i++) cells.push(null);
    for (i = 1; i <= days; i++) {
      var date = new Date(year, monthIndex, i);
      cells.push({ date: date, day: i, key: keyOf(date), summary: daySummary(state, keyOf(date)) });
    }
    while (cells.length % 7) cells.push(null);
    return { year: year, monthIndex: monthIndex, month: monthIndex + 1, cells: cells };
  }

  function trend(state, endDate, span) {
    state = state || {};
    span = Math.max(1, Number(span) || 28);
    endDate = endDate instanceof Date ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) : new Date();
    var taskStats = TASKS.map(function (_, task) { return { task: task, self: 0, help: 0, recentSelf: 0, previousSelf: 0 }; });
    var activeDays = 0, selfTotal = 0, helpTotal = 0;
    var half = Math.floor(span / 2);
    for (var i = span - 1; i >= 0; i--) {
      var date = new Date(endDate); date.setDate(date.getDate() - i);
      var sum = daySummary(state, keyOf(date));
      if (sum.recorded) activeDays++;
      sum.done.forEach(function (x) {
        var stat = taskStats[x.task];
        if (x.mode === 'self') {
          stat.self++; selfTotal++;
          if (i < half) stat.recentSelf++; else stat.previousSelf++;
        } else { stat.help++; helpTotal++; }
      });
    }
    return { span: span, activeDays: activeDays, selfTotal: selfTotal, helpTotal: helpTotal, tasks: taskStats };
  }

  function currentState() {
    try { return (typeof s !== 'undefined' && s) ? s : { days: {}, rewards: [] }; }
    catch (e) { return { days: {}, rewards: [] }; }
  }
  function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function fmtDate(key) {
    var d = fromKey(key);
    if (!d) return key;
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getDay()];
  }

  function injectEntry() {
    if (typeof document === 'undefined') return;
    try { if (typeof page === 'undefined' || page !== 'growth') return; } catch (e) { return; }
    var main = document.getElementById('main');
    if (!main || document.getElementById('growthHistoryEntry')) return;
    var tip = main.querySelector('.tip');
    var html = '<section id="growthHistoryEntry" class="history-entry">' +
      '<div class="history-entry-copy"><span class="history-kicker">📖 成长足迹</span><h2>看看以前的自己</h2>' +
      '<p>翻翻日历，看看哪些事情越来越能自己想起来。</p></div>' +
      '<button class="history-open" onclick="GrowthHistory.open()">打开成长足迹 <span aria-hidden="true">→</span></button></section>';
    if (tip && tip.insertAdjacentHTML) tip.insertAdjacentHTML('beforebegin', html);
    else if (main.insertAdjacentHTML) main.insertAdjacentHTML('afterbegin', html);
  }

  function install() {
    if (installed || typeof document === 'undefined') return;
    installed = true;
    try {
      if (typeof render === 'function') {
        var baseRender = render;
        render = function () { baseRender(); injectEntry(); };
        injectEntry();
      }
    } catch (e) {}
  }

  function calendarHtml(model) {
    var today = keyOf(new Date());
    var heads = ['一', '二', '三', '四', '五', '六', '日'].map(function (x) { return '<span>' + x + '</span>'; }).join('');
    var cells = model.cells.map(function (cell) {
      if (!cell) return '<span class="history-day empty" aria-hidden="true"></span>';
      var sum = cell.summary;
      var cls = 'history-day' + (sum.recorded ? ' has-record' : '') + (cell.key === today ? ' today' : '');
      var badge = '';
      if (sum.selfCount) badge += '<span class="history-dot self" title="自己想起来">★' + sum.selfCount + '</span>';
      if (sum.helpCount) badge += '<span class="history-dot help" title="提醒后完成">●' + sum.helpCount + '</span>';
      var aria = cell.day + '日' + (sum.recorded ? '，自己想起来' + sum.selfCount + '次，提醒后完成' + sum.helpCount + '次' : '，没有记录');
      if (sum.recorded) return '<button class="' + cls + '" aria-label="' + aria + '" onclick="GrowthHistory.openDay(\'' + cell.key + '\')"><strong>' + cell.day + '</strong><span class="history-day-marks">' + badge + '</span></button>';
      return '<span class="' + cls + '" aria-label="' + aria + '"><strong>' + cell.day + '</strong></span>';
    }).join('');
    return '<div class="history-calendar"><div class="history-weekheads">' + heads + '</div><div class="history-days">' + cells + '</div></div>';
  }

  function trendMessage(t) {
    if (!t.selfTotal && !t.helpTotal) return '还没有足够记录。以后每一点主动，都会慢慢留在这里。';
    if (t.selfTotal > t.helpTotal) return '这 4 周里，更多时候是自己想起来的。';
    if (t.selfTotal === t.helpTotal) return '自己想起来和提醒后完成都在发生，正在慢慢练习。';
    return '提醒也是练习的一部分，下一次再试试自己想起来。';
  }

  function trendHtml(t) {
    var rows = t.tasks.filter(function (x) { return x.self || x.help; }).map(function (x) {
      var total = x.self + x.help;
      var pct = total ? Math.round(x.self / total * 100) : 0;
      var change = x.recentSelf > x.previousSelf ? '最近两周自主更多了' : (x.recentSelf < x.previousSelf ? '最近节奏有变化' : '正在稳定练习');
      return '<div class="history-trend-row"><div class="history-trend-title"><strong>' + esc(TASKS[x.task][1]) + '</strong><span>自主 ' + x.self + ' · 提醒 ' + x.help + '</span></div>' +
        '<div class="history-trend-bar" aria-label="自主比例' + pct + '%"><span style="width:' + pct + '%"></span></div><small>' + change + '</small></div>';
    }).join('');
    if (!rows) rows = '<div class="history-empty">🌱 先从今天的一件小事开始，成长足迹会慢慢出现。</div>';
    return '<section class="history-trends"><div class="history-section-title"><div><span class="history-kicker">最近 4 周</span><h3>我越来越会自己做主了吗？</h3></div></div>' +
      '<div class="history-summary"><span><strong>' + t.selfTotal + '</strong> 次自己想起来</span><span><strong>' + t.helpTotal + '</strong> 次提醒后完成</span><span><strong>' + t.activeDays + '</strong> 天留下记录</span></div>' +
      '<p class="history-gentle">' + trendMessage(t) + '</p><div class="history-trend-list">' + rows + '</div></section>';
  }

  function renderPanel() {
    if (typeof show !== 'function') return;
    var st = currentState();
    var now = new Date();
    if (!cursor) cursor = new Date(now.getFullYear(), now.getMonth(), 1);
    var model = monthModel(st, cursor.getFullYear(), cursor.getMonth());
    var t = trend(st, now, 28);
    var html = '<div class="history-shell"><div class="history-hero"><div><span class="history-kicker">🌱 我的成长足迹</span><h2>一点一点，我在长本领</h2><p>这里记录的是练习，不是成绩。没记录的日子，只是没记录，不代表没做好。</p></div><span class="history-hero-icon" aria-hidden="true">📖</span></div>' +
      '<section class="history-month"><div class="history-month-head"><button class="history-arrow" aria-label="上个月" onclick="GrowthHistory.shiftMonth(-1)">‹</button><h3>' + model.year + '年' + model.month + '月</h3><button class="history-arrow" aria-label="下个月" onclick="GrowthHistory.shiftMonth(1)">›</button></div>' + calendarHtml(model) + '<div class="history-legend"><span><i class="self"></i>自己想起来</span><span><i class="help"></i>提醒后完成</span></div></section>' + trendHtml(t) + '</div>';
    show(html);
  }

  function open() {
    var now = new Date();
    cursor = new Date(now.getFullYear(), now.getMonth(), 1);
    renderPanel();
  }
  function shiftMonth(delta) {
    if (!cursor) return open();
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + Number(delta || 0), 1);
    renderPanel();
  }

  function doneMap(sum) {
    var out = {};
    sum.done.forEach(function (x) { out[x.task] = x.mode; });
    return out;
  }
  function openDay(key) {
    if (typeof show !== 'function') return;
    var sum = daySummary(currentState(), key);
    if (!sum.recorded) return;
    var done = doneMap(sum);
    var tasksHtml = sum.selected.map(function (task) {
      var mode = done[task];
      var status = mode === 'self' ? '<span class="history-status self">★ 自己想起来的</span>' : (mode === 'help' ? '<span class="history-status help">● 提醒后完成</span>' : '<span class="history-status pending">○ 选了这个挑战</span>');
      return '<div class="history-detail-task"><span class="history-task-no">' + (task + 1) + '</span><div><strong>' + esc(TASKS[task][0]) + '</strong><small>' + esc(TASKS[task][1]) + '</small></div>' + status + '</div>';
    }).join('');
    if (!tasksHtml) tasksHtml = '<p class="history-gentle">这天没有挑战记录。</p>';
    var plan = sum.planned && sum.plan.length ? '<section class="history-detail-block"><h3>🗓️ 我的一天</h3><div class="history-plan">' + sum.plan.map(esc).join('<span aria-hidden="true">→</span>') + '</div></section>' : '';
    var mood = sum.mood !== null && MOODS[sum.mood] ? '<section class="history-detail-block"><h3>今天的心情</h3><p class="history-mood">' + MOODS[sum.mood] + '</p></section>' : '';
    var note = sum.note.trim() ? '<section class="history-detail-block"><h3>💌 给你的一句话</h3><p>' + esc(sum.note) + '</p></section>' : '';
    var rewardHtml = sum.rewards.length ? '<section class="history-detail-block"><h3>🎁 当天兑换</h3><div class="history-reward-list">' + sum.rewards.map(function (r) { return '<span>' + esc(REWARD_NAMES[Number(r.id)] || '一张奖励券') + (r.used ? ' · 已兑现' : ' · 等待兑现') + '</span>'; }).join('') + '</div></section>' : '';
    var html = '<div class="history-shell history-detail"><button class="history-back" onclick="GrowthHistory.renderPanel()">← 回到成长足迹</button><div class="history-detail-head"><span class="history-kicker">' + esc(fmtDate(key)) + '</span><h2>这一天，我做到了什么？</h2><div class="history-day-score"><span>★ ' + sum.starsEarned + ' 颗星</span><span>自主 ' + sum.selfCount + '</span><span>提醒 ' + sum.helpCount + '</span></div></div><section class="history-detail-block"><h3>🎯 我的小挑战</h3><div class="history-detail-tasks">' + tasksHtml + '</div></section>' + plan + mood + note + rewardHtml + '<p class="history-footnote">回头看看，是为了发现自己的变化，不是给过去打分。</p></div>';
    show(html);
  }

  return {
    TASKS: TASKS,
    keyOf: keyOf,
    daySummary: daySummary,
    monthModel: monthModel,
    trend: trend,
    install: install,
    injectEntry: injectEntry,
    open: open,
    shiftMonth: shiftMonth,
    openDay: openDay,
    renderPanel: renderPanel,
  };
});
