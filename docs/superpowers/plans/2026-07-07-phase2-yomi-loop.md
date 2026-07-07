# Phase 2 YOMI LOOP（ループ化）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「引く辞書」を「回るループ」へ — ループホーム／1試合=1カード（match-cards）／SOLVE・課題ビルダー吸収／記録モジュール共通エンジン化。

**仕様正本:** `C:\Users\togan1080\OneDrive\Claude\HANDBALL_LAB_Phase2-3_設計書.md` §1（オーナー決裁済）。上位: 羽化設計図 §3-4。

**憲法（違反したら実装却下）:**
1. 顧問向け集計ビュー・ダッシュボードは作らない
2. `STORAGE_VERSION` は上げない・既存キー（reflect-history / gk_predictions / pv_records / tb-tasks 等）のデータは1件も消えない
3. 本番URL不変。**1カード3タップ起点・試合後5分（20タップ以内）**を破る設計は却下
4. 削除量≧追加量を目標（git diff --stat で計測・最終タスクで報告）
5. mainへのpush・本番切替はオーナー承認必須（作業は `phase2-loop` ブランチ）

**Architecture:** 新規純ロジックは `app/src/lib/loop.js`（位相判定・カード生成・マイグレーション・集計）＋Vitest。UIは `app/src/components/loop.jsx`（ループホーム・読み宣言・カード起点）と `components/record.jsx`（GK/PV共通エンジン）に置き、App.jsx は配線のみ追記（肥大させない）。4軸振り返り本体は既存 QUESTIONS/RESULTS フローを再利用し、カードは `resultId` で参照する（good/issue/improve は RESULTS から導出可能なため**カードに複製保存しない** — 肥大回避。設計書1-3のデータモデルからの意図的な簡約）。

**Tech Stack:** 既存どおり Vite + React 18 + Vitest。新規依存なし。

**新規 localStorage キー（`hb_v1_` プレフィクスは lsGet/lsSet が自動付与）:**
- `match-cards` — カード配列（ts降順）。バックアップ書き出しは機械列挙で自動、**取り込みマージ対象への追加が必須**（検収6）
- `loop-state` — `{ nextMatch: {date:'YYYY-MM-DD', opponent:''}|null, migrated: 1 }`（端末ローカル設定＋変換コピー済フラグ）

**カードのデータモデル（確定）:**
```js
{
  id: 'mc...',            // マイグレーション由来は 'mc-' + 旧reflect-history id（冪等性の要）
  ts, date: 'YYYY-MM-DD',
  kind: 'match' | 'scrimmage' | 'practice',
  opponent: '',           // 任意
  yomi: [{ target: 'df'|'gk'|'other', claim: '', hit: null|true|false }],  // 最大3
  reflect: null | { mode, resultId, crumbs: [] },   // 既存QUESTIONSの結果を接続
  next: '',               // 宣言（next-declaration と同期）
  nextDone: null|true|false,
  star: false,            // このカードの「良かった点」をプレイブック「効いた技」に載せる
}
```

---

### Task 1: lib/loop.js — 位相モデル・カード・マイグレーションの純関数（TDD）

**Files:**
- Create: `app/src/lib/loop.js`
- Test: `tests/loop.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```js
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
      reflects: 2,            // reflect接続済カード数
      declared: 2, done: 1,   // 宣言あり／達成
      doneRate: 50,
      yomiTotal: 2, yomiHit: 1, yomiRate: 50,   // hit=null（未照合）は分母に入れない
    });
  });
  it('空配列は率null', () =>
    expect(cardStats([])).toEqual({ reflects: 0, declared: 0, done: 0, doneRate: null, yomiTotal: 0, yomiHit: 0, yomiRate: null }));
});
```

- [ ] **Step 2: 失敗を確認** — Run: `npm test -- tests/loop.test.js` → Expected: FAIL（loop.js が無い）

- [ ] **Step 3: 実装**

```js
// app/src/lib/loop.js
// Phase 2 YOMI LOOP の純ロジック：位相判定・1試合=1カード・reflect-history変換コピー・集計。
// UIを含めない（Vitest対象）。日付ヘルパーは gk.js の既存実装を再利用する。
import { gkDateStr } from './gk.js';

// 位相判定（設計書1-2）。todayStr は 'YYYY-MM-DD'（省略時は当日）。
// nextMatchあり: D-3以前=練習 / D-2〜D-0=予測 / 試合翌日〜+2=検証 / +3以降=practice-week（大会期空白対策）
function loopPhaseInfo(nextMatch, todayStr) {
  const today = todayStr || gkDateStr();
  if (!nextMatch || !nextMatch.date) return { mode: 'practice-week', phase: 'practice', days: null };
  const diff = Math.round((new Date(nextMatch.date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
  if (diff >= 3) return { mode: 'match-week', phase: 'practice', days: diff };
  if (diff >= 0) return { mode: 'match-week', phase: 'predict', days: diff };
  if (diff >= -2) return { mode: 'match-week', phase: 'verify', days: diff };
  return { mode: 'practice-week', phase: 'practice', days: null };
}

function newMatchCard({ date, kind, opponent, yomi }) {
  return {
    id: 'mc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ts: Date.now(),
    date: date || gkDateStr(),
    kind: kind || 'match',
    opponent: (opponent || '').trim(),
    yomi: (yomi || []).slice(0, 3),
    reflect: null,
    next: '',
    nextDone: null,
    star: false,
  };
}

// reflect-history（Phase 0）→ match-cards への一度限りの変換コピー。
// 元の reflect-history は破棄しない（憲法）。id を 'mc-'+旧id にすることで再実行しても重複しない。
function migrateReflectToCards(reflectHistory, existingCards) {
  const have = new Set((existingCards || []).map(c => c && c.id));
  const converted = (reflectHistory || [])
    .filter(e => e && e.id)
    .map(e => ({
      id: 'mc-' + e.id,
      ts: e.ts || 0,
      date: gkDateStr(new Date(e.ts || Date.now())),
      kind: 'practice',
      opponent: '',
      yomi: [],
      reflect: { mode: e.mode || null, resultId: e.resultId || null, crumbs: e.crumbs || [] },
      next: e.next || '',
      nextDone: null,
      star: false,
    }))
    .filter(c => !have.has(c.id));
  const cards = [...converted, ...(existingCards || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return { cards, added: converted.length };
}

// マイ・プレイブックの数字（既存集計と同じ「率はnullで“記録なし”を区別」規約）
function cardStats(cards) {
  const list = cards || [];
  const reflects = list.filter(c => c.reflect && c.reflect.resultId != null || (c.reflect && c.reflect.mode)).length;
  const declared = list.filter(c => (c.next || '').trim()).length;
  const done = list.filter(c => c.nextDone === true).length;
  const yomiAll = list.flatMap(c => c.yomi || []).filter(y => y.hit === true || y.hit === false);
  const yomiHit = yomiAll.filter(y => y.hit === true).length;
  return {
    reflects,
    declared, done,
    doneRate: declared ? Math.round(done / declared * 100) : null,
    yomiTotal: yomiAll.length, yomiHit,
    yomiRate: yomiAll.length ? Math.round(yomiHit / yomiAll.length * 100) : null,
  };
}

const YOMI_TARGETS = [
  { id: 'df', label: '相手DF', hint: '例：6-0で真ん中は固い、右45は前に出てくる' },
  { id: 'gk', label: '相手GK', hint: '例：早く落ちる、サイドは上が空く' },
  { id: 'other', label: 'その他', hint: '例：立ち上がり10分は走ってくる' },
];
const CARD_KINDS = [
  { id: 'match', label: '公式戦・練習試合' },
  { id: 'scrimmage', label: '紅白戦・課題ゲーム' },
  { id: 'practice', label: '練習' },
];
const kindLabel = (id) => (CARD_KINDS.find(k => k.id === id) || {}).label || id;

export { loopPhaseInfo, newMatchCard, migrateReflectToCards, cardStats, YOMI_TARGETS, CARD_KINDS, kindLabel };
```

⚠ 注意: `cardStats` の `reflects` 判定は「reflect接続済（mode か resultId がある）」。テストの期待値（reflects: 2）と一致するよう実装後にテストを通すこと。実装例の `||` 優先順位バグに注意（`c.reflect && (c.reflect.resultId != null || c.reflect.mode)` が正しい形）。

- [ ] **Step 4: テスト緑を確認** — Run: `npm test -- tests/loop.test.js` → Expected: PASS 全件
- [ ] **Step 5: 全テスト回帰** — Run: `npm test` → Expected: 既存136+テスト含め全緑
- [ ] **Step 6: Commit** — `git add app/src/lib/loop.js tests/loop.test.js && git commit -m "feat(phase2): ループ位相・match-cards・変換コピーの純ロジック＋テスト (Task 1)"`

---

### Task 2: App配線 — match-cards / loop-state の永続化・起動時マイグレーション・バックアップ取り込み対象化

**Files:**
- Modify: `app/src/App.jsx`（state宣言ブロック 32-69行付近＋handleBackupImport 160-183行付近）
- Test: `tests/aggregation.test.js`（mergeExtraKey の match-cards ケース追記）

- [ ] **Step 1: 失敗するテストを書く（バックアップ取り込みで match-cards がID単位マージされる）**

`tests/aggregation.test.js` 末尾に追記:

```js
import { mergeExtraKey } from '../app/src/lib/backup.js';
import { migrateReflectToCards } from '../app/src/lib/loop.js';

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
```

- [ ] **Step 2: 失敗を確認** — Run: `npm test -- tests/aggregation.test.js` → mergeExtraKey は既存実装なので**このテストは通る可能性が高い**。通ったらそれで良し（実装済の裏付け）。migrateReflectToCards 側が未コミットなら Task 1 完了後なので緑のはず。

- [ ] **Step 3: App.jsx に state・永続化・マイグレーションを追記**

`reflectHistory` state宣言（32-34行）の直後に:

```jsx
  // ── Phase 2: 1試合=1カード＋ループ状態 ──
  // match-cards は新規保存先。reflect-history は読み続ける（破棄禁止）が、初回起動時に
  // 変換コピーする（migrateReflectToCards は冪等なので多重実行しても安全）。
  const [matchCards, setMatchCards] = useState(() => lsGet('match-cards') || []);
  const [loopState, setLoopState] = useState(() => lsGet('loop-state') || { nextMatch: null, migrated: 0 });
  useEffect(() => { lsSet('match-cards', matchCards); }, [matchCards]);
  useEffect(() => { lsSet('loop-state', loopState); }, [loopState]);
  useEffect(() => {
    if (loopState.migrated) return;
    const { cards, added } = migrateReflectToCards(reflectHistory, matchCards);
    if (added > 0) setMatchCards(cards);
    setLoopState(prev => ({ ...prev, migrated: 1 }));
  }, []);  // 初回マウント時のみ
  const upsertCard = (card) => {
    setMatchCards(prev => {
      const i = prev.findIndex(c => c.id === card.id);
      const next = i >= 0 ? prev.map(c => c.id === card.id ? card : c) : [card, ...prev];
      return next.sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 300);
    });
  };
```

import に追加: `import { loopPhaseInfo, migrateReflectToCards, newMatchCard, cardStats, YOMI_TARGETS, CARD_KINDS, kindLabel } from './lib/loop.js';`

- [ ] **Step 4: handleBackupImport に match-cards を追加**

`applyExtra('reflect-history', ...)` 行の直後に:

```jsx
      applyExtra('match-cards', matchCards, (v) => setMatchCards(v.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 300)));
      applyExtra('loop-state', loopState, null);   // スカラー＝ローカル優先（端末設定なので上書きしない）
```

⚠ `applyExtra` の第3引数が null の場合に落ちないこと（既存実装は `if (apply) apply(...)` なので安全）を確認。

- [ ] **Step 5: 全テスト＋起動確認** — Run: `npm test` → 全緑。`npm run dev` でコンソールエラーなし・既存reflect履歴のある端末相当（localStorageに reflect-history を仕込む）でカードが増えることを確認。
- [ ] **Step 6: Commit** — `git commit -am "feat(phase2): match-cards/loop-state 配線＋起動時変換コピー＋バックアップ取り込み対象化 (Task 2)"`

---

### Task 3: ループホーム — 位相ヘッダ＋主ボタン1つ＋下段格納（hub差し替え）

**Files:**
- Create: `app/src/components/loop.jsx`（LoopHome / MatchDateEditor）
- Modify: `app/src/App.jsx`（hub画面 960-1022行を LoopHome 呼び出しに差し替え）
- Modify: `app/src/lib/appData.js`（HUB_MODULES から solve を外しプレイブック追加・リファレンス3件を定義）
- Modify: `app/src/styles.css`（loop-* クラス追加。既存 hub-* トーンを踏襲）

**画面仕様（設計書1-2）:**
- 上部: 「次の試合まで あとN日」＋位相バッジ（🔮予測位相/📝検証位相/🎯練習位相/practice-week時は「練習週モード」）
- 主ボタン1つ: predict=「🔮 読みを宣言する」→ `setPhase('yomi')` / verify=「📝 5分振り返り」→ `setPhase('card')` / practice=「🎯 今週の課題→練習」→ `setTbView({name:'home'}); setPhase('build')`（課題ビルダー昇格・1タップ）
- 副ボタン（小・2つ）: 主ボタン以外の2位相アクション（ループはいつでも回せる）
- 検証位相のみ: 既存 hub-declare（前回の宣言→できた？）をここに表示（`declaration && phaseInfo.phase === 'verify'` に変更。それ以外の位相では非表示にせず**畳んだ1行表示**にする — 宣言照合の機会損失を防ぐ）
- 試合日設定: 「📅 次の試合日を設定」→ date入力＋相手名（任意）＋「クリア」。選手自身が設定、未設定でも全機能動作
- 下段: モジュール格納グリッド（既存 hub-cards 流用）— 辞書・質問・練習・GK予測・PV認知・🗂プレイブック（solve カードは削除＝カード/結果画面からの直行に吸収。bottom-nav の課題解決タブは残すので到達不能にはならない）
- 最下段: 📖リファレンス行（janken/context/gk の3逆引き — Task 5 で振り返りから移動してくる受け皿）＋「🌱初めての方」「💾バックアップ」

- [ ] **Step 1: appData.js 修正** — HUB_MODULES から `id:'solve'` エントリを削除し、以下を追加:

```js
  {
    id: 'playbook', cls: 'dict', icon: '🗂', target: '選手',
    title: 'マイ・プレイブック',
    desc: '振り返り回数・宣言達成率・読み的中率・効いた技 — 自分の記録が1枚で見える',
    enabled: true,
  },
```

さらにリファレンス定義を追加（export に含める）:

```js
// 振り返り10モードから「逆引きリファレンス」へ降格した3モード（設計書1-5）
const REFERENCE_MODES = ['janken', 'context', 'gk'];
```

- [ ] **Step 2: components/loop.jsx を作成**

```jsx
// Phase 2: ループホーム。「いまループのどこにいるか」＋位相別の主ボタン1つ。
// 他モジュールは下段に格納（設計書1-2）。試合日は選手自身が設定・未設定でも全機能が動く。
import React, { useState } from 'react';
import { loopPhaseInfo } from '../lib/loop.js';

const PHASE_META = {
  predict:  { icon: '🔮', label: '予測位相',  main: '🔮 読みを宣言する',   sub: '試合前に相手DF/GKの読みを3タップで宣言' },
  verify:   { icon: '📝', label: '検証位相',  main: '📝 5分振り返り',      sub: '試合を1枚のカードにする（読みの丸付け＋4軸）' },
  practice: { icon: '🎯', label: '練習位相',  main: '🎯 今週の課題 → 練習', sub: '課題を1つ選んで練習に落とす（課題ビルダー）' },
};

function MatchDateEditor({ nextMatch, onSave, onClose }) {
  const [date, setDate] = useState(nextMatch?.date || '');
  const [opp, setOpp] = useState(nextMatch?.opponent || '');
  return (
    <div className="onboard-overlay">
      <div className="onboard-card">
        <div className="onboard-title">📅 次の試合日</div>
        <div className="onboard-desc" style={{ textAlign: 'left' }}>
          設定すると、ホームが「予測→試合→検証→練習」のループで案内します。未設定でも全機能は使えます。
        </div>
        <div className="tb-field"><div className="tb-field-label">試合日</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div className="tb-field" style={{ marginTop: 8 }}><div className="tb-field-label">相手（任意）</div>
          <input type="text" value={opp} onChange={e => setOpp(e.target.value)} placeholder="例：○○高校" /></div>
        <div className="onboard-actions">
          {nextMatch && <button className="onboard-btn" onClick={() => { onSave(null); onClose(); }}>クリア</button>}
          <button className="onboard-btn" onClick={onClose}>閉じる</button>
          <button className="onboard-btn primary" disabled={!date}
            onClick={() => { onSave({ date, opponent: opp.trim() }); onClose(); }}>✓ 設定</button>
        </div>
      </div>
    </div>
  );
}

function LoopHome({ loopState, onSetNextMatch, declaration, decSnooze, onAnswerDeclaration, onSnooze,
                    reflectCount, onAction, children }) {
  const [editOpen, setEditOpen] = useState(false);
  const info = loopPhaseInfo(loopState.nextMatch);
  const meta = PHASE_META[info.phase];
  const others = ['predict', 'verify', 'practice'].filter(p => p !== info.phase);
  return (
    <div className="hub-screen animate-in">
      <div className="hub-hero">
        <div className="hub-hero-eyebrow">近江兄弟社高校ハンドボール部</div>
        <div className="hub-title">先に読んだ方が、選択肢を持てる</div>
      </div>

      {/* 位相ヘッダ */}
      <div className="loop-head" onClick={() => setEditOpen(true)}>
        {info.mode === 'match-week' ? (
          <div className="loop-head-days">
            {info.days > 0 ? <>次の試合まで <b>あと{info.days}日</b></> : info.days === 0 ? <b>今日が試合日</b> : <>試合から {-info.days}日</>}
            {loopState.nextMatch?.opponent ? <span className="loop-head-opp"> vs {loopState.nextMatch.opponent}</span> : null}
          </div>
        ) : (
          <div className="loop-head-days">練習週モード<span className="loop-head-opp">（紅白戦・課題ゲームで1周する）</span></div>
        )}
        <div className="loop-head-phase">{meta.icon} {meta.label}　<span className="loop-head-edit">📅 試合日を設定</span></div>
      </div>

      {/* 検証位相：前回の宣言→できた？（他位相では1行に畳む） */}
      {declaration && (info.phase === 'verify' || declaration.done !== true) && (
        info.phase === 'verify' ? (
          <div className="hub-declare">
            {declaration.done === true ? (
              <div className="hub-declare-text">✅ 達成した宣言：「{declaration.text}」
                <span className="hub-declare-sub">次の振り返りで新しい宣言を書こう</span></div>
            ) : (
              <React.Fragment>
                <div className="hub-declare-label">🎯 前回の宣言 — 次のプレーで試すこと</div>
                <div className="hub-declare-text">「{declaration.text}」</div>
                {!decSnooze && (
                  <div className="hub-declare-actions">
                    <button className="hub-declare-btn" onClick={() => onAnswerDeclaration(true)}>✓ できた</button>
                    <button className="hub-declare-btn ghost" onClick={onSnooze}>まだこれから</button>
                  </div>
                )}
              </React.Fragment>
            )}
            {reflectCount > 0 && <div className="hub-declare-count">これまでの振り返り：{reflectCount}回</div>}
          </div>
        ) : (
          declaration.done !== true && <div className="loop-declare-mini">🎯 宣言中：「{declaration.text}」</div>
        )
      )}

      {/* 位相別の主ボタン1つ＋副2つ */}
      <button className="loop-main-btn" onClick={() => onAction(info.phase)}>
        <span className="loop-main-btn-title">{meta.main}</span>
        <span className="loop-main-btn-sub">{meta.sub}</span>
      </button>
      <div className="loop-sub-row">
        {others.map(p => (
          <button key={p} className="loop-sub-btn" onClick={() => onAction(p)}>{PHASE_META[p].main}</button>
        ))}
      </div>

      {/* 下段：モジュール格納・リファレンス・ヘルプ（App側から children で注入） */}
      {children}
      {editOpen && <MatchDateEditor nextMatch={loopState.nextMatch} onSave={onSetNextMatch} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

export { LoopHome, MatchDateEditor };
```

- [ ] **Step 3: App.jsx の hub 画面を差し替え**

既存の `{phase === 'hub' && (...)}` ブロック（960-1022行）を以下に置換。**既存の hub-declare JSX は削除**（LoopHome に移動済＝削除量に計上）:

```jsx
      {phase === 'hub' && (
        <LoopHome
          loopState={loopState}
          onSetNextMatch={(nm) => setLoopState(prev => ({ ...prev, nextMatch: nm }))}
          declaration={declaration} decSnooze={decSnooze}
          onAnswerDeclaration={answerDeclaration} onSnooze={() => setDecSnooze(true)}
          reflectCount={matchCards.length}
          onAction={(p) => {
            if (p === 'predict') setPhase('yomi');
            else if (p === 'verify') setPhase('card');
            else { setTbView({ name: 'home' }); setPhase('build'); }
          }}
        >
          <div className="hub-cards">
            {HUB_MODULES.map(mod => (
              <button key={mod.id} className={`hub-card ${mod.cls} ${mod.enabled ? '' : 'disabled'}`}
                onClick={() => handleHubSelect(mod.id)} disabled={!mod.enabled}
                aria-label={`${mod.title}（${mod.target}）：${mod.desc}`}>
                <div className="hub-card-icon" aria-hidden="true">{mod.icon}</div>
                <div className="hub-card-body">
                  <div className="hub-card-target">{mod.target}</div>
                  <div className="hub-card-title">{mod.title}</div>
                  <div className="hub-card-desc">{mod.desc}</div>
                </div>
                {mod.enabled && <div className="hub-card-arrow" aria-hidden="true">›</div>}
              </button>
            ))}
          </div>
          <div className="loop-ref-row">
            <div className="loop-ref-label">📖 リファレンス（逆引き）</div>
            {REFERENCE_MODES.map(key => (
              <button key={key} className="loop-ref-btn" onClick={() => handleModeSelect(key)}>
                {MODES[key].icon} {MODES[key].label}
              </button>
            ))}
          </div>
          <button className="help-btn" style={{ marginTop: 12 }} onClick={handleOnboardOpen}>🌱 初めての方はこちら</button>
          <button className="help-btn" style={{ marginTop: 8 }} onClick={() => setBackupOpen(true)}>💾 データの書き出し / 取り込み</button>
        </LoopHome>
      )}
```

`handleHubSelect` に playbook 分岐を追加: `else if (modId === 'playbook') setPhase('playbook');`（画面は Task 6。それまで暫定で `setPhase('playbook')` のみ・未定義phaseは空描画になるので Task 6 まで HUB_MODULES 追加を遅らせても良い — 実装順に合わせて判断）

- [ ] **Step 4: styles.css に loop-* を追加**

```css
/* ── Phase 2: ループホーム ── */
.loop-head { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; margin-bottom: 10px; cursor: pointer; }
.loop-head-days { font-size: var(--fs-md); color: var(--tx-primary); }
.loop-head-days b { color: #67e8f9; }
.loop-head-opp { color: var(--tx-muted); font-size: var(--fs-sm); margin-left: 6px; }
.loop-head-phase { margin-top: 4px; font-size: var(--fs-sm); font-weight: 800; color: #fbbf24; display: flex; justify-content: space-between; }
.loop-head-edit { color: var(--tx-muted); font-weight: 400; font-size: var(--fs-xs); }
.loop-main-btn { width: 100%; text-align: left; padding: 16px; border-radius: 14px; border: 1.5px solid rgba(34,211,238,0.5); background: rgba(34,211,238,0.10); cursor: pointer; margin-bottom: 8px; }
.loop-main-btn-title { display: block; font-size: var(--fs-lg); font-weight: 900; color: #67e8f9; }
.loop-main-btn-sub { display: block; margin-top: 4px; font-size: var(--fs-xs); color: var(--tx-muted); }
.loop-sub-row { display: flex; gap: 8px; margin-bottom: 14px; }
.loop-sub-btn { flex: 1; padding: 8px 6px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-1); color: var(--tx-muted); font-size: var(--fs-xs); cursor: pointer; }
.loop-declare-mini { font-size: var(--fs-xs); color: var(--tx-muted); border-left: 3px solid #fbbf24; padding: 4px 8px; margin-bottom: 10px; }
.loop-ref-row { margin-top: 14px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.loop-ref-label { width: 100%; font-size: var(--fs-xs); font-weight: 800; color: var(--tx-muted); }
.loop-ref-btn { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-1); color: var(--tx-primary); font-size: var(--fs-xs); cursor: pointer; }
```

- [ ] **Step 5: 動作確認** — `npm run dev` → ホームで (a) 試合日未設定=練習週モード表示 (b) 試合日を明後日に設定→予測位相＋主ボタン「読みを宣言する」 (c) 昨日に設定→検証位相＋宣言照合カード表示 (d) 主ボタン遷移先はまだ空でOK（Task 4で実装）。`npm test` 全緑。
- [ ] **Step 6: Commit** — `git commit -am "feat(phase2): ループホーム — 位相ヘッダ＋主ボタン1つ＋下段格納 (Task 3)"`

---

### Task 4: 読み宣言（予測位相）＋5分振り返りカードフロー（検証位相）＋SOLVE直行

**Files:**
- Modify: `app/src/components/loop.jsx`（YomiWizard / CardFlow を追加）
- Modify: `app/src/App.jsx`（phase 'yomi' / 'card' の配線、recordReflectStart/commitNextStep のカード接続）
- Modify: `app/src/styles.css`（yomi-* 最小限）

**フロー仕様:**

🔮 **YomiWizard（試合前・3タップ起点）**: 対象カードを特定（nextMatch.date の未振り返りカードがあれば再開、なければ `newMatchCard({date: nextMatch?.date || today, kind: nextMatch ? 'match' : 'scrimmage', opponent})` で新規作成）→ target 3択チップ（df/gk/other）→ claim 短文入力 → 「＋もう1つ読む」（最大3）→ 保存で upsertCard。タップ数: target(1)+入力+保存(1) = 起点3タップ以内。

📝 **CardFlow（試合後5分）**: 
1. カード特定: 直近の reflect 未接続カード（yomi宣言済みならそれ、なければ「きょうの試合/紅白戦/練習」チップで新規作成＝1タップ）
2. yomi があれば丸付け: 各宣言に「○当たった／×外れた／—わからない」（hit true/false/null）
3. 「4軸で振り返る →」ボタン → 既存の振り返りフロー（`setPhase('start')`）へ。**activeCardIdRef** にカードidを保持
4. 既存 `recordReflectStart` 末尾に追記: activeCardIdRef があれば該当カードの reflect に {mode, resultId, crumbs} を接続
5. 既存 `commitNextStep` 末尾に追記: activeCardIdRef があればカードの next にも書く（next-declaration との同期）
6. 結果画面の既存ボタン「🎯 この悩みに対応する症状を直接見る →」= SOLVE吸収の実体（変更不要・RESULT_TO_SYMPTOM 21件＋MODE_TO_SOLVE カテゴリ直行）

- [ ] **Step 1: loop.jsx に YomiWizard を追加**

```jsx
function YomiWizard({ card, onSave, onExit }) {
  const [yomi, setYomi] = useState(card.yomi.length ? card.yomi : [{ target: null, claim: '', hit: null }]);
  const setAt = (i, patch) => setYomi(prev => prev.map((y, j) => j === i ? { ...y, ...patch } : y));
  const valid = yomi.filter(y => y.target && y.claim.trim());
  return (
    <div className="plan-screen">
      <button className="dict-back" onClick={onExit}>← 戻る（ホーム）</button>
      <div className="tb-q-label">🔮 読みを宣言する ─ 試合の前に</div>
      <div className="tb-q-text">{card.opponent ? `vs ${card.opponent}：` : ''}相手をどう読む？（最大3つ）</div>
      <div className="tb-q-hint">正解はない。「先に読んだ方が選択肢を持てる」— 試合後に丸付けして自分の読みを育てる。</div>
      {yomi.map((y, i) => (
        <div key={i} className="tb-card" style={{ marginTop: 12 }}>
          <div className="tb-field-label">読み {i + 1} ─ 何についての読み？</div>
          <div className="plan-themes">
            {YOMI_TARGETS.map(t => (
              <button key={t.id} className={`plan-theme-chip ${y.target === t.id ? 'active' : ''}`}
                onClick={() => setAt(i, { target: t.id })}>{t.label}</button>
            ))}
          </div>
          <div className="tb-field" style={{ marginTop: 8 }}>
            <input type="text" value={y.claim} onChange={e => setAt(i, { claim: e.target.value })}
              placeholder={(YOMI_TARGETS.find(t => t.id === y.target) || YOMI_TARGETS[0]).hint} />
          </div>
        </div>
      ))}
      {yomi.length < 3 && (
        <button className="tb-ghost-btn" style={{ marginTop: 10 }}
          onClick={() => setYomi(prev => [...prev, { target: null, claim: '', hit: null }])}>＋ もう1つ読む</button>
      )}
      <button className="tb-next-btn" style={{ marginTop: 14 }} disabled={!valid.length}
        onClick={() => onSave({ ...card, yomi: valid.map(y => ({ ...y, claim: y.claim.trim() })) })}>
        ✓ 宣言する（{valid.length}件）
      </button>
    </div>
  );
}
```

（import に YOMI_TARGETS, CARD_KINDS, kindLabel, newMatchCard を追加。export に YomiWizard, CardFlow を追加）

- [ ] **Step 2: loop.jsx に CardFlow を追加**

```jsx
// 検証位相：試合後5分。カード起点(1タップ)→読みの丸付け→4軸振り返り(既存フロー)→宣言。
function CardFlow({ cards, nextMatch, onUpsert, onStartReflect, onPickIssue, onExit }) {
  // 再開対象: reflect 未接続の直近カード（読み宣言済みを優先）
  const pending = cards.find(c => !c.reflect && (c.yomi || []).length) || cards.find(c => !c.reflect);
  const [card, setCard] = useState(pending || null);
  const save = (c) => { onUpsert(c); setCard(c); };

  if (!card) return (
    <div className="plan-screen">
      <button className="dict-back" onClick={onExit}>← 戻る（ホーム）</button>
      <div className="tb-q-label">📝 5分振り返り ─ 1試合=1カード</div>
      <div className="tb-q-text">何を振り返る？</div>
      <div className="tb-choices" style={{ marginTop: 12 }}>
        {CARD_KINDS.map(k => (
          <button key={k.id} className="tb-choice" onClick={() => {
            const c = newMatchCard({ kind: k.id, date: undefined, opponent: nextMatch?.opponent || '' });
            save(c);
          }}>
            <div className="tb-choice-title">{k.label}</div>
          </button>
        ))}
      </div>
    </div>
  );

  const unmarked = (card.yomi || []).filter(y => y.hit === null);
  return (
    <div className="plan-screen">
      <button className="dict-back" onClick={onExit}>← 戻る（ホーム）</button>
      <div className="tb-q-label">📝 5分振り返り ─ {kindLabel(card.kind)}{card.opponent ? ` vs ${card.opponent}` : ''}（{card.date}）</div>

      {(card.yomi || []).length > 0 && (
        <div className="tb-card" style={{ marginTop: 10 }}>
          <div className="tb-card-k">🔮 試合前の読み — 丸付け（事実のみ）</div>
          {card.yomi.map((y, i) => (
            <div key={i} className="tb-card-row">
              <div className="tb-card-v">【{(YOMI_TARGETS.find(t => t.id === y.target) || {}).label}】{y.claim}</div>
              <div className="gk-result-row" style={{ marginTop: 4 }}>
                <button className={`gk-result-btn hit ${y.hit === true ? 'selected' : ''}`}
                  onClick={() => save({ ...card, yomi: card.yomi.map((x, j) => j === i ? { ...x, hit: true } : x) })}>○ 当たった</button>
                <button className={`gk-result-btn miss ${y.hit === false ? 'selected' : ''}`}
                  onClick={() => save({ ...card, yomi: card.yomi.map((x, j) => j === i ? { ...x, hit: false } : x) })}>× 外れた</button>
              </div>
            </div>
          ))}
          {unmarked.length > 0 && <div className="tb-q-hint">未丸付け {unmarked.length} 件（わからないものは飛ばしてOK）</div>}
        </div>
      )}

      {!card.reflect ? (
        <button className="tb-next-btn" style={{ marginTop: 14 }} onClick={() => onStartReflect(card)}>
          🤾 4軸で振り返る →（良かった点・課題・改善案・次の一手）
        </button>
      ) : (
        <React.Fragment>
          <div className="tb-card" style={{ marginTop: 10 }}>
            <div className="tb-card-k">✓ 振り返り済み</div>
            <div className="tb-card-v">{(card.reflect.crumbs || []).join(' › ')}</div>
            {card.next && <div className="tb-card-v">🎯 宣言：「{card.next}」</div>}
          </div>
          <button className="tb-next-btn" style={{ marginTop: 10 }} onClick={() => onPickIssue(card)}>
            🎯 このカードから課題を1つ選ぶ →（課題解決へ）
          </button>
          <button className="tb-ghost-btn" style={{ marginTop: 8 }} onClick={() => onStartReflect(card)}>
            🤾 もう1プレー振り返る
          </button>
        </React.Fragment>
      )}
    </div>
  );
}
```

- [ ] **Step 3: App.jsx 配線**

phase state の近くに `const activeCardIdRef = useRef(null);` を追加。

`recordReflectStart` の `setReflectHistory(...)` の後に追記:

```jsx
    // Phase 2: カード起点の振り返りなら、カードにも接続する（reflect-history と二重保存＝旧経路互換）
    if (activeCardIdRef.current) {
      const cid = activeCardIdRef.current;
      setMatchCards(prev => prev.map(c => c.id === cid
        ? { ...c, reflect: { mode, resultId: rid, crumbs: (hist || []).map(h => h.text) } } : c));
    }
```

`commitNextStep` の `if (t) {...}` 内に追記:

```jsx
      if (activeCardIdRef.current) {
        const cid = activeCardIdRef.current;
        setMatchCards(prev => prev.map(c => c.id === cid ? { ...c, next: t } : c));
      }
```

`handleBackToHub` に `activeCardIdRef.current = null;` を追加（カード外の振り返りに持ち越さない）。

JSXに2画面を追加（GK/PV画面ブロックの近く）:

```jsx
      {phase === 'yomi' && (() => {
        const today = loopState.nextMatch?.date;
        const target = matchCards.find(c => !c.reflect && c.date === today)
          || newMatchCard({ date: today, kind: loopState.nextMatch ? 'match' : 'scrimmage', opponent: loopState.nextMatch?.opponent });
        return <YomiWizard card={target} onExit={handleBackToHub}
          onSave={(c) => { upsertCard(c); setPhase('hub'); }} />;
      })()}

      {phase === 'card' && (
        <CardFlow cards={matchCards} nextMatch={loopState.nextMatch}
          onUpsert={upsertCard} onExit={handleBackToHub}
          onStartReflect={(c) => { activeCardIdRef.current = c.id; setPhase('start'); }}
          onPickIssue={(c) => {
            const sym = c.reflect && RESULT_TO_SYMPTOM[c.reflect.resultId];
            const mm = c.reflect && MODE_TO_SOLVE[c.reflect.mode];
            if (sym) { setSolveRole(sym.role); setSolveCategory(sym.category); setSolveSymptom(sym.symptom); }
            else if (mm) { setSolveRole(mm.role); setSolveCategory(mm.category); setSolveSymptom(null); }
            else { handleSolveReset(); }
            setPhase('solve');
          }} />
      )}
```

結果画面（phase === 'result'）に戻り導線を追加: カード起点なら「← カードに戻る」ボタン（`activeCardIdRef.current` があれば表示、onClick で `commitNextStep(); setPhase('card'); setMode(null); setHistory([]); setResultId(null); setCurrentQ(null); setSelected(null); setNextStep('');`）。

ヘッダの画面名分岐に追加: `{phase === 'yomi' && '読みを宣言する'}` / `{phase === 'card' && '5分振り返り'}`（header-brand-sub は 'Yomi Declaration' / 'Match Card'）。

- [ ] **Step 4: gk-result-btn の selected 状態CSS**（styles.css 既存 .gk-result-btn 群の直後）:

```css
.gk-result-btn.selected { outline: 2px solid #67e8f9; }
```

- [ ] **Step 5: タップ数実測（検収1）** — `npm run dev` で検証位相フロー実測: ホーム主ボタン(1)→カード種別(1)→丸付け(≤3)→4軸で振り返る(1)→モード(1)→設問(4-6問×2タップ)→宣言入力→カードに戻る(1)。**合計20タップ以内**であることを数えて記録（超えるなら設問の深いモードでなく浅い経路で測る＝「1プレー1つだけ」の想定経路）。
- [ ] **Step 6: 回帰** — `npm test` 全緑＋dev画面でループ1周（宣言→カード→振り返り→SOLVE直行→ホーム）を通し確認。
- [ ] **Step 7: Commit** — `git commit -am "feat(phase2): 読み宣言＋1試合=1カード検証フロー＋SOLVE直行 (Task 4)"`

---

### Task 5: 10モード降格 — 振り返り選択肢を4軸骨格2グループに・リファレンス3件を移動

**Files:**
- Modify: `app/src/App.jsx`（start画面 2082-2118行の MODE_GROUPS）

- [ ] **Step 1: MODE_GROUPS を変更**（janken/context/gk を除去 — 受け皿はTask 3のリファレンス行に設置済み）:

```jsx
        const MODE_GROUPS = [
          { label: '🟦 自分のプレー（① 自分の立場から選ぶ）', ids: ['of', 'df', 'gk_self', 'skill'] },
          { label: '🟢 特殊場面', ids: ['physical', 'shot_7m', 'sign'] },
        ];
```

start画面の最下部に案内1行を追加:

```jsx
            <div style={{ fontSize: 11, color: 'var(--tx-muted)', marginTop: 8 }}>
              🔍 相手の分析（じゃんけん・試合状況・相手GK）はホームの「📖 リファレンス」へ移動しました
            </div>
```

- [ ] **Step 2: 確認** — dev で振り返り入口が7モード2グループになり、ホームのリファレンス行から janken/context/gk に入れること。既存の `handleJumpToCountry`（結果画面→janken直行）が壊れていないこと。
- [ ] **Step 3: Commit** — `git commit -am "refactor(phase2): 振り返り10モード並列を4軸骨格2グループへ・逆引き3種をリファレンスに降格 (Task 5)"`

---### Task 6: 記録モジュール共通エンジン — GK/PVのHome+Wizardを宣言的スキーマ1実装に畳む

**Files:**
- Create: `app/src/lib/recordModules.js`（宣言的スキーマ）
- Create: `app/src/components/record.jsx`（RecordHome / RecordWizard 汎用実装）
- Delete: `app/src/components/gk.jsx` / `app/src/components/pv.jsx`（**削除量の主原資**）
- Modify: `app/src/App.jsx`（phase 'gk' / 'pv' ブロックを汎用呼び出しに置換）

**検収: 削除量≧追加量（このタスク単体で）。集計純関数（lib/gk.js / lib/pv.js）は無変更＝aggregation.test.js が退行検知。**

**スキーマ設計（設計書1-4を実装可能な形に具体化）:**

```js
// app/src/lib/recordModules.js
// GK予測・PV認知（将来のDFフットワーク等）を1つのHome/Wizard実装で駆動する宣言的スキーマ。
// wizardステップ型: 'actors'（選手チップ複数フィールド）| 'chips'（単一選択）| 'grid'（コース盤）
//                  | 'choices'（説明付き大ボタン）| 'multichips'（複数選択）| 'text'（自由短文）
// 保存トリガは最終ステップの resultButtons。集計表示は renderStats（既存純関数を呼ぶ関数）に委譲する
// —— 集計の見た目はモジュールごとに違いすぎるため、無理に宣言化せず関数注入にする（YAGNI）。
import { GK_COURSES, GK_SITUATIONS, gkBaselineCompare, gkCalcTendencies, gkCourseLabel,
         gkExportWeekText, gkSituationLabel, gkStats, gkWeekStart, gkWeeklySeries, gkDateStr, gkFmtDate } from './gk.js';
import { PV_AXIS1, PV_AXIS2, PV_CUES, PV_RESULTS, PV_TYPES, pvAxisLabel, pvCalcTypeDist,
         pvCrossTypeResult, pvExportWeekText, pvNonBlockRate, pvResultLabel, pvTypeLabel } from './pv.js';

const RECORD_MODULES = {
  gk: {
    id: 'gk', icon: '🧤', idPrefix: 'p',
    title: 'GK予測 ─ 予測して、照合する',
    lead: 'シュート前に予測、シュート後に照合',
    hint: '流れ：①状況・シューターを選ぶ → ②GKの予測コースをタップ → シュート → ③的中/不的中。入力はシューター側。結果は事実のみ（うまい下手の話ではない）。',
    storageKey: 'gk_predictions',
    actors: [
      { field: 'keepers',  label: 'GK',      addPlaceholder: 'GK名を追加' },
      { field: 'shooters', label: 'シューター', addPlaceholder: 'シューター名を追加' },
    ],
    // 連続入力で維持するフィールド（直前値）
    sticky: ['gk', 'situation', 'shooter'],
    steps: [
      { stage: 'setup', label: 'STEP 1 / 3 ─ 状況とメンバー', text: '誰が・どこから打つ？',
        hint: '入力はシューター側が行う（GK本人は入力しない）。',
        fields: [
          { key: 'gk',        type: 'actor', actorField: 'keepers',  label: 'GK（予測する人）' },
          { key: 'situation', type: 'chips', options: GK_SITUATIONS, label: '状況' },
          { key: 'shooter',   type: 'actor', actorField: 'shooters', label: 'シューター' },
        ],
        nextLabel: '次へ：コースを予測する →' },
      { stage: 'predict', label: 'STEP 2 / 3 ─ シュートの前に記入',
        text: (d) => `${d.gk} の予測：${d.shooter}（${gkSituationLabel(d.situation)}）はどこに打つ？`,
        hint: 'GKに口頭で予測を聞いて、シュートの前にタップ。左右はシューターから見た向き。',
        fields: [
          { key: 'course', type: 'grid', options: GK_COURSES },
          { key: 'cue',    type: 'text', label: '根拠の手がかり（任意・短文）', placeholder: '例：助走角度が外向き／肩が早く開く', optional: true },
        ],
        nextLabel: '予測を確定 → シュートへ', undoHere: true },
      { stage: 'result', label: 'STEP 3 / 3 ─ シュートの後に記入', text: '結果は？（事実のみ・良し悪しの判定はしない）',
        hint: (d) => `予測：${d.gk} → ${gkCourseLabel(d.course)}（${d.shooter}・${gkSituationLabel(d.situation)}）`,
        resultKey: 'hit', rowClass: 'gk-result-row',
        resultButtons: [
          { value: true,  label: '○ 的中',   cls: 'gk-result-btn hit' },
          { value: false, label: '× 不的中', cls: 'gk-result-btn miss' },
        ],
        // 保存後に戻るステージ（GKは同メンバーで連投するため predict へ）
        afterSaveStage: 'predict' },
    ],
    toastFor: (rec) => rec.hit ? '記録した：○的中' : '記録した：×不的中',
    undoLabel: (r) => `${r.shooter}・${gkCourseLabel(r.course)}・${r.hit ? '○的中' : '×不的中'}`,
    exportText: (records) => gkExportWeekText(records),
    recordLine: (p) => `${gkFmtDate(p.date)} ${p.gk}×${p.shooter}｜${gkSituationLabel(p.situation)}｜予測${gkCourseLabel(p.course)}｜${p.hit ? '○的中' : '×不的中'}${p.cue ? '｜' + p.cue : ''}`,
    // 集計カード群（既存GKHomeの表示を関数として移設 — 純関数は lib/gk.js のまま）
    statsSections: [ /* Home実装から呼ぶ。下記 record.jsx 参照 */ ],
  },
  pv: { /* 同形式。PV_AXIS1/2 は setup の chips、PV_TYPES は choices、PV_CUES は result の multichips、
           PV_RESULTS は resultButtons(3値)。sticky: ['pivot']。afterSaveStage: 'setup'。
           既存 PVRecordWizard / PVHome と同じ文言・順序を移植する */ },
};

export { RECORD_MODULES };
```

- [ ] **Step 1: recordModules.js を上記方針で完成させる**（pv 側も gk と同粒度で全記述。文言は既存 gk.jsx / pv.jsx から一字一句移植）
- [ ] **Step 2: components/record.jsx を実装**

RecordWizard: `steps` を state machine として解釈（現行の setup/predict/result 3段構成と同一挙動）。フィールド型ごとの描画は既存 gk.jsx の chips/grid/text、pv.jsx の choices/multichips の JSX をそのまま汎用化。lastSaved/undo・sticky（連続入力の直前値保持）・バイブレーションは現行どおり。

RecordHome: 共通シェル（戻る・題字・▶開始ボタン・ready判定・最近の記録10件＋削除confirm・選手リスト管理＋削除confirm・週次エクスポート）＋ statsSections（モジュール別の集計カードを関数コンポーネント配列として RECORD_MODULES 側に持つ。GKの「的中率/推移/内訳/照合」カードと「シューター傾向」カード、PVの「類型分布」「類型×結果」カードを既存JSXから移植）。

- [ ] **Step 3: App.jsx の phase 'gk' / 'pv' ブロックを置換**

```jsx
      {(phase === 'gk' || phase === 'pv') && (
        <div className="plan-screen">
          <RecordModule
            def={RECORD_MODULES[phase]}
            records={phase === 'gk' ? gkPreds : pvRecords}
            setRecords={phase === 'gk' ? setGkPreds : setPvRecords}
            players={phase === 'gk' ? gkPlayers : pvPlayers}
            setPlayers={phase === 'gk' ? setGkPlayers : setPvPlayers}
            view={phase === 'gk' ? gkView : pvView}
            setView={phase === 'gk' ? setGkView : setPvView}
            lastSetupRef={phase === 'gk' ? gkLastSetup : pvLastSetup}
            onBackHub={handleBackToHub}
          />
        </div>
      )}
```

（RecordModule 内で toast も自前管理し、gkToast/pvToast state と GKHome/PVHome/GKRecordWizard/PVRecordWizard の import・呼び出しを App.jsx から削除）

- [ ] **Step 4: gk.jsx / pv.jsx を削除** — `git rm app/src/components/gk.jsx app/src/components/pv.jsx`
- [ ] **Step 5: 挙動パリティ確認** — dev で GK予測・PV認知の全操作（選手登録→記録3件→取り消し→削除→週次コピー→集計表示）を両モジュールで通す。**文言・タップ数が現行と同一**であること。`npm test` 全緑（集計純関数無変更の証明）。
- [ ] **Step 6: 削除量≧追加量の計測** — `git diff --stat HEAD~1` で本タスクの insertions ≦ deletions を確認し、コミットメッセージに数値を記載。
- [ ] **Step 7: Commit** — `git commit -am "refactor(phase2): GK/PV Home+Wizard を宣言的スキーマ駆動の共通エンジンに統合（-XXX/+YYY行）(Task 6)"`

---

### Task 7: マイ・プレイブック（最小版）

**Files:**
- Create: `app/src/components/playbook.jsx`
- Modify: `app/src/App.jsx`（phase 'playbook' 配線・結果画面/カードに⭐ボタン）

**仕様（設計書1-6・肥大禁止＝1画面のみ、辞書転記はPhase 4送り）:**
- 振り返り回数・宣言達成率・読み的中率: `cardStats(matchCards)`
- GK/PV的中率推移: 自分の名前をチップで選ぶ→ `gkWeeklySeries(gkPreds, name)` / PV は `pvNonBlockRate` 週次（選手リストは既存 gk_players/pv_players を参照）
- 効いた技: `matchCards.filter(c => c.star && c.reflect?.resultId)` → `RESULTS[resultId].good` を一覧表示
- ⭐の付与: CardFlow の振り返り済みカード表示（Task 4）に「⭐ 効いた技に載せる」トグルを追加

- [ ] **Step 1: playbook.jsx 実装**（cardStats・gkWeeklySeries・RESULTS を import。カード3枚: ①数字サマリー ②推移（名前チップ選択） ③効いた技リスト。全て既存 tb-card スタイル流用・新CSSなし）
- [ ] **Step 2: App.jsx 配線** — `{phase === 'playbook' && <Playbook cards={matchCards} gkPreds={gkPreds} pvRecords={pvRecords} gkPlayers={gkPlayers} pvPlayers={pvPlayers} onBack={handleBackToHub} />}`。ヘッダ分岐追加。CardFlow に star トグル（`onUpsert({...card, star: !card.star})`）。
- [ ] **Step 3: 確認＋Commit** — dev確認→`git commit -am "feat(phase2): マイ・プレイブック最小版 — 数字1枚＋効いた技⭐ (Task 7)"`

---

### Task 8: 検収 — 実測・回帰・削除量・ドキュメント

- [ ] **Step 1: 検収条件の実測（設計書1-7）**
1. タップ数: 検証位相フロー（カード作成→丸付け→4軸→宣言）を dev 実測 ≤20タップ・体感5分以内 → 数値を記録
2. `git diff --stat main...phase2-loop` → 削除量≧追加量か数値を記録（未達なら差分と理由を報告 — 勝手に検収を「合格」にしない）
3. `npm test` 全緑（回帰14問・集計・content-integrity・loop 新規）
4. 試合日未設定でホームが practice-week 表示になり空白にならない（スクショ）
5. マイグレーション: reflect-history 5件を仕込んだ状態で起動→ match-cards に5件変換・reflect-history は無傷・再起動で増えない
6. バックアップ書き出しに match-cards / loop-state が含まれ、取り込みで ID 単位マージされる（Task 2 テスト＋手動1回）
- [ ] **Step 2: package.json の caret を外す**（地雷リスト2「依存はすべてバージョン固定」— package-lock の実解決版に固定）
- [ ] **Step 3: CLAUDE.md 更新** — アーキテクチャ節に lib/loop.js・components/loop.jsx・record.jsx・playbook.jsx、新キー match-cards / loop-state、「次のフェーズ」から Phase 2 を完了に。虚偽を残さない（乖離したCLAUDE.mdは次セッションを誤誘導する装置）。
- [ ] **Step 4: 最終Commit** — `git commit -am "docs(phase2): 検収記録とCLAUDE.md更新・依存バージョン固定 (Task 8)"`
- [ ] **Step 5: オーナー報告** — 検収数値（タップ数・diff stat・テスト数）を添えて main へのマージ承認を求める。**承認までpushしない。**

---

## Self-Review 記録

- 仕様カバレッジ: 設計書 §1-2(位相/ホーム)=Task 1,3 / §1-3(カード/マイグレーション)=Task 1,2,4 / §1-4(共通エンジン)=Task 6 / §1-5(吸収合併: SOLVE=Task 3,4・課題ビルダー昇格=Task 3・10モード降格=Task 5・チャット下段=Task 3で自然達成) / §1-6(プレイブック)=Task 7 / §1-7(検収)=各タスク＋Task 8
- 意図的な仕様簡約（要オーナー認識）: ①カード reflect に good/issue/improve を複製保存せず resultId 参照（肥大回避・RESULTS が正本） ②SOLVE は bottom-nav に残置（ホーム下段からのみ撤去 — 到達不能化はリスク） ③RESULT_TO_SYMPTOM の301件拡充は設計書どおり別工事
- 型整合: card.reflect = { mode, resultId, crumbs } を Task 1(migration)・Task 4(recordReflectStart)・Task 7(playbook) で共通使用。loopPhaseInfo の返り値 { mode, phase, days } を Task 3 が消費
