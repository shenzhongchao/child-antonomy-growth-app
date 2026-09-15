/* 家长账号与事件同步 V2
 * - 一个账号只对应一个孩子。
 * - 本机状态立即生效；云端只追加事件，失败时保留待上传队列。
 * - 孩子不登录，断网和账号错误不打断孩子操作。
 */
(function () {
  'use strict';

  var _app = null, _auth = null, _db = null, _sdk = null;
  var _uid = null, _phone = '', _verification = null;
  var _status = 'off', _error = '', _mount = null, _timer = null, _busy = false;

  function conf() { return window.GROWTH_CLOUD || {}; }
  function store() { return window.GrowthStore && GrowthStore.read ? GrowthStore.read() : null; }
  function configured() {
    if (location.protocol === 'file:') return false;
    var id = conf().envId;
    return !!id && !/^(your|xxx|你的)/i.test(String(id));
  }
  function phone(p) { return '+86 ' + String(p || '').replace(/\D/g, ''); }
  function esc(x) { return String(x).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function errText(e) { return (e && (e.message || e.errMsg || e.error_description)) || '网络不太顺，稍后会自动再试'; }
  function when(ts) {
    if (!ts) return '刚刚开启';
    var d = new Date(ts), now = new Date(), same = d.toDateString() === now.toDateString();
    var hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return same ? '今天 ' + hm : (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
  }
  function notify(msg) { try { if (typeof toast === 'function') toast(msg); } catch (e) {} }

  function sdk() {
    if (_sdk) return _sdk;
    var testApp = (typeof window.__growthTestApp === 'function' && window.__growthTestApp()) || null;
    if (testApp) {
      _app = testApp; _auth = testApp.auth ? testApp.auth() : null; _db = testApp.rdb();
      return Promise.resolve(_app);
    }
    var url = new URL('cloudbase.esm.js?v=16', location.href).href;
    _sdk = import(url).then(function (m) { return m.default || m.cloudbase || m; });
    return _sdk;
  }
  function ensure() {
    if (_app) return Promise.resolve(_app);
    return sdk().then(function (cb) {
      _app = cb.init({ env: conf().envId });
      _auth = _app.auth({ persistence: 'local' });
      _db = _app.rdb();
      return _app;
    });
  }
  function profiles() { return _db.from(conf().profiles || 'profiles'); }
  function events() { return _db.from(conf().events || 'growth_events'); }
  function rowsOf(res) {
    if (res && res.error) throw res.error;
    return (res && res.data) || [];
  }
  function currentUid() {
    return ensure().then(function () { return _auth.getLoginState(); }).then(function (st) {
      var u = st && (st.user || st.currentUser || st);
      return (u && (u.uid || u.uuid)) || null;
    }).catch(function () { return null; });
  }

  function listProfiles(uid) { return profiles().select('*').eq('user_id', uid).limit(2).then(rowsOf); }
  function writeProfile(id, uid) {
    var st = store();
    return profiles().upsert({
      id: id, user_id: uid,
      name: (st && st.state && st.state.name) || '小小探险家',
      phone: _phone || '', updated_at: Date.now(),
    }).then(function (res) { if (res && res.error) throw res.error; return id; });
  }
  function ensureProfile(uid) {
    var st = store();
    if (!st) return Promise.reject(new Error('本机记录尚未准备好'));
    if (st.userId && st.userId !== uid) return Promise.reject(new Error('这台设备已经绑定另一个家长账号'));
    return listProfiles(uid).then(function (list) {
      if (list.length > 1) throw new Error('这个账号存在多个孩子档案，请先联系管理员整理');
      var id = list.length ? list[0].id : st.profileId;
      GrowthStore.setAccount(id, uid);
      if (list.length) return id;
      return writeProfile(id, uid).then(function () { return id; });
    });
  }

  function eventFromRow(row) {
    var e = Object.assign({}, row.payload || {});
    e.id = row.id; e.type = row.type; e.day = row.day || undefined; e.t = Number(row.t) || 0;
    e.serverSeq = Number(row.server_seq) || 0; e.order = e.serverSeq || e.t;
    return e;
  }
  function eventToRow(e, uid, profileId) {
    var payload = Object.assign({}, e);
    delete payload.id; delete payload.type; delete payload.day; delete payload.t;
    delete payload.order; delete payload.serverSeq;
    return {
      id: e.id, user_id: uid, profile_id: profileId, device_id: (store() || {}).deviceId || '',
      type: e.type, day: e.day || null, t: Number(e.t) || Date.now(), payload: payload,
    };
  }
  function listEvents(profileId, afterSeq) {
    var all = [], size = 1000;
    function page(from) {
      var q = events().select('*').eq('profile_id', profileId);
      if (afterSeq > 0) q = q.gt('server_seq', afterSeq);
      return q.order('server_seq', { ascending: true }).range(from, from + size - 1).then(rowsOf)
        .then(function (rows) {
          all = all.concat(rows);
          return rows.length === size ? page(from + size) : all;
        });
    }
    return page(0).then(function (rows) {
      return rows.map(eventFromRow).sort(function (a, b) { return (a.order - b.order) || String(a.id).localeCompare(String(b.id)); });
    });
  }
  function uploadMissing(pending, uid, profileId) {
    var rows = (pending || []).map(function (e) { return eventToRow(e, uid, profileId); });
    if (!rows.length) return Promise.resolve();
    return events().upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
      .then(function (res) { if (res && res.error) throw res.error; });
  }

  function syncNow(silent) {
    if (!configured() || !_uid || _busy) return Promise.resolve(null);
    _busy = true; _status = 'syncing'; render();
    var pack = store() || {};
    var fromSeq = (pack.confirmedState == null) ? 0 : (Number(pack.lastServerSeq) || 0);
    var profileId;
    return ensureProfile(_uid)
      .then(function (id) { profileId = id; return listEvents(profileId, fromSeq); })
      .then(function (remote) {
        var st = store() || {}, pending = (st.pending || []).slice();
        var plan = GrowthEvents.syncPlan(remote, pending);
        if (plan.mode === 'adopt-cloud') {
          GrowthStore.dropPending(plan.dropIds);
          pending = pending.filter(function (e) { return plan.dropIds.indexOf(String(e.id)) === -1; });
          notify(plan.message);
        }
        return uploadMissing(pending, _uid, profileId);
      })
      .then(function () { return listEvents(profileId, fromSeq); })
      .then(function (remote) {
        var st = store() || {}, pending = (st.pending || []).slice(), ids = {}, ack = [], max = fromSeq;
        remote.forEach(function (e) { ids[e.id] = true; max = Math.max(max, Number(e.serverSeq) || 0); });
        pending.forEach(function (e) { if (ids[e.id]) ack.push(e.id); });
        GrowthStore.merge(remote, ack, profileId, _uid, max);
        return writeProfile(profileId, _uid).then(function () {
          _status = 'ok'; _error = ''; render();
          if (!silent) notify('记录已自动保护');
          return 'ok';
        });
      })
      .catch(function (e) {
        _error = errText(e); _status = 'error'; render();
        if (!silent) notify('记录已存本机，联网后会自动补传');
        return null;
      })
      .then(function (v) {
        _busy = false;
        if (v === 'ok' && ((store() || {}).pending || []).length) markDirty();
        return v;
      });
  }

  function statusText() {
    var st = store(), n = st && st.pending ? st.pending.length : 0;
    if (_status === 'off') return '记录保存在这台设备上';
    if (_status === 'login') return '尚未开启自动保护';
    if (_status === 'syncing') return '正在保护记录…';
    if (_status === 'error') return '已存本机' + (n ? ' · ' + n + ' 条等待上传' : '') + '，联网后自动重试';
    if (n) return '已存本机 · ' + n + ' 条等待上传';
    return '记录已自动保护 · ' + when(st && st.lastSync);
  }
  function cloudBox() {
    var el = _mount && document.getElementById(_mount);
    if (!el) return;
    var h = '<p><strong>' + esc(statusText()) + '</strong></p>';
    if (_status === 'off') {
      h += '<p class="sub">云端尚未配置。孩子可以正常使用，但清理浏览器数据后无法找回记录。</p>';
    } else if (!_uid) {
      h += '<p class="sub">绑定一次家长手机号，之后会在后台自动保护记录。孩子不用登录。</p>' +
        '<label>家长手机号<input id="clPhone" inputmode="numeric" maxlength="11" autocomplete="tel" placeholder="13800138000"></label>' +
        '<label>短信验证码<input id="clCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6 位数字"></label>' +
        '<button class="secondary" onclick="Cloud.sendCode()">获取验证码</button> ' +
        '<button class="primary" onclick="Cloud.login()">开启自动保护</button>';
    } else {
      if (_status === 'error') h += '<p class="sub">' + esc(_error) + '</p>';
      h += '<p class="sub">孩子照常使用即可，无需手动同步。</p><button class="link" onclick="Cloud.logout()">退出家长账号</button>';
    }
    el.innerHTML = h;
  }
  function render() { cloudBox(); }
  function mount(id) { _mount = id; render(); }

  function boot() {
    if (!configured()) { _status = 'off'; render(); return; }
    _status = 'login';
    currentUid().then(function (uid) {
      if (!uid) { _uid = null; _status = 'login'; render(); return null; }
      _uid = uid; _status = 'ok'; render(); return syncNow(true);
    }).catch(function (e) { _error = errText(e); _status = 'error'; render(); });
  }
  function sendCode() {
    var input = document.getElementById('clPhone'), raw = input ? input.value.replace(/\D/g, '') : '';
    if (!/^1\d{10}$/.test(raw)) { notify('请填写 11 位手机号'); return; }
    _phone = raw;
    ensure().then(function () { return _auth.getVerification({ phone_number: phone(raw) }); })
      .then(function (info) { _verification = info; notify('验证码已发送，请查收短信'); })
      .catch(function (e) { notify(errText(e)); });
  }
  function login() {
    var codeEl = document.getElementById('clCode'), code = codeEl ? codeEl.value.trim() : '';
    if (!_verification) { notify('请先获取验证码'); return; }
    if (!/^\d{4,8}$/.test(code)) { notify('请填写短信里的验证码'); return; }
    ensure().then(function () {
      return _auth.signInWithSms({ verificationInfo: _verification, verificationCode: code, phoneNum: phone(_phone) });
    }).then(function () { _verification = null; return currentUid(); })
      .then(function (uid) {
        if (!uid) throw new Error('登录没有完成，请重试');
        _uid = uid; _status = 'ok'; render(); return syncNow();
      }).catch(function (e) { notify(errText(e)); });
  }
  function logout() {
    var done = _auth && _auth.signOut ? _auth.signOut().catch(function () {}) : Promise.resolve();
    done.then(function () { _uid = null; _status = 'login'; render(); notify('已退出，记录仍保存在本机'); });
  }
  function markDirty() {
    if (!configured() || !_uid) return;
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(function () { _timer = null; syncNow(true); }, conf().pushDelay || 1500);
  }

  window.Cloud = {
    boot: boot, mount: mount, sendCode: sendCode, login: login, logout: logout,
    syncNow: function () { return syncNow(); }, markDirty: markDirty,
    configured: configured, status: function () { return _status; },
    __test: function (app, uid) {
      _app = app; _auth = app && app.auth ? app.auth() : null; _db = app && app.rdb ? app.rdb() : null;
      if (uid) _uid = uid;
      return { syncNow: syncNow, listEvents: listEvents };
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  document.addEventListener('visibilitychange', function () { if (!document.hidden && _uid) syncNow(true); });
  window.addEventListener('online', function () { if (_uid) syncNow(true); });
})();
