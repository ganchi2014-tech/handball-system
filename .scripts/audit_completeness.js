#!/usr/bin/env node
// E: データ完備性監査 v2 — 簡素化
const fs = require('fs');
const path = require('path');
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

// symptom 区切りで分割する。各 symptom は `{ id: 'xxx',` または `{ id: "xxx",` から始まる
// もっと単純に、行ベースで「id: 'symId', title:」のラインで切り出す
const lines = solveBlock.split('\n');
const symptomChunks = [];
let curCat = null, curStart = -1, curSymId = null;
for (let li = 0; li < lines.length; li++) {
  const l = lines[li];
  const catMatch = l.match(/^        id:\s*['"]([a-z_0-9]+)['"]\s*,\s*icon:/);
  if (catMatch) {
    if (curStart >= 0) symptomChunks.push({ cat: curCat, sym: curSymId, body: lines.slice(curStart, li).join('\n') });
    curCat = catMatch[1];
    curStart = -1;
    continue;
  }
  const symMatch = l.match(/^            id:\s*['"]([a-z_0-9]+)['"]\s*,\s*title:/);
  if (symMatch) {
    if (curStart >= 0) symptomChunks.push({ cat: curCat, sym: curSymId, body: lines.slice(curStart, li).join('\n') });
    curSymId = symMatch[1];
    curStart = li;
  }
}
if (curStart >= 0) symptomChunks.push({ cat: curCat, sym: curSymId, body: lines.slice(curStart).join('\n') });

const issues = { noDesc: [], shortDesc: [], noRelated: [], fewRelated: [], noActions: [], fewActions: [], dupRelated: [] };

for (const chunk of symptomChunks) {
  const key = `${chunk.cat}/${chunk.sym}`;
  // desc
  const dm = chunk.body.match(/desc:\s*(?:'([^']*)'|"([^"]*)")/);
  const desc = dm ? (dm[1] || dm[2] || '') : '';
  if (!desc) issues.noDesc.push(key);
  else if (desc.length < 20) issues.shortDesc.push(`${key}(${desc.length})`);

  // related: count `{ fileId: ... }` occurrences
  const relMatches = [...chunk.body.matchAll(/\{\s*fileId:\s*'(\d+)',\s*match:\s*['"]([^'"]+)['"]\s*\}/g)];
  const relList = relMatches.map(m => `${m[1]}/${m[2]}`);
  if (relList.length === 0) issues.noRelated.push(key);
  else if (relList.length < 2) issues.fewRelated.push(key);
  const seen = {};
  relList.forEach(r => seen[r] = (seen[r] || 0) + 1);
  const dupes = Object.entries(seen).filter(([, v]) => v > 1);
  if (dupes.length > 0) issues.dupRelated.push(`${key}: ${dupes.map(([k, v]) => `${k}×${v}`).join(', ')}`);

  // actions: count quoted strings inside actions block
  const actBlock = chunk.body.match(/actions:\s*\[([\s\S]*?)\]/);
  let actCount = 0;
  if (actBlock) {
    actCount = [...actBlock[1].matchAll(/^\s+(?:'|")/gm)].length;
  }
  if (actCount === 0) issues.noActions.push(key);
  else if (actCount < 3) issues.fewActions.push(`${key}(${actCount})`);
}

console.log('=== SOLVE_DATA 完備性 ===');
console.log('Total symptoms detected:', symptomChunks.length);
console.log('  desc 欠落:', issues.noDesc.length, issues.noDesc.slice(0, 8));
console.log('  desc 短い (<20文字):', issues.shortDesc.length, issues.shortDesc.slice(0, 8));
console.log('  related 欠落:', issues.noRelated.length, issues.noRelated.slice(0, 8));
console.log('  related 少ない (<2):', issues.fewRelated.length, issues.fewRelated.slice(0, 8));
console.log('  actions 欠落:', issues.noActions.length, issues.noActions.slice(0, 8));
console.log('  actions 少ない (<3):', issues.fewActions.length, issues.fewActions.slice(0, 8));
console.log('  related 重複:', issues.dupRelated.length);
issues.dupRelated.forEach(s => console.log('   ', s));

// DRILL_THEMES 完備性
const drillStart = html.indexOf('const DRILL_THEMES = ');
let dd = 0, dj = drillStart + 'const DRILL_THEMES = '.length - 1, ds = null;
for (; dj < html.length; dj++) {
  const c = html[dj], p = html[dj - 1];
  if (ds) { if (c === ds && p !== '\\') ds = null; continue; }
  if (c === "'" || c === '"' || c === '`') { ds = c; continue; }
  if (c === '/' && html[dj + 1] === '/') { while (dj < html.length && html[dj] !== '\n') dj++; continue; }
  if (c === '[') dd++;
  else if (c === ']') { dd--; if (dd === 0) { dj++; break; } }
}
const drillBlock = html.slice(drillStart, dj);
const themeLines = drillBlock.split('\n');
const themes = [];
let curT = null, curLv = null;
for (const l of themeLines) {
  // テーマ id 行: 4スペース + id: 'xxx', icon: '...', label: '...',
  const tm = l.match(/^    id:\s*'([a-z_0-9]+)',\s*icon:\s*'[^']+',\s*label:\s*'([^']+)'/);
  if (tm) {
    if (curT) themes.push(curT);
    curT = { id: tm[1], label: tm[2], basic: 0, mid: 0, adv: 0 };
    curLv = null;
    continue;
  }
  const lvm = l.match(/^\s*(basic|mid|adv):\s*\[/);
  if (lvm) { curLv = lvm[1]; continue; }
  if (curT && curLv && /title:\s*'[^']+'\s*,\s*minutes/.test(l)) curT[curLv]++;
}
if (curT) themes.push(curT);

console.log('\n=== DRILL_THEMES 完備性 ===');
console.log('Total themes:', themes.length);
const emptyThemes = themes.filter(t => t.basic === 0 || t.mid === 0 || t.adv === 0);
console.log('空レベルがあるテーマ:', emptyThemes.length);
emptyThemes.forEach(t => console.log(`  ${t.id}(${t.label}): basic=${t.basic} mid=${t.mid} adv=${t.adv}`));

// === 終了コード：致命的欠落があれば失敗扱い ===
// desc 短いは情報目的のみ、致命的ではない
const fatal = issues.noDesc.length + issues.noRelated.length + issues.noActions.length + issues.dupRelated.length + emptyThemes.length;
const warn = issues.fewRelated.length + issues.fewActions.length;
if (fatal > 0) {
  console.error(`\n❌ FAIL: fatal=${fatal}（desc/related/actions欠落・重複・空レベル）`);
  process.exit(1);
}
if (warn > 0) {
  console.warn(`\n⚠️  WARN: warn=${warn}（related/actions 推奨数未満）`);
}
console.log('\n✅ OK: 全 symptom / theme が必須項目を充足');
process.exit(0);
