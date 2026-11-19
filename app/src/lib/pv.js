// このファイルは index.html（Phase 0版）から Phase 1 S2 で機械分割された。
// 由来行: 9546-9642
import { gkDateStr, gkExportWeekText, gkFmtDate, gkWeekStart } from './gk.js';

const PV_TYPES = [
  { id: '1a', label: '①a ブロック・表', desc: 'DFとボールの間に入り、背中でブロックする' },
  { id: '1b', label: '①b ブロック・裏', desc: 'DFの背中側にブロックする（次のパスや、味方のドライブ・カットインを通す）' },
  { id: '2a', label: '②a スライド・同期', desc: '隣のDFの裏のスペースへ、パサーが出せるタイミングで動く' },
  { id: '2b', label: '②b スライド・拡張', desc: 'ボールを持つ味方が仕掛ける前に動き、DFをついて来させてスペースを広げる' },
  { id: '3', label: '③ はなれる', desc: '自分のスペースに味方が攻めてきたら、ボールの方向に体を向けたまま隣のスペースへ離れる' },
];
const PV_AXIS1 = [
  { id: 'ball', label: 'ボール側' },
  { id: 'self', label: '自分側' },
];
const PV_AXIS2 = [
  { id: 'man', label: '人に反応' },
  { id: 'space', label: '空間に反応' },
];
const PV_CUES = [
  { id: 'df-weight', label: 'DFの体重が乗っている足' },
  { id: 'passer', label: 'パサーの目と腕' },
  { id: 'holder', label: 'ボールを持つ味方の進む向きと声' },
];
const PV_RESULTS = [
  { id: 'break', label: '突破', cls: 'break' },
  { id: 'stopped', label: '止められた', cls: 'stopped' },
  { id: 'rereceive', label: '受け直し', cls: 'rereceive' },
];
const pvTypeLabel = (id) => (PV_TYPES.find(t => t.id === id) || {}).label || id;
const pvResultLabel = (id) => (PV_RESULTS.find(r => r.id === id) || {}).label || id;
const pvAxisLabel = (rec) => {
  const a1 = (PV_AXIS1.find(a => a.id === rec.axis1) || {}).label || rec.axis1;
  const a2 = (PV_AXIS2.find(a => a.id === rec.axis2) || {}).label || rec.axis2;
  return `${a1}・${a2}`;
};

// 選手別の類型選択分布 {pivot: {typeId: count}}（①偏重の可視化。週次エクスポートにも含める）
function pvCalcTypeDist(records) {
  const d = {};
  records.forEach(r => {
    if (!d[r.pivot]) d[r.pivot] = {};
    d[r.pivot][r.type] = (d[r.pivot][r.type] || 0) + 1;
  });
  return d;
}

// ②③（スライド・はなれる）選択率 0-100 | null（①安住の逆指標）
function pvNonBlockRate(records) {
  if (!records.length) return null;
  const n = records.filter(r => r.type !== '1a' && r.type !== '1b').length;
  return Math.round(n / records.length * 100);
}

// 類型×結果クロス集計 {typeId: {resultId: count, total}}
function pvCrossTypeResult(records) {
  const c = {};
  records.forEach(r => {
    if (!c[r.type]) c[r.type] = { total: 0 };
    c[r.type][r.result] = (c[r.type][r.result] || 0) + 1;
    c[r.type].total += 1;
  });
  return c;
}

// 週次テキストエクスポート（揮発対策：当該週の集計＋生記録。gkExportWeekText と同形式）
function pvExportWeekText(records, weekStartStr) {
  const ws = weekStartStr || gkWeekStart(gkDateStr());
  const weekRecs = records.filter(r => gkWeekStart(r.date) === ws);
  const end = new Date(ws + 'T00:00:00');
  end.setDate(end.getDate() + 6);
  const lines = [];
  lines.push(`🧲 ピヴォット認知 週次レポート（${gkFmtDate(ws)}〜${gkFmtDate(gkDateStr(end))}）`);
  lines.push('━━━━━━━━━━━━━━');
  lines.push('■ 選んだ動きの型（今週）※①ばかりになっていないか');
  const pivots = [...new Set(weekRecs.map(r => r.pivot))];
  if (!pivots.length) lines.push('  記録なし');
  pivots.forEach(pv => {
    const mine = weekRecs.filter(r => r.pivot === pv);
    const dist = pvCalcTypeDist(mine)[pv] || {};
    const parts = PV_TYPES.filter(t => dist[t.id]).map(t => `${t.label.slice(0, 2)}${dist[t.id]}`);
    lines.push(`・${pv}：${parts.join('・')}（${mine.length}本・②③率${pvNonBlockRate(mine)}%）`);
    const cross = pvCrossTypeResult(mine);
    PV_TYPES.forEach(t => {
      const c = cross[t.id];
      if (c) lines.push(`    ${t.label.slice(0, 2)}：突破${c.break || 0}／止められた${c.stopped || 0}／受け直し${c.rereceive || 0}`);
    });
  });
  lines.push('');
  lines.push(`■ 今週の全記録（${weekRecs.length}件）※バックアップ`);
  weekRecs.slice().sort((a, b) => a.ts - b.ts).forEach(r => {
    const cues = (r.cues || []).map(c => (PV_CUES.find(x => x.id === c) || {}).label).filter(Boolean).join('・');
    lines.push(`${gkFmtDate(r.date)} ${r.pivot}｜${pvAxisLabel(r)}｜${pvTypeLabel(r.type)}｜${pvResultLabel(r.result)}${r.predict ? '｜予測:' + r.predict : ''}${cues ? '｜確認:' + cues : ''}`);
  });
  return lines.join('\n');
}

// ─── データバックアップ（hb_v1_* の全キー） ───
// 端末故障・機種変・複数端末の記録合流に対応する。取り込みはID単位マージ（重複スキップ）。
// 書き出しはキーを機械的に列挙する（キーのハードコード漏れで「全データ」が嘘になるのを防ぐ）。


export { PV_TYPES, PV_AXIS1, PV_AXIS2, PV_CUES, PV_RESULTS, pvTypeLabel, pvResultLabel, pvAxisLabel, pvCalcTypeDist, pvNonBlockRate, pvCrossTypeResult, pvExportWeekText };
