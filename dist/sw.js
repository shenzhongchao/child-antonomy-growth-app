// 离线缓存：让「今天我做主」装到手机桌面后没网也能打开。
// 改完 dist 里的 HTML/CSS/JS 后，把下面 VERSION 加一，用户下次联网打开就会拿到新版。
// 注意：VERSION（growth-vXX）只是 Service Worker Cache Storage 命名空间，
// 与 index.html 里的 ?v=xx（HTTP/CDN/浏览器缓存 busting）职责不同；
// 两者互不相等没关系，但都只能向前递增，绝不复用历史版本号。
const VERSION = 'growth-v18';

// 核心预缓存文件：index.html 里带 ?v=xx 引用它们，fetch 时需要忽略 query 才能命中缓存。
const CORE_FILES = ['index.html', 'styles.css', 'history.css', 'growth-events.js', 'pwa.js', 'app.js', 'history.js', 'config.js', 'auth.js'];

// 页面导航等网络的上限：超过这个时间就用本地缓存顶上，避免弱网/断网时白屏干等。
const NAV_TIMEOUT_MS = 2500;

// 只预缓存「首屏必需且体积小」的文件；大图（growth-art / storybook-scene）走运行时缓存，避免安装拖慢。
const CORE = [
  './',
  './index.html',
  './styles.css',
  './history.css',
  './growth-events.js',
  './pwa.js',
  './app.js',
  './history.js',
  './config.js',
  './auth.js',
  './manifest.json',
  './star-friend.webp',
  './favicon-32.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 导航请求：优先联网拿最新版；但只要有缓存兜底，就把联网限制在 NAV_TIMEOUT_MS 内。
// 没有缓存兜底（首次访问）时不设超时，老老实实等网络，否则会直接白屏。
async function handleNavigate(req) {
  const cache = await caches.open(VERSION);
  const fallback = (await cache.match(req)) || (await cache.match('./index.html'));

  const controller = new AbortController();
  const timer = fallback ? setTimeout(() => controller.abort(), NAV_TIMEOUT_MS) : null;

  try {
    const res = await fetch(req, { signal: controller.signal });
    if (timer) clearTimeout(timer);
    if (res && res.status === 200) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    if (timer) clearTimeout(timer);
    if (fallback) return fallback;
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1) {
    event.respondWith(handleNavigate(req));
    return;
  }

  // 静态资源：先看缓存，没有再走网络并顺手存下来。
  event.respondWith(serveStatic(req));
});

async function serveStatic(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  let name = '';
  try { name = new URL(req.url).pathname.split('/').pop() || ''; } catch (err) { name = ''; }
  if (CORE_FILES.indexOf(name) !== -1) {
    const near = await cache.match(req, { ignoreSearch: true });
    if (near) return near;
  }
  const res = await fetch(req);
  if (res && res.status === 200 && res.type === 'basic') {
    const copy = res.clone();
    caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
}
