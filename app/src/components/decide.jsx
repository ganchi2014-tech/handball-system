// 「ここから、次に試すことを1つ宣言する」。
// 辞書の核心原則「選ぶのは自分」を、読んだ後の行動につなぐための小さな箱。
// 宣言した1つは、振り返りの最後で書く「次に試すこと」と同じ入れ物（next-declaration）に入り、
// ホームに出て「できた／まだ」を押せる。
import React, { useState } from 'react';
import { MENTAL_APP_URL } from '../lib/declWhere.js';

// 宣言がどこに出るかを、書いた本人に見せる（info は lib/declWhere.js の declWhere の結果）。
// full … 出る所を1行ずつ全部。そうでなければ1行にまとめる。
function DeclWhere({ info, full = false, done = false, onHowTo }) {
  if (!info) return null;
  const how = info.howto && onHowTo
    ? <button type="button" className="decl-where-how" onClick={onHowTo}>メンタルアプリとのつなぎ方を見る →</button>
    : info.mental
      ? <a className="decl-where-how" href={MENTAL_APP_URL} target="_blank" rel="noopener noreferrer">メンタルアプリを開く →</a>
      : null;
  if (!full) return <div className="decl-where short">📍 宣言が出る所：{info.short}{how}</div>;
  return (
    <div className="decl-where">
      <div className="decl-where-label">📍 {done ? 'この宣言が出ている所' : 'この宣言が出る所'}</div>
      {info.lines.map((l, i) => <div key={i} className="decl-where-line">・{l}</div>)}
      {how}
    </div>
  );
}

function DecideOne({ declaration, onDecide, where, onHowTo }) {
  const [text, setText] = useState('');
  const [justSet, setJustSet] = useState(false);
  const pending = declaration && declaration.done !== true ? declaration.text : '';
  const decide = () => {
    const t = text.trim();
    if (!t) return;
    onDecide(t);
    setText('');
    setJustSet(true);
  };
  return (
    <div className="decide-box">
      <div className="decide-label">🎯 ここから、次に試すことを1つ宣言する</div>
      <div className="decide-hint">選ぶのは自分。正解はない。宣言した1つは「前回の宣言」としてホームに出て、後で「できた／まだ」を押せる。</div>
      {justSet ? (
        <React.Fragment>
          <div className="decide-done">✓ 宣言した：「{pending}」
            <button className="decide-redo" onClick={() => setJustSet(false)}>書き直す</button>
          </div>
          <DeclWhere info={where} full done onHowTo={onHowTo} />
        </React.Fragment>
      ) : (
        <React.Fragment>
          {pending && <div className="decide-current">いまの宣言：「{pending}」（新しく書くと入れかわる）</div>}
          <div className="decide-row">
            <input className="decide-input" type="text" value={text} maxLength={60}
              placeholder="自分の言葉で1つ書く"
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') decide(); }} />
            <button className="decide-btn" disabled={!text.trim()} onClick={decide}>宣言する</button>
          </div>
          <DeclWhere info={where} onHowTo={onHowTo} />
        </React.Fragment>
      )}
    </div>
  );
}

export { DecideOne, DeclWhere };
