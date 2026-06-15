#!/usr/bin/env node
// consolidated_terms.json(surface→desc) と 統合結果(assignments/merges/drops/group_order)から
// index.html へ挿入する GLOSSARY 追加グループの JS リテラルを生成し、整合性を検査する。
const fs = require('fs');
const path = require('path');

const TASK_DIR = 'C:/Users/TOGAN1~1/AppData/Local/Temp/claude/C--Users-togan1080/be44c057-8d48-4546-83be-6718ed4d8aa8/tasks';
const consolidated = JSON.parse(fs.readFileSync(path.join(__dirname, 'consolidated_terms.json'), 'utf8'));
const integ = JSON.parse(fs.readFileSync(path.join(TASK_DIR, 'wg4ff7pdp.output'), 'utf8')).result;

const GROUPS = integ.groups;
const order = integ.group_order && integ.group_order.length === GROUPS.length ? integ.group_order : GROUPS.map((_, i) => i);

// desc 検索: surface 完全一致 → key一致
const bySurface = new Map(), byKey = new Map();
for (const t of consolidated) { bySurface.set(t.surface, t.desc); byKey.set(t.key, t.desc); }
function lookupDesc(surface) {
  if (bySurface.has(surface)) return bySurface.get(surface);
  const k = surface.replace(/[（(].*$/, '').trim();
  if (byKey.has(k)) return byKey.get(k);
  return null;
}

const warnings = [];

// マージで消える surface 集合
const mergedAway = new Set();
for (const m of (integ.merges || [])) for (const d of (m.drops || [])) mergedAway.add(d);
const dropped = new Set((integ.drops || []).map(d => d.surface));

// merge の keep が assignments にあるか検査
const assignedSurfaces = new Set(integ.assignments.map(a => a.surface));
for (const m of (integ.merges || [])) {
  if (!assignedSurfaces.has(m.keep) && !bySurface.has(m.keep) && !byKey.has(m.keep.replace(/[（(].*$/,'').trim())) {
    warnings.push(`merge.keep "${m.keep}" が assignments にもconsolidatedにも無い（概念喪失の恐れ）`);
  }
}

// グループ別にエントリを構築
const groupItems = GROUPS.map(() => []);
const seenKeys = new Set();
for (const a of integ.assignments) {
  if (dropped.has(a.surface) || mergedAway.has(a.surface)) continue; // 念のため
  const desc = lookupDesc(a.surface);
  if (!desc) { warnings.push(`desc未発見: "${a.surface}" (group ${a.group_index})`); continue; }
  const key = a.surface.replace(/[（(].*$/, '').trim();
  if (seenKeys.has(key)) { warnings.push(`重複キー(スキップ): "${a.surface}"`); continue; }
  seenKeys.add(key);
  if (a.group_index < 0 || a.group_index >= GROUPS.length) { warnings.push(`不正group_index ${a.group_index}: "${a.surface}"`); continue; }
  groupItems[a.group_index].push({ term: a.surface, desc });
}

// consolidated にあるが採用/マージ/ドロップどれにも無い孤児を検出
for (const t of consolidated) {
  if (seenKeys.has(t.key)) continue;
  if (dropped.has(t.surface) || mergedAway.has(t.surface)) continue;
  // マージ消滅側でkey一致も確認
  let inMerge = false;
  for (const d of mergedAway) if (d.replace(/[（(].*$/,'').trim() === t.key) inMerge = true;
  if (inMerge) continue;
  warnings.push(`孤児(どこにも分類されず): "${t.surface}"`);
}

// JS リテラル生成
function esc(s) { return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
let js = '';
let total = 0;
for (const gi of order) {
  const items = groupItems[gi];
  if (!items.length) continue;
  js += `  { group: '${esc(GROUPS[gi])}', items: [\n`;
  for (const it of items) {
    js += `    { term: '${esc(it.term)}', desc: '${esc(it.desc)}' },\n`;
    total++;
  }
  js += `  ]},\n`;
}

fs.writeFileSync(path.join(__dirname, '_glossary_additions.js'), js, 'utf8');
console.log('=== GLOSSARY追加ブロック生成 ===');
console.log('総エントリ数:', total);
console.log('グループ別:');
order.forEach(gi => { if (groupItems[gi].length) console.log(`  ${GROUPS[gi]}: ${groupItems[gi].length}`); });
console.log('\n=== 警告 (' + warnings.length + '件) ===');
warnings.forEach(w => console.log('  ⚠ ' + w));
console.log('\n書き出し: .scripts/_glossary_additions.js');
