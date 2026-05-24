#!/usr/bin/env node
// SOLVE_DATA詳細監査：RESULT_TO_SYMPTOM の参照先が実在するか
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// SOLVE_DATA をブロックで抽出
const startMarker = 'const SOLVE_DATA = {';
const startIdx = html.indexOf(startMarker);
let depth = 0;
let i = startIdx + startMarker.length - 1; // start at the {
let inStr = null;
for (; i < html.length; i++) {
  const c = html[i];
  const p = html[i - 1];
  if (inStr) {
    if (c === inStr && p !== '\\') inStr = null;
    continue;
  }
  if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
  // ignore single-line comments
  if (c === '/' && html[i + 1] === '/') { while (i < html.length && html[i] !== '\n') i++; continue; }
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
}
const solveBlock = html.slice(startIdx, i);
console.log('SOLVE_DATA length:', solveBlock.length);

// playerセクション抽出: "player: {" から coach: { まで
const playerStart = solveBlock.indexOf('player: {');
const coachStart = solveBlock.indexOf('coach: {', playerStart);
const playerSection = solveBlock.slice(playerStart, coachStart > 0 ? coachStart : solveBlock.length);
console.log('player section length:', playerSection.length);

// 各カテゴリの id を抽出 (depth=4でid: 'xxx')
// 簡易: 行頭 "        id: '..." (8スペース) はカテゴリ、 "            id: '..." (12スペース) は症状
const lines = playerSection.split('\n');
const catIds = [];
const symIdsPerCat = {};
let curCat = null;
for (const l of lines) {
  // カテゴリの id: 行頭8spaces (Read-tool tab表示は実際スペースのはず、確認)
  const catMatch = l.match(/^        id:\s*'([a-z_0-9]+)',\s*icon:/);
  if (catMatch) { curCat = catMatch[1]; catIds.push(curCat); symIdsPerCat[curCat] = []; continue; }
  // 症状の id: 行頭12spaces で 'id: 'xxx',' で始まる行（{は別行）
  const symMatch = l.match(/^            id:\s*'([a-z_0-9]+)',\s*title:/);
  if (symMatch && curCat) symIdsPerCat[curCat].push(symMatch[1]);
}
console.log('player categories:', catIds);
console.log('symptom counts per category:');
for (const c of catIds) console.log(`  ${c}: ${symIdsPerCat[c].length}`);

// RESULT_TO_SYMPTOMの解析
const r2sMatch = html.match(/const RESULT_TO_SYMPTOM = \{[\s\S]*?\n  \};/);
const r2sBlock = r2sMatch ? r2sMatch[0] : '';
const r2sEntries = [...r2sBlock.matchAll(/'(r_[^']+)':\s*\{\s*role:\s*'([^']+)',\s*category:\s*'([^']+)',\s*symptom:\s*'([^']+)'/g)];
console.log('\nRESULT_TO_SYMPTOM entries:', r2sEntries.length);
const issues = [];
for (const [, rid, role, cat, sym] of r2sEntries) {
  if (role !== 'player') { issues.push(`  ${rid}: unknown role '${role}'`); continue; }
  if (!catIds.includes(cat)) { issues.push(`  ${rid}: category '${cat}' NOT FOUND in player.categories`); continue; }
  if (!symIdsPerCat[cat].includes(sym)) { issues.push(`  ${rid}: symptom '${sym}' NOT FOUND in player.${cat}.symptoms (avail: ${symIdsPerCat[cat].slice(0,5).join(',')}...)`); continue; }
}
console.log('Issues:', issues.length);
issues.forEach(i => console.log(i));

// MODE_TO_SOLVEもチェック
const m2sMatch = html.match(/const MODE_TO_SOLVE = \{[\s\S]*?\n  \};/);
const m2sBlock = m2sMatch ? m2sMatch[0] : '';
const m2sEntries = [...m2sBlock.matchAll(/'([^']+)':\s*\{\s*role:\s*'([^']+)',\s*category:\s*'([^']+)'/g)];
console.log('\nMODE_TO_SOLVE entries:', m2sEntries.length);
const m2sIssues = [];
for (const [, mode, role, cat] of m2sEntries) {
  if (role !== 'player' && role !== 'coach') { m2sIssues.push(`  ${mode}: unknown role '${role}'`); continue; }
  if (role === 'player' && !catIds.includes(cat)) m2sIssues.push(`  ${mode}: player/${cat} NOT FOUND`);
}
console.log('MODE_TO_SOLVE issues:', m2sIssues.length);
m2sIssues.forEach(i => console.log(i));
