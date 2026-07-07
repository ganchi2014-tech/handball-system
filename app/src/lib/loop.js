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
  const reflects = list.filter(c => c.reflect && (c.reflect.resultId != null || c.reflect.mode)).length;
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
