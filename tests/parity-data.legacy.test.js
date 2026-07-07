// 新旧パリティ: 旧index.htmlのデータ定数 ＝ app/src/data/*.json（S2抽出の正しさを直接検証）
// 旧index.html削除（切替）時にこのテストも削除する。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { legacyConst, ROOT } from './helpers/legacy.js';
import { RESULTS as NEW_RESULTS_MERGED } from '../app/src/lib/content.js';

const PAIRS = [
  ['DICT_FILES', 'dictFiles.json'],
  ['GLOSSARY', 'glossary.json'],
  ['SOLVE_DATA', 'solve.json'],
  ['DRILL_THEMES', 'drillThemes.json'],
  ['POSITION_DRILL_VARIANTS', 'positionDrillVariants.json'],
  ['CHAT_SYNONYMS', 'chatSynonyms.json'],
  ['QUESTIONS', 'questions.json'],
  ['RESULTS', 'results.json'],
  ['GK_SELF_RESULTS', 'gkSelfResults.json'],
  ['PHYSICAL_RESULTS', 'physicalResults.json'],
  ['PHYSICAL_RESULTS_EXTRA', 'physicalResultsExtra.json'],
  ['OF_EXTRA_RESULTS', 'ofExtraResults.json'],
  ['DF_EXTRA_RESULTS', 'dfExtraResults.json'],
];

describe('データ定数パリティ（旧index.html vs data/*.json）', () => {
  for (const [name, file] of PAIRS) {
    it(`${name} = ${file}`, () => {
      const legacy = legacyConst(name);
      const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'src', 'data', file), 'utf8'));
      expect(json).toEqual(legacy);
    });
  }

  it('RESULTS（マージ後）: content.js = 旧Object.assign連鎖', () => {
    const legacyMerged = Object.assign(
      {},
      legacyConst('RESULTS'),
      legacyConst('GK_SELF_RESULTS'),
      legacyConst('PHYSICAL_RESULTS'),
      legacyConst('PHYSICAL_RESULTS_EXTRA'),
      legacyConst('OF_EXTRA_RESULTS'),
      legacyConst('DF_EXTRA_RESULTS'),
    );
    expect(NEW_RESULTS_MERGED).toEqual(legacyMerged);
  });
});
