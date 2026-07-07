// このファイルは index.html（Phase 0版）から Phase 1 S2 で機械分割された。
// 由来行: 9729-9938
import React, { useState } from 'react';
import { gkDateStr, gkFmtDate, gkWeekStart } from '../lib/gk.js';
import { PV_AXIS1, PV_AXIS2, PV_CUES, PV_RESULTS, PV_TYPES, pvAxisLabel, pvCalcTypeDist, pvCrossTypeResult, pvNonBlockRate, pvResultLabel, pvTypeLabel } from '../lib/pv.js';

function PVRecordWizard({ players, initial, onSave, onUndo, onExit }) {
  const [pivot, setPivot] = useState(initial.pivot || null);
  const [axis1, setAxis1] = useState(null);
  const [axis2, setAxis2] = useState(null);
  const [type, setType] = useState(null);
  const [predict, setPredict] = useState('');
  const [cues, setCues] = useState([]);
  const [stage, setStage] = useState('setup'); // setup | predict | result
  const [lastSaved, setLastSaved] = useState(null);

  const handleSave = (res) => {
    const rec = {
      id: 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: gkDateStr(), ts: Date.now(),
      pivot, axis1, axis2, type, predict: predict.trim(), cues, result: res,
    };
    onSave(rec);
    setLastSaved(rec);
    // 連続入力：ピヴォットは維持し、2軸・類型・予測・事実はリセット（毎プレー変わるため）
    setAxis1(null); setAxis2(null); setType(null); setPredict(''); setCues([]);
    setStage('setup');
  };

  const chips = (list, cur, set) => (
    <div className="plan-themes">
      {list.map(o => (
        <button key={o.id} className={`plan-theme-chip ${cur === o.id ? 'active' : ''}`} onClick={() => set(o.id)}>{o.label}</button>
      ))}
    </div>
  );

  if (stage === 'setup') return (
    <React.Fragment>
      <button className="dict-back" onClick={onExit}>← ピヴォット認知ホームへ</button>
      <div className="tb-q-label">STEP 1 / 3 ─ プレーの前に記入</div>
      <div className="tb-q-text">第0問：いまのDFはどう見えている？</div>
      <div className="tb-q-hint">入力はユニット内のバック陣が行う（ピヴォット本人に口頭で確認）。</div>
      <div className="tb-field-label" style={{marginTop: 14}}>ピヴォット</div>
      {players.pivots.length ? chips(players.pivots.map(n => ({ id: n, label: n })), pivot, setPivot)
        : <div className="tb-q-hint">ピヴォットが未登録です。ホームの「選手リスト」で登録してください。</div>}
      <div className="tb-field-label" style={{marginTop: 14}}>DFはどちら側？</div>
      {chips(PV_AXIS1, axis1, setAxis1)}
      <div className="tb-field-label" style={{marginTop: 14}}>DFは何に反応している？</div>
      {chips(PV_AXIS2, axis2, setAxis2)}
      <button className="tb-next-btn" style={{marginTop: 16}} disabled={!pivot || !axis1 || !axis2} onClick={() => setStage('predict')}>
        次へ：類型を選ぶ →
      </button>
      {lastSaved && (
        <button className="tb-ghost-btn" style={{marginTop: 10}} onClick={() => { onUndo(lastSaved.id); setLastSaved(null); }}>
          ↩ 直前の記録を取り消す（{lastSaved.pivot}・{pvTypeLabel(lastSaved.type)}・{pvResultLabel(lastSaved.result)}）
        </button>
      )}
    </React.Fragment>
  );

  if (stage === 'predict') return (
    <React.Fragment>
      <button className="dict-back" onClick={() => setStage('setup')}>← 第0問に戻る</button>
      <div className="tb-q-label">STEP 2 / 3 ─ プレーの前に記入</div>
      <div className="tb-q-text">{pivot} の選択：どの類型でいく？</div>
      <div className="tb-q-hint">どれを選ぶかは自由（正解チェックはしない）。選んだら「この選択でDFはどうなる？」を短く。</div>
      <div className="tb-choices" style={{marginTop: 12}}>
        {PV_TYPES.map(t => (
          <button key={t.id} className={`tb-choice ${type === t.id ? 'selected' : ''}`} onClick={() => setType(t.id)}>
            <div className="tb-choice-title">{t.label}</div>
            <div className="tb-choice-desc">{t.desc}</div>
          </button>
        ))}
      </div>
      <div className="tb-field" style={{marginTop: 14}}>
        <div className="tb-field-label">予測：この選択でDFはどうなる？（任意・短文）</div>
        <input type="text" value={predict} onChange={e => setPredict(e.target.value)} placeholder="例：重心が自分に残って隣が空く" />
      </div>
      <button className="tb-next-btn" style={{marginTop: 16}} disabled={!type} onClick={() => setStage('result')}>
        記入を確定 → プレーへ
      </button>
    </React.Fragment>
  );

  // stage === 'result'
  return (
    <React.Fragment>
      <div className="tb-q-label">STEP 3 / 3 ─ プレーの後に記入</div>
      <div className="tb-q-text">確認できた事実と結果は？（事実のみ・良し悪しの判定はしない）</div>
      <div className="tb-q-hint">選択：{pivot} → {pvTypeLabel(type)}（{pvAxisLabel({ axis1, axis2 })}）{predict ? `｜予測:${predict}` : ''}</div>
      <div className="tb-field-label" style={{marginTop: 14}}>実際に確認できた事実（複数可・0個でも可）</div>
      <div className="plan-themes">
        {PV_CUES.map(c => (
          <button key={c.id} className={`plan-theme-chip ${cues.includes(c.id) ? 'active' : ''}`}
            onClick={() => setCues(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="tb-field-label" style={{marginTop: 14}}>結果</div>
      <div className="pv-result-row">
        {PV_RESULTS.map(r => (
          <button key={r.id} className={`pv-result-btn ${r.cls}`} onClick={() => handleSave(r.id)}>{r.label}</button>
        ))}
      </div>
      <button className="tb-ghost-btn" style={{marginTop: 12}} onClick={() => setStage('predict')}>← 類型・予測をやり直す</button>
    </React.Fragment>
  );
}

// ピヴォット認知：ホーム（類型分布・②③率・類型×結果・選手リスト・週次エクスポート）
function PVHome({ records, players, onStart, onDelete, onAddPlayer, onRemovePlayer, onExport, onBackHub }) {
  const [newPivot, setNewPivot] = useState('');
  const thisWeek = gkWeekStart(gkDateStr());
  const weekRecs = records.filter(r => gkWeekStart(r.date) === thisWeek);
  const ready = players.pivots.length > 0;

  const addPivot = () => {
    const n = newPivot.trim();
    if (!n) return;
    onAddPlayer(n);
    setNewPivot('');
  };

  return (
    <React.Fragment>
      <button className="dict-back" onClick={onBackHub}>← 戻る（ホーム）</button>
      <div>
        <div className="tb-q-label">ピヴォット認知 ─ 選んで、照合する</div>
        <div className="tb-q-text">2軸で見て、類型を選び、事実で照合</div>
        <div className="tb-q-hint">流れ：①第0問（DFはどちら側？何に反応？）→ ②類型（①a/①b/②a/②b/③）＋予測 → プレー → ③確認できた事実＋結果。
          入力はユニット内のバック陣が兼任。結果は事実のみ（うまい下手の話ではない）。どの類型を選ぶかは自由＝正解チェックはしない。</div>
      </div>
      <button className="tb-next-btn" style={{marginTop: 12}} onClick={onStart} disabled={!ready}>▶ 記録をはじめる</button>
      {!ready && <div className="tb-yn-warn">先に下の「選手リスト」でピヴォットを登録してください。</div>}

      {players.pivots.length > 0 && records.length > 0 && (
        <div className="tb-card" style={{marginTop: 16}}>
          <div className="tb-card-k">類型選択分布（今週 / 累計）※①に安住していないかを見る</div>
          {players.pivots.map(pv => {
            const mineW = weekRecs.filter(r => r.pivot === pv);
            const mineAll = records.filter(r => r.pivot === pv);
            if (!mineAll.length) return null;
            const distAll = pvCalcTypeDist(mineAll)[pv] || {};
            const parts = PV_TYPES.filter(t => distAll[t.id]).map(t => `${t.label.slice(0, 2)}${distAll[t.id]}`);
            return (
              <div key={pv} className="tb-card-row">
                <div className="tb-card-v">
                  <b style={{color: 'var(--tx-primary)'}}>{pv}</b>
                  　今週 {mineW.length ? `${mineW.length}本・②③率${pvNonBlockRate(mineW)}%` : '記録なし'}
                  　累計 {mineAll.length}本・②③率{pvNonBlockRate(mineAll)}%
                </div>
                <div className="tb-card-v" style={{fontSize: 'var(--fs-xs)'}}>累計分布：{parts.join('・')}</div>
              </div>
            );
          })}
        </div>
      )}

      {records.length > 0 && (
        <div className="tb-card" style={{marginTop: 12}}>
          <div className="tb-card-k">類型×結果（累計・チーム全体）</div>
          {(() => {
            const cross = pvCrossTypeResult(records);
            return PV_TYPES.filter(t => cross[t.id]).map(t => {
              const c = cross[t.id];
              return (
                <div key={t.id} className="tb-card-row">
                  <div className="tb-card-v"><b style={{color: 'var(--tx-primary)'}}>{t.label}</b>　突破{c.break || 0}／被停止{c.stopped || 0}／受け直し{c.rereceive || 0}（{c.total}本）</div>
                </div>
              );
            });
          })()}
        </div>
      )}

      {records.length > 0 && (
        <div className="tb-card" style={{marginTop: 12}}>
          <div className="tb-card-k">最近の記録（最新10件・誤入力は削除可）</div>
          {records.slice(0, 10).map(r => (
            <div key={r.id} className="tb-card-row gk-list-row">
              <div className="tb-card-v">
                {gkFmtDate(r.date)} {r.pivot}｜{pvAxisLabel(r)}｜{pvTypeLabel(r.type)}｜{pvResultLabel(r.result)}
                {r.predict ? <span style={{color: 'var(--tx-muted)'}}>｜{r.predict}</span> : null}
              </div>
              <button className="gk-del-btn" onClick={() => { if (window.confirm('この記録を削除しますか？')) onDelete(r.id); }}>削除</button>
            </div>
          ))}
        </div>
      )}

      <div className="tb-card" style={{marginTop: 12}}>
        <div className="tb-card-k">選手リスト（この端末に保存）</div>
        <div className="tb-card-row">
          <div className="tb-field-label">ピヴォット</div>
          {players.pivots.map(n => (
            <div key={n} className="gk-list-row tb-card-row">
              <div className="tb-card-v">{n}</div>
              <button className="gk-del-btn" onClick={() => { if (window.confirm('「' + n + '」をリストから削除しますか？（過去の記録は消えません）')) onRemovePlayer(n); }}>削除</button>
            </div>
          ))}
          <div className="gk-add-row">
            <input type="text" value={newPivot} onChange={e => setNewPivot(e.target.value)} placeholder="ピヴォット名を追加" />
            <button className="gk-add-btn" onClick={addPivot}>＋追加</button>
          </div>
        </div>
      </div>

      <button className="tb-ghost-btn" style={{marginTop: 12}} onClick={onExport} disabled={!records.length}>
        📋 週次テキストをコピー（LINE共有・バックアップ）
      </button>
    </React.Fragment>
  );
}


export { PVRecordWizard, PVHome };
