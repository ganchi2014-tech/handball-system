// Phase 2: マイ・プレイブック（最小版・1画面のみ）。数字は既存集計の再利用（設計書1-6）。
// 辞書項目の「自分の辞書」転記は Phase 4 で判断（肥大リスク）。
import React, { useState } from 'react';
import { cardStats, kindLabel } from '../lib/loop.js';
import { gkWeeklySeries, gkFmtDate, gkWeekStart } from '../lib/gk.js';
import { pvNonBlockRate } from '../lib/pv.js';
import { RESULTS } from '../lib/content.js';
import { GText } from './GText.jsx';

function Playbook({ cards, gkPreds, pvRecords, gkPlayers, pvPlayers, onBack }) {
  const [gkName, setGkName] = useState(gkPlayers.keepers[0] || null);
  const [pvName, setPvName] = useState(pvPlayers.pivots[0] || null);
  const s = cardStats(cards);
  const starred = cards.filter(c => c.star && c.reflect?.resultId && RESULTS[c.reflect.resultId]);
  // PV: 選手別・週別の②③率（gkWeeklySeries と同じ月曜起点）
  const pvSeries = (name) => {
    const byWeek = {};
    pvRecords.filter(r => r.pivot === name).forEach(r => {
      const w = gkWeekStart(r.date);
      (byWeek[w] = byWeek[w] || []).push(r);
    });
    return Object.keys(byWeek).sort().map(w => ({ week: w, rate: pvNonBlockRate(byWeek[w]) }));
  };
  return (
    <div className="plan-screen">
      <button className="dict-back" onClick={onBack}>← 戻る（ホーム）</button>
      <div className="tb-q-label">🗂 マイ・プレイブック</div>
      <div className="tb-q-text">自分の記録が1枚で見える</div>
      <div className="tb-q-hint">数字は事実の記録。良し悪しの判定はしない（隣と比べるものでもない）。</div>

      {/* ① 数字サマリー */}
      <div className="tb-card" style={{ marginTop: 12 }}>
        <div className="tb-card-k">これまでの積み上げ</div>
        <div className="tb-card-row"><div className="tb-card-v">🤾 振り返り：<b>{s.reflects}</b> 回（カード {cards.length} 枚）</div></div>
        <div className="tb-card-row"><div className="tb-card-v">🎯 宣言：{s.declared} 件{s.doneRate != null ? <>／達成 {s.done} 件（{s.doneRate}%）</> : null}</div></div>
        <div className="tb-card-row"><div className="tb-card-v">🔮 読み：{s.yomiTotal ? <>{s.yomiHit}/{s.yomiTotal} 的中（{s.yomiRate}%）</> : '丸付けした読みはまだない'}</div></div>
      </div>

      {/* ② 推移（GK的中率 / PV②③率） */}
      {gkPreds.length > 0 && gkPlayers.keepers.length > 0 && (
        <div className="tb-card" style={{ marginTop: 12 }}>
          <div className="tb-card-k">🧤 GK予測 的中率の推移（自分を選ぶ）</div>
          <div className="plan-themes">
            {gkPlayers.keepers.map(n => (
              <button key={n} className={`plan-theme-chip ${gkName === n ? 'active' : ''}`} onClick={() => setGkName(n)}>{n}</button>
            ))}
          </div>
          {gkName && (() => {
            const series = gkWeeklySeries(gkPreds, gkName).slice(-6);
            if (!series.length) return <div className="tb-card-v">記録なし</div>;
            return <div className="tb-card-v">{series.map(w => `${gkFmtDate(w.week)}週 ${w.rate}%`).join(' → ')}</div>;
          })()}
        </div>
      )}
      {pvRecords.length > 0 && pvPlayers.pivots.length > 0 && (
        <div className="tb-card" style={{ marginTop: 12 }}>
          <div className="tb-card-k">🧲 ピヴォット ②③選択率の推移（自分を選ぶ）</div>
          <div className="plan-themes">
            {pvPlayers.pivots.map(n => (
              <button key={n} className={`plan-theme-chip ${pvName === n ? 'active' : ''}`} onClick={() => setPvName(n)}>{n}</button>
            ))}
          </div>
          {pvName && (() => {
            const series = pvSeries(pvName).slice(-6);
            if (!series.length) return <div className="tb-card-v">記録なし</div>;
            return <div className="tb-card-v">{series.map(w => `${gkFmtDate(w.week)}週 ${w.rate}%`).join(' → ')}</div>;
          })()}
        </div>
      )}

      {/* ③ 効いた技（⭐したカードの「良かった点」） */}
      <div className="tb-card" style={{ marginTop: 12 }}>
        <div className="tb-card-k">⭐ 効いた技（カードで ⭐ を付けた「良かった点」）</div>
        {starred.length === 0 && <div className="tb-card-v">まだない。5分振り返りのカードで ⭐ を付けると、ここに積もる。</div>}
        {starred.map(c => (
          <div key={c.id} className="tb-card-row">
            <div className="tb-card-v" style={{ color: 'var(--tx-muted)', fontSize: 'var(--fs-xs)' }}>{c.date}｜{kindLabel(c.kind)}{c.opponent ? ` vs ${c.opponent}` : ''}</div>
            <GText as="div" className="tb-card-v" text={RESULTS[c.reflect.resultId].good} />
          </div>
        ))}
      </div>
    </div>
  );
}

export { Playbook };
