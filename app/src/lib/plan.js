// このファイルは index.html（Phase 0版）から Phase 1 S2 で機械分割された。
// 由来行: 4298-4341, 4885-4962
import DRILL_THEMES from '../data/drillThemes.json';
import POSITION_DRILL_VARIANTS from '../data/positionDrillVariants.json';

// drillTypeを自動付与（明示指定がないドリルを分類）
// スキル練習：相手役の動きが固定されている（パーだけ出させる→チョキの練習）
// エコロジカル：環境制限の中で両者が自由に勝負する（パーなしのじゃんけん）
(function autoAnnotateDrillTypes() {
  // スキル判定：相手役の動きが固定・コール式・先読み強制 など
  const skillSignals = /GK役は必ず|DF役は必ず|コーチのコール|GK役のコール|DF役のコール|コールしてタイプ変更|タイプを変える|コール（.+）で即|コーチが意図的/;
  DRILL_THEMES.forEach(theme => {
    ['basic', 'mid', 'adv'].forEach(lv => {
      (theme.drills[lv] || []).forEach(drill => {
        if (drill.drillType) return; // 明示指定があれば上書きしない
        const txt = (drill.constraints || []).map(c => c.text).join(' ');
        drill.drillType = skillSignals.test(txt) ? 'skill' : 'eco';
      });
    });
  });
})();

// ポジション定義
const POSITIONS = [
  { id: 'all',   icon: '👥', label: 'チーム全体',    desc: 'ポジション問わず全員で取り組む' },
  { id: 'gk',    icon: '🧤', label: 'GK',             desc: 'ゴールキーパー専用' },
  { id: 'cb',    icon: '🎯', label: 'CB（センター）', desc: 'センターバック特化' },
  { id: 'back',  icon: '💪', label: 'LB・RB',         desc: 'サイドバック特化' },
  { id: 'wing',  icon: '🚀', label: 'LW・RW',         desc: 'ウィング特化' },
  { id: 'pivot', icon: '🔄', label: 'Pivot',          desc: 'ポスト・ピボット特化' },
];

// ポジション別推奨テーマ
const POSITION_RECOMMENDED = {
  all:   [],
  gk:    ['gk_save', 'fast', 'link', 'def'],
  cb:    ['cb_vision', '1on1', 'pass', 'setof', '2on2'],
  back:  ['back_shoot', 'shoot', 'feint', 'step', '1on1'],
  wing:  ['wing_special', 'shoot', 'fast', 'step'],
  pivot: ['pivot_body', 'post', '2on2', '1on1'],
};

// ─────────────────────────────────────────────
// ポジション別ドリルバリアント（辞書知識完全統合版）
// 各ドリルは辞書ファイルの具体的知識に直接紐づく
// GKキュー逆工学(29)・AIMポジション(29)・フィクサシオン(29)・ポスト4プレー(06)
// GKタイプ理論(05)・ノルウェー4フェーズ(15)・デュアルバック(29)・4択判断(29)等
// buildPlan が positionId != 'all' のとき、DRILL_THEMES の drills より優先される
// ─────────────────────────────────────────────

const DRILL_WARMUP = { title: 'ウォームアップ（ダイナミックストレッチ＋パス）', minutes: 0, desc: '関節可動域→軽いランニング→ペアパスでテンポを上げる。' };
const DRILL_COOLDOWN = { title: 'クールダウン（ストレッチ＋振り返り）', minutes: 0, desc: '主要筋群のストレッチ＋今日の3秒振り返り（良かった点・課題・次回試すこと）。' };

const LEVELS = [
  { id: 'basic', label: '初級', desc: '基本動作の習得が目的（中学〜高1）' },
  { id: 'mid',   label: '中級', desc: '応用と判断が目的（高1〜高2）' },
  { id: 'adv',   label: '上級', desc: '試合実戦が目的（高2〜高3、全国レベル）' },
];

const DURATIONS = [30, 45, 60, 90]; // 分（練習は1日90分上限の方針。120分は撤去 2026-07-06）

// 練習計画ビルダー：選択された テーマ × レベル × 時間 × ポジション から計画を作る
function buildPlan(themeIds, levelId, totalMinutes, positionId = 'all') {
  // ウォームアップとクールダウンの時間を確保
  // 30分：W=5/C=3、45分：W=6/C=4、60分：W=8/C=5、90分：W=12/C=7、120分：W=15/C=10
  const warmupTime = Math.min(15, Math.max(5, Math.round(totalMinutes * 0.13)));
  const cooldownTime = Math.min(10, Math.max(3, Math.round(totalMinutes * 0.08)));
  const remaining = totalMinutes - warmupTime - cooldownTime;

  // 選択されたテーマからレベルに合う drills を集める
  // ポジション別バリアントがあれば優先使用
  const themeDrills = themeIds.map(tid => {
    const theme = DRILL_THEMES.find(t => t.id === tid);
    if (!theme) return null;
    const posDrills = positionId !== 'all'
      ? (POSITION_DRILL_VARIANTS[positionId]?.[tid]?.[levelId] || null)
      : null;
    return { theme, drills: posDrills || theme.drills[levelId] || [] };
  }).filter(Boolean);

  if (!themeDrills.length) {
    return { warmup: null, blocks: [], cooldown: null, totalAllocated: 0, mismatch: 0 };
  }

  // 各テーマの合計時間を計算 → 比率で残時間を分配 → 各テーマ内で順に詰める
  const perThemeBaseSum = themeDrills.reduce((sum, td) =>
    sum + td.drills.reduce((s, d) => s + d.minutes, 0), 0);

  let totalAllocated = warmupTime + cooldownTime;
  const blocks = [];

  themeDrills.forEach((td, idx) => {
    const baseSum = td.drills.reduce((s, d) => s + d.minutes, 0);
    let share = perThemeBaseSum > 0 ? Math.round(remaining * (baseSum / perThemeBaseSum)) : 0;
    // 1テーマ時の極端な縮小を防ぐ：そのテーマのフルベース時間が share より大きく、
    // 残時間に余裕があれば share を増やす（最大 remaining まで）
    if (themeDrills.length === 1) share = remaining;
    let used = 0;
    const items = [];
    for (const d of td.drills) {
      if (used >= share) break;
      // share に対する drill ベース時間の比率で配分 → ベース合計を超えるなら倍率かける
      const ratio = baseSum > 0 ? share / baseSum : 1;
      const scaled = Math.max(5, Math.round(d.minutes * Math.max(1, ratio)));
      const allotted = Math.min(scaled, share - used);
      if (allotted >= 5) {
        items.push({ ...d, minutes: allotted });
        used += allotted;
      }
    }
    if (items.length) {
      blocks.push({ theme: td.theme, items, blockMinutes: used });
      totalAllocated += used;
    }
  });

  return {
    warmup: { ...DRILL_WARMUP, minutes: warmupTime },
    blocks,
    cooldown: { ...DRILL_COOLDOWN, minutes: cooldownTime },
    totalAllocated,
    mismatch: totalMinutes - totalAllocated,
  };
}

// ─────────────────────────────────────────────
// 簡易Markdownレンダラ（必要最小限）
// ─────────────────────────────────────────────

export { DRILL_THEMES, POSITION_DRILL_VARIANTS, POSITIONS, POSITION_RECOMMENDED, DRILL_WARMUP, DRILL_COOLDOWN, LEVELS, DURATIONS, buildPlan };
