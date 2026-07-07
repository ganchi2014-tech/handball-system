// tests/loop.test.js
// ループ位相・カード生成・reflect-history変換コピーの期待値テスト。
// 位相判定は設計書1-2の表そのもの：D-3以前=練習 / D-2〜D-0=予測 / 試合翌日〜+2=検証 / +3以降=練習週。
import { describe, it, expect } from 'vitest';
import { loopPhaseInfo, newMatchCard, migrateReflectToCards, cardStats } from '../app/src/lib/loop.js';

describe('loopPhaseInfo（位相判定・当日基準）', () => {
  const nm = { date: '2026-07-10', opponent: 'A高' };
  it('試合なし = practice-week', () =>
    expect(loopPhaseInfo(null, '2026-07-07')).toEqual({ mode: 'practice-week', phase: 'practice', days: null }));
  it('D-3 = 練習位相', () =>
    expect(loopPhaseInfo(nm, '2026-07-07')).toEqual({ mode: 'match-week', phase: 'practice', days: 3 }));
  it('D-2 = 予測位相', () =>
    expect(loopPhaseInfo(nm, '2026-07-08').phase).toBe('predict'));
  it('当日(D-0) = 予測位相', () =>
    expect(loopPhaseInfo(nm, '2026-07-10')).toEqual({ mode: 'match-week', phase: 'predict', days: 0 }));
  it('翌日〜+2 = 検証位相', () => {
    expect(loopPhaseInfo(nm, '2026-07-11').phase).toBe('verify');
    expect(loopPhaseInfo(nm, '2026-07-12').phase).toBe('verify');
  });
  it('+3以降 = practice-week（試合日は過去扱いで空白にしない）', () =>
    expect(loopPhaseInfo(nm, '2026-07-13')).toEqual({ mode: 'practice-week', phase: 'practice', days: null }));
});

describe('newMatchCard', () => {
  it('既定値：kind=match・yomi空・reflect未接続', () => {
    const c = newMatchCard({ date: '2026-07-10', opponent: 'A高' });
    expect(c.kind).toBe('match');
    expect(c.yomi).toEqual([]);
    expect(c.reflect).toBeNull();
    expect(c.nextDone).toBeNull();
    expect(c.star).toBe(false);
    expect(c.id.startsWith('mc')).toBe(true);
  });
  it('yomiは最大3に切り詰める', () => {
    const y = [1, 2, 3, 4].map(i => ({ target: 'df', claim: 'c' + i, hit: null }));
    expect(newMatchCard({ date: '2026-07-10', yomi: y }).yomi).toHaveLength(3);
  });
});

describe('migrateReflectToCards（変換コピー・元は残す・冪等）', () => {
  const hist = [
    { id: 'r1', ts: 1751500000000, mode: 'of', resultId: 'r_x', crumbs: ['a'], next: '次はこれ' },
    { id: 'r2', ts: 1751400000000, mode: 'df', resultId: null, crumbs: [], next: '' },
  ];
  it('全件が kind=practice のカードになり ts降順', () => {
    const { cards, added } = migrateReflectToCards(hist, []);
    expect(added).toBe(2);
    expect(cards[0].id).toBe('mc-r1');
    expect(cards[0].kind).toBe('practice');
    expect(cards[0].reflect).toEqual({ mode: 'of', resultId: 'r_x', crumbs: ['a'] });
    expect(cards[0].next).toBe('次はこれ');
  });
  it('再実行しても増えない（id接頭 mc- で冪等）', () => {
    const first = migrateReflectToCards(hist, []);
    const second = migrateReflectToCards(hist, first.cards);
    expect(second.added).toBe(0);
    expect(second.cards).toHaveLength(2);
  });
  it('既存の新規カードと混ざっても ts降順を維持', () => {
    const manual = newMatchCard({ date: '2026-07-07' });
    manual.ts = 1751600000000;
    const { cards } = migrateReflectToCards(hist, [manual]);
    expect(cards[0].id).toBe(manual.id);
  });
});

describe('cardStats（プレイブック用集計）', () => {
  const cards = [
    { reflect: { resultId: 'r1' }, next: 'a', nextDone: true,  yomi: [{ hit: true }, { hit: false }], star: true },
    { reflect: { resultId: 'r2' }, next: 'b', nextDone: false, yomi: [{ hit: null }], star: false },
    { reflect: null,               next: '',  nextDone: null,  yomi: [], star: false },
  ];
  it('回数・宣言達成率・読み的中率', () => {
    expect(cardStats(cards)).toEqual({
      reflects: 2,
      declared: 2, done: 1,
      doneRate: 50,
      yomiTotal: 2, yomiHit: 1, yomiRate: 50,
    });
  });
  it('空配列は率null', () =>
    expect(cardStats([])).toEqual({ reflects: 0, declared: 0, done: 0, doneRate: null, yomiTotal: 0, yomiHit: 0, yomiRate: null }));
});

describe('cardStats（mode のみの reflect も振り返りに数える）', () => {
  it('resultId=null でも mode があれば reflects に含む', () => {
    expect(cardStats([{ reflect: { mode: 'of', resultId: null }, next: '', nextDone: null, yomi: [] }]).reflects).toBe(1);
  });
});
