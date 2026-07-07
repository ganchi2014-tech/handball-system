import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

// dictionary/ ・ icons/ ・ manifest.json はリポジトリ直下が正本（旧index.htmlと共有）。
// dev/preview はここから直接配信し、build後は dist/ へコピーする。
// （app/public に複製を置くと二重管理になるため、この方式で単一ソースを守る）
function sharedRootAssets() {
  const attach = (server) => {
    server.middlewares.use((req, res, next) => {
      const url = (req.url || '').split('?')[0];
      const m = url.match(/^\/(dictionary\/[^/]+\.md|icons\/[^/]+\.(?:png|ico)|manifest\.json)$/);
      if (!m) return next();
      const file = path.join(repoRoot, m[1]);
      if (!fs.existsSync(file)) return next();
      const type = file.endsWith('.md') ? 'text/markdown; charset=utf-8'
        : file.endsWith('.json') ? 'application/manifest+json'
        : 'image/png';
      res.setHeader('Content-Type', type);
      fs.createReadStream(file).pipe(res);
    });
  };
  return {
    name: 'shared-root-assets',
    configureServer: attach,
    configurePreviewServer: attach,
    closeBundle() {
      const dist = path.join(repoRoot, 'dist');
      if (!fs.existsSync(dist)) return;
      fs.cpSync(path.join(repoRoot, 'dictionary'), path.join(dist, 'dictionary'), { recursive: true });
      fs.cpSync(path.join(repoRoot, 'icons'), path.join(dist, 'icons'), { recursive: true });
      fs.copyFileSync(path.join(repoRoot, 'manifest.json'), path.join(dist, 'manifest.json'));
    },
  };
}

export default defineConfig({
  root: 'app',
  // 相対base: GitHub Pagesの /handball-system/（切替後）でも /handball-system/next/（並走中）でも動く
  base: './',
  plugins: [
    react(),
    sharedRootAssets(),
    // 手書き sw.js の後継。ビルド資産（ハッシュ付き）をプリキャッシュ＝真のオフライン対応。
    // ⚠ 辞書.md は StaleWhileRevalidate（キャッシュ即返し＋裏で更新）。旧sw.js v6/v7 と同じ挙動。
    // ⚠ 条件付きGET（If-None-Match/no-cache）は絶対に使わない。過去にGitHub Pagesの304応答で
    //    辞書が全滅した（sw.js v5事故）。Workboxは自前で条件付きヘッダを付けないため安全。
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // 既存のルート manifest.json をそのまま使う（closeBundleでdistへコピー）
      workbox: {
        globPatterns: ['**/*.{js,css,html,png}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/dictionary/') && url.pathname.endsWith('.md'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'dictionary-md',
              expiration: { maxEntries: 64 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
