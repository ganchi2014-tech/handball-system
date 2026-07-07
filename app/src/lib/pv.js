// このファイルは index.html（Phase 0版）から Phase 1 S2 で機械分割された。
// 由来行: 9546-9642
import { gkDateStr, gkExportWeekText, gkFmtDate, gkWeekStart } from './gk.js';

const PV_TYPES = [
  { id: '1a', label: '①a ブロック・表', desc: 'DFとボールの間に背中で壁を作る（触覚主導：接触圧とDF重心）' },
  { id: '1b', label: '①b ブロック・裏', desc: 'DFの背中側に壁＝ドライブ導線を開ける（触覚主導：接触圧とDF重心）' },
  { id: '2a', label: '②a スライド・同期', desc: '隣DFの裏へパスと同期して滑り込む（保持者の状態認知が主導）' },
  { id: '2b', label: '②b スライド・拡張', desc: '2:2仕掛けの前にDFを引き連れて空間を広げる（保持者の状態認知が主導）' },
  { id: '3', label: '③ はなれる', desc: '保持者に自スペースを譲り、体はボール方向のまま＝受け直し即時性（保持者の状態認知が主導）' },
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
  { id: 'df-weight', label: 'DF重心の足' },
  { id: 'passer', label: 'パサーの目と腕' },
  { id: 'holder', label: '保持者の進行方向と声' },
];
const PV_RESULTS = [
  { id: 'break', label: '突破', cls: 'break' },
  { id: 'stopped', label: '被停止', cls: 'stopped' },
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
  lines.push('■ 類型選択分布（今週）※①偏重チェック');
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
      if (c) lines.push(`    ${t.label.slice(0, 2)}：突破${c.break || 0}／被停止${c.stopped || 0}／受け直し${c.rereceive || 0}`);
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
