#!/usr/bin/env node
// N-fix: ソース中の `\\n` (literal 2-char: backslash + n) を `\n` (改行コード) に変換
// 但し、replace() 等の正規表現/コード文脈は変更しない（行に '\n' 単独で含まれるパターンを除外）
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(file, 'utf8');

let changes = 0;
const out = src.split('\n').map((line, i) => {
  // 修正対象： improve: '...', desc: '...', body: '...', 等のテキスト文字列内のみ
  // 除外: replace(...), split(...), join(...) のような code context
  if (/replace\(|split\(|join\(/.test(line)) return line;
  // 行内に `\\n` (4-char regex: backslash backslash n) が含まれる場合
  // → `\n` (2-char regex: backslash n) に変換
  if (line.includes('\\\\n')) {
    const before = line;
    const after = line.replace(/\\\\n/g, '\\n');
    if (after !== before) { changes++; }
    return after;
  }
  return line;
}).join('\n');

fs.writeFileSync(file, out);
console.log(`Changed ${changes} lines`);
