/* 云端账号与同步（腾讯云 CloudBase）
 *
 * 三条原则：
 * 1. 本地优先。localStorage 里的 self-growth-v1 始终是孩子正在用的那份数据，云端只是它的一份备份。
 * 2. 永不打扰。没配置 / 没登录 / 断网 / 报错，应用照常能用，不弹错误打断孩子。
 * 3. 整包同步。state 字段原样沿用现有结构（blank()），不做字段级合并，避免破坏真实儿童记录。
 *
 * 依赖 app.js 暴露的全局：s / save() / render() / blank() / show() / closeModal() / toast()
 */
(function () {
  'use strict';

  var META_KEY = 'self-growth-cloud-v1';
  var STATE_KEY = 'self-growth-v1';
  // 惰性读配置：config.js 一般先于本文件加载，但这样写可以容忍顺序变化和热改配置
  function conf() { return window.GROWTH_CLOUD || {}; }

  var meta = readJson(META_KEY) || {};
  var _app = null, _auth = null, _db = null, _sdk = null;
  var _timer = null, _busy = false, _error = '';
  var _status = 'off';            // off 未配置 | login 待登录 | ok 已登录 | error 出错
  var _mount = null;              // 家长面板里挂载 UI 的元素 id
  var _conflict = null;           // 首次同步两边都有数据时的选择回调

  /* ---------- 小工具 ---------- */

  function readJson(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function writeMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {} }
  function localState() { return readJson(STATE_KEY) || {}; }
  function phone(p) { return '+86 ' + String(p || '').replace(/\D/g, ''); }
  function newId() { return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function errText(e) { return (e && (e.message || e.errMsg || e.error_description)) || '网络不太顺，稍后再试'; }
  function configured() {
    // file:// 下浏览器不允许动态 import 模块，
    // 直接当作未配置，别去报一个没意义的同步错误。
    if (location.protocol === 'file:') return false;
    var id = conf().envId;
    return !!id && !/^(your|xxx|你的)/i.test(String(id));
  }

  // 这份本地数据算不算「有记录」——决定首次同步时该上传还是该下载
  function hasRecords(st) {
    if (!st) return false;
    if (st.stars > 0) return true;
    if (st.days && Object.keys(st.days).length) return true;
    if (Array.isArray(st.counts) && st.counts.some(function (x) { return x > 0; })) return true;
    return !!(Array.isArray(st.rewards) && st.rewards.length);
  }
  function recordCount(st) { return st && st.days ? Object.keys(st.days).length : 0; }

  function when(ts) {
    if (!ts) return '还没同步过';
    var d = new Date(ts), now = new Date();
    var same = d.toDateString() === now.toDateString();
    var hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return same ? '今天 ' + hm : (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
  }

  /* ---------- SDK 与云资源 ---------- */

  function sdk() {
    if (_sdk) return _sdk;
    var url = new URL('cloudbase.esm.js?v=11', location.href).href;
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

  function tbl() { return _db.from(conf().profiles || 'profiles'); }

  function currentUid() {
    return ensure()
      .then(function () { return _auth.getLoginState(); })
      .then(function (st) {
        var u = st && (st.user || st.currentUser || st);
        return (u && (u.uid || u.uuid)) || null;
      })
      .catch(function () { return null; });
  }

  // 数据库行 -> 应用内字段。上层（firstSync / profileList / switchChild 等）沿用
  // _id / userId / updatedAt 这套命名，这里做一次映射，避免改动上层逻辑。
  function rowOf(row) {
    if (!row) return null;
    return {
      _id: row.id,
      userId: row.user_id,
      name: row.name,
      phone: row.phone,
      state: row.state,
      updatedAt: row.updated_at,
    };
  }

  function rowsOf(res) {
    if (res && res.error) throw res.error;
    return (res && res.data) || [];
  }

  function loadProfile(id) {
    return tbl().select('*').eq('id', id).limit(1)
      .then(function (res) { return rowOf(rowsOf(res)[0]); })
      .catch(function () { return null; });
  }

  function listProfiles(uid) {
    return tbl().select('*').eq('user_id', uid).limit(20)
      .then(function (res) { return rowsOf(res).map(rowOf); })
      .catch(function () { return []; });
  }

  function writeProfile(id, data) {
    data.updatedAt = Date.now();
    // 冗余存一份手机号：二期小程序按手机号登录时，用它把两端的记录并到同一个孩子档案下
    data.phone = data.phone || meta.phone || '';
    return tbl().upsert({
      id: id,
      user_id: data.userId,
      name: data.name || '小小探险家',
      phone: data.phone,
      state: data.state,
      updated_at: data.updatedAt,
    }).then(function (res) {
      if (res && res.error) throw res.error;
      return data;
    });
  }

  /* ---------- 读写本地状态 ---------- */

  function applyState(st) {
    if (!st) return;
    try {
      var next = Object.assign(blank(), st);
      s = next;                 // s 是 app.js 的全局状态
      save();
      if (typeof render === 'function') render();
    } catch (e) {}
  }

  function push() {
    if (!meta.profileId) return Promise.resolve(false);
    return currentUid().then(function (uid) {
      if (!uid) return false;
      var st = localState();
      return writeProfile(meta.profileId, {
        userId: uid,
        name: st.name || '小小探险家',
        state: st,
      }).then(function () {
        meta.userId = uid; meta.lastSync = Date.now(); writeMeta();
        return true;
      });
    }).catch(function (e) { _error = errText(e); _status = 'error'; render(); return false; });
  }

  /* ---------- 同步 ---------- */

  // 登录后第一次对齐：本地有记录且云端空 → 上传；云端有且本地空 → 下载；
  // 两边都有且判不出谁新 → 问家长。
  function firstSync(uid) {
    return listProfiles(uid).then(function (list) {
      var local = localState();
      if (!list.length) {
        var id = meta.profileId || newId();
        return writeProfile(id, { userId: uid, name: local.name || '小小探险家', state: local })
          .then(function () {
            meta.userId = uid; meta.profileId = id; meta.lastSync = Date.now(); writeMeta();
            return '本地记录已备份到云端';
          });
      }
      var cur = null;
      for (var i = 0; i < list.length; i++) { if (list[i]._id === meta.profileId) cur = list[i]; }
      if (!cur) cur = list[0];
      meta.userId = uid; meta.profileId = cur._id; writeMeta();

      if (!hasRecords(local) && hasRecords(cur.state)) {
        applyState(cur.state); meta.lastSync = cur.updatedAt || Date.now(); writeMeta();
        return '已从云端恢复记录';
      }
      if (hasRecords(local) && !hasRecords(cur.state)) return push().then(function () { return '本地记录已备份到云端'; });
      if (hasRecords(local) && hasRecords(cur.state)) return askConflict(local, cur);
      return push().then(function () { return '已开启同步'; });
    });
  }

  function askConflict(local, cloudDoc) {
    return new Promise(function (resolve) {
      _conflict = resolve;
      show('<h2>两份记录，留哪一份？</h2>' +
        '<p class="sub">这台设备有 ' + recordCount(local) + ' 天的记录，' +
        '云端有 ' + recordCount(cloudDoc.state) + ' 天（' + when(cloudDoc.updatedAt) + '）。</p>' +
        '<button class="primary" onclick="Cloud.resolveConflict(\'local\')">留这台设备的</button> ' +
        '<button class="secondary" onclick="Cloud.resolveConflict(\'cloud\')">留云端的</button>' +
        '<p class="sub">选完会立刻同步，另一份会被覆盖。</p>');
    }).then(function (choice) {
      _conflict = null;
      if (choice === 'cloud') {
        applyState(cloudDoc.state);
        meta.lastSync = cloudDoc.updatedAt || Date.now(); writeMeta();
        return '已用云端记录覆盖本机';
      }
      // 云端那边的档案太旧？先存一份副本，避免家长点错丢数据
      return writeProfile(meta.profileId + '_old', { userId: meta.userId, name: (cloudDoc.name || '备份') + '（旧）', state: cloudDoc.state })
        .then(function () { return push(); })
        .then(function () { return '已用本机记录覆盖云端（旧记录另存了一份）'; });
    });
  }

  // 常规同步：云端比上次同步新 → 下载；否则上传。
  function syncNow(silent) {
    if (!configured() || _busy) return Promise.resolve(null);
    _busy = true;
    if (!silent) { _status = 'ok'; render(); }
    return currentUid().then(function (uid) {
      if (!uid) { _status = 'login'; render(); return null; }
      if (!meta.profileId) return firstSync(uid).then(function (msg) { finish(msg, silent); return msg; });
      return loadProfile(meta.profileId).then(function (p) {
        if (p && p.updatedAt && (!meta.lastSync || p.updatedAt > meta.lastSync + 1000)) {
          applyState(p.state);
          meta.lastSync = p.updatedAt; writeMeta();
          finish('已同步（从云端更新）', silent);
          return '已同步（从云端更新）';
        }
        return push().then(function (ok) {
          var msg = ok ? '已同步' : '同步失败，已存本地';
          finish(msg, silent);
          return msg;
        });
      });
    }).catch(function (e) {
      _error = errText(e); _status = 'error'; render();
      return null;
    }).then(function (v) { _busy = false; return v; });
  }

  function finish(msg, silent) {
    _status = 'ok'; _error = ''; render();
    if (!silent && typeof toast === 'function') toast(msg);
  }

  /* ---------- 家长面板 UI ---------- */

  function statusText() {
    if (_status === 'off') return '云端未开通（仅本机保存）';
    if (_status === 'error') return '同步有问题：' + _error;
    if (_status === 'login') return '已配置，待登录';
    return '已开启 · 上次同步 ' + when(meta.lastSync);
  }

  function mount(id) {
    _mount = id;
    render();
    if (configured() && _status === 'off') { _status = 'login'; boot(); }
  }

  function render() {
    var el = _mount && document.getElementById(_mount);
    if (!el) return;
    var h = '<p class="sub">' + esc(statusText()) + '</p>';
    if (_status === 'off') {
      h += '<p class="sub">云端暂未开通，记录目前只保存在本机，可用「备份与恢复」导出存档。</p>';
    } else if (_status === 'login' || (_status === 'error' && !meta.profileId)) {
      h += '<label>家长手机号<input id="clPhone" inputmode="numeric" maxlength="11" autocomplete="tel" placeholder="13800138000"></label>' +
        '<label>短信验证码<input id="clCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6 位数字"></label>' +
        '<button class="secondary" onclick="Cloud.sendCode()">获取验证码</button> ' +
        '<button class="primary" onclick="Cloud.login()">登录并开启同步</button>' +
        '<p class="sub">孩子不用登录，照常点开就用。只给家长用于换设备时恢复记录。</p>';
    } else {
      h += '<button class="secondary" onclick="Cloud.syncNow()">立即同步</button> ' +
        '<button class="link" onclick="Cloud.logout()">退出登录</button>' +
        '<h3>孩子档案</h3>' + profileList() +
        '<label>再添加一个孩子<input id="clNew" maxlength="12" placeholder="小名"></label>' +
        '<button class="secondary" onclick="Cloud.addChild()">添加档案</button>';
    }
    el.innerHTML = h;
  }

  function profileList() {
    if (!_profiles || !_profiles.length) return '<p class="sub">正在读取…</p>';
    return _profiles.map(function (p) {
      var cur = p._id === meta.profileId;
      return '<div class="receipt">' + esc(p.name || '小小探险家') + ' · ' + recordCount(p.state) + ' 天' +
        (cur ? '<span class="sub">（当前）</span>' : ' <button class="link" onclick="Cloud.switchChild(\'' + p._id + '\')">切换</button>') + '</div>';
    }).join('');
  }

  var _profiles = [];

  function refreshProfiles() {
    if (!configured()) return Promise.resolve();
    return currentUid().then(function (uid) {
      if (!uid) return [];
      return listProfiles(uid);
    }).then(function (list) { _profiles = list || []; render(); });
  }

  /* ---------- 对外动作 ---------- */

  function boot() {
    if (!configured()) { _status = 'off'; render(); return; }
    _status = _status === 'off' ? 'login' : _status;
    ensure().then(function () { return _auth.getLoginState(); })
      .then(function (st) {
        if (!st) { _status = 'login'; render(); return null; }
        _status = 'ok'; render();
        refreshProfiles();
        return syncNow(true);
      })
      .catch(function (e) { _error = errText(e); _status = 'error'; render(); });
  }

  function sendCode() {
    var input = document.getElementById('clPhone');
    var raw = input ? input.value.replace(/\D/g, '') : '';
    if (!/^1\d{10}$/.test(raw)) { toast('请填写 11 位手机号'); return; }
    meta.phone = raw; writeMeta();
    ensure()
      .then(function () { return _auth.getVerification({ phone_number: phone(raw) }); })
      .then(function (info) { meta.verification = info; writeMeta(); toast('验证码已发送，请查收短信'); })
      .catch(function (e) { toast(errText(e)); });
  }

  function login() {
    var codeEl = document.getElementById('clCode');
    var code = codeEl ? codeEl.value.trim() : '';
    if (!/^\d{4,8}$/.test(code)) { toast('请填写短信里的验证码'); return; }
    ensure()
      .then(function () {
        return _auth.signInWithSms({
          verificationInfo: meta.verification,
          verificationCode: code,
          phoneNum: phone(meta.phone),
        });
      })
      .then(function () {
        meta.verification = null; writeMeta();
        _status = 'ok';
        closeModal();
        return syncNow().then(function () { refreshProfiles(); });
      })
      .catch(function (e) { toast(errText(e)); });
  }

  function logout() {
    if (_auth && _auth.signOut) _auth.signOut().catch(function () {});
    meta = { profileId: meta.profileId }; writeMeta();
    _status = 'login'; _profiles = []; render();
  }

  function addChild() {
    var el = document.getElementById('clNew');
    var name = el ? el.value.trim() : '';
    if (!name) { toast('先填个小名吧'); return; }
    currentUid().then(function (uid) {
      if (!uid) { toast('请先登录'); return null; }
      var id = newId();
      return writeProfile(id, { userId: uid, name: name, state: blank() })
        .then(function () { meta.profileId = id; writeMeta(); applyState(blank()); s.name = name; save(); render(); refreshProfiles(); toast('已切换到 ' + name); });
    }).catch(function (e) { toast(errText(e)); });
  }

  function switchChild(id) {
    if (id === meta.profileId) return;
    push().then(function () { return loadProfile(id); }).then(function (p) {
      if (!p) { toast('这份档案读不到，请重试'); return; }
      meta.profileId = id; meta.lastSync = p.updatedAt || Date.now(); writeMeta();
      applyState(p.state);
      refreshProfiles();
      toast('已切换到 ' + (p.name || '这份档案'));
    }).catch(function (e) { toast(errText(e)); });
  }

  function resolveConflict(choice) {
    if (_conflict) _conflict(choice);
    if (typeof closeModal === 'function') closeModal();
  }

  // app.js 的 save() 每次都会调到这里：合并短时间内的一串操作，只上传一次
  function markDirty() {
    if (!configured() || !meta.profileId) return;
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(function () { _timer = null; push(); }, conf().pushDelay || 1500);
  }

  window.Cloud = {
    boot: boot,
    mount: mount,
    render: render,
    sendCode: sendCode,
    login: login,
    logout: logout,
    syncNow: function () { return syncNow(); },
    addChild: addChild,
    switchChild: switchChild,
    resolveConflict: resolveConflict,
    markDirty: markDirty,
    configured: function () { return configured(); },
    status: function () { return _status; },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && _status === 'ok') syncNow(true);
  });
})();
