// このファイルは index.html（Phase 0版）から Phase 1 S2 で機械分割された。
// 由来行: 8848-9197
import React, { useState } from 'react';
import { TB_CHECKS, TB_COGNITION_OPTS, TB_CONSTRAINTS, TB_NEXT_MOVE_MAP, TB_Q0_TARGETS, tbJudgeRow, tbTaskToCardText } from '../lib/tb.js';

function tbCopy(text, setToast) {
  const done = () => { setToast('コピーした。LINEに貼り付けて共有'); setTimeout(() => setToast(null), 2200); };
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta); done();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(fallback);
  } else fallback();
}

function TBHome({ tasks, onNew, onOpen, onExport, onBackPlan }) {
  return (
    <React.Fragment>
      <button className="dict-back" onClick={onBackPlan}>← 練習を組むへ</button>
      <div>
        <div className="tb-q-label">自分の課題は自分で作る</div>
        <div className="tb-q-text">課題を作る行為が、課題と向き合う練習になる</div>
        <div className="tb-q-hint">流れ：①できなかった場面 → ②制約を1つ → ③成功の定義 → ④検証 → カード化してペアに共有 → 実施 → 振り返り</div>
      </div>
      <button className="tb-next-btn" onClick={onNew}>＋ 新しい課題を作る</button>
      {tasks.length > 0 && (
        <div>
          <div className="tb-field-label">作った課題（{tasks.length}）</div>
          <div className="tb-choices">
            {tasks.map(t => (
              <div key={t.id} className="tb-task-item" onClick={() => onOpen(t.id)}>
                <div className="tb-task-name">{t.name}{(t.version || 1) > 1 ? `　v${t.version}` : ''}</div>
                <div className="tb-task-meta">
                  {TB_CONSTRAINTS.find(c => c.id === t.constraintId)?.name}を操作 ・ 実施{(t.sessions || []).length}回
                  {t.sessions && t.sessions.length > 0 && ` ・ 直近 ${Math.round(t.sessions[t.sessions.length - 1].success / t.sessions[t.sessions.length - 1].attempts * 100)}%`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {tasks.length > 0 && (
        <div>
          <button className="tb-ghost-btn" onClick={onExport}>全履歴をテキストでコピー（保全用）</button>
          <div className="tb-small-note" style={{ marginTop: 6 }}>※ 履歴は端末内に保存される。機種変更やキャッシュ削除で消えるため、定期的にコピーしてLINEのKeepなどに保存すること</div>
        </div>
      )}
    </React.Fragment>
  );
}

function TBWizard({ baseTask, onSave, onCancel }) {
  const [step, setStep] = useState(1);
  const [cognition, setCognition] = useState(baseTask?.cognition || []);
  const [cognitionNote, setCognitionNote] = useState(baseTask?.cognitionNote || '');
  const [constraintId, setConstraintId] = useState(baseTask?.constraintId || null);
  const [constraintDetail, setConstraintDetail] = useState(baseTask?.constraintDetail || '');
  const [successResult, setSuccessResult] = useState(baseTask?.successResult || '');
  const [successProcess, setSuccessProcess] = useState(baseTask?.successProcess || '');
  const [attempts, setAttempts] = useState(baseTask?.attempts || 10);
  const [q0Targets, setQ0Targets] = useState(baseTask?.q0Targets || []);
  const [q0Note, setQ0Note] = useState(baseTask?.q0Note || '');
  const [checks, setChecks] = useState({});
  const [overrideReason, setOverrideReason] = useState('');
  const [name, setName] = useState(baseTask?.name || '');

  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  const constraint = TB_CONSTRAINTS.find(c => c.id === constraintId);
  const hasNo = TB_CHECKS.some(c => checks[c.id] === false);
  const allAnswered = TB_CHECKS.every(c => checks[c.id] !== undefined);
  const stepTitle = ['', '① できなかった場面', '② 制約を1つ選ぶ', '③ 成功の定義', '④ 検証', '⑤ 課題カード'][step];

  return (
    <React.Fragment>
      <button className="dict-back" onClick={() => step === 1 ? onCancel() : setStep(step - 1)}>← 戻る</button>
      <div className="tb-q-label">STEP {step} / 5 — {stepTitle}</div>

      {step === 1 && (<div>
        <div className="tb-q-text">受ける前、何が見えていなかった？</div>
        <div className="tb-q-hint">「シュートを外した」は症状。その手前、ボールを受ける前に見ていなかったものまで掘る。それが課題の起点になる</div>
        <div className="tb-choices" style={{ marginTop: 14 }}>
          {TB_COGNITION_OPTS.map(o => (
            <button key={o} className={`tb-choice ${cognition.includes(o) ? 'selected' : ''}`}
              onClick={() => toggle(cognition, setCognition, o)}>{o}</button>
          ))}
        </div>
        <div className="tb-field" style={{ marginTop: 14 }}>
          <div className="tb-field-label">場面メモ（いつ・どこで・何が起きたか）</div>
          <textarea value={cognitionNote} onChange={e => setCognitionNote(e.target.value)}
            placeholder="例：右45で受けた時、ポストの位置を見ておらず1択でカットインした" />
        </div>
        <button className="tb-next-btn" style={{ marginTop: 16 }} disabled={cognition.length === 0}
          onClick={() => setStep(2)}>次へ</button>
      </div>)}

      {step === 2 && (<div>
        <div className="tb-q-text">変える制約を1つだけ選ぶ</div>
        <div className="tb-q-hint">優先順位は 空間 → 人数 → 得点条件 → ルール。空間と人数は「見えるもの」自体を変える。1つしか選べない（複数変えると原因が分からなくなる）</div>
        <div className="tb-choices" style={{ marginTop: 14 }}>
          {TB_CONSTRAINTS.map(c => (
            <button key={c.id} className={`tb-choice ${constraintId === c.id ? 'selected' : ''}`}
              onClick={() => setConstraintId(c.id)}>
              <div className="tb-choice-title">{c.order}. {c.name}</div>
              <div className="tb-choice-desc">{c.desc}</div>
            </button>
          ))}
        </div>
        {constraint && (
          <div className="tb-field" style={{ marginTop: 14 }}>
            <div className="tb-field-label">具体的な設定（例：{constraint.examples.join(' ／ ')}）</div>
            <textarea value={constraintDetail} onChange={e => setConstraintDetail(e.target.value)}
              placeholder="自分の課題に合わせて書く" />
          </div>
        )}
        <button className="tb-next-btn" style={{ marginTop: 16 }} disabled={!constraintId || !constraintDetail.trim()}
          onClick={() => setStep(3)}>次へ</button>
      </div>)}

      {step === 3 && (<div>
        <div className="tb-q-text">「成功」を2層で決める</div>
        <div className="tb-q-hint">ここが一番むずかしい。結果だけだと「見てないけど入った」が混ざる。プロセスだけだと数えられない。両方を決めて、カウントはペアに任せる</div>
        <div className="tb-field" style={{ marginTop: 14 }}>
          <div className="tb-field-label">結果指標（ペアが数えられる形で）</div>
          <textarea value={successResult} onChange={e => setSuccessResult(e.target.value)}
            placeholder="例：シュートまたはアシストで終わる" />
        </div>
        <div className="tb-field">
          <div className="tb-field-label">プロセス指標（受け前に何をしていれば成功か）</div>
          <textarea value={successProcess} onChange={e => setSuccessProcess(e.target.value)}
            placeholder="例：受ける前にDFの重心を見て、逆を取る動きから始める" />
        </div>
        <div className="tb-field">
          <div className="tb-field-label">1セットの本数</div>
          <input type="number" min="5" max="30" value={attempts}
            onChange={e => setAttempts(parseInt(e.target.value || '10', 10))} />
        </div>
        <button className="tb-next-btn" style={{ marginTop: 16 }}
          disabled={!successResult.trim() || !successProcess.trim()}
          onClick={() => setStep(4)}>次へ</button>
      </div>)}

      {step === 4 && (<div>
        <div className="tb-q-text">第0問：この課題は、DFの何を変えさせる？</div>
        <div className="tb-q-hint">答えられなければ、それはDFのいない「動作の練習」になっている疑いが強い</div>
        <div className="tb-choices" style={{ marginTop: 12 }}>
          {TB_Q0_TARGETS.map(t => (
            <button key={t} className={`tb-choice ${q0Targets.includes(t) ? 'selected' : ''}`}
              onClick={() => toggle(q0Targets, setQ0Targets, t)}>DFの{t}</button>
          ))}
        </div>
        <div className="tb-field" style={{ marginTop: 12 }}>
          <div className="tb-field-label">どう変えさせるか（一言）</div>
          <input type="text" value={q0Note} onChange={e => setQ0Note(e.target.value)}
            placeholder="例：狭い空間でDFの連結を密にさせ、揺さぶらないと割れない状況を作る" />
        </div>
        <div className="tb-q-text" style={{ marginTop: 22, fontSize: 'var(--fs-md)' }}>検証4問</div>
        <div className="tb-choices" style={{ marginTop: 10 }}>
          {TB_CHECKS.map(c => (
            <div key={c.id}>
              <div className="tb-yn-row">
                <div className="tb-yn-q">{c.text}</div>
                <div className="tb-yn-btns">
                  <button className={`tb-yn-btn yes ${checks[c.id] === true ? 'on' : ''}`}
                    onClick={() => setChecks({ ...checks, [c.id]: true })}>Yes</button>
                  <button className={`tb-yn-btn no ${checks[c.id] === false ? 'on' : ''}`}
                    onClick={() => setChecks({ ...checks, [c.id]: false })}>No</button>
                </div>
              </div>
              {checks[c.id] === false && (
                <div className="tb-yn-warn">{c.hint} — <button onClick={() => setStep(c.back)}>STEP {c.back} に戻って直す</button></div>
              )}
            </div>
          ))}
        </div>
        {hasNo && allAnswered && (
          <div className="tb-field" style={{ marginTop: 14 }}>
            <div className="tb-field-label">それでも実施するなら、理由を書く（自分への説明）</div>
            <textarea value={overrideReason} onChange={e => setOverrideReason(e.target.value)}
              placeholder="Noのまま実施する理由。理由が書けないなら戻った方が早い" />
          </div>
        )}
        <button className="tb-next-btn" style={{ marginTop: 16 }}
          disabled={!allAnswered || q0Targets.length === 0 || !q0Note.trim() || (hasNo && !overrideReason.trim())}
          onClick={() => setStep(5)}>次へ</button>
      </div>)}

      {step === 5 && (<div>
        <div className="tb-q-text">課題に名前をつけて保存</div>
        <div className="tb-field" style={{ marginTop: 12 }}>
          <div className="tb-field-label">課題名</div>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="例：狭いセンター3対3" />
        </div>
        <div className="tb-card" style={{ marginTop: 14 }}>
          <div className="tb-card-name">{name || '（課題名）'}</div>
          <div className="tb-card-row"><div className="tb-card-k">起点</div>
            <div className="tb-card-v">{[...cognition, cognitionNote].filter(Boolean).join(' / ')}</div></div>
          <div className="tb-card-row"><div className="tb-card-k">制約：{constraint?.name}</div>
            <div className="tb-card-v">{constraintDetail}</div></div>
          <div className="tb-card-row"><div className="tb-card-k">成功の定義（{attempts}本）</div>
            <div className="tb-card-v">{`結果：${successResult}\nプロセス：${successProcess}（ペアが観察）`}</div></div>
          <div className="tb-card-row"><div className="tb-card-k">DFに変えさせるもの</div>
            <div className="tb-card-v">{q0Targets.join('・')} — {q0Note}</div></div>
          {overrideReason && (<div className="tb-card-row"><div className="tb-card-k">検証を通さず実施する理由</div>
            <div className="tb-card-v">{overrideReason}</div></div>)}
        </div>
        <div className="tb-q-hint" style={{ marginTop: 12 }}>保存したらカードをコピーしてLINEに共有 → ペアが「俺がDFならこう攻略する」をレビュー。攻略されたら解が1つの証拠、作り直す</div>
        <button className="tb-next-btn" style={{ marginTop: 14 }} disabled={!name.trim()}
          onClick={() => onSave({
            id: baseTask?.id || Date.now().toString(36),
            name, cognition, cognitionNote, constraintId, constraintDetail,
            successResult, successProcess, attempts, q0Targets, q0Note,
            overrideReason: overrideReason || null,
            sessions: baseTask?.sessions || [],
            version: baseTask?.version, history: baseTask?.history,
            created: baseTask?.created || new Date().toISOString(),
          })}>保存して共有へ</button>
      </div>)}
    </React.Fragment>
  );
}

function TBTaskDetail({ task, onUpdate, onRevise, onBack, setToast }) {
  const [tbPhase, setTbPhase] = useState('view');
  const [success, setSuccess] = useState('');
  const [solutions, setSolutions] = useState('');
  const [insight, setInsight] = useState('');
  const [move, setMove] = useState(null);
  const [reason, setReason] = useState('');

  const rate = success !== '' ? Number(success) / task.attempts : null;
  const hitRow = (rate !== null && solutions !== '') ? tbJudgeRow(rate, Number(solutions)) : null;
  const sessions = task.sessions || [];

  const saveSession = () => {
    const s = {
      date: new Date().toLocaleDateString('ja-JP'),
      version: task.version || 1,
      success: Number(success), attempts: task.attempts,
      solutions: Number(solutions), insight, move, reason,
    };
    onUpdate({ ...task, sessions: [...sessions, s] });
    setTbPhase('view'); setSuccess(''); setSolutions(''); setInsight(''); setMove(null); setReason('');
    setToast('記録した'); setTimeout(() => setToast(null), 1800);
  };

  return (
    <React.Fragment>
      <button className="dict-back" onClick={onBack}>← 課題一覧へ</button>
      <div className="tb-card">
        <div className="tb-card-name">{task.name}{(task.version || 1) > 1 ? `　v${task.version}` : ''}</div>
        <div className="tb-card-row"><div className="tb-card-k">制約：{TB_CONSTRAINTS.find(c => c.id === task.constraintId)?.name}</div>
          <div className="tb-card-v">{task.constraintDetail}</div></div>
        <div className="tb-card-row"><div className="tb-card-k">成功の定義（{task.attempts}本）</div>
          <div className="tb-card-v">{`結果：${task.successResult}\nプロセス：${task.successProcess}（ペアが観察）`}</div></div>
        <div className="tb-card-row"><div className="tb-card-k">DFに変えさせるもの</div>
          <div className="tb-card-v">{(task.q0Targets || []).join('・')} — {task.q0Note}</div></div>
      </div>
      <button className="tb-ghost-btn" onClick={() => tbCopy(tbTaskToCardText(task), setToast)}>カードをコピー（LINE共有・ペアレビュー用）</button>

      {tbPhase === 'view' && (<div>
        <button className="tb-next-btn" onClick={() => setTbPhase('review')}>実施した → 振り返る</button>
        {sessions.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div className="tb-field-label">実施ログ（{sessions.length}回）</div>
            {sessions.map((s, i) => (
              <div key={i} className="tb-session-log">
                <div className="tb-session-line"><b>{s.date}</b>{s.version ? `（v${s.version}）` : ''}　成功 {s.success}/{s.attempts}（{Math.round(s.success / s.attempts * 100)}%）　解 {s.solutions}つ</div>
                <div className="tb-session-line">次の一手：<b>{s.move}</b> — {s.reason}</div>
                {s.insight && <div className="tb-session-line">見えたもの：{s.insight}</div>}
              </div>
            ))}
          </div>
        )}
        {(task.history || []).length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div className="tb-field-label">課題の変遷</div>
            {task.history.map((h, i) => (
              <div key={i} className="tb-session-log">
                <div className="tb-session-line"><b>v{h.v}</b>　{TB_CONSTRAINTS.find(c => c.id === h.constraintId)?.name}：{h.constraintDetail}</div>
                {h.movedBy && <div className="tb-session-line">→ 動かした一手：<b>{h.movedBy.move}</b> — {h.movedBy.reason}</div>}
              </div>
            ))}
            <div className="tb-session-log">
              <div className="tb-session-line"><b>v{task.version || 1}（現在）</b>　{TB_CONSTRAINTS.find(c => c.id === task.constraintId)?.name}：{task.constraintDetail}</div>
            </div>
          </div>
        )}
        {sessions.length > 0 && (
          <button className="tb-ghost-btn" style={{ marginTop: 14 }} onClick={onRevise}>この課題を改訂する（次の一手を反映・履歴は引き継ぐ）</button>
        )}
      </div>)}

      {tbPhase === 'review' && (<div>
        <div className="tb-q-label">実施後の自己問答</div>
        <div className="tb-q-text" style={{ fontSize: 'var(--fs-md)' }}>ペアの観察データを入れる</div>
        <div className="tb-field" style={{ marginTop: 12 }}>
          <div className="tb-field-label">成功数（{task.attempts}本中・ペアのカウント）</div>
          <input type="number" min="0" max={task.attempts} value={success} onChange={e => setSuccess(e.target.value)} />
        </div>
        <div className="tb-field">
          <div className="tb-field-label">出ていた解の数（ペアのカウント）</div>
          <input type="number" min="0" max="9" value={solutions} onChange={e => setSolutions(e.target.value)} />
        </div>
        <div className="tb-field">
          <div className="tb-field-label">何が見えるようになった？（自分の言葉で）</div>
          <textarea value={insight} onChange={e => setInsight(e.target.value)} placeholder="例：受ける前に隣DFの距離が見えるようになった" />
        </div>
        {hitRow && (<div style={{ marginTop: 16 }}>
          <div className="tb-q-text" style={{ fontSize: 'var(--fs-md)' }}>次の一手 — 地図を見て自分で選ぶ</div>
          <div className="tb-rule-box" style={{ margin: '10px 0' }}>
            <b>運用ルール</b>：①動かすのは1回1変数 ②1回の結果で動かさない（3セッション連続で帯を外れてから） ③「変えない」も選択であり、理由を記録する
          </div>
          <div>
            {TB_NEXT_MOVE_MAP.map(r => (
              <div key={r.id} className={`tb-map-row ${r.id === hitRow ? 'hit' : ''}`}>
                <div className="tb-map-cond">{r.cond}{r.id === hitRow ? '　← いまここ' : ''}</div>
                <div className="tb-map-read">読み：{r.read}</div>
                {r.id === hitRow && (
                  <div className="tb-map-opts">
                    {r.opts.map(o => (
                      <button key={o} className={`tb-map-opt ${move === o ? 'selected' : ''}`} onClick={() => setMove(o)}>{o}</button>
                    ))}
                    <button className={`tb-map-opt ${move === '別の一手（自分で考えた）' ? 'selected' : ''}`}
                      onClick={() => setMove('別の一手（自分で考えた）')}>別の一手（自分で考えた）</button>
                  </div>
                )}
                {r.note && r.id === hitRow && <div className="tb-map-note">{r.note}</div>}
              </div>
            ))}
          </div>
          <div className="tb-field" style={{ marginTop: 12 }}>
            <div className="tb-field-label">その一手を選んだ理由（ここが自己問答）</div>
            <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="なぜそれを動かすのか。何が見えるようになると考えたか" />
          </div>
        </div>)}
        <button className="tb-next-btn" style={{ marginTop: 14 }}
          disabled={success === '' || solutions === '' || !move || !reason.trim()}
          onClick={saveSession}>記録する</button>
        <button className="tb-ghost-btn" style={{ marginTop: 8 }} onClick={() => setTbPhase('view')}>やめる</button>
      </div>)}
    </React.Fragment>
  );
}

// ═══════════════════════════════════════════════════
// GK予測モジュール（2026-07 GK先行サイクル）
// GKがシュート前にコースを予測→シュート後に的中/不的中を照合する。
// 入力はシューター側が行う（GK本人入力は自己奉仕バイアスのため不可）。
// 理論根拠：プレテスト効果（予測誤差学習）＋GK知覚トレーニング研究。
// ═══════════════════════════════════════════════════


export { tbCopy, TBHome, TBWizard, TBTaskDetail };
