// Service Worker — オフライン対応
// v7: アプリシェル（index.html・React/Babel CDN）をプリキャッシュ＋ランタイムキャッシュ。
//     これまで「オフライン対応」を謳いながら本体を一切キャッシュしておらず、圏外で白画面だった欠陥の修正。
//     - HTML: network-first(no-store) + 成功時にキャッシュ更新 + 失敗時キャッシュfallback（デプロイ即反映は維持）
//     - CDN(unpkg): cache-first（バージョン固定資産。毎回の約3MB再取得と起動遅延を解消）
//     - 辞書(.md): v6のまま cache-first(stale-while-revalidate)。※v5でno-cache条件付きGETに変えたら
//       GitHub Pagesの304応答で辞書が全滅した→絶対に条件付きGETにしない（no-storeのみ使用）
//     - activate: 現行バージョン以外のキャッシュのみ削除（全削除をやめ、プリキャッシュを保全）
const CACHE = 'handball-lab-v7';
const APP_SHELL = [
  './',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];
const CDN_ASSETS = [
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7.26.4/babel.min.js',
];

// インストール時：アプリシェルを事前キャッシュ（CDNは失敗しても install を止めない＝初回fetch時に補完）
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL)
        .then(() => Promise.all(
          CDN_ASSETS.map(u => cache.add(u).catch(() => null))
        )))
      .then(() => self.skipWaiting())
  );
});

// 起動時：旧バージョンのキャッシュのみ破棄
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// fetch：辞書(.md)=cache-first / CDN=cache-first / HTML等=network-first＋キャッシュfallback
self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith('http')) return;
  if (event.request.method !== 'GET') return;

  const url = event.request.url;
  const isDictFile = url.includes('/dictionary/') && url.endsWith('.md');
  const isCdn = url.includes('unpkg.com/');

  if (isDictFile) {
    // 辞書：cache-first（即表示・確実にロード）＋背景でネットワーク更新（次回最新化）
    // ※キャッシュがあれば必ず返すので「空セクション」にならない。更新は1読込遅れで反映。
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
  } else if (isCdn) {
    // CDN資産：cache-first（URLにバージョンが乗っており不変扱い。CACHE更新時に取り直し）
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  } else {
    // HTML/その他：network-first + no-store（デプロイ即反映）。成功時にキャッシュ更新、
    // 失敗時（圏外）はキャッシュから返す。ナビゲーションは './' にもフォールバック。
    const noCache = new Request(event.request, { cache: 'no-store' });
    event.respondWith(
      fetch(noCache).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() =>
        caches.match(event.request).then((cached) =>
          cached || (event.request.mode === 'navigate' ? caches.match('./') : undefined)
        )
      )
    );
  }
});
