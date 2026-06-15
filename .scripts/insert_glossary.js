#!/usr/bin/env node
// _glossary_additions.js のブロックを index.html の GLOSSARY 配列末尾（コンセプト群の後）に挿入する。
const fs = require('fs');
const path = require('path');

const idxPath = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(idxPath, 'utf8');
let add = fs.readFileSync(path.join(__dirname, '_glossary_additions.js'), 'utf8');

// 改行コード検出（index.html に合わせる）
const crlf = /\r\n/.test(html);
const NL = crlf ? '\r\n' : '\n';
if (crlf) add = add.replace(/\r?\n/g, '\r\n'); else add = add.replace(/\r\n/g, '\n');

// アンカー：2秒の壁 エントリ（GLOSSARY内で一意）
const anchor = "{ term: '2秒の壁',";
const idx = html.indexOf(anchor);
if (idx < 0) { console.error('ERROR: anchor (2秒の壁) not found'); process.exit(1); }

// idx 以降の最初の "];"（GLOSSARY 配列の閉じ。グループ閉じは "]}," なので衝突しない）
const closePos = html.indexOf('];', idx);
if (closePos < 0) { console.error('ERROR: GLOSSARY closing "];" not found'); process.exit(1); }

// 既に挿入済みでないか（二重挿入防止）
if (html.slice(idx, closePos).includes('辞書監査(全33ファイル)で追加')) {
  console.error('ERROR: already inserted (marker found). 中止。'); process.exit(1);
}

const marker = `  // ── 辞書監査(全33ファイル)で追加した用語 ──${NL}`;
const before = html.slice(0, closePos);
const after = html.slice(closePos);
const newHtml = before + marker + add + after;

// バックアップ
fs.writeFileSync(idxPath + '.bak', html, 'utf8');
fs.writeFileSync(idxPath, newHtml, 'utf8');

// 検算
const added = (add.match(/\{ term:/g) || []).length;
console.log('挿入完了。新規エントリ:', added);
console.log('バックアップ: index.html.bak');
