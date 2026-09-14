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
  var ARCH_KEY = 'self-growth-archive-v1';   // 本机档案缓存：多个孩子的记录各存一份
  // 惰性读配置：config.js 一般先于本文件加载，但这样写可以容忍顺序变化和热改配置
  function conf() { return window.GROWTH_CLOUD || {}; }

  var meta = readJson(META_KEY) || {};
  // 本机档案缓存 { [档案id]: { name, state, updatedAt } }。
  // 有了它，断网也能在多个孩子之间切换，不必等云端返回；
  // self-growth-v1 仍然是「正在用的那一个孩子」，结构不变。
  var arch = readJson(ARCH_KEY) || {};
  var _app = null, _auth = null, _db = null, _sdk = null;
  var _timer = null, _busy = false, _error = '';
  var _status = 'off';            // off 未配置 | login 待登录 | ok 已登录 | error 出错
  var _mount = null;              // 家长面板里挂载「云端账号」UI 的元素 id
  var _kidsMount = null;          // 家长面板里挂载「孩子档案」UI 的元素 id
  var _guard = null;              // 换孩子前「还没备份上云」的选择回调
  var _conflict = null;           // 首次同步两边都有数据时的选择回调

  /* ---------- 小工具 ---------- */

  function readJson(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function writeMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {} }
  function writeArch() { try { localStorage.setItem(ARCH_KEY, JSON.stringify(arch)); } catch (e) {} }
  // 把一份档案写进本机缓存（切换前保命，云端返回后刷新）
  function keep(id, name, state, at) {
    if (!id || !state) return;
    arch[id] = { name: name || state.name || '小小探险家', state: state, updatedAt: at || Date.now() };
    writeArch();
  }
  // 把「本机正在用的这份」存进缓存——换孩子之前必须先调这个
  function keepCurrent() { if (meta.profileId) keep(meta.profileId, localState().name, localState(), Date.now()); }
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
    var url = new URL('cloudbase.esm.js?v=12', location.href).href;
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

  // 注意：本文件里也有一个 render()，在 IIFE 内直接写 render() 会调到自己头上，
  // 所以孩子界面必须显式走 window.render()（app.js 的那一个）。
  function paintApp() {
    try { if (typeof window.render === 'function') window.render(); } catch (e) {}
  }
  // 只刷新顶部「当前是谁」胶囊，不动整页（app.js 的 whoChip）
  function paintChip() {
    try { if (typeof window.whoChip === 'function') window.whoChip(); } catch (e) {}
  }

  function applyState(st) {
    if (!st) return;
    try {
      var next = Object.assign(blank(), st);
      s = next;                 // s 是 app.js 的全局状态
      save();
      paintApp();
    } catch (e) {}
  }

  function push() {
    if (!meta.profileId || !configured()) return Promise.resolve(false);
    return currentUid().then(function (uid) {
      if (!uid) return false;
      var st = localState();
      return writeProfile(meta.profileId, {
        userId: uid,
        name: st.name || '小小探险家',
        state: st,
      }).then(function (d) {
        meta.userId = uid; meta.lastSync = d.updatedAt || Date.now(); writeMeta();
        keep(meta.profileId, st.name, st, d.updatedAt);
        return true;
      });
    }).catch(function (e) { _error = errText(e); _status = 'error'; render(); return false; });
  }

  /* ---------- 孩子档案（一台设备、多个孩子） ---------- */

  // 档案清单：本机缓存 ∪ 云端返回。当前这份以本机内容为准（昵称可能刚改过）。
  function kids() {
    var map = {}, ids = Object.keys(arch), i;
    for (i = 0; i < ids.length; i++) map[ids[i]] = { id: ids[i], name: arch[ids[i]].name, state: arch[ids[i]].state };
    for (i = 0; i < _profiles.length; i++) {
      var p = _profiles[i];
      map[p._id] = { id: p._id, name: p.name || '小小探险家', state: p.state };
    }
    if (meta.profileId) {
      var local = localState();
      map[meta.profileId] = { id: meta.profileId, name: local.name || '小小探险家', state: local };
    }
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return (b.id === meta.profileId) - (a.id === meta.profileId); })
      .map(function (k) { return { id: k.id, name: k.name, days: recordCount(k.state), cur: k.id === meta.profileId }; });
  }

  // 取某个档案的最新内容：云端优先；拿不到就退回本机缓存，断网也能切。
  function takeProfile(id) {
    var cached = arch[id] ? { _id: id, name: arch[id].name, state: arch[id].state, updatedAt: arch[id].updatedAt } : null;
    if (!configured()) return Promise.resolve(cached);
    return loadProfile(id).then(function (p) {
      if (p) { keep(id, p.name, p.state, p.updatedAt); return p; }
      return cached;
    }).catch(function () { return cached; });
  }

  // 换孩子之前先确认本机这份已经备份上云。上传不了就问家长，绝不悄悄覆盖。
  function guardLocal(risk) {
    if (!configured() || !meta.profileId) return Promise.resolve('ok');
    return push().then(function (ok) {
      if (ok) return 'ok';
      return new Promise(function (resolve) {
        _guard = resolve;
        show('<h2>本机记录还没备份上云</h2>' +
          '<p class="sub">' + esc(risk) + '</p>' +
          '<button class="primary" onclick="Cloud.guard(\'retry\')">再试一次同步</button> ' +
          '<button class="secondary" onclick="Cloud.guard(\'go\')">不等了，直接继续</button> ' +
          '<button class="link" onclick="Cloud.guard(\'cancel\')">先不换了</button>' +
          '<p class="sub">网络不好时可以先取消，之后在「云端备份」里点「立即同步」。</p>');
      }).then(function (c) {
        _guard = null;
        if (c === 'retry') return push().then(function (o) { return o ? 'ok' : 'fail'; });
        return c === 'go' ? 'ok' : 'cancel';
      });
    });
  }
  function guard(c) { if (_guard) _guard(c); }

  function switchChild(id) {
    if (id === meta.profileId) { if (typeof closeModal === 'function') closeModal(); return; }
    return guardLocal('换孩子会先存好本机这份记录，再载入另一个孩子的记录。')
      .then(function (r) {
        if (r !== 'ok') {
          if (typeof closeModal === 'function') closeModal();
          if (r === 'fail') toast('还是没连上，稍后再试');
          return null;
        }
        keepCurrent();
        return takeProfile(id).then(function (p) {
          if (typeof closeModal === 'function') closeModal();
          if (!p) { toast('这份档案读不到，请重试'); return null; }
          meta.profileId = id; meta.lastSync = p.updatedAt || Date.now(); writeMeta();
          applyState(p.state);
          render();
          refreshProfiles();
          toast('已切换到 ' + (p.name || '这份档案'));
        });
      }).catch(function (e) { toast(errText(e)); });
  }

  function addChild() {
    var el = document.getElementById('clNew');
    var name = el ? el.value.trim() : '';
    if (!name) { toast('先填个小名吧'); return; }
    return guardLocal('新建档案会切到这个新孩子，本机当前的记录会先存好。')
      .then(function (r) {
        if (r !== 'ok') { if (r === 'fail') toast('还是没连上，稍后再试'); return null; }
        keepCurrent();
        var id = newId(), st = blank();
        st.name = name;
        meta.profileId = id; writeMeta();
        keep(id, name, st, Date.now());
        applyState(st);
        render();
        refreshProfiles();
        toast('已切换到 ' + name);
      }).catch(function (e) { toast(errText(e)); });
  }

  function renameCurrent() {
    var el = document.getElementById('kidName');
    var v = el ? el.value.trim() : '';
    if (!v) { toast('昵称不能空着'); return; }
    if (!meta.profileId) { meta.profileId = newId(); writeMeta(); }
    s.name = v; save();
    keep(meta.profileId, v, localState(), Date.now());
    paintApp();
    render();
    refreshProfiles();
    toast('昵称已保存');
  }

  // 孩子端入口：点顶部昵称胶囊弹出，选自己的名字即可换过来（不需要家长 PIN）
  function openKidPicker() {
    var list = kids();
    if (list.length < 2) { toast('现在只有一个孩子档案'); return; }
    show('<h2>今天是谁呀？</h2><p class="sub">点一下自己的名字，就换成自己的记录。</p><div class="kidpick">' +
      list.map(function (k) {
        return '<button class="' + (k.cur ? 'cur' : '') + '" aria-pressed="' + k.cur + '" onclick="Cloud.switchChild(\'' + k.id + '\')">' +
          '<strong>' + esc(k.name) + '</strong>' +
          '<span class="sub">' + k.days + ' 天记录 · ' + (k.cur ? '正在用' : '点一下换过来') + '</span></button>';
      }).join('') + '</div><p class="sub">换过来以后，就是自己的星星和本子啦。</p>');
  }

  // 家长面板里的「孩子档案」块
  function kidsBoxView() {
    var el = _kidsMount && document.getElementById(_kidsMount);
    if (!el) return;
    var list = kids();
    var h = '<label>当前孩子的昵称<input id="kidName" maxlength="12" value="' + esc(localState().name || '小小探险家') + '"></label>' +
      '<button class="secondary" onclick="Cloud.renameCurrent()">保存昵称</button>';
    if (list.length > 1) {
      h += '<h3>档案列表</h3>' + list.map(function (k) {
        return '<div class="receipt">' + esc(k.name) + ' · ' + k.days + ' 天' +
          (k.cur ? '<span class="sub">（正在用）</span>' : ' <button class="link" onclick="Cloud.switchChild(\'' + k.id + '\')">切换</button>') + '</div>';
      }).join('');
    }
    h += '<label>再添加一个孩子<input id="clNew" maxlength="12" placeholder="小名，例如 朵朵"></label>' +
      '<button class="secondary" onclick="Cloud.addChild()">添加档案</button>' +
      '<p class="sub">' + (configured()
        ? '换孩子前会先把当前记录同步到云端，不会丢。'
        : '档案目前只保存在这台设备上；登录下面「云端备份」后，换设备也能找回。') + '</p>';
    el.innerHTML = h;
  }

  function mountKids(id) { _kidsMount = id; kidsBoxView(); }

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
            keep(id, local.name, local, Date.now());
            return '本地记录已备份到云端';
          });
      }
      var cur = null;
      for (var i = 0; i < list.length; i++) { if (list[i]._id === meta.profileId) cur = list[i]; }
      if (!cur) cur = list[0];
      meta.userId = uid; meta.profileId = cur._id; writeMeta();

      if (!hasRecords(local) && hasRecords(cur.state)) {
        keep(cur._id, cur.name, cur.state, cur.updatedAt);
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

  function cloudBox() {
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
        '<p class="sub">正在用的档案：' + esc(localState().name || '小小探险家') + ' · ' + recordCount(localState()) + ' 天记录</p>';
    }
    el.innerHTML = h;
  }

  // 家长面板一次刷新两块：云端账号 + 孩子档案
  function render() { cloudBox(); kidsBoxView(); paintChip(); }

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
    mountKids: mountKids,
    render: render,
    sendCode: sendCode,
    login: login,
    logout: logout,
    syncNow: function () { return syncNow(); },
    addChild: addChild,
    switchChild: switchChild,
    renameCurrent: renameCurrent,
    openKidPicker: openKidPicker,
    guard: guard,
    kids: kids,
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
