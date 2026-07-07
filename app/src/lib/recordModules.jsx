// 記録モジュール（GK予測・ピヴォット認知）の宣言的スキーマ。
// Phase 2 Task 6 で components/gk.jsx と components/pv.jsx の複製実装を統合した。
// エンジン本体は components/record.jsx。文言・挙動は統合前と同一（変更禁止）。
import React from 'react';
import { GK_COURSES, GK_SITUATIONS, gkBaselineCompare, gkCalcTendencies, gkCourseLabel, gkDateStr, gkExportWeekText, gkFmtDate, gkSituationLabel, gkStats, gkWeekStart, gkWeeklySeries } from './gk.js';
import { PV_AXIS1, PV_AXIS2, PV_CUES, PV_RESULTS, PV_TYPES, pvAxisLabel, pvCalcTypeDist, pvCrossTypeResult, pvExportWeekText, pvNonBlockRate, pvResultLabel, pvTypeLabel } from './pv.js';

// ── ホーム統計カード（旧 GKHome / PVHome から移設。JSXは原文のまま） ──

function GKRateCard({ records, players }) {
  if (!players.keepers.length) return null;
  const thisWeek = gkWeekStart(gkDateStr());
  const weekPreds = records.filter(p => gkWeekStart(p.date) === thisWeek);
  return (
    <div className="tb-card" style={{marginTop: 16}}>
      <div className="tb-card-k">GK別 的中率（今週 / 累計）</div>
      {players.keepers.map(g => {
        const week = gkStats(weekPreds.filter(p => p.gk === g));
        const cum = gkStats(records.filter(p => p.gk === g));
        const series = gkWeeklySeries(records, g).slice(-6);
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
              const bySit = GK_SITUATIONS.map(sit => ({ sit, s: gkStats(records.filter(p => p.gk === g && p.situation === sit.id)) })).filter(x => x.s.total);
              if (!bySit.length) return null;
              return (
                <div className="tb-card-v" style={{fontSize: 'var(--fs-xs)'}}>
                  累計内訳：{bySit.map(x => `${x.sit.label} ${x.s.hits}/${x.s.total}（${x.s.rate}%）`).join('／')}
                </div>
              );
            })()}
            {(() => {
              const cmp = gkBaselineCompare(records, g);
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
  );
}

function GKTendencyCard({ records }) {
  const tend = gkCalcTendencies(records);
  if (!Object.keys(tend).length) return null;
  return (
    <div className="tb-card" style={{marginTop: 12}}>
      <div className="tb-card-k">シューター傾向（攻撃陣スカウティング兼用）</div>
      <div className="tb-card-v" style={{fontSize: 'var(--fs-xs)'}}>※実コースが確定する「的中」記録のみから算出</div>
      {Object.keys(tend).map(sh => {
        const dist = tend[sh];
        const parts = GK_COURSES.filter(c => dist[c.id]).map(c => `${c.label}${dist[c.id]}`);
        const totalPred = records.filter(p => p.shooter === sh).length;
        return (
          <div key={sh} className="tb-card-row">
            <div className="tb-card-v"><b style={{color: 'var(--tx-primary)'}}>{sh}</b>　{parts.join('・')}（予測{totalPred}本）</div>
          </div>
        );
      })}
    </div>
  );
}

function PVDistCard({ records, players }) {
  if (!players.pivots.length || !records.length) return null;
  const thisWeek = gkWeekStart(gkDateStr());
  const weekRecs = records.filter(r => gkWeekStart(r.date) === thisWeek);
  return (
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
  );
}

function PVCrossCard({ records }) {
  if (!records.length) return null;
  const cross = pvCrossTypeResult(records);
  return (
    <div className="tb-card" style={{marginTop: 12}}>
      <div className="tb-card-k">類型×結果（累計・チーム全体）</div>
      {PV_TYPES.filter(t => cross[t.id]).map(t => {
        const c = cross[t.id];
        return (
          <div key={t.id} className="tb-card-row">
            <div className="tb-card-v"><b style={{color: 'var(--tx-primary)'}}>{t.label}</b>　突破{c.break || 0}／被停止{c.stopped || 0}／受け直し{c.rereceive || 0}（{c.total}本）</div>
          </div>
        );
      })}
    </div>
  );
}

// ── スキーマ本体 ──
// actors: players オブジェクト内のリスト定義（key=保存フィールド, field=記録のsticky項目名）
// steps: 3段ウィザード。text/hint は文字列 or draft を受ける関数（JSX可）。
// フィールド必須判定は type が text/multichips 以外＝必須（エンジン側の規約）。

const GK_DEF = {
  id: 'gk',
  idPrefix: 'p',
  actors: [
    { key: 'keepers', field: 'gk', listLabel: 'GK', addPlaceholder: 'GK名を追加' },
    { key: 'shooters', field: 'shooter', listLabel: 'シューター', addPlaceholder: 'シューター名を追加' },
  ],
  home: {
    title: 'GK予測 ─ 予測して、照合する',
    lead: 'シュート前に予測、シュート後に照合',
    hint: '流れ：①状況・シューターを選ぶ → ②GKの予測コースをタップ → シュート → ③的中/不的中。 入力はシューター側。結果は事実のみ（うまい下手の話ではない）。',
    startLabel: '▶ 予測をはじめる',
    notReadyWarn: '先に下の「選手リスト」でGKとシューターを登録してください。',
    sections: [GKRateCard, GKTendencyCard],
  },
  exitLabel: '← GK予測ホームへ',
  steps: {
    setup: {
      label: 'STEP 1 / 3 ─ 状況とメンバー',
      text: '誰が・どこから打つ？',
      hint: '入力はシューター側が行う（GK本人は入力しない）。',
      fields: [
        { type: 'actor', field: 'gk', label: 'GK（予測する人）', playersKey: 'keepers', emptyHint: 'GKが未登録です。ホームの「選手リスト」で登録してください。' },
        { type: 'chips', field: 'situation', label: '状況', options: GK_SITUATIONS },
        { type: 'actor', field: 'shooter', label: 'シューター', playersKey: 'shooters', emptyHint: 'シューターが未登録です。ホームの「選手リスト」で登録してください。' },
      ],
      next: '次へ：コースを予測する →',
    },
    predict: {
      backLabel: '← 状況・メンバーを変える',
      label: 'STEP 2 / 3 ─ シュートの前に記入',
      text: d => `${d.gk} の予測：${d.shooter}（${gkSituationLabel(d.situation)}）はどこに打つ？`,
      hint: () => <React.Fragment>GKに口頭で予測を聞いて、シュートの<b>前</b>にタップ。左右はシューターから見た向き。</React.Fragment>,
      fields: [
        { type: 'grid', field: 'course', options: GK_COURSES },
        { type: 'text', field: 'cue', label: '根拠の手がかり（任意・短文）', placeholder: '例：助走角度が外向き／肩が早く開く' },
      ],
      next: '予測を確定 → シュートへ',
    },
    result: {
      label: 'STEP 3 / 3 ─ シュートの後に記入',
      text: '結果は？（事実のみ・良し悪しの判定はしない）',
      hint: d => <React.Fragment>予測：{d.gk} → <b>{gkCourseLabel(d.course)}</b>（{d.shooter}・{gkSituationLabel(d.situation)}）</React.Fragment>,
      backLabel: '← 予測をやり直す',
      resultField: 'hit',
      resultRowClass: 'gk-result-row',
      resultBtnClass: 'gk-result-btn',
      results: [
        { value: true, cls: 'hit', label: '○ 的中' },
        { value: false, cls: 'miss', label: '× 不的中' },
      ],
    },
  },
  // 連続入力：GK・状況・シューターは維持し、コース・根拠だけリセット
  sticky: ['gk', 'situation', 'shooter'],
  afterSaveStage: 'predict',
  undoStage: 'predict',
  toastFor: rec => rec.hit ? '記録した：○的中' : '記録した：×不的中',
  undoLabel: rec => `↩ 直前の記録を取り消す（${rec.shooter}・${gkCourseLabel(rec.course)}・${rec.hit ? '○的中' : '×不的中'}）`,
  recordLine: p => (
    <React.Fragment>
      {gkFmtDate(p.date)} {p.gk}×{p.shooter}｜{gkSituationLabel(p.situation)}｜予測{gkCourseLabel(p.course)}｜{p.hit ? '○的中' : '×不的中'}
      {p.cue ? <span style={{color: 'var(--tx-muted)'}}>｜{p.cue}</span> : null}
    </React.Fragment>
  ),
  exportText: gkExportWeekText,
};

const PV_DEF = {
  id: 'pv',
  idPrefix: 'v',
  actors: [
    { key: 'pivots', field: 'pivot', listLabel: 'ピヴォット', addPlaceholder: 'ピヴォット名を追加' },
  ],
  home: {
    title: 'ピヴォット認知 ─ 選んで、照合する',
    lead: '2軸で見て、類型を選び、事実で照合',
    hint: '流れ：①第0問（DFはどちら側？何に反応？）→ ②類型（①a/①b/②a/②b/③）＋予測 → プレー → ③確認できた事実＋結果。 入力はユニット内のバック陣が兼任。結果は事実のみ（うまい下手の話ではない）。どの類型を選ぶかは自由＝正解チェックはしない。',
    startLabel: '▶ 記録をはじめる',
    notReadyWarn: '先に下の「選手リスト」でピヴォットを登録してください。',
    sections: [PVDistCard, PVCrossCard],
  },
  exitLabel: '← ピヴォット認知ホームへ',
  steps: {
    setup: {
      label: 'STEP 1 / 3 ─ プレーの前に記入',
      text: '第0問：いまのDFはどう見えている？',
      hint: '入力はユニット内のバック陣が行う（ピヴォット本人に口頭で確認）。',
      fields: [
        { type: 'actor', field: 'pivot', label: 'ピヴォット', playersKey: 'pivots', emptyHint: 'ピヴォットが未登録です。ホームの「選手リスト」で登録してください。' },
        { type: 'chips', field: 'axis1', label: 'DFはどちら側？', options: PV_AXIS1 },
        { type: 'chips', field: 'axis2', label: 'DFは何に反応している？', options: PV_AXIS2 },
      ],
      next: '次へ：類型を選ぶ →',
    },
    predict: {
      backLabel: '← 第0問に戻る',
      label: 'STEP 2 / 3 ─ プレーの前に記入',
      text: d => `${d.pivot} の選択：どの類型でいく？`,
      hint: 'どれを選ぶかは自由（正解チェックはしない）。選んだら「この選択でDFはどうなる？」を短く。',
      fields: [
        { type: 'choices', field: 'type', options: PV_TYPES },
        { type: 'text', field: 'predict', label: '予測：この選択でDFはどうなる？（任意・短文）', placeholder: '例：重心が自分に残って隣が空く' },
      ],
      next: '記入を確定 → プレーへ',
    },
    result: {
      label: 'STEP 3 / 3 ─ プレーの後に記入',
      text: '確認できた事実と結果は？（事実のみ・良し悪しの判定はしない）',
      hint: d => <React.Fragment>選択：{d.pivot} → {pvTypeLabel(d.type)}（{pvAxisLabel(d)}）{d.predict ? `｜予測:${d.predict}` : ''}</React.Fragment>,
      backLabel: '← 類型・予測をやり直す',
      fields: [
        { type: 'multichips', field: 'cues', label: '実際に確認できた事実（複数可・0個でも可）', options: PV_CUES },
      ],
      resultLabel: '結果',
      resultField: 'result',
      resultRowClass: 'pv-result-row',
      resultBtnClass: 'pv-result-btn',
      results: PV_RESULTS.map(r => ({ value: r.id, cls: r.cls, label: r.label })),
    },
  },
  // 連続入力：ピヴォットは維持し、2軸・類型・予測・事実はリセット（毎プレー変わるため）
  sticky: ['pivot'],
  afterSaveStage: 'setup',
  undoStage: 'setup',
  toastFor: rec => `記録した：${pvResultLabel(rec.result)}`,
  undoLabel: rec => `↩ 直前の記録を取り消す（${rec.pivot}・${pvTypeLabel(rec.type)}・${pvResultLabel(rec.result)}）`,
  recordLine: r => (
    <React.Fragment>
      {gkFmtDate(r.date)} {r.pivot}｜{pvAxisLabel(r)}｜{pvTypeLabel(r.type)}｜{pvResultLabel(r.result)}
      {r.predict ? <span style={{color: 'var(--tx-muted)'}}>｜{r.predict}</span> : null}
    </React.Fragment>
  ),
  exportText: pvExportWeekText,
};

export const RECORD_MODULES = { gk: GK_DEF, pv: PV_DEF };
