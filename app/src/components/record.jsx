// GK予測・ピヴォット認知の共通エンジン（Phase 2 Task 6）。
// スキーマは lib/recordModules.jsx。旧 gk.jsx / pv.jsx と文言・挙動同一。
import React, { useState } from 'react';
import { gkDateStr } from '../lib/gk.js';
import { tbCopy } from './tb.jsx';

const STAGES = ['setup', 'predict', 'result'];
const draftDefault = (f) => f.type === 'text' ? '' : f.type === 'multichips' ? [] : null;
const allFields = (def) => STAGES.flatMap(s => def.steps[s].fields || []);

// スキーマのフィールド1件を描画（規約：text/multichips 以外は必須扱い）
function Field({ f, draft, set, players }) {
  const chipRow = (options) => (
    <div className="plan-themes">
      {options.map(o => (
        <button key={o.id} className={`plan-theme-chip ${draft[f.field] === o.id ? 'active' : ''}`} onClick={() => set(f.field, o.id)}>{o.label}</button>
      ))}
    </div>
  );
  if (f.type === 'actor') return (
    <React.Fragment>
      <div className="tb-field-label" style={{marginTop: 14}}>{f.label}</div>
      {players[f.playersKey].length ? chipRow(players[f.playersKey].map(n => ({ id: n, label: n })))
        : <div className="tb-q-hint">{f.emptyHint}</div>}
    </React.Fragment>
  );
  if (f.type === 'chips') return (
    <React.Fragment>
      <div className="tb-field-label" style={{marginTop: 14}}>{f.label}</div>
      {chipRow(f.options)}
    </React.Fragment>
  );
  if (f.type === 'multichips') return (
    <React.Fragment>
      <div className="tb-field-label" style={{marginTop: 14}}>{f.label}</div>
      <div className="plan-themes">
        {f.options.map(c => (
          <button key={c.id} className={`plan-theme-chip ${draft[f.field].includes(c.id) ? 'active' : ''}`}
            onClick={() => set(f.field, prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])}>
            {c.label}
          </button>
        ))}
      </div>
    </React.Fragment>
  );
  if (f.type === 'grid') return (
    <div className="gk-grid">
      {f.options.map(c => (
        <button key={c.id} className={`gk-cell ${draft[f.field] === c.id ? 'selected' : ''}`} onClick={() => set(f.field, c.id)}>{c.label}</button>
      ))}
    </div>
  );
  if (f.type === 'choices') return (
    <div className="tb-choices" style={{marginTop: 12}}>
      {f.options.map(t => (
        <button key={t.id} className={`tb-choice ${draft[f.field] === t.id ? 'selected' : ''}`} onClick={() => set(f.field, t.id)}>
          <div className="tb-choice-title">{t.label}</div>
          <div className="tb-choice-desc">{t.desc}</div>
        </button>
      ))}
    </div>
  );
  // type === 'text'
  return (
    <div className="tb-field" style={{marginTop: 14}}>
      <div className="tb-field-label">{f.label}</div>
      <input type="text" value={draft[f.field]} onChange={e => set(f.field, e.target.value)} placeholder={f.placeholder} />
    </div>
  );
}

function RecordWizard({ def, players, initial, onSave, onUndo, onExit }) {
  const [draft, setDraft] = useState(() => {
    const d = {};
    for (const f of allFields(def)) d[f.field] = (def.sticky.includes(f.field) && initial[f.field]) || draftDefault(f);
    return d;
  });
  const [stage, setStage] = useState('setup'); // setup | predict | result
  const [lastSaved, setLastSaved] = useState(null);
  const set = (field, val) => setDraft(prev => ({ ...prev, [field]: typeof val === 'function' ? val(prev[field]) : val }));

  const handleResult = (value) => {
    const rec = { id: def.idPrefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: gkDateStr(), ts: Date.now() };
    for (const f of allFields(def)) rec[f.field] = f.type === 'text' ? draft[f.field].trim() : draft[f.field];
    rec[def.steps.result.resultField] = value;
    onSave(rec);
    setLastSaved(rec);
    // 連続入力：sticky項目は維持し、それ以外だけリセット
    setDraft(prev => {
      const d = { ...prev };
      for (const f of allFields(def)) if (!def.sticky.includes(f.field)) d[f.field] = draftDefault(f);
      return d;
    });
    setStage(def.afterSaveStage);
  };

  const step = def.steps[stage];
  const txt = (v) => typeof v === 'function' ? v(draft) : v;
  const nextDisabled = (step.fields || []).some(f => f.type !== 'text' && f.type !== 'multichips' && !draft[f.field]);

  return (
    <React.Fragment>
      {stage === 'setup' && <button className="dict-back" onClick={onExit}>{def.exitLabel}</button>}
      {stage === 'predict' && <button className="dict-back" onClick={() => setStage('setup')}>{step.backLabel}</button>}
      <div className="tb-q-label">{step.label}</div>
      <div className="tb-q-text">{txt(step.text)}</div>
      <div className="tb-q-hint">{txt(step.hint)}</div>
      {(step.fields || []).map(f => <Field key={f.field} f={f} draft={draft} set={set} players={players} />)}
      {stage !== 'result' ? (
        <button className="tb-next-btn" style={{marginTop: 16}} disabled={nextDisabled} onClick={() => setStage(stage === 'setup' ? 'predict' : 'result')}>
          {step.next}
        </button>
      ) : (
        <React.Fragment>
          {step.resultLabel && <div className="tb-field-label" style={{marginTop: 14}}>{step.resultLabel}</div>}
          <div className={step.resultRowClass}>
            {step.results.map(r => (
              <button key={String(r.value)} className={`${step.resultBtnClass} ${r.cls}`} onClick={() => handleResult(r.value)}>{r.label}</button>
            ))}
          </div>
          <button className="tb-ghost-btn" style={{marginTop: 12}} onClick={() => setStage('predict')}>{step.backLabel}</button>
        </React.Fragment>
      )}
      {stage === def.undoStage && lastSaved && (
        <button className="tb-ghost-btn" style={{marginTop: 10}} onClick={() => { onUndo(lastSaved.id); setLastSaved(null); }}>
          {def.undoLabel(lastSaved)}
        </button>
      )}
    </React.Fragment>
  );
}

// 共通ホーム（統計カード・最近の記録・選手リスト管理・週次エクスポート）
function RecordHome({ def, records, players, onStart, onDelete, onAddPlayer, onRemovePlayer, onExport, onBackHub }) {
  const [newNames, setNewNames] = useState({});
  const ready = def.actors.every(a => players[a.key].length > 0);

  const addPlayer = (key) => {
    const n = (newNames[key] || '').trim();
    if (!n) return;
    onAddPlayer(key, n);
    setNewNames(prev => ({ ...prev, [key]: '' }));
  };

  return (
    <React.Fragment>
      <button className="dict-back" onClick={onBackHub}>← 戻る（ホーム）</button>
      <div>
        <div className="tb-q-label">{def.home.title}</div>
        <div className="tb-q-text">{def.home.lead}</div>
        <div className="tb-q-hint">{def.home.hint}</div>
      </div>
      <button className="tb-next-btn" style={{marginTop: 12}} onClick={onStart} disabled={!ready}>{def.home.startLabel}</button>
      {!ready && <div className="tb-yn-warn">{def.home.notReadyWarn}</div>}

      {def.home.sections.map((Section, i) => <Section key={i} records={records} players={players} />)}

      {records.length > 0 && (
        <div className="tb-card" style={{marginTop: 12}}>
          <div className="tb-card-k">最近の記録（最新10件・誤入力は削除可）</div>
          {records.slice(0, 10).map(r => (
            <div key={r.id} className="tb-card-row gk-list-row">
              <div className="tb-card-v">{def.recordLine(r)}</div>
              <button className="gk-del-btn" onClick={() => { if (window.confirm('この記録を削除しますか？')) onDelete(r.id); }}>削除</button>
            </div>
          ))}
        </div>
      )}

      <div className="tb-card" style={{marginTop: 12}}>
        <div className="tb-card-k">選手リスト（この端末に保存）</div>
        {def.actors.map(a => (
          <div key={a.key} className="tb-card-row">
            <div className="tb-field-label">{a.listLabel}</div>
            {players[a.key].map(n => (
              <div key={n} className="gk-list-row tb-card-row">
                <div className="tb-card-v">{n}</div>
                <button className="gk-del-btn" onClick={() => { if (window.confirm('「' + n + '」をリストから削除しますか？（過去の記録は消えません）')) onRemovePlayer(a, n); }}>削除</button>
              </div>
            ))}
            <div className="gk-add-row">
              <input type="text" value={newNames[a.key] || ''} onChange={e => setNewNames(prev => ({ ...prev, [a.key]: e.target.value }))} placeholder={a.addPlaceholder} />
              <button className="gk-add-btn" onClick={() => addPlayer(a.key)}>＋追加</button>
            </div>
          </div>
        ))}
      </div>

      <button className="tb-ghost-btn" style={{marginTop: 12}} onClick={onExport} disabled={!records.length}>
        📋 週次テキストをコピー（LINE共有・バックアップ）
      </button>
    </React.Fragment>
  );
}

function RecordModule({ def, records, setRecords, players, setPlayers, view, setView, lastSetupRef, onBackHub }) {
  const [toast, setToast] = useState(null);

  const handleSave = (rec) => {
    if (navigator.vibrate) navigator.vibrate(30);
    const sticky = {};
    def.sticky.forEach(k => { sticky[k] = rec[k]; });
    lastSetupRef.current = sticky;
    setRecords(prev => [rec, ...prev]);
    setToast(def.toastFor(rec));
    setTimeout(() => setToast(null), 1800);
  };

  return (
    <React.Fragment>
      {view.name === 'home' && (
        <RecordHome def={def} records={records} players={players}
          onStart={() => setView({ name: 'record' })}
          onDelete={(id) => setRecords(prev => prev.filter(r => r.id !== id))}
          onAddPlayer={(key, name) => setPlayers(prev => prev[key].includes(name) ? prev : { ...prev, [key]: [...prev[key], name] })}
          onRemovePlayer={(actor, name) => {
            // 削除した選手が連続入力の直前選択に残っていたらクリア（Task 3レビュー指摘）
            if (lastSetupRef.current[actor.field] === name) delete lastSetupRef.current[actor.field];
            setPlayers(prev => ({ ...prev, [actor.key]: prev[actor.key].filter(n => n !== name) }));
          }}
          onExport={() => tbCopy(def.exportText(records), setToast)}
          onBackHub={onBackHub} />
      )}
      {view.name === 'record' && (
        <RecordWizard def={def} players={players} initial={lastSetupRef.current}
          onSave={handleSave}
          onUndo={(id) => setRecords(prev => prev.filter(r => r.id !== id))}
          onExit={() => setView({ name: 'home' })} />
      )}
      {toast && <div className="tb-toast">{toast}</div>}
    </React.Fragment>
  );
}

export { RecordModule };
