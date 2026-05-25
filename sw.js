// Service Worker — オフライン対応
// v3: HTML/JS はネットワーク優先（常に最新）、辞書.md のみキャッシュ優先（体育館オフライン対応）
const CACHE = 'handball-lab-v3';

// インストール時：即座にアクティブ化
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

// 起動時：古いキャッシュをすべて破棄
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// fetch：辞書ファイル(.md)のみ cache-first、それ以外は network-first
self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith('http')) return;
  if (event.request.method !== 'GET') return;

  const url = event.request.url;
  const isDictFile = url.includes('/dictionary/') && url.endsWith('.md');

  if (isDictFile) {
    // 辞書：cache-first（電波なし環境でも読める）
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
  } else {
    // HTML/JS/その他：network-first（常に最新を取得）
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});
