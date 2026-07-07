#!/usr/bin/env node
// Phase 1 S2: index.html (v0b1e1d8) を app/src/ のモジュール群へ機械分割する一回性スクリプト。
// - データ定数: 行範囲でスライス → eval → JSON.stringify で data/*.json へ
// - コード: 行範囲スライスをそのまま lib/*.js, components/*.jsx, App.jsx へ
// - import文: 所有シンボル表 + \bシンボル\b 走査で自動生成（過剰importは無害、ビルドで検出可能）
'use strict';
const fs = require('fs');
const path = require('path');

const REPO = 'C:/Users/togan1080/handball-system';
const SRC = path.join(REPO, 'app', 'src');
const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const L = html.split('\n'); // 1-based access via slice helper

// 1-based inclusive
const lines = (a, b) => L.slice(a - 1, b).join('\n');

// ---------- 1. データ定数 → JSON ----------
const DATA_BLOCKS = [
  { name: 'DICT_FILES',             file: 'dictFiles.json',             a: 1416, b: 1452 },
  { name: 'GLOSSARY',               file: 'glossary.json',              a: 1463, b: 1891 },
  { name: 'SOLVE_DATA',             file: 'solve.json',                 a: 1905, b: 3745 },
  { name: 'DRILL_THEMES',           file: 'drillThemes.json',           a: 3746, b: 4296 },
  { name: 'POSITION_DRILL_VARIANTS',file: 'positionDrillVariants.json', a: 4342, b: 4884 },
  { name: 'CHAT_SYNONYMS',          file: 'chatSynonyms.json',          a: 5259, b: 5334 },
  { name: 'QUESTIONS',              file: 'questions.json',             a: 5544, b: 6642 },
  { name: 'RESULTS',                file: 'results.json',               a: 6643, b: 7392 },
  { name: 'GK_SELF_RESULTS',        file: 'gkSelfResults.json',         a: 7393, b: 7584 },
  { name: 'PHYSICAL_RESULTS',       file: 'physicalResults.json',       a: 7590, b: 7960 },
  { name: 'PHYSICAL_RESULTS_EXTRA', file: 'physicalResultsExtra.json',  a: 7966, b: 8362 },
  { name: 'OF_EXTRA_RESULTS',       file: 'ofExtraResults.json',        a: 8368, b: 8506 },
  { name: 'DF_EXTRA_RESULTS',       file: 'dfExtraResults.json',        a: 8509, b: 8555 },
];

fs.mkdirSync(path.join(SRC, 'data'), { recursive: true });
fs.mkdirSync(path.join(SRC, 'lib'), { recursive: true });
fs.mkdirSync(path.join(SRC, 'components'), { recursive: true });

const jsonOwner = {}; // sym -> json relative path
for (const blk of DATA_BLOCKS) {
  const src = lines(blk.a, blk.b);
  if (!new RegExp('^const ' + blk.name + ' [=]').test(src)) throw new Error('境界不一致: ' + blk.name);
  const val = new Function(src + '\nreturn ' + blk.name + ';')();
  const json = JSON.stringify(val, null, 2) + '\n';
  // 往復検証: JSON化して情報が落ちないこと
  const back = JSON.parse(json);
  if (JSON.stringify(back) !== JSON.stringify(val)) throw new Error('JSON往復不一致: ' + blk.name);
  fs.writeFileSync(path.join(SRC, 'data', blk.file), json);
  jsonOwner[blk.name] = './data/' + blk.file;
  console.log(`data/${blk.file}  ${(Buffer.byteLength(json) / 1024).toFixed(0)}KB`);
}

// ---------- 2. CSS ----------
fs.writeFileSync(path.join(SRC, 'styles.css'), lines(29, 1405) + '\n');
console.log('styles.css OK');

// ---------- 3. コードモジュール ----------
// owner表: シンボル -> モジュール相対パス（src基準）
const MODULES = [
  {
    file: 'lib/dict.js',
    jsonImports: [['DICT_FILES', 'dictFiles.json'], ['GLOSSARY', 'glossary.json']],
    slices: [[1453, 1462], [5164, 5222]],
    exports: ['DICT_FILES', 'GLOSSARY', 'ALL_TAGS', 'DICT_SECTION_COUNT', 'splitSections'],
  },
  {
    file: 'lib/markdown.js',
    jsonImports: [],
    slices: [[4963, 5163]],
    exports: ['escapeHtml', 'highlightInHtml', 'getGlossaryDecorator', 'decorateGlossary', 'renderMarkdown'],
  },
  {
    file: 'lib/appData.js',
    jsonImports: [],
    slices: [[1892, 1904], [8558, 8714]],
    exports: ['FEINT_LEGEND', 'AXIS_MAP', 'axisStyle', 'MODES', 'getProgress', 'HUB_MODULES'],
  },
  {
    file: 'lib/content.js',
    jsonImports: [
      ['SOLVE_DATA', 'solve.json'], ['QUESTIONS', 'questions.json'], ['RESULTS', 'results.json'],
      ['GK_SELF_RESULTS', 'gkSelfResults.json'], ['PHYSICAL_RESULTS', 'physicalResults.json'],
      ['PHYSICAL_RESULTS_EXTRA', 'physicalResultsExtra.json'], ['OF_EXTRA_RESULTS', 'ofExtraResults.json'],
      ['DF_EXTRA_RESULTS', 'dfExtraResults.json'],
    ],
    slices: [],
    prelude: [
      '// 原本 index.html 7585/7961/8363/8507/8556 行の Object.assign を集約（順序維持＝後勝ち）',
      'Object.assign(RESULTS, GK_SELF_RESULTS, PHYSICAL_RESULTS, PHYSICAL_RESULTS_EXTRA, OF_EXTRA_RESULTS, DF_EXTRA_RESULTS);',
    ].join('\n'),
    exports: ['SOLVE_DATA', 'QUESTIONS', 'RESULTS', 'GK_SELF_RESULTS', 'PHYSICAL_RESULTS',
      'PHYSICAL_RESULTS_EXTRA', 'OF_EXTRA_RESULTS', 'DF_EXTRA_RESULTS'],
  },
  {
    file: 'lib/plan.js',
    jsonImports: [['DRILL_THEMES', 'drillThemes.json'], ['POSITION_DRILL_VARIANTS', 'positionDrillVariants.json']],
    slices: [[4298, 4341], [4885, 4962]],
    exports: ['DRILL_THEMES', 'POSITION_DRILL_VARIANTS', 'POSITIONS', 'POSITION_RECOMMENDED',
      'DRILL_WARMUP', 'DRILL_COOLDOWN', 'LEVELS', 'DURATIONS', 'buildPlan'],
  },
  {
    file: 'lib/chat.js',
    jsonImports: [['CHAT_SYNONYMS', 'chatSynonyms.json']],
    slices: [[5223, 5258], [5335, 5543]],
    exports: ['chatNormalize', 'chatIsAsciiKey', 'chatHasTerm', 'chatCountTerm', 'CHAT_SYNONYMS',
      'CHAT_STOPWORDS', 'CHAT_NOISE_RE', 'chatLexicon', 'CHAT_BODY_CHARS', 'chatExtractKeywords',
      'chatNBody', 'chatIsStub', 'CHAT_EXCLUDED_FILES', 'chatSearch', 'chatBestExcerpt',
      'CHAT_SUGGESTIONS', 'buildChatReply'],
  },
  {
    file: 'lib/storage.js',
    jsonImports: [],
    slices: [[8715, 8752]],
    exports: ['STORAGE_VERSION', 'STORAGE_PREFIX', 'lsGet', 'lsSet', 'lsRemove'],
  },
  {
    file: 'lib/tb.js',
    jsonImports: [],
    slices: [[8770, 8847]],
    exports: ['TB_CONSTRAINTS', 'TB_COGNITION_OPTS', 'TB_Q0_TARGETS', 'TB_CHECKS', 'TB_NEXT_MOVE_MAP',
      'tbJudgeRow', 'tbTaskToCardText', 'tbExportAllText'],
  },
  {
    file: 'lib/gk.js',
    jsonImports: [],
    slices: [[9198, 9303], [9715, 9728]],
    exports: ['GK_SITUATIONS', 'GK_COURSES', 'gkSituationLabel', 'gkCourseLabel', 'gkDateStr',
      'gkWeekStart', 'gkFmtDate', 'gkCalcTendencies', 'gkStats', 'gkWeeklySeries',
      'gkExportWeekText', 'gkBaselineCompare'],
  },
  {
    file: 'lib/pv.js',
    jsonImports: [],
    slices: [[9546, 9642]],
    exports: ['PV_TYPES', 'PV_AXIS1', 'PV_AXIS2', 'PV_CUES', 'PV_RESULTS', 'pvTypeLabel',
      'pvResultLabel', 'pvAxisLabel', 'pvCalcTypeDist', 'pvNonBlockRate', 'pvCrossTypeResult',
      'pvExportWeekText'],
  },
  {
    file: 'lib/backup.js',
    jsonImports: [],
    slices: [[9643, 9714]],
    exports: ['collectAllData', 'mergeExtraKey', 'buildBackupText', 'mergeById', 'mergeBackup'],
  },
  {
    file: 'components/GText.jsx',
    jsonImports: [],
    slices: [[8753, 8769]],
    exports: ['GText'],
  },
  {
    file: 'components/tb.jsx',
    jsonImports: [],
    slices: [[8848, 9197]],
    exports: ['tbCopy', 'TBHome', 'TBWizard', 'TBTaskDetail'],
  },
  {
    file: 'components/gk.jsx',
    jsonImports: [],
    slices: [[9304, 9545]],
    exports: ['GKRecordWizard', 'GKHome'],
  },
  {
    file: 'components/pv.jsx',
    jsonImports: [],
    slices: [[9729, 9938]],
    exports: ['PVRecordWizard', 'PVHome'],
  },
  {
    file: 'App.jsx',
    jsonImports: [],
    slices: [[9939, 12348]],
    exports: [],
    defaultExport: 'App',
  },
];

// owner表を構築
const owner = {};
for (const m of MODULES) {
  for (const s of m.exports) owner[s] = m.file;
  // defaultExport(App)はmain.jsxだけが使う。コメント中の"App"誤検出で循環を作るため走査対象にしない
}

const HOOKS = ['useState', 'useEffect', 'useMemo', 'useRef', 'useCallback', 'useContext'];

function relImport(fromFile, toFile) {
  let rel = path.posix.relative(path.posix.dirname('src/' + fromFile), 'src/' + toFile);
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

const crossRefs = [];
for (const m of MODULES) {
  const body = [m.slices.map(([a, b]) => lines(a, b)).join('\n\n'), m.prelude || ''].filter(Boolean).join('\n\n');
  const localSyms = new Set([...m.exports, m.defaultExport].filter(Boolean));
  // 外部シンボル走査
  const needs = {}; // ownerFile -> [syms]
  for (const [sym, ownFile] of Object.entries(owner)) {
    if (ownFile === m.file || localSyms.has(sym)) continue;
    if (new RegExp('\\b' + sym + '\\b').test(body)) {
      (needs[ownFile] ||= []).push(sym);
      crossRefs.push(`${m.file} <- ${sym} (${ownFile})`);
    }
  }
  // reactインポート
  const usedHooks = HOOKS.filter(h => new RegExp('\\b' + h + '\\s*\\(').test(body));
  const usesReactNs = /\bReact\./.test(body);
  const header = [];
  header.push(`// このファイルは index.html（Phase 0版）から Phase 1 S2 で機械分割された。`);
  header.push(`// 由来行: ${m.slices.map(([a, b]) => `${a}-${b}`).join(', ') || '(JSON集約のみ)'}`);
  if (usedHooks.length || usesReactNs) {
    const named = usedHooks.length ? `{ ${usedHooks.join(', ')} }` : '';
    if (usesReactNs && named) header.push(`import React, ${named} from 'react';`);
    else if (usesReactNs) header.push(`import React from 'react';`);
    else header.push(`import ${named} from 'react';`);
  }
  for (const [sym, jf] of m.jsonImports) {
    header.push(`import ${sym} from '${relImport(m.file, 'data/' + jf)}';`);
  }
  for (const [ownFile, syms] of Object.entries(needs)) {
    header.push(`import { ${syms.sort().join(', ')} } from '${relImport(m.file, ownFile)}';`);
  }
  const exportLine = m.exports.length ? `\nexport { ${m.exports.join(', ')} };\n` : '';
  const defaultLine = m.defaultExport ? `\nexport default ${m.defaultExport};\n` : '';
  const out = header.join('\n') + '\n\n' + body + '\n' + exportLine + defaultLine;
  fs.writeFileSync(path.join(SRC, m.file), out);
  console.log(`${m.file}  ${(Buffer.byteLength(out) / 1024).toFixed(0)}KB  imports:[${Object.values(needs).flat().length}] hooks:[${usedHooks.join(',')}]`);
}

console.log('\n--- クロス参照（循環チェック用） ---');
// 循環検出
const edges = {};
for (const r of crossRefs) {
  const [from, rest] = r.split(' <- ');
  const to = rest.match(/\(([^)]+)\)/)[1];
  (edges[from] ||= new Set()).add(to);
}
function findCycle(start, node, visited, stack) {
  for (const nxt of edges[node] || []) {
    if (nxt === start) return [...stack, nxt];
    if (!visited.has(nxt)) { visited.add(nxt); const c = findCycle(start, nxt, visited, [...stack, nxt]); if (c) return c; }
  }
  return null;
}
let cycles = 0;
for (const n of Object.keys(edges)) {
  const c = findCycle(n, n, new Set([n]), [n]);
  if (c) { console.log('循環: ' + c.join(' -> ')); cycles++; }
}
console.log(cycles ? `⚠ 循環 ${cycles}件` : '循環なし');
