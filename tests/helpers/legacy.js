// 旧 index.html（Phase 0版・並走中は凍結）から実コードを抽出してサンドボックス評価するヘルパー。
// 新モジュール（app/src/）との「新旧パリティテスト」専用。切替（旧index.html削除）時にこのヘルパーと
// *.legacy.test.js は一緒に削除する。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

export function slice(startAnchor, endAnchor) {
  const s = html.indexOf(startAnchor);
  if (s < 0) throw new Error('anchor not found: ' + startAnchor);
  const e = html.indexOf(endAnchor, s + startAnchor.length);
  if (e < 0) throw new Error('end anchor not found: ' + endAnchor);
  return html.slice(s, e);
}

// データ定数ブロックの終端アンカー（開始は `const NAME = `）
const CONST_END = {
  DICT_FILES: '\nconst ALL_TAGS',
  GLOSSARY: '\nconst FEINT_LEGEND',
  SOLVE_DATA: '\nconst DRILL_THEMES',
  DRILL_THEMES: '\n// drillTypeを自動付与',
  POSITION_DRILL_VARIANTS: '\nconst DRILL_WARMUP',
  CHAT_SYNONYMS: '\nconst CHAT_STOPWORDS',
  QUESTIONS: '\nconst RESULTS',
  RESULTS: '\nconst GK_SELF_RESULTS',
  GK_SELF_RESULTS: '\nObject.assign(RESULTS, GK_SELF_RESULTS);',
  PHYSICAL_RESULTS: '\nObject.assign(RESULTS, PHYSICAL_RESULTS);',
  PHYSICAL_RESULTS_EXTRA: '\nObject.assign(RESULTS, PHYSICAL_RESULTS_EXTRA);',
  OF_EXTRA_RESULTS: '\nObject.assign(RESULTS, OF_EXTRA_RESULTS);',
  DF_EXTRA_RESULTS: '\nObject.assign(RESULTS, DF_EXTRA_RESULTS);',
};

export function legacyConst(name) {
  const end = CONST_END[name];
  if (!end) throw new Error('unknown const: ' + name);
  const src = slice(`const ${name} = `, end);
  return new Function(`${src}\nreturn ${name};`)();
}

export function legacyConstNames() {
  return Object.keys(CONST_END);
}

// 実機チャットロジック（chat_battery.js と同方式）
export function legacyChat() {
  const dictFilesSrc = slice('const DICT_FILES = [', '\n];') + '\n];';
  const glossarySrc = slice('const GLOSSARY = [', '\n];') + '\n];';
  const chatSrc = slice('function splitSections(md, fileMeta) {', 'function chatBestExcerpt');
  const factory = `
${dictFilesSrc}
const ALL_TAGS = Array.from(new Set(DICT_FILES.flatMap(f => f.tags))).sort();
${glossarySrc}
${chatSrc}
return { splitSections, chatSearch, chatExtractKeywords, DICT_FILES };
`;
  return new Function(factory)();
}

// GK/PV/TB集計・バックアップマージの実機ロジック
export function legacyCalc() {
  const gkSrc = slice('const GK_SITUATIONS = [', 'function GKRecordWizard');
  const pvSrc = slice('const PV_TYPES = [', 'function collectAllData');
  const backupSrc = slice('function mergeExtraKey(curVal, impVal) {', 'function PVRecordWizard');
  const tbSrc = slice('const TB_CONSTRAINTS = [', 'function tbCopy');
  const factory = `
${gkSrc}
${pvSrc}
${backupSrc}
${tbSrc}
return { gkCalcTendencies, gkStats, gkWeeklySeries, gkExportWeekText, gkBaselineCompare, gkWeekStart,
         pvCalcTypeDist, pvNonBlockRate, pvCrossTypeResult, pvExportWeekText,
         mergeExtraKey, mergeById, mergeBackup,
         tbJudgeRow, tbTaskToCardText, tbExportAllText };
`;
  return new Function(factory)();
}

// 練習プラン生成の実機ロジック（DRILL_THEMES＋drillType自動付与IIFE＋buildPlanを含む）
export function legacyPlan() {
  const src = slice('const DRILL_THEMES = [', '\nfunction escapeHtml');
  const factory = `
${src}
return { buildPlan, DRILL_THEMES, LEVELS, DURATIONS, POSITIONS };
`;
  return new Function(factory)();
}

// 辞書33ファイルを読み込んで sections を構築（splitSections は呼び出し側の実装を使う）
export function buildSections(splitSections, dictFiles) {
  const sections = [];
  for (const fm of dictFiles) {
    const p = path.join(ROOT, 'dictionary', fm.name);
    if (!fs.existsSync(p)) continue;
    sections.push(...splitSections(fs.readFileSync(p, 'utf8'), fm));
  }
  return sections;
}
