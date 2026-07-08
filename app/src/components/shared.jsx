// Phase B-3: 読みの回覧板（labShared）。
// 選手が自分で選んで共有した「丸付け済みの読み」をチーム全員が読める。
// 表示は実名（接続時に選んだ名簿表示名）・自分の投稿のみ削除可。firebase は import しない（App 側が IO）。
import React from 'react';
import { YOMI_TARGETS, kindLabel } from '../lib/loop.js';

function targetLabel(id) {
  const t = YOMI_TARGETS.find(x => x.id === id);
  return t ? t.label : '';
}

function SharedBoard({ entries, onRemove, onExit }) {
  return (
    <div className="plan-screen">
      <button className="dict-back" onClick={onExit}>← 戻る（ホーム）</button>
      <div className="tb-q-label">📣 チームの読み回覧板</div>
      <div className="tb-q-hint">
        みんなが自分で共有した「読み→結果」が新しい順に流れる。正解はない —
        外れた読みも、次に読む人の選択肢になる。
      </div>

      {entries === null && <div className="tb-q-hint" style={{ marginTop: 12 }}>読み込み中…</div>}

      {Array.isArray(entries) && entries.length === 0 && (
        <div className="tb-card" style={{ marginTop: 12 }}>
          <div className="tb-card-v">まだ回覧はありません。試合カードの丸付けが終わった読みに出る「📣 回覧」ボタンが最初の1枚です。</div>
        </div>
      )}

      {Array.isArray(entries) && entries.map(e => (
        <div key={e.id} className="tb-card" style={{ marginTop: 10 }}>
          <div className="tb-card-k">
            {e.name}　{e.date}{e.opponent ? ` vs ${e.opponent}` : ''}（{kindLabel(e.kind)}）
          </div>
          <div className="tb-card-v">
            {e.target ? `【${targetLabel(e.target)}】` : ''}{e.claim}
          </div>
          <div className="tb-card-v" style={{ marginTop: 4 }}>
            {e.hit ? '○ 当たった' : '× 外れた'}
          </div>
          {e.mine && (
            <button className="tb-ghost-btn" style={{ marginTop: 6 }} onClick={() => onRemove(e.id)}>
              🗑 自分の回覧を取り下げる
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export { SharedBoard };
