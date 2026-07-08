// tests/fb.test.js — lib/fb.js の純ロジックのみをテストする（firebase SDK はモックしない方針。
// 接続系は Task 6 の実機検証で担保）。fb.js は firebase を dynamic import しかしないため、
// この import 自体で firebase チャンクはロードされない＝ネットワーク接続なしで走ることの証明でもある。
import { describe, it, expect } from 'vitest';
import { FB_NODES, fbNormalizeRoster, fbQueueAdd, fbRosterDisplayName, fbRosterToPlayers, fbUid, buildSharedYomi, fbNormalizeShared } from '../app/src/lib/fb.js';

describe('FB_NODES 対応表', () => {
  it('4ノードが揃っている', () => {
    expect(FB_NODES).toHaveLength(4);
    expect(FB_NODES.map((n) => n.node)).toEqual(['matchCards', 'gkPredictions', 'pvRecords', 'tbTasks']);
  });

  it('lsKey が App.jsx の実キー（match-cards / gk_predictions / pv_records / tb-tasks）と一致する', () => {
    const map = Object.fromEntries(FB_NODES.map((n) => [n.node, n.lsKey]));
    expect(map).toEqual({
      matchCards: 'match-cards',
      gkPredictions: 'gk_predictions',
      pvRecords: 'pv_records',
      tbTasks: 'tb-tasks',
    });
  });

  it('module import 直後は未接続（fbUid()===null）＝firebase未ロードで動く', () => {
    expect(fbUid()).toBeNull();
  });
});

describe('fbQueueAdd（純関数・キュー重複除去）', () => {
  it('空キューに追加できる', () => {
    expect(fbQueueAdd([], 'matchCards', 'a1')).toEqual([{ node: 'matchCards', id: 'a1' }]);
  });

  it('同一 node+id は重複しない', () => {
    const q = fbQueueAdd([{ node: 'matchCards', id: 'a1' }], 'matchCards', 'a1');
    expect(q).toEqual([{ node: 'matchCards', id: 'a1' }]);
  });

  it('同じ id でも node が違えば別エントリ', () => {
    const q = fbQueueAdd([{ node: 'matchCards', id: 'a1' }], 'tbTasks', 'a1');
    expect(q).toHaveLength(2);
  });

  it('既存キューの重複も除去される（引数1つでの整形にも使える）', () => {
    const dirty = [
      { node: 'pvRecords', id: 'x' },
      { node: 'pvRecords', id: 'x' },
      { node: 'gkPredictions', id: 'y' },
      null,
      { node: 'pvRecords' }, // id 欠落 → 落とす
    ];
    expect(fbQueueAdd(dirty)).toEqual([
      { node: 'pvRecords', id: 'x' },
      { node: 'gkPredictions', id: 'y' },
    ]);
  });

  it('元の配列を破壊しない・順序を維持する', () => {
    const orig = [{ node: 'tbTasks', id: 't1' }];
    const q = fbQueueAdd(orig, 'matchCards', 'm1');
    expect(orig).toHaveLength(1);
    expect(q.map((e) => e.id)).toEqual(['t1', 'm1']);
  });

  it('queue が配列でなくても安全', () => {
    expect(fbQueueAdd(null, 'matchCards', 'a')).toEqual([{ node: 'matchCards', id: 'a' }]);
  });
});

describe('fbRosterToPlayers（純関数・roster→選手チップ）', () => {
  it('keepers は isGK のみ、shooters/pivots は全員', () => {
    const roster = [
      { name: '山田', isGK: true, rosterId: 'r1' },
      { name: '田中', isGK: false, rosterId: 'r2' },
      { name: '鈴木', isGK: false, rosterId: 'r3' },
    ];
    const p = fbRosterToPlayers(roster);
    expect(p.keepers).toEqual(['山田']);
    expect(p.shooters).toEqual(['山田', '田中', '鈴木']);
    expect(p.pivots).toEqual(['山田', '田中', '鈴木']);
  });

  it('trim・重複除去・順序維持', () => {
    const roster = [
      { name: ' 山田 ', isGK: true },
      { name: '山田', isGK: true },
      { name: '', isGK: false },
      { name: '田中', isGK: false },
      null,
      { isGK: true },
    ];
    const p = fbRosterToPlayers(roster);
    expect(p.keepers).toEqual(['山田']);
    expect(p.shooters).toEqual(['山田', '田中']);
  });

  it('空・非配列入力でも {keepers:[],shooters:[],pivots:[]}', () => {
    expect(fbRosterToPlayers([])).toEqual({ keepers: [], shooters: [], pivots: [] });
    expect(fbRosterToPlayers(null)).toEqual({ keepers: [], shooters: [], pivots: [] });
    expect(fbRosterToPlayers(undefined)).toEqual({ keepers: [], shooters: [], pivots: [] });
  });
});

describe('fbRosterDisplayName / fbNormalizeRoster（mental 実データ形の正規化）', () => {
  // 2026-07-07 実測: /roster は {rosterId: {surname, enrollmentYear, isGK, ...}}。
  // 表示名は mental の rosterDisplayName 互換（学年丸数字＋姓・4月1日始まり年度）。
  const ref = new Date('2026-07-07'); // 年度=2026 → 入学2026=①, 2025=②, 2024=③

  it('学年丸数字＋姓を生成する（4月始まり年度）', () => {
    expect(fbRosterDisplayName({ surname: '赤塚', enrollmentYear: 2024 }, ref)).toBe('③赤塚');
    expect(fbRosterDisplayName({ surname: '山田', enrollmentYear: 2026 }, ref)).toBe('①山田');
    expect(fbRosterDisplayName({ surname: '田中', enrollmentYear: 2025 }, ref)).toBe('②田中');
  });

  it('1〜3月は前年が年度（学年が1つ進まない）', () => {
    expect(fbRosterDisplayName({ surname: '赤塚', enrollmentYear: 2024 }, new Date('2027-02-01'))).toBe('③赤塚');
  });

  it('enrollmentYear なし → 丸数字なしの姓のみ／name フィールド優先', () => {
    expect(fbRosterDisplayName({ surname: '無学年' }, ref)).toBe('無学年');
    expect(fbRosterDisplayName({ name: '直接名', surname: '姓' }, ref)).toBe('直接名');
  });

  it('オブジェクト形（実データ）: キーが rosterId になり {name,isGK,rosterId} が揃う', () => {
    const val = {
      r1: { surname: '赤塚', enrollmentYear: 2024, isGK: true },
      r2: { surname: '山田', enrollmentYear: 2026 },
    };
    expect(fbNormalizeRoster(val, ref)).toEqual([
      { name: '③赤塚', isGK: true, rosterId: 'r1' },
      { name: '①山田', isGK: false, rosterId: 'r2' },
    ]);
  });

  it('配列形（設計書の想定形）も受ける', () => {
    const val = [{ name: '山田', isGK: true, rosterId: 'a' }];
    expect(fbNormalizeRoster(val, ref)).toEqual([{ name: '山田', isGK: true, rosterId: 'a' }]);
  });

  it('名前が作れないエントリ・null は落とす／null 入力は空配列', () => {
    expect(fbNormalizeRoster({ r1: { enrollmentYear: 2026 }, r2: null }, ref)).toEqual([]);
    expect(fbNormalizeRoster(null)).toEqual([]);
  });

  it('引退（active=false）は除外する。active 未指定・true は残す', () => {
    const val = {
      r1: { surname: '引退済', enrollmentYear: 2024, active: false },
      r2: { surname: '現役A', enrollmentYear: 2025, active: true },
      r3: { surname: '現役B', enrollmentYear: 2026 },
    };
    expect(fbNormalizeRoster(val, ref)).toEqual([
      { name: '②現役A', isGK: false, rosterId: 'r2' },
      { name: '①現役B', isGK: false, rosterId: 'r3' },
    ]);
  });
});

describe('buildSharedYomi / fbNormalizeShared（読みの回覧・Phase B-3）', () => {
  const card = { id: 'mcABC', date: '2026-07-12', kind: 'match', opponent: '○○高校', yomi: [] };
  const yomi = { target: 'ace', claim: '左45が起点', hit: true };

  it('回覧レコードを組み立てる（id は card.id＋index で冪等）', () => {
    const rec = buildSharedYomi({ card, yomi, index: 1, authorUid: 'u1', authorName: '②山田', ts: 1234 });
    expect(rec).toEqual({
      id: 'sy-mcABC-1',
      author: 'u1',
      name: '②山田',
      date: '2026-07-12',
      kind: 'match',
      opponent: '○○高校',
      target: 'ace',
      claim: '左45が起点',
      hit: true,
      ts: 1234,
    });
  });

  it('丸付けされていない読み（hit=null）は組み立てを拒否して null を返す', () => {
    expect(buildSharedYomi({ card, yomi: { ...yomi, hit: null }, index: 0, authorUid: 'u1', authorName: 'n', ts: 1 })).toBe(null);
    expect(buildSharedYomi({ card, yomi: null, index: 0, authorUid: 'u1', authorName: 'n', ts: 1 })).toBe(null);
  });

  it('一覧正規化: ts降順・不正エントリ除外・mine フラグ・50件上限', () => {
    const val = {
      a: { id: 'a', author: 'u1', name: 'A', claim: 'x', hit: true, ts: 10 },
      b: { id: 'b', author: 'u2', name: 'B', claim: 'y', hit: false, ts: 30 },
      c: null,
      d: { id: 'd', author: 'u3', name: '', claim: '', hit: true, ts: 20 }, // claim空は除外
    };
    const out = fbNormalizeShared(val, 'u1');
    expect(out.map((e) => e.id)).toEqual(['b', 'a']);
    expect(out[0].mine).toBe(false);
    expect(out[1].mine).toBe(true);
  });

  it('50件を超えたら新しい順に50件で切る／null 入力は空配列', () => {
    const val = {};
    for (let i = 0; i < 60; i++) val['k' + i] = { id: 'k' + i, author: 'u', name: 'N', claim: 'c', hit: true, ts: i };
    const out = fbNormalizeShared(val, 'u');
    expect(out).toHaveLength(50);
    expect(out[0].ts).toBe(59);
    expect(out[49].ts).toBe(10);
    expect(fbNormalizeShared(null, 'u')).toEqual([]);
  });
});
