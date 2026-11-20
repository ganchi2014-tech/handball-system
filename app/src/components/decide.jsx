// 「ここから、次に試すことを1つ宣言する」。
// 辞書の核心原則「選ぶのは自分」を、読んだ後の行動につなぐための小さな箱。
// 宣言した1つは、振り返りの最後で書く「次に試すこと」と同じ入れ物（next-declaration）に入り、
// ホームに出て「できた／まだ」を押せる。
import React, { useState } from 'react';

function DecideOne({ declaration, onDecide }) {
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
        <div className="decide-done">✓ 宣言した：「{pending}」
          <button className="decide-redo" onClick={() => setJustSet(false)}>書き直す</button>
        </div>
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
        </React.Fragment>
      )}
    </div>
  );
}

export { DecideOne };
