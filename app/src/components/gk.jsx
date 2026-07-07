// このファイルは index.html（Phase 0版）から Phase 1 S2 で機械分割された。
// 由来行: 9304-9545
import React, { useState } from 'react';
import { GK_COURSES, GK_SITUATIONS, gkBaselineCompare, gkCalcTendencies, gkCourseLabel, gkDateStr, gkFmtDate, gkSituationLabel, gkStats, gkWeekStart, gkWeeklySeries } from '../lib/gk.js';

function GKRecordWizard({ players, initial, onSave, onUndo, onExit }) {
  const [gk, setGk] = useState(initial.gk || null);
  const [situation, setSituation] = useState(initial.situation || null);
  const [shooter, setShooter] = useState(initial.shooter || null);
  const [course, setCourse] = useState(null);
  const [cue, setCue] = useState('');
  const [stage, setStage] = useState('setup'); // setup | predict | result
  const [lastSaved, setLastSaved] = useState(null);

  const handleResult = (hit) => {
    const rec = {
      id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: gkDateStr(), ts: Date.now(),
      gk, situation, shooter, course, cue: cue.trim(), hit,
    };
    onSave(rec);
    setLastSaved(rec);
    // 連続入力：GK・状況・シューターは維持し、コース・根拠だけリセット
    setCourse(null); setCue('');
    setStage('predict');
  };

  const chips = (list, cur, set) => (
    <div className="plan-themes">
      {list.map(name => (
        <button key={name} className={`plan-theme-chip ${cur === name ? 'active' : ''}`} onClick={() => set(name)}>{name}</button>
      ))}
    </div>
  );

  if (stage === 'setup') return (
    <React.Fragment>
      <button className="dict-back" onClick={onExit}>← GK予測ホームへ</button>
      <div className="tb-q-label">STEP 1 / 3 ─ 状況とメンバー</div>
      <div className="tb-q-text">誰が・どこから打つ？</div>
      <div className="tb-q-hint">入力はシューター側が行う（GK本人は入力しない）。</div>
      <div className="tb-field-label" style={{marginTop: 14}}>GK（予測する人）</div>
      {players.keepers.length ? chips(players.keepers, gk, setGk)
        : <div className="tb-q-hint">GKが未登録です。ホームの「選手リスト」で登録してください。</div>}
      <div className="tb-field-label" style={{marginTop: 14}}>状況</div>
      <div className="plan-themes">
        {GK_SITUATIONS.map(s => (
          <button key={s.id} className={`plan-theme-chip ${situation === s.id ? 'active' : ''}`} onClick={() => setSituation(s.id)}>{s.label}</button>
        ))}
      </div>
      <div className="tb-field-label" style={{marginTop: 14}}>シューター</div>
      {players.shooters.length ? chips(players.shooters, shooter, setShooter)
        : <div className="tb-q-hint">シューターが未登録です。ホームの「選手リスト」で登録してください。</div>}
      <button className="tb-next-btn" style={{marginTop: 16}} disabled={!gk || !situation || !shooter} onClick={() => setStage('predict')}>
        次へ：コースを予測する →
      </button>
    </React.Fragment>
  );

  if (stage === 'predict') return (
    <React.Fragment>
      <button className="dict-back" onClick={() => setStage('setup')}>← 状況・メンバーを変える</button>
      <div className="tb-q-label">STEP 2 / 3 ─ シュートの前に記入</div>
      <div className="tb-q-text">{gk} の予測：{shooter}（{gkSituationLabel(situation)}）はどこに打つ？</div>
      <div className="tb-q-hint">GKに口頭で予測を聞いて、シュートの<b>前</b>にタップ。左右はシューターから見た向き。</div>
      <div className="gk-grid">
        {GK_COURSES.map(c => (
          <button key={c.id} className={`gk-cell ${course === c.id ? 'selected' : ''}`} onClick={() => setCourse(c.id)}>{c.label}</button>
        ))}
      </div>
      <div className="tb-field" style={{marginTop: 14}}>
        <div className="tb-field-label">根拠の手がかり（任意・短文）</div>
        <input type="text" value={cue} onChange={e => setCue(e.target.value)} placeholder="例：助走角度が外向き／肩が早く開く" />
      </div>
      <button className="tb-next-btn" style={{marginTop: 16}} disabled={!course} onClick={() => setStage('result')}>
        予測を確定 → シュートへ
      </button>
      {lastSaved && (
        <button className="tb-ghost-btn" style={{marginTop: 10}} onClick={() => { onUndo(lastSaved.id); setLastSaved(null); }}>
          ↩ 直前の記録を取り消す（{lastSaved.shooter}・{gkCourseLabel(lastSaved.course)}・{lastSaved.hit ? '○的中' : '×不的中'}）
        </button>
      )}
    </React.Fragment>
  );

  // stage === 'result'
  return (
    <React.Fragment>
      <div className="tb-q-label">STEP 3 / 3 ─ シュートの後に記入</div>
      <div className="tb-q-text">結果は？（事実のみ・良し悪しの判定はしない）</div>
      <div className="tb-q-hint">予測：{gk} → <b>{gkCourseLabel(course)}</b>（{shooter}・{gkSituationLabel(situation)}）</div>
      <div className="gk-result-row">
        <button className="gk-result-btn hit" onClick={() => handleResult(true)}>○ 的中</button>
        <button className="gk-result-btn miss" onClick={() => handleResult(false)}>× 不的中</button>
      </div>
      <button className="tb-ghost-btn" style={{marginTop: 12}} onClick={() => setStage('predict')}>← 予測をやり直す</button>
    </React.Fragment>
  );
}

// GK予測：ホーム（集計・週別推移・シューター傾向・選手リスト管理・週次エクスポート）
function GKHome({ preds, players, onStart, onDelete, onAddPlayer, onRemovePlayer, onExport, onBackHub }) {
  const [newKeeper, setNewKeeper] = useState('');
  const [newShooter, setNewShooter] = useState('');
  const thisWeek = gkWeekStart(gkDateStr());
  const weekPreds = preds.filter(p => gkWeekStart(p.date) === thisWeek);
  const tend = gkCalcTendencies(preds);
  const ready = players.keepers.length > 0 && players.shooters.length > 0;

  const addPlayer = (role, name, clear) => {
    const n = name.trim();
    if (!n) return;
    onAddPlayer(role, n);
    clear('');
  };

  return (
    <React.Fragment>
      <button className="dict-back" onClick={onBackHub}>← 戻る（ホーム）</button>
      <div>
        <div className="tb-q-label">GK予測 ─ 予測して、照合する</div>
        <div className="tb-q-text">シュート前に予測、シュート後に照合</div>
        <div className="tb-q-hint">流れ：①状況・シューターを選ぶ → ②GKの予測コースをタップ → シュート → ③的中/不的中。
          入力はシューター側。結果は事実のみ（うまい下手の話ではない）。</div>
      </div>
      <button className="tb-next-btn" style={{marginTop: 12}} onClick={onStart} disabled={!ready}>▶ 予測をはじめる</button>
      {!ready && <div className="tb-yn-warn">先に下の「選手リスト」でGKとシューターを登録してください。</div>}

      {players.keepers.length > 0 && (
        <div className="tb-card" style={{marginTop: 16}}>
          <div className="tb-card-k">GK別 的中率（今週 / 累計）</div>
          {players.keepers.map(g => {
            const week = gkStats(weekPreds.filter(p => p.gk === g));
            const cum = gkStats(preds.filter(p => p.gk === g));
            const series = gkWeeklySeries(preds, g).slice(-6);
            return (
              <div key={g} className="tb-card-row">
                <div className="tb-card-v">
                  <b style={{color: 'var(--tx-primary)'}}>{g}</b>
                  　今週 {week.total ? `${week.hits}/${week.total}（${week.rate}%）` : '記録なし'}
                  　累計 {cum.total ? `${cum.hits}/${cum.total}（${cum.rate}%）` : '—'}
                </div>
                {series.length > 1 && (
                  <div className="tb-card-v" style={{fontSize: 'var(--fs-xs)'}}>
                    推移：{series.map(w => `${gkFmtDate(w.week)}週 ${w.rate}%`).join(' → ')}
                  </div>
                )}
                {(() => {
                  const bySit = GK_SITUATIONS.map(sit => ({ sit, s: gkStats(preds.filter(p => p.gk === g && p.situation === sit.id)) })).filter(x => x.s.total);
                  if (!bySit.length) return null;
                  return (
                    <div className="tb-card-v" style={{fontSize: 'var(--fs-xs)'}}>
                      累計内訳：{bySit.map(x => `${x.sit.label} ${x.s.hits}/${x.s.total}（${x.s.rate}%）`).join('／')}
                    </div>
                  );
                })()}
                {(() => {
                  const cmp = gkBaselineCompare(preds, g);
                  if (!cmp) return null;
                  return (
                    <div className="tb-card-v" style={{fontSize: 'var(--fs-xs)'}}>
                      照合：基準期 {cmp.baseRate}% → 直近週 {cmp.recentRate}%（{cmp.delta >= 0 ? '+' : ''}{cmp.delta}pt）
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {Object.keys(tend).length > 0 && (
        <div className="tb-card" style={{marginTop: 12}}>
          <div className="tb-card-k">シューター傾向（攻撃陣スカウティング兼用）</div>
          <div className="tb-card-v" style={{fontSize: 'var(--fs-xs)'}}>※実コースが確定する「的中」記録のみから算出</div>
          {Object.keys(tend).map(sh => {
            const dist = tend[sh];
            const parts = GK_COURSES.filter(c => dist[c.id]).map(c => `${c.label}${dist[c.id]}`);
            const totalPred = preds.filter(p => p.shooter === sh).length;
            return (
              <div key={sh} className="tb-card-row">
                <div className="tb-card-v"><b style={{color: 'var(--tx-primary)'}}>{sh}</b>　{parts.join('・')}（予測{totalPred}本）</div>
              </div>
            );
          })}
        </div>
      )}

      {preds.length > 0 && (
        <div className="tb-card" style={{marginTop: 12}}>
          <div className="tb-card-k">最近の記録（最新10件・誤入力は削除可）</div>
          {preds.slice(0, 10).map(p => (
            <div key={p.id} className="tb-card-row gk-list-row">
              <div className="tb-card-v">
                {gkFmtDate(p.date)} {p.gk}×{p.shooter}｜{gkSituationLabel(p.situation)}｜予測{gkCourseLabel(p.course)}｜{p.hit ? '○的中' : '×不的中'}
                {p.cue ? <span style={{color: 'var(--tx-muted)'}}>｜{p.cue}</span> : null}
              </div>
              <button className="gk-del-btn" onClick={() => { if (window.confirm('この記録を削除しますか？')) onDelete(p.id); }}>削除</button>
            </div>
          ))}
        </div>
      )}

      <div className="tb-card" style={{marginTop: 12}}>
        <div className="tb-card-k">選手リスト（この端末に保存）</div>
        <div className="tb-card-row">
          <div className="tb-field-label">GK</div>
          {players.keepers.map(n => (
            <div key={n} className="gk-list-row tb-card-row">
              <div className="tb-card-v">{n}</div>
              <button className="gk-del-btn" onClick={() => { if (window.confirm('「' + n + '」をリストから削除しますか？（過去の記録は消えません）')) onRemovePlayer('keepers', n); }}>削除</button>
            </div>
          ))}
          <div className="gk-add-row">
            <input type="text" value={newKeeper} onChange={e => setNewKeeper(e.target.value)} placeholder="GK名を追加" />
            <button className="gk-add-btn" onClick={() => addPlayer('keepers', newKeeper, setNewKeeper)}>＋追加</button>
          </div>
        </div>
        <div className="tb-card-row">
          <div className="tb-field-label">シューター</div>
          {players.shooters.map(n => (
            <div key={n} className="gk-list-row tb-card-row">
              <div className="tb-card-v">{n}</div>
              <button className="gk-del-btn" onClick={() => { if (window.confirm('「' + n + '」をリストから削除しますか？（過去の記録は消えません）')) onRemovePlayer('shooters', n); }}>削除</button>
            </div>
          ))}
          <div className="gk-add-row">
            <input type="text" value={newShooter} onChange={e => setNewShooter(e.target.value)} placeholder="シューター名を追加" />
            <button className="gk-add-btn" onClick={() => addPlayer('shooters', newShooter, setNewShooter)}>＋追加</button>
          </div>
        </div>
      </div>

      <button className="tb-ghost-btn" style={{marginTop: 12}} onClick={onExport} disabled={!preds.length}>
        📋 週次テキストをコピー（LINE共有・バックアップ）
      </button>
    </React.Fragment>
  );
}

// ═══════════════════════════════════════════════════
// ピヴォット認知モジュール（GKサイクル後続）
// 2軸認知→類型選択→予測→プレー→事実チェック→結果照合。
// 記録はユニット内バック陣が兼任する（ピヴォット本人は入力しない）。
// 類型選択は探索領域なのでアプリは検証・警告しない（地図の判定機化防止）。
// ═══════════════════════════════════════════════════


export { GKRecordWizard, GKHome };
