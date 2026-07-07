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

export { LoopHome, MatchDateEditor };
