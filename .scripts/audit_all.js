#!/usr/bin/env node
// 全クリック箇所監査：あらゆる参照（related, plan item, dict-related, sectionId等）の整合性
const fs = require('fs');
const path = require('path');

function splitSections(md, fileMeta) {
  md = md.replace(/\r\n?/g, '\n');
  const lines = md.split('\n');
  const sections = [];
  let current = null;
  let preamble = [];
  let idx = 0;
  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.*)$/);
    if (m && m[1].length <= 2) {
      if (current) { sections.push(current); idx++; }
      else if (preamble.length) { sections.push({ id: fileMeta.id + '-pre', fileId: fileMeta.id, title: '冒頭', body: preamble.join('\n').trim() }); idx++; }
      current = {
        id: fileMeta.id + '-' + sections.length,
        fileId: fileMeta.id,
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

function findRelatedSection(sections, fileId, match) {
  const inFile = sections.filter(s => s.fileId === fileId);
  let hit = inFile.find(s => s.title === match);
  if (hit) return { type: 'exact', section: hit };
  hit = inFile.find(s => s.title.startsWith(match));
  if (hit) return { type: 'prefix', section: hit };
  hit = inFile.find(s => s.title.includes(match));
  if (hit) return { type: 'contains', section: hit };
  const stripped = match.replace(/^[A-Za-z0-9\-]+】\s*/, '');
  if (stripped !== match && stripped.length > 0) {
    hit = inFile.find(s => s.title.includes(stripped));
    if (hit) return { type: 'stripped', section: hit };
  }
  hit = inFile.find(s => s.body && s.body.includes(match));
  if (hit) return { type: 'body', section: hit };
  return null;
}

// 全辞書セクション
const dictDir = path.join(__dirname, '..', 'dictionary');
const files = fs.readdirSync(dictDir).filter(f => f.endsWith('.md'));
const allSections = [];
for (const f of files) {
  const fileId = f.split('_')[0];
  const md = fs.readFileSync(path.join(dictDir, f), 'utf8');
  allSections.push(...splitSections(md, { id: fileId, name: f }));
}

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// === 1. SOLVE_DATA の related ===
const solveStart = html.indexOf('const SOLVE_DATA = {');
let depth = 0, i = solveStart + 'const SOLVE_DATA = '.length - 1, inStr = null;
for (; i < html.length; i++) {
  const c = html[i], p = html[i - 1];
  if (inStr) { if (c === inStr && p !== '\\') inStr = null; continue; }
  if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
  if (c === '/' && html[i + 1] === '/') { while (i < html.length && html[i] !== '\n') i++; continue; }
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
}
const solveBlock = html.slice(solveStart, i);

const lines = solveBlock.split('\n');
const solveRelated = [];
let curCat = null, curSym = null;
for (const l of lines) {
  const catMatch = l.match(/^        id:\s*'([a-z_0-9]+)',\s*icon:/);
  if (catMatch) { curCat = catMatch[1]; continue; }
  const symMatch = l.match(/^            id:\s*'([a-z_0-9]+)',\s*title:\s*'([^']+)'/);
  if (symMatch) { curSym = `${curCat}/${symMatch[1]}`; continue; }
  const relMatch = l.match(/\{\s*fileId:\s*'(\d+)',\s*match:\s*'([^']+)'\s*\}/);
  if (relMatch) solveRelated.push({ source: 'SOLVE.' + curSym, fileId: relMatch[1], match: relMatch[2] });
}

// === 2. DRILL_THEMES の items[].fileId / .match ===
const themesStart = html.indexOf('const DRILL_THEMES = ');
const themesEnd = (() => {
  let d = 0, j = themesStart + 'const DRILL_THEMES = '.length - 1, s = null;
  for (; j < html.length; j++) {
    const c = html[j], p = html[j - 1];
    if (s) { if (c === s && p !== '\\') s = null; continue; }
    if (c === "'" || c === '"' || c === '`') { s = c; continue; }
    if (c === '/' && html[j + 1] === '/') { while (j < html.length && html[j] !== '\n') j++; continue; }
    if (c === '[') d++;
    else if (c === ']') { d--; if (d === 0) { j++; break; } }
  }
  return j;
})();
const themesBlock = themesStart > 0 ? html.slice(themesStart, themesEnd) : '';
const planRelated = [];
if (themesBlock) {
  // 行ベース: { title: '...', minutes: N, fileId: '01', match: '...', desc: '...' }
  const pl = themesBlock.split('\n');
  let curTheme = null;
  for (const l of pl) {
    const themeMatch = l.match(/^  \{\s*id:\s*'([a-z_0-9]+)',\s*icon:\s*'[^']+',\s*label:\s*'([^']+)'/);
    if (themeMatch) { curTheme = themeMatch[2]; continue; }
    // ドリル行: { title: 'XXX', minutes: N, fileId: 'NN', match: 'YYY', desc: '...' }
    const drillMatch = l.match(/title:\s*'([^']+)',\s*minutes:\s*\d+,\s*fileId:\s*'(\d+)',\s*match:\s*'([^']+)'/);
    if (drillMatch) planRelated.push({ source: 'DRILL.' + (curTheme || '?') + '.' + drillMatch[1], fileId: drillMatch[2], match: drillMatch[3] });
  }
}

// === 3. QUESTIONS の hint等に含まれる辞書参照（後で必要なら）===
// ※QUESTIONS は直接辞書を参照しない（resultがjump）

console.log('=== SOLVE_DATA related ===');
console.log('Total:', solveRelated.length);
const solveBroken = [];
for (const r of solveRelated) {
  const result = findRelatedSection(allSections, r.fileId, r.match);
  if (!result) solveBroken.push(r);
}
console.log('Broken:', solveBroken.length);
solveBroken.forEach(b => console.log(`  [${b.source}] file ${b.fileId} match: "${b.match}"`));

console.log('\n=== PRACTICE_THEMES related ===');
console.log('Total:', planRelated.length);
const planBroken = [];
for (const r of planRelated) {
  const result = findRelatedSection(allSections, r.fileId, r.match);
  if (!result) planBroken.push(r);
}
console.log('Broken:', planBroken.length);
planBroken.forEach(b => console.log(`  [${b.source}] file ${b.fileId} match: "${b.match}"`));

// === 3. 解決の質（body match や汎用過ぎるmatchの抽出）===
console.log('\n=== Body-match (低品質マッチ：matchがタイトルになく本文だけで当たっている) ===');
const allRefs = [...solveRelated, ...planRelated];
const bodyMatches = [];
for (const r of allRefs) {
  const result = findRelatedSection(allSections, r.fileId, r.match);
  if (result && result.type === 'body') {
    bodyMatches.push({ src: r.source, fileId: r.fileId, match: r.match, hit: result.section.title });
  }
}
console.log('Total body-only matches:', bodyMatches.length);
bodyMatches.forEach(b => console.log(`  [${b.src}] file ${b.fileId} match "${b.match}" → ${b.hit}`));

console.log('\n=== DRILL: match別の解決先と所要時間 ===');
const drillSummary = {};
for (const r of planRelated) {
  const result = findRelatedSection(allSections, r.fileId, r.match);
  const k = `${r.fileId}/${r.match}`;
  drillSummary[k] = drillSummary[k] || { count: 0, hits: new Set() };
  drillSummary[k].count++;
  if (result) drillSummary[k].hits.add(result.section.title);
}
for (const [k, v] of Object.entries(drillSummary)) {
  if (v.count > 2 || v.hits.size === 0) {
    console.log(`  ${k} (${v.count}x) → ${[...v.hits].join(' / ') || 'NONE'}`);
  }
}
