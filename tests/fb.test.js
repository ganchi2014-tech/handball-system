// tests/fb.test.js — lib/fb.js の純ロジックのみをテストする（firebase SDK はモックしない方針。
// 接続系は Task 6 の実機検証で担保）。fb.js は firebase を dynamic import しかしないため、
// この import 自体で firebase チャンクはロードされない＝ネットワーク接続なしで走ることの証明でもある。
import { describe, it, expect } from 'vitest';
import { FB_NODES, fbQueueAdd, fbRosterToPlayers, fbUid } from '../app/src/lib/fb.js';

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
