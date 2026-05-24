#!/usr/bin/env node
// SOLVE_DATA の symptom.related[].match が辞書セクションタイトルに解決するか全件チェック
const fs = require('fs');
const path = require('path');

// splitSections と同等の処理（index.htmlのロジックを移植）
function splitSections(md) {
  md = md.replace(/\r\n?/g, '\n');
  const lines = md.split('\n');
  const sections = [];
  let current = null;
  let preamble = [];
  let sectionIdx = 0;
  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.*)$/);
    if (m && m[1].length <= 2) {
      if (current) { sections.push(current); sectionIdx++; }
      else if (preamble.length) { sections.push({ title: '冒頭', body: preamble.join('\n').trim() }); sectionIdx++; }
      current = {
        title: m[2]
          .replace(/【([A-Za-z0-9]{1,2})】/g, '$1. ')
          .replace(/【([^】]+)】/g, '$1 ')
          .replace(/「([^」]+)」/g, '$1 ')
          .replace(/\s+/g, ' ')
          .trim(),
        body: line + '\n',
      };
    } else {
      if (current) current.body += line + '\n';
      else preamble.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

function findRelatedSection(sections, match) {
  let hit = sections.find(s => s.title === match);
  if (hit) return { type: 'exact', section: hit };
  hit = sections.find(s => s.title.startsWith(match));
  if (hit) return { type: 'prefix', section: hit };
  hit = sections.find(s => s.title.includes(match));
  if (hit) return { type: 'contains', section: hit };
  const stripped = match.replace(/^[A-Za-z0-9\-]+】\s*/, '');
  if (stripped !== match && stripped.length > 0) {
    hit = sections.find(s => s.title.includes(stripped));
    if (hit) return { type: 'stripped', section: hit };
  }
  hit = sections.find(s => s.body && s.body.includes(match));
  if (hit) return { type: 'body', section: hit };
  return null;
}

// 各辞書ファイルをパースしてセクションタイトル一覧を作る
const dictDir = path.join(__dirname, '..', 'dictionary');
const files = fs.readdirSync(dictDir).filter(f => f.endsWith('.md'));
const fileSections = {}; // {fileId: [{title, body}, ...]}
for (const f of files) {
  const fileId = f.split('_')[0];
  const md = fs.readFileSync(path.join(dictDir, f), 'utf8');
  fileSections[fileId] = splitSections(md);
}

// index.htmlからSOLVE_DATAを抽出（playerセクション内のrelated）
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const startMarker = 'const SOLVE_DATA = {';
const startIdx = html.indexOf(startMarker);
let depth = 0, i = startIdx + startMarker.length - 1, inStr = null;
for (; i < html.length; i++) {
  const c = html[i], p = html[i - 1];
  if (inStr) { if (c === inStr && p !== '\\') inStr = null; continue; }
  if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
  if (c === '/' && html[i + 1] === '/') { while (i < html.length && html[i] !== '\n') i++; continue; }
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
}
const solveBlock = html.slice(startIdx, i);

// related エントリを行ベースで全件抽出
// パターン: { fileId: '01', match: 'コンタクト技術（山側/谷側）' },
// しかし症状ごとにgroupingが必要 — 簡易: 全行を抽出
const lines = solveBlock.split('\n');
const allRelated = [];
let curCat = null, curSym = null;
for (const l of lines) {
  const catMatch = l.match(/^        id:\s*'([a-z_0-9]+)',\s*icon:/);
  if (catMatch) { curCat = catMatch[1]; continue; }
  const symMatch = l.match(/^            id:\s*'([a-z_0-9]+)',\s*title:\s*'([^']+)'/);
  if (symMatch) { curSym = `${curCat}/${symMatch[1]}`; continue; }
  const relMatch = l.match(/\{\s*fileId:\s*'(\d+)',\s*match:\s*'([^']+)'\s*\}/);
  if (relMatch) {
    allRelated.push({ sym: curSym, fileId: relMatch[1], match: relMatch[2] });
  }
}
console.log('Total related entries:', allRelated.length);

// 各エントリを検証
const broken = [];
const matches = { exact: 0, prefix: 0, contains: 0, stripped: 0, body: 0 };
for (const r of allRelated) {
  const sections = fileSections[r.fileId];
  if (!sections) {
    broken.push({ ...r, reason: `file ${r.fileId} not found on disk` });
    continue;
  }
  const result = findRelatedSection(sections, r.match);
  if (!result) {
    broken.push({ ...r, reason: 'no match', avail: sections.slice(0, 3).map(s => s.title) });
  } else {
    matches[result.type]++;
  }
}
console.log('Match types:', matches);
console.log('Broken:', broken.length);
if (broken.length) {
  console.log('\n=== Broken Details ===');
  for (const b of broken) {
    console.log(`[${b.sym}] file ${b.fileId} match: "${b.match}" — ${b.reason}`);
  }
}
