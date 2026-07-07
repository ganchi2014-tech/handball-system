import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import './styles.css';

// 旧世代（手書きsw.js）のキャッシュ掃除。切替後のルート配信時のみ実行する。
// ⚠ 並走中（/next/ 配下）は旧アプリが同一オリジンで共存しており、Cache Storage は
//    オリジン共有のため、ここで消すと旧アプリのオフラインが壊れる。切替後にだけ動く条件にしている。
if ('caches' in window && !window.location.pathname.includes('/next/')) {
  caches.keys().then((keys) => {
    keys.filter((k) => k.startsWith('handball-lab-')).forEach((k) => caches.delete(k));
  }).catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
