#!/usr/bin/env node
// 批判担当：データ整合性監査
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const dictFiles = fs.readdirSync('dictionary').filter(f => f.endsWith('.md')).map(f => f.replace('.md', '').split('_')[0]);
console.log('Dict files on disk:', dictFiles.sort());

// 1) DICT_FILES に登録されている全 fileId
const dictFilesMatch = html.match(/const DICT_FILES = \[[\s\S]*?\n\];/);
const registeredIds = [...dictFilesMatch[0].matchAll(/id:\s*'(\d+)'/g)].map(m => m[1]);
console.log('Registered in DICT_FILES:', registeredIds.length, 'IDs:', registeredIds.sort());
const diskSet = new Set(dictFiles);
const regSet = new Set(registeredIds);
console.log('  On disk but not registered:', dictFiles.filter(f => !regSet.has(f)));
console.log('  Registered but not on disk:', registeredIds.filter(f => !diskSet.has(f)));

// 2) SOLVE_DATA の related で参照される fileId が全て存在するか
const solveBlock = html.match(/const SOLVE_DATA[\s\S]*?coach:\s*{[\s\S]*?\n  },?\n\};/)?.[0] || '';
const relatedFileIds = [...solveBlock.matchAll(/fileId:\s*'(\d+)'/g)].map(m => m[1]);
const uniqueRelated = [...new Set(relatedFileIds)];
console.log('\nSOLVE_DATA references:', uniqueRelated.length, 'unique fileIds');
const missingDict = uniqueRelated.filter(id => !regSet.has(id));
console.log('  Referenced but not in DICT_FILES:', missingDict);

// 3) QUESTIONS の全 next: が QUESTIONS or RESULTS で resolve するか
const qBlock = html.match(/const QUESTIONS = \{[\s\S]*?\n\};/)?.[0] || '';
const qIds = [...qBlock.matchAll(/^  ([a-z_][a-z0-9_]*):\s*\{/gm)].map(m => m[1]);
const qSet = new Set(qIds);
// All result keys (start with r_)
const rIds = [...html.matchAll(/^  (r[_a-z0-9]+):\s*\{\s*good:/gm)].map(m => m[1]);
const rSet = new Set(rIds);
const allNexts = [...qBlock.matchAll(/next:\s*'([^']+)'/g)].map(m => m[1]);
const unique = [...new Set(allNexts)];
const broken = unique.filter(n => !qSet.has(n) && !rSet.has(n));
console.log('\nQUESTIONS next refs:', unique.length, 'unique, broken:', broken.length);
if (broken.length) console.log('  Broken:', broken);

// 4) RESULT_TO_SYMPTOM 内の参照が SOLVE_DATA に実在するか
const r2sBlock = html.match(/const RESULT_TO_SYMPTOM = \{[\s\S]*?\n  \};/)?.[0] || '';
const r2sEntries = [...r2sBlock.matchAll(/'(r_[^']+)':\s*\{\s*role:\s*'([^']+)',\s*category:\s*'([^']+)',\s*symptom:\s*'([^']+)'/g)];
console.log('\nRESULT_TO_SYMPTOM entries:', r2sEntries.length);
const symRefIssues = [];
for (const [, rid, role, cat, sym] of r2sEntries) {
  // result_id exists in RESULTS?
  if (!rSet.has(rid)) symRefIssues.push(`Result missing: ${rid}`);
  // role/category/symptom resolvable?
  const catBlock = solveBlock.match(new RegExp("id:\\s*'" + cat + "'[\\s\\S]*?symptoms:\\s*\\["));
  if (!catBlock) { symRefIssues.push(`Category not found: ${role}/${cat} (for ${rid})`); continue; }
  // Find symptom id - rough check
  const symPattern = new RegExp("id:\\s*'" + sym + "'");
  if (!symPattern.test(solveBlock)) symRefIssues.push(`Symptom not found: ${role}/${cat}/${sym} (for ${rid})`);
}
console.log('  Issues:', symRefIssues.length);
if (symRefIssues.length) symRefIssues.forEach(i => console.log('   -', i));

// 5) AXIS_MAP の全エントリが QUESTIONS に存在するか
const axisBlock = html.match(/const AXIS_MAP = \{[\s\S]*?\n\};/)?.[0] || '';
const axisIds = [...axisBlock.matchAll(/^  ([a-z_][a-z0-9_]*):\s*'/gm)].map(m => m[1]);
const orphanAxis = axisIds.filter(a => !qSet.has(a));
console.log('\nAXIS_MAP entries:', axisIds.length, 'orphan (no matching Q):', orphanAxis.length);
if (orphanAxis.length) console.log('  Orphans:', orphanAxis.slice(0, 10));

// 6) MODE_TO_SOLVE / RESULT_TO_SYMPTOM 重複あれば指摘
console.log('\n--- Summary ---');
console.log('Total QUESTIONS:', qIds.length);
console.log('Total RESULTS:', rIds.length);
console.log('Total dict files:', dictFiles.length);
