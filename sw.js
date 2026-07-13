const CACHE_NAME = 'pinchi-v29';
const ASSETS = [
  '/money/',
  '/money/index.html',
  '/money/css/style.css',
  '/money/js/supabase.js',
  '/money/js/store.js',
  '/money/js/utils.js',
  '/money/js/pages.js',
  '/money/js/app.js',
  '/money/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  // Supabase 資料 API 永遠走網路，不快取
  if (url.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }
  // 只快取自家靜態檔與 supabase-js CDN（離線時沒有它整個 App 起不來）；
  // 其他第三方 API（報價、proxy）不經快取
  const isStatic = url.startsWith(self.location.origin) || url.includes('cdn.jsdelivr.net');
  if (!isStatic || event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
