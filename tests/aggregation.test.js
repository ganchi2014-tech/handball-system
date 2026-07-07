// GK/PV/TB集計・mergeBackup の期待値ベース単体テスト（旧index.html削除後も残る恒久テスト）。
// 選手に見せる数字の退行をここで検知する。
import { describe, it, expect } from 'vitest';
import { gkCalcTendencies, gkStats, gkWeeklySeries, gkWeekStart, gkBaselineCompare } from '../app/src/lib/gk.js';
import { pvCalcTypeDist, pvNonBlockRate, pvCrossTypeResult } from '../app/src/lib/pv.js';
import { tbJudgeRow } from '../app/src/lib/tb.js';
import { mergeBackup, mergeExtraKey } from '../app/src/lib/backup.js';
import { migrateReflectToCards } from '../app/src/lib/loop.js';

describe('gkWeekStart（週次集計の単位＝月曜起点）', () => {
  it('月曜はその日自身', () => expect(gkWeekStart('2026-07-06')).toBe('2026-07-06'));
  it('日曜は前の月曜', () => expect(gkWeekStart('2026-07-05')).toBe('2026-06-29'));
  it('火曜は当週月曜', () => expect(gkWeekStart('2026-07-07')).toBe('2026-07-06'));
});

describe('gkCalcTendencies（シューター傾向は的中記録のみから）', () => {
  const preds = [
    { shooter: '田中', course: 'TL', hit: true },
    { shooter: '田中', course: 'TL', hit: true },
    { shooter: '田中', course: 'BR', hit: false }, // 不的中は実コース不明→数えない
    { shooter: '佐藤', course: 'ML', hit: true },
  ];
  it('的中のみカウント', () => {
    expect(gkCalcTendencies(preds)).toEqual({ '田中': { TL: 2 }, '佐藤': { ML: 1 } });
  });
  it('全不的中なら空', () => {
    expect(gkCalcTendencies(preds.map(p => ({ ...p, hit: false })))).toEqual({});
  });
});

describe('gkStats（的中率）', () => {
  it('3/4 = 75%', () => {
    expect(gkStats([{ hit: true }, { hit: true }, { hit: true }, { hit: false }]))
      .toEqual({ total: 4, hits: 3, rate: 75 });
  });
  it('記録なしは rate=null（0%と区別）', () => {
    expect(gkStats([])).toEqual({ total: 0, hits: 0, rate: null });
  });
});

describe('gkWeeklySeries / gkBaselineCompare（第5週中間照合）', () => {
  const preds = [
    // 第1週（6/15〜）: 1/2 = 50%
    { gk: '山田', date: '2026-06-15', hit: true }, { gk: '山田', date: '2026-06-17', hit: false },
    // 第2週（6/22〜）: 0/2 = 0%
    { gk: '山田', date: '2026-06-22', hit: false }, { gk: '山田', date: '2026-06-24', hit: false },
    // 第3週（6/29〜）: 2/2 = 100%
    { gk: '山田', date: '2026-06-29', hit: true }, { gk: '山田', date: '2026-07-01', hit: true },
    // 別GKの記録は混ざらない
    { gk: '井上', date: '2026-06-29', hit: false },
  ];
  it('週開始日昇順に集計', () => {
    expect(gkWeeklySeries(preds, '山田')).toEqual([
      { week: '2026-06-15', total: 2, hits: 1, rate: 50 },
      { week: '2026-06-22', total: 2, hits: 0, rate: 0 },
      { week: '2026-06-29', total: 2, hits: 2, rate: 100 },
    ]);
  });
  it('基準期=最初の2週（1/4=25%）と直近週（100%）の差', () => {
    expect(gkBaselineCompare(preds, '山田'))
      .toEqual({ baseRate: 25, recentRate: 100, recentWeek: '2026-06-29', delta: 75 });
  });
  it('1週しかなければ比較不能（null）', () => {
    expect(gkBaselineCompare(preds.slice(0, 2), '山田')).toBeNull();
  });
});

describe('PV集計', () => {
  const recs = [
    { pivot: '中村', type: '1a', result: 'break' },
    { pivot: '中村', type: '1a', result: 'stopped' },
    { pivot: '中村', type: '2a', result: 'break' },
    { pivot: '中村', type: '3', result: 'rereceive' },
    { pivot: '小林', type: '1b', result: 'stopped' },
  ];
  it('類型選択分布（①偏重の可視化）', () => {
    expect(pvCalcTypeDist(recs)).toEqual({
      '中村': { '1a': 2, '2a': 1, '3': 1 },
      '小林': { '1b': 1 },
    });
  });
  it('②③選択率＝ブロック(1a/1b)以外の割合', () => {
    expect(pvNonBlockRate(recs)).toBe(40); // 2/5
    expect(pvNonBlockRate([])).toBeNull();
  });
  it('類型×結果クロス集計', () => {
    expect(pvCrossTypeResult(recs)['1a']).toEqual({ total: 2, break: 1, stopped: 1 });
    expect(pvCrossTypeResult(recs)['3']).toEqual({ total: 1, rereceive: 1 });
  });
});

describe('tbJudgeRow（成功率×解の数 → 次の一手マップ）', () => {
  it('5割未満は low', () => expect(tbJudgeRow(0.49, 3)).toBe('low'));
  it('8割超×複数解は hi-multi', () => expect(tbJudgeRow(0.81, 2)).toBe('hi-multi'));
  it('8割超×単一解は hi-one', () => expect(tbJudgeRow(0.9, 1)).toBe('hi-one'));
  it('70%帯×複数解は band-multi', () => expect(tbJudgeRow(0.7, 2)).toBe('band-multi'));
  it('境界: ちょうど0.5は band / ちょうど0.8も band', () => {
    expect(tbJudgeRow(0.5, 1)).toBe('band-one');
    expect(tbJudgeRow(0.8, 2)).toBe('band-multi');
  });
});

describe('mergeBackup（記録合流の安全性）', () => {
  const current = {
    gkPreds: [{ id: 'a', ts: 2 }],
    pvRecords: [],
    tbTasks: [{ id: 't1' }],
    gkPlayers: { keepers: ['山田'], shooters: ['田中'] },
    pvPlayers: { pivots: [] },
  };
  const mk = (data) => JSON.stringify({ app: 'handball-lab-backup', v: 1, data });

  it('既存IDはスキップ・新規のみ追加・ts降順維持', () => {
    const r = mergeBackup(current, mk({
      gk_predictions: [{ id: 'a', ts: 2 }, { id: 'b', ts: 5 }, { id: 'c', ts: 1 }],
    }));
    expect(r.gkPreds.map(p => p.id)).toEqual(['b', 'a', 'c']);
    expect(r.added.gk).toBe(2);
    expect(r.tbTasks).toEqual([{ id: 't1' }]);
  });
  it('選手名簿は和集合', () => {
    const r = mergeBackup(current, mk({
      gk_players: { keepers: ['山田', '大野'], shooters: [] },
      pv_players: { pivots: ['中村'] },
    }));
    expect(r.gkPlayers.keepers).toEqual(['山田', '大野']);
    expect(r.added.players).toBe(2);
  });
  it('他アプリのJSONは拒否', () => {
    expect(() => mergeBackup(current, JSON.stringify({ app: 'other', data: {} })))
      .toThrow('このアプリのバックアップ形式ではありません');
  });
  it('壊れたテキストは拒否', () => {
    expect(() => mergeBackup(current, '{{{')).toThrow('JSONとして読めませんでした');
  });
});

describe('match-cards のバックアップ取り込み（検収6：「全データ」を嘘に戻さない）', () => {
  it('mergeExtraKey で id 単位の和集合になり重複はスキップ', () => {
    const cur = [{ id: 'mc1', ts: 2 }];
    const imp = [{ id: 'mc1', ts: 2 }, { id: 'mc2', ts: 1 }];
    const m = mergeExtraKey(cur, imp);
    expect(m.added).toBe(1);
    expect(m.val.map(c => c.id).sort()).toEqual(['mc1', 'mc2']);
  });
  it('マイグレーション由来カード（mc-接頭）も別端末取り込みで重複しない', () => {
    const hist = [{ id: 'rA', ts: 5, mode: 'of', resultId: 'r_x', crumbs: [], next: '' }];
    const a = migrateReflectToCards(hist, []).cards;   // 端末A
    const b = migrateReflectToCards(hist, []).cards;   // 端末B（同じ履歴を取り込み済み）
    expect(mergeExtraKey(a, b).added).toBe(0);
  });
});
