#!/usr/bin/env node
// RESULTS 系（複数）の完備性監査
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const RESULT_VAR_NAMES = [
  'RESULTS',
  'GK_SELF_RESULTS',
  'PHYSICAL_RESULTS',
  'PHYSICAL_RESULTS_EXTRA',
  'OF_EXTRA_RESULTS',
  'DF_EXTRA_RESULTS',
];

// ブロック単位抽出
function extractObjectBlock(html, marker) {
  const startIdx = html.indexOf(marker);
  if (startIdx < 0) return null;
  let depth = 0, i = startIdx + marker.length - 1, inStr = null;
  for (; i < html.length; i++) {
    const c = html[i], p = html[i - 1];
    if (inStr) { if (c === inStr && p !== '\\') inStr = null; continue; }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '/' && html[i + 1] === '/') { while (i < html.length && html[i] !== '\n') i++; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return html.slice(startIdx, i);
}

const allIssues = [];
let totalEntries = 0;

for (const name of RESULT_VAR_NAMES) {
  const block = extractObjectBlock(html, `const ${name} = {`);
  if (!block) { console.warn(`SKIP: ${name} not found`); continue; }

  // エントリ分割: 各エントリは行頭2-4 spaces + `r_xxx: {` または `r_xxx_yyy: {`
  const lines = block.split('\n');
  const entries = []; // {id, body}
  let curId = null, curStart = -1;
  for (let li = 0; li < lines.length; li++) {
    const l = lines[li];
    const m = l.match(/^  ([a-z_0-9]+):\s*\{/);
    if (m) {
      if (curId) entries.push({ id: curId, body: lines.slice(curStart, li).join('\n') });
      curId = m[1];
      curStart = li;
    }
  }
  if (curId) entries.push({ id: curId, body: lines.slice(curStart).join('\n') });

  console.log(`\n=== ${name}: ${entries.length} entries ===`);
  totalEntries += entries.length;

  const issues = { noGood: [], noIssue: [], noBody: [], noImprove: [], noApproaches: [], emptyApproaches: [] };
  for (const e of entries) {
    const hasField = (key) => {
      const re = new RegExp(`${key}:\\s*(?:'[^']*'|"[^"]*"|\`[^\`]*\`)`);
      const m = e.body.match(re);
      return m && m[0].length > key.length + 4;
    };
    if (!hasField('good')) issues.noGood.push(e.id);
    if (!hasField('issue')) issues.noIssue.push(e.id);
    if (!hasField('body')) issues.noBody.push(e.id);
    if (!hasField('improve')) issues.noImprove.push(e.id);
    // approaches: [ ... ]
    const approachMatch = e.body.match(/approaches:\s*\[([\s\S]*?)\]/);
    if (!approachMatch) issues.noApproaches.push(e.id);
    else {
      const items = [...approachMatch[1].matchAll(/\{\s*tag:/g)];
      if (items.length === 0) issues.emptyApproaches.push(e.id);
    }
  }

  for (const [key, list] of Object.entries(issues)) {
    if (list.length > 0) {
      const issueObj = { name, field: key, count: list.length, samples: list.slice(0, 5) };
      allIssues.push(issueObj);
      console.log(`  ${key}: ${list.length}件 — sample: ${list.slice(0, 5).join(', ')}`);
    }
  }
  if (Object.values(issues).every(l => l.length === 0)) {
    console.log('  ✅ 全件完備');
  }
}

console.log(`\n=== 総合 ===`);
console.log(`Total RESULTS entries: ${totalEntries}`);
if (allIssues.length > 0) {
  console.error(`\n❌ FAIL: ${allIssues.length} 種類の欠落あり`);
  process.exit(1);
}
console.log('\n✅ OK: 全 RESULTS が必須フィールド（good/issue/body/improve/approaches）を充足');
process.exit(0);
