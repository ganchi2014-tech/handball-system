// このファイルは index.html（Phase 0版）から Phase 1 S2 で機械分割された。
// 由来行: 9198-9303, 9715-9728

const GK_SITUATIONS = [
  { id: 'backcourt', label: 'バックコート' },
  { id: 'side', label: 'サイド' },
  { id: '7m', label: '7m' },
];
// 6分割コース（シューターから見た向き）。的中率が安定したら9分割拡張を検討
const GK_COURSES = [
  { id: 'TL', label: '左上' }, { id: 'TR', label: '右上' },
  { id: 'ML', label: '左中' }, { id: 'MR', label: '右中' },
  { id: 'BL', label: '左下' }, { id: 'BR', label: '右下' },
];
const gkSituationLabel = (id) => (GK_SITUATIONS.find(s => s.id === id) || {}).label || id;
const gkCourseLabel = (id) => (GK_COURSES.find(c => c.id === id) || {}).label || id;

// ローカル日付 'YYYY-MM-DD'
function gkDateStr(d) {
  const dt = d || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
// dateStr を含む週の月曜日 'YYYY-MM-DD'（週次集計の単位）
function gkWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = (d.getDay() + 6) % 7; // 月=0 … 日=6
  d.setDate(d.getDate() - day);
  return gkDateStr(d);
}
// 'YYYY-MM-DD' → 'M/D'
function gkFmtDate(s) {
  const d = new Date(s + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// シューター別コース分布（攻撃陣スカウティング兼用）。
// 実コースが確定するのは的中時のみなので、的中記録だけから算出する。
function gkCalcTendencies(preds) {
  const t = {};
  preds.forEach(p => {
    if (!p.hit) return;
    if (!t[p.shooter]) t[p.shooter] = {};
    t[p.shooter][p.course] = (t[p.shooter][p.course] || 0) + 1;
  });
  return t;
}

// 的中率 {total, hits, rate(0-100) | rate=null(記録なし)}
function gkStats(preds) {
  const total = preds.length;
  const hits = preds.filter(p => p.hit).length;
  return { total, hits, rate: total ? Math.round(hits / total * 100) : null };
}

// GK別・週別の的中率推移（週開始日昇順）— 第5週中間照合のベースライン比較に使う
function gkWeeklySeries(preds, gkName) {
  const byWeek = {};
  preds.filter(p => p.gk === gkName).forEach(p => {
    const w = gkWeekStart(p.date);
    if (!byWeek[w]) byWeek[w] = [];
    byWeek[w].push(p);
  });
  return Object.keys(byWeek).sort().map(w => Object.assign({ week: w }, gkStats(byWeek[w])));
}

// 週次テキストエクスポート（揮発対策：当該週の集計＋生記録をLINE共有できる形に）
function gkExportWeekText(preds, weekStartStr) {
  const ws = weekStartStr || gkWeekStart(gkDateStr());
  const weekPreds = preds.filter(p => gkWeekStart(p.date) === ws);
  const end = new Date(ws + 'T00:00:00');
  end.setDate(end.getDate() + 6);
  const lines = [];
  lines.push(`🧤 GK予測 週次レポート（${gkFmtDate(ws)}〜${gkFmtDate(gkDateStr(end))}）`);
  lines.push('━━━━━━━━━━━━━━');
  lines.push('■ GK別 的中率（今週）');
  const gks = [...new Set(weekPreds.map(p => p.gk))];
  if (!gks.length) lines.push('  記録なし');
  gks.forEach(g => {
    const mine = weekPreds.filter(p => p.gk === g);
    const s = gkStats(mine);
    const cum = gkStats(preds.filter(p => p.gk === g));
    lines.push(`・${g}：${s.hits}/${s.total}（${s.rate}%）｜累計 ${cum.hits}/${cum.total}（${cum.rate}%）`);
    GK_SITUATIONS.forEach(sit => {
      const ss = gkStats(mine.filter(p => p.situation === sit.id));
      if (ss.total) lines.push(`    ${sit.label} ${ss.hits}/${ss.total}（${ss.rate}%）`);
    });
  });
  lines.push('');
  lines.push('■ シューター傾向（累計・的中ベース）');
  const tend = gkCalcTendencies(preds);
  const shooters = Object.keys(tend);
  if (!shooters.length) lines.push('  的中記録なし');
  shooters.forEach(sh => {
    const dist = tend[sh];
    const parts = GK_COURSES.filter(c => dist[c.id]).map(c => `${c.label}${dist[c.id]}`);
    const totalPred = preds.filter(p => p.shooter === sh).length;
    const hitCount = GK_COURSES.reduce((a, c) => a + (dist[c.id] || 0), 0);
    lines.push(`・${sh}：${parts.join('・')}（的中${hitCount}／予測${totalPred}）`);
  });
  lines.push('');
  lines.push(`■ 今週の全記録（${weekPreds.length}件）※バックアップ`);
  weekPreds.slice().sort((a, b) => a.ts - b.ts).forEach(p => {
    lines.push(`${gkFmtDate(p.date)} ${p.gk}×${p.shooter}｜${gkSituationLabel(p.situation)}｜予測${gkCourseLabel(p.course)}｜${p.hit ? '○的中' : '×不的中'}${p.cue ? '｜' + p.cue : ''}`);
  });
  return lines.join('\n');
}

// GK予測：記録ウィザード（①状況・メンバー → ②予測コース＋根拠 → シュート → ③結果）

function gkBaselineCompare(preds, gkName) {
  const series = gkWeeklySeries(preds, gkName);
  if (series.length < 2) return null;
  // 基準期は最大2週。`- 1` は直近週を基準期に含めない（比較対象を必ず残す）ための予約
  const nBase = Math.min(2, series.length - 1);
  const baseWeeks = series.slice(0, nBase);
  const hits = baseWeeks.reduce((a, w) => a + w.hits, 0);
  const total = baseWeeks.reduce((a, w) => a + w.total, 0);
  const baseRate = Math.round(hits / total * 100);
  const recent = series[series.length - 1];
  return { baseRate, recentRate: recent.rate, recentWeek: recent.week, delta: recent.rate - baseRate };
}

// ピヴォット認知：記録ウィザード（①第0問2軸＋類型＋予測 → プレー → ②事実チェック＋結果）

export { GK_SITUATIONS, GK_COURSES, gkSituationLabel, gkCourseLabel, gkDateStr, gkWeekStart, gkFmtDate, gkCalcTendencies, gkStats, gkWeeklySeries, gkExportWeekText, gkBaselineCompare };
