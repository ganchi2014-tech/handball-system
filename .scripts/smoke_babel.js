#!/usr/bin/env node
// スモークテスト：index.html の <script type="text/babel"> が本番と同じ Babel 7.26.4 で
// 変換に通ることを検証する。typo 1つで全部員が白画面になる事故（過去2回）をCIで塞ぐ。
// 実行前提: npm i --no-save @babel/standalone@7.26.4（audit.yml 参照）
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const OPEN = '<script type="text/babel">';
const CLOSE = '</script>';
const s = html.indexOf(OPEN);
if (s < 0) { console.error('NG: <script type="text/babel"> が見つかりません'); process.exit(1); }
const e = html.indexOf(CLOSE, s);
if (e < 0) { console.error('NG: 閉じ</script>が見つかりません'); process.exit(1); }
const src = html.slice(s + OPEN.length, e);
console.log(`対象スクリプト: ${(src.length / 1024).toFixed(0)} KB`);

let Babel;
try {
  Babel = require('@babel/standalone');
} catch (err) {
  console.error('NG: @babel/standalone が未インストール。`npm i --no-save @babel/standalone@7.26.4` を実行してください');
  process.exit(1);
}

let out;
try {
  out = Babel.transform(src, { presets: ['react'] }).code;
} catch (err) {
  console.error('NG: Babel変換に失敗（本番で白画面になる状態）');
  console.error(String(err.message || err).split('\n').slice(0, 20).join('\n'));
  process.exit(1);
}

// automatic JSXランタイム化の検知（Babel v8系が混入した場合の保険）
if (/from\s+["']react\/jsx-runtime["']/.test(out)) {
  console.error('NG: 変換結果に react/jsx-runtime の import が含まれる（automaticランタイム化＝白画面）');
  process.exit(1);
}
console.log('OK: Babel変換成功・classicランタイム確認');
