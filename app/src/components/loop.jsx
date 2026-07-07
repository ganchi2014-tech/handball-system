// Phase 2: ループホーム。「いまループのどこにいるか」＋位相別の主ボタン1つ。
// 他モジュールは下段に格納（設計書1-2）。試合日は選手自身が設定・未設定でも全機能が動く。
import React, { useState } from 'react';
import { loopPhaseInfo, newMatchCard, YOMI_TARGETS, CARD_KINDS, kindLabel } from '../lib/loop.js';

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

      {/* 位相ヘッダ（タップで試合日設定） */}
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

      {/* 前回の宣言→できた？（検証位相ではフル表示、他位相は1行に畳む） */}
      {declaration && (
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

// 予測位相：試合前の読み宣言（3タップ起点・最大3件）。カードを作る/再開して yomi を書く。
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

// 検証位相：試合後5分。カード起点(1タップ)→読みの丸付け→4軸振り返り(既存フロー)→宣言。
function CardFlow({ cards, nextMatch, resumeCardId, onUpsert, onStartReflect, onPickIssue, onExit }) {
  // 再開対象: reflect 未接続の直近カード（読み宣言済みを優先）
  const pending = cards.find(c => !c.reflect && (c.yomi || []).length) || cards.find(c => !c.reflect);
  const initial = (resumeCardId && cards.find(c => c.id === resumeCardId)) || pending || null;
  const [card, setCard] = useState(initial);
  const save = (c) => { onUpsert(c); setCard(c); };
  // ストア側が新しければそちらを優先（reflect flow から戻った直後に反映されるように）
  const live = card && (cards.find(c => c.id === card.id) || card);

  if (!live) return (
    <div className="plan-screen">
      <button className="dict-back" onClick={onExit}>← 戻る（ホーム）</button>
      <div className="tb-q-label">📝 5分振り返り ─ 1試合=1カード</div>
      <div className="tb-q-text">何を振り返る？</div>
      <div className="tb-choices" style={{ marginTop: 12 }}>
        {CARD_KINDS.map(k => (
          <button key={k.id} className="tb-choice" onClick={() => {
            save(newMatchCard({ kind: k.id, opponent: nextMatch?.opponent || '' }));
          }}>
            <div className="tb-choice-title">{k.label}</div>
          </button>
        ))}
      </div>
    </div>
  );

  const unmarked = (live.yomi || []).filter(y => y.hit === null);
  return (
    <div className="plan-screen">
      <button className="dict-back" onClick={onExit}>← 戻る（ホーム）</button>
      <div className="tb-q-label">📝 5分振り返り ─ {kindLabel(live.kind)}{live.opponent ? ` vs ${live.opponent}` : ''}（{live.date}）</div>

      {(live.yomi || []).length > 0 && (
        <div className="tb-card" style={{ marginTop: 10 }}>
          <div className="tb-card-k">🔮 試合前の読み — 丸付け（事実のみ）</div>
          {live.yomi.map((y, i) => (
            <div key={i} className="tb-card-row">
              <div className="tb-card-v">【{(YOMI_TARGETS.find(t => t.id === y.target) || {}).label}】{y.claim}</div>
              <div className="gk-result-row" style={{ marginTop: 4 }}>
                <button className={`gk-result-btn hit ${y.hit === true ? 'selected' : ''}`}
                  onClick={() => save({ ...live, yomi: live.yomi.map((x, j) => j === i ? { ...x, hit: true } : x) })}>○ 当たった</button>
                <button className={`gk-result-btn miss ${y.hit === false ? 'selected' : ''}`}
                  onClick={() => save({ ...live, yomi: live.yomi.map((x, j) => j === i ? { ...x, hit: false } : x) })}>× 外れた</button>
              </div>
            </div>
          ))}
          {unmarked.length > 0 && <div className="tb-q-hint">未丸付け {unmarked.length} 件（わからないものは飛ばしてOK）</div>}
        </div>
      )}

      {!live.reflect ? (
        <button className="tb-next-btn" style={{ marginTop: 14 }} onClick={() => onStartReflect(live)}>
          🤾 4軸で振り返る →（良かった点・課題・改善案・次の一手）
        </button>
      ) : (
        <React.Fragment>
          <div className="tb-card" style={{ marginTop: 10 }}>
            <div className="tb-card-k">✓ 振り返り済み</div>
            <div className="tb-card-v">{(live.reflect.crumbs || []).join(' › ')}</div>
            {live.next && <div className="tb-card-v">🎯 宣言：「{live.next}」</div>}
          </div>
          <button className="tb-next-btn" style={{ marginTop: 10 }} onClick={() => onPickIssue(live)}>
            🎯 このカードから課題を1つ選ぶ →（課題解決へ）
          </button>
          <button className="tb-ghost-btn" style={{ marginTop: 8 }} onClick={() => onStartReflect(live)}>
            🤾 もう1プレー振り返る
          </button>
        </React.Fragment>
      )}
    </div>
  );
}

export { LoopHome, MatchDateEditor, YomiWizard, CardFlow };
