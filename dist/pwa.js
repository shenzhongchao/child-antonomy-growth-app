/* 家长中心 PWA 安装引导：只负责环境识别与安装提示，不接触成长业务状态。 */
(function () {
  'use strict';

  var deferredPrompt = null;

  function standalone() {
    return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || !!navigator.standalone;
  }
  function ua() { return navigator.userAgent || ''; }
  function isWechat() { return /MicroMessenger/i.test(ua()); }
  function isIOS() { return /iPhone|iPad|iPod/i.test(ua()); }
  function isAndroid() { return /Android/i.test(ua()); }

  function html() {
    if (standalone()) {
      return '<div class="pwa-status"><strong>✓ 已经放到桌面</strong><span class="sub">下次直接点击「今天我做主」图标就能打开。</span></div>';
    }
    if (isWechat()) {
      return '<div class="pwa-status"><strong>先用浏览器打开</strong><ol class="pwa-steps"><li>点微信右上角「···」</li><li>选择“在浏览器打开”</li><li>再按浏览器提示添加到主屏幕</li></ol></div>';
    }
    if (deferredPrompt) {
      return '<div class="pwa-status"><strong>可以直接安装</strong><span class="sub">安装后会像普通 App 一样出现在手机桌面。</span></div><button class="primary" onclick="PWAInstall.install()">安装「今天我做主」</button>';
    }
    if (isIOS()) {
      return '<div class="pwa-status"><strong>添加到 iPhone / iPad 主屏幕</strong><ol class="pwa-steps"><li>建议用 Safari 打开当前页面</li><li>点底部“分享”按钮</li><li>选择“添加到主屏幕” → “添加”</li></ol></div>';
    }
    if (isAndroid()) {
      return '<div class="pwa-status"><strong>添加到 Android 桌面</strong><ol class="pwa-steps"><li>用 Chrome 等浏览器打开当前页面</li><li>点浏览器右上角菜单</li><li>选择“安装应用”或“添加到主屏幕”</li></ol></div>';
    }
    return '<div class="pwa-status"><strong>可以安装成桌面应用</strong><span class="sub">在浏览器菜单中寻找“安装应用 / 添加到主屏幕”。手机端使用会更方便。</span></div>';
  }

  function render() {
    var el = document.getElementById('pwaBox');
    if (el) el.innerHTML = html();
  }

  function install() {
    if (!deferredPrompt) { render(); return; }
    var prompt = deferredPrompt;
    deferredPrompt = null;
    prompt.prompt();
    Promise.resolve(prompt.userChoice).catch(function () {}).then(render);
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    render();
  });
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    render();
  });

  document.addEventListener('click', function () { setTimeout(render, 0); }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();

  window.PWAInstall = { install: install, render: render, standalone: standalone };
})();
