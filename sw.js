// Service Worker — オフライン対応（cache-first 戦略）
// 体育館の電波弱い環境でも辞書が見られるよう設計
const CACHE = 'handball-lab-v1';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  // React / Babel CDN は外部のため動的キャッシュ
];

// インストール時：必須ファイルをプリキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// 起動時：古いキャッシュを掃除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// fetch：cache-first（オフラインでも読める）+ 取得後に背景更新
self.addEventListener('fetch', (event) => {
  // chrome-extension などは無視
  if (!event.request.url.startsWith('http')) return;
  // POST 等のキャッシュ対象外メソッドはネット直行
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);

      // キャッシュがあればまず即返却、背景でネット更新
      return cached || networkFetch;
    })
  );
});
