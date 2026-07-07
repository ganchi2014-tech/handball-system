// 新旧パリティ: GK/PV/TB集計・mergeBackup・buildPlan が旧index.htmlと完全一致すること。切替時に削除。
import { describe, it, expect } from 'vitest';
import * as gk from '../app/src/lib/gk.js';
import * as pv from '../app/src/lib/pv.js';
import * as tb from '../app/src/lib/tb.js';
import { mergeExtraKey, mergeById, mergeBackup } from '../app/src/lib/backup.js';
import { buildPlan, DRILL_THEMES, LEVELS, DURATIONS, POSITIONS } from '../app/src/lib/plan.js';
import { legacyCalc, legacyPlan } from './helpers/legacy.js';

const L = legacyCalc();
const LP = legacyPlan();

// 決定論的疑似乱数（LCG）
function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

function makeGkPreds(n, seed) {
  const rnd = lcg(seed);
  const gks = ['山田', '井上'], shooters = ['田中', '佐藤', '鈴木', '高橋'];
  const situations = ['backcourt', 'side', '7m'], courses = ['TL', 'TR', 'ML', 'MR', 'BL', 'BR'];
  const dates = ['2026-06-15', '2026-06-17', '2026-06-22', '2026-06-24', '2026-06-29', '2026-07-01', '2026-07-06'];
  return Array.from({ length: n }, (_, i) => ({
    id: 'p' + i, gk: pick(rnd, gks), shooter: pick(rnd, shooters),
    situation: pick(rnd, situations), course: pick(rnd, courses),
    hit: rnd() < 0.4, date: pick(rnd, dates), ts: 1780000000000 + i * 1000,
    cue: rnd() < 0.3 ? '肩の向き' : '',
  }));
}

function makePvRecords(n, seed) {
  const rnd = lcg(seed);
  const pivots = ['中村', '小林'], types = ['1a', '1b', '2a', '2b', '3'];
  const results = ['break', 'stopped', 'rereceive'];
  const dates = ['2026-06-22', '2026-06-24', '2026-06-29', '2026-07-01', '2026-07-06'];
  return Array.from({ length: n }, (_, i) => ({
    id: 'v' + i, pivot: pick(rnd, pivots), type: pick(rnd, types), result: pick(rnd, results),
    axis1: pick(rnd, ['ball', 'self']), axis2: pick(rnd, ['man', 'space']),
    cues: rnd() < 0.5 ? ['df-weight'] : ['passer', 'holder'],
    predict: rnd() < 0.3 ? '表を取る' : '', date: pick(rnd, dates), ts: 1780000000000 + i * 1000,
  }));
}

describe('GK集計パリティ', () => {
  const preds = makeGkPreds(120, 42);
  it('gkCalcTendencies / gkStats / gkWeeklySeries / gkBaselineCompare', () => {
    expect(gk.gkCalcTendencies(preds)).toEqual(L.gkCalcTendencies(preds));
    expect(gk.gkStats(preds)).toEqual(L.gkStats(preds));
    for (const g of ['山田', '井上']) {
      expect(gk.gkWeeklySeries(preds, g)).toEqual(L.gkWeeklySeries(preds, g));
      expect(gk.gkBaselineCompare(preds, g)).toEqual(L.gkBaselineCompare(preds, g));
    }
  });
  it('gkExportWeekText（週指定）', () => {
    for (const ws of ['2026-06-15', '2026-06-22', '2026-06-29', '2026-07-06']) {
      expect(gk.gkExportWeekText(preds, ws)).toBe(L.gkExportWeekText(preds, ws));
    }
  });
  it('空配列・全不的中の縁ケース', () => {
    expect(gk.gkStats([])).toEqual(L.gkStats([]));
    const miss = makeGkPreds(10, 7).map(p => ({ ...p, hit: false }));
    expect(gk.gkCalcTendencies(miss)).toEqual(L.gkCalcTendencies(miss));
  });
});

describe('PV集計パリティ', () => {
  const recs = makePvRecords(80, 43);
  it('pvCalcTypeDist / pvNonBlockRate / pvCrossTypeResult', () => {
    expect(pv.pvCalcTypeDist(recs)).toEqual(L.pvCalcTypeDist(recs));
    expect(pv.pvNonBlockRate(recs)).toBe(L.pvNonBlockRate(recs));
    expect(pv.pvNonBlockRate([])).toBe(L.pvNonBlockRate([]));
    expect(pv.pvCrossTypeResult(recs)).toEqual(L.pvCrossTypeResult(recs));
  });
  it('pvExportWeekText（週指定）', () => {
    for (const ws of ['2026-06-22', '2026-06-29', '2026-07-06']) {
      expect(pv.pvExportWeekText(recs, ws)).toBe(L.pvExportWeekText(recs, ws));
    }
  });
});

describe('TB判定パリティ', () => {
  it('tbJudgeRow 全域', () => {
    for (const rate of [0, 0.3, 0.49, 0.5, 0.7, 0.8, 0.81, 1]) {
      for (const sol of [1, 2, 3]) {
        expect(tb.tbJudgeRow(rate, sol)).toBe(L.tbJudgeRow(rate, sol));
      }
    }
  });
  it('tbTaskToCardText / tbExportAllText', () => {
    const task = {
      id: 't1', name: '受け前の逆サイド認知', version: 2, constraintId: 'score',
      cognition: ['Far（遠い展開先）が見えていなかった'], cognitionNote: '声も出ていない',
      constraintDetail: '逆サイド展開からの得点は2点', attempts: 10,
      successResult: '10本中6本で逆サイドへ展開', successProcess: '受ける前に首を振って指差し',
      q0Targets: ['重心', '連結'], q0Note: 'DFのカバー位置が変わる', overrideReason: '',
      sessions: [{ date: '2026-07-01', success: 6, solutions: 2 }],
    };
    expect(tb.tbTaskToCardText(task)).toBe(L.tbTaskToCardText(task));
    expect(tb.tbExportAllText([task]).split('\n').slice(2).join('\n'))
      .toBe(L.tbExportAllText([task]).split('\n').slice(2).join('\n')); // 1-2行目は現在時刻を含むため除外
  });
});

describe('mergeBackupパリティ', () => {
  const current = {
    gkPreds: makeGkPreds(20, 50),
    pvRecords: makePvRecords(15, 51),
    tbTasks: [{ id: 't1', name: 'A' }],
    gkPlayers: { keepers: ['山田'], shooters: ['田中', '佐藤'] },
    pvPlayers: { pivots: ['中村'] },
  };
  const backup = JSON.stringify({
    app: 'handball-lab-backup', v: 1, exportedAt: 'x',
    data: {
      gk_predictions: makeGkPreds(30, 52),   // 一部IDが重複（p0..p19）→スキップされる
      pv_records: makePvRecords(25, 53),
      'tb-tasks': [{ id: 't1', name: 'A' }, { id: 't2', name: 'B' }],
      gk_players: { keepers: ['山田', '大野'], shooters: ['佐藤'] },
      pv_players: { pivots: ['中村', '小林'] },
    },
  });
  it('マージ結果・追加件数が一致', () => {
    expect(mergeBackup(current, backup)).toEqual(L.mergeBackup(current, backup));
  });
  it('不正入力は同じメッセージで失敗', () => {
    for (const bad of ['not json', '{}', JSON.stringify({ app: 'other', data: {} })]) {
      let e1, e2;
      try { mergeBackup(current, bad); } catch (e) { e1 = e.message; }
      try { L.mergeBackup(current, bad); } catch (e) { e2 = e.message; }
      expect(e1).toBe(e2);
      expect(e1).toBeTruthy();
    }
  });
  it('mergeExtraKey / mergeById 単体', () => {
    const cases = [
      [['a'], ['a', 'b']],
      [[{ id: 1, x: 1 }], [{ id: 1, x: 9 }, { id: 2 }]],
      [null, ['a']], ['keep', 'imp'], [null, null], [{ k: 1 }, { k: 2 }],
    ];
    for (const [cur, imp] of cases) {
      expect(mergeExtraKey(cur, imp)).toEqual(L.mergeExtraKey(cur, imp));
    }
    expect(mergeById([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }, null]))
      .toEqual(L.mergeById([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }, null]));
  });
});

describe('buildPlanパリティ', () => {
  it('定数一致（DRILL_THEMES はdrillType自動付与後）', () => {
    expect(DRILL_THEMES).toEqual(LP.DRILL_THEMES);
    expect(LEVELS).toEqual(LP.LEVELS);
    expect(DURATIONS).toEqual(LP.DURATIONS);
    expect(POSITIONS).toEqual(LP.POSITIONS);
  });
  it('代表的な組合せでプラン完全一致', () => {
    const themeIds = DRILL_THEMES.map(t => t.id);
    const combos = [
      [[themeIds[0]], 'basic', 30, 'all'],
      [[themeIds[0]], 'mid', 60, 'all'],
      [[themeIds[0], themeIds[1]], 'adv', 90, 'all'],
      [[themeIds[2], themeIds[5], themeIds[8]], 'mid', 90, 'all'],
      [[themeIds[0]], 'mid', 60, 'gk'],
      [[themeIds[0], themeIds[3]], 'basic', 45, 'pivot'],
      [[themeIds[1]], 'adv', 60, 'back'],
    ];
    for (const [themes, lv, min, pos] of combos) {
      expect(buildPlan(themes, lv, min, pos)).toEqual(LP.buildPlan(themes, lv, min, pos));
    }
  });
});
