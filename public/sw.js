/* Picabead Service Worker — 离线缓存核心资源 */
const CACHE = 'picabead-v1';

// 安装时预缓存静态壳 + 关键依赖
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll([
        './',
        './index.html',
        './logo.png',
        './manifest.webmanifest',
      ]).catch(() => {}), // 首次安装时个别资源缺失不阻塞
    ),
  );
  self.skipWaiting();
});

// 激活时清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

// 缓存优先，回源补充
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((resp) => {
          // 只缓存同源成功响应
          if (resp.ok && new URL(request.url).origin === self.location.origin) {
            const clone = resp.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return resp;
        })
        .catch(() => {
          // 离线时回退到首页（SPA）
          if (request.mode === 'navigate') return caches.match('./index.html');
          return undefined;
        });
    }),
  );
});