// このファイルは index.html（Phase 0版）から Phase 1 S2 で機械分割された。
// 由来行: 1892-1904, 8558-8714
import { DICT_FILES, DICT_SECTION_COUNT } from './dict.js';
import { STORAGE_VERSION, lsGet } from './storage.js';

const FEINT_LEGEND = [
  { n: '①', name: '廻旋', desc: 'DFの腕を回して外す' },
  { n: '②', name: 'ターン', desc: '体ごと回転' },
  { n: '③', name: 'シュート', desc: 'シュートフォームで打たない' },
  { n: '④', name: 'パス', desc: 'パスフリして出さない' },
  { n: '⑤', name: 'ステップ', desc: '踏み込む足の方向を偽る' },
  { n: '⑥', name: 'ボディ', desc: '肩・上半身だけ傾ける' },
  { n: '⑦', name: 'スピード', desc: '急停止→再加速の緩急' },
];

// ─────────────────────────────────────────────
// Phase 2A：症状診断のデータ
// ─────────────────────────────────────────────

const AXIS_MAP = {
  // OF（旧：skill modeから参照される残存ノード）
  q1: '④ 自分の対応', q1b: '④ 自分の対応',
  q2: '② 相手の状況', q2_close: '③ リアクション理解', q2_wide: '③ リアクション理解',
  q3_cross: '③ リアクション理解', q3_reaction: '③ リアクション理解', q3_reaction_b: '③ リアクション理解',
  // OF全要素トップ
  qof_top: '① 自分の立場',
  // OF（②→③→④ 再設計版・もらい出し）
  qof_start: '② 相手の状況',
  qof_noball: '④ 自分の対応',
  qof_close_react: '③ リアクション理解', qof_wide_react: '③ リアクション理解',
  qof_close_press_self: '④ 自分の対応', qof_close_pull_self: '④ 自分の対応',
  qof_wide_cross_self: '④ 自分の対応', qof_wide_normal_self: '④ 自分の対応',
  // OF：シュート結果
  qof_shoot_result: '② 相手の状況', qof_shoot_good_how: '④ 自分の対応',
  qof_shoot_type: '④ 自分の対応',
  qof_shoot_gk_how: '③ リアクション理解', qof_shoot_block: '③ リアクション理解',
  // OF：1on1
  qof_1on1_result: '② 相手の状況', qof_1on1_good_how: '④ 自分の対応', qof_1on1_miss_why: '③ リアクション理解',
  // OF：フェイント（7種）
  qof_feint_type: '④ 自分の対応',
  qof_feint_rotate_r: '③ リアクション理解', qof_feint_turn_r: '③ リアクション理解',
  qof_feint_shoot_r: '③ リアクション理解', qof_feint_pass_r: '③ リアクション理解',
  qof_feint_step_r: '③ リアクション理解', qof_feint_body_r: '③ リアクション理解',
  qof_feint_speed_r: '③ リアクション理解',
  qof_feint_double_r: '③ リアクション理解',
  // OF：パス
  qof_pass_result: '② 相手の状況', qof_pass_intercept_why: '③ リアクション理解', qof_pass_miss_why: '④ 自分の対応',
  // OF：ポスト
  qof_post_role: '① 自分の立場', qof_post_back: '③ リアクション理解', qof_post_pivot: '③ リアクション理解',
  qof_post_rotate_r: '④ 自分の対応', qof_post_fake_r: '④ 自分の対応',
  qof_post_flash_r: '④ 自分の対応', qof_post_screen_r: '④ 自分の対応',
  // OF：コンタクト
  qof_contact_result: '② 相手の状況', qof_contact_lose_why: '③ リアクション理解',
  // DF
  qd_top: '① 自分の立場',
  qd1: '④ 自分の対応', qd_good: '③ リアクション理解',
  qd_good_read: '③ リアクション理解', qd_good_pos: '③ リアクション理解', qd_good_team: '③ リアクション理解',
  qd2: '③ リアクション理解',
  // DF 拡張（7要素）
  qd_formation: '① 自分の立場', qd_individual: '④ 自分の対応',
  qd_cover_top: '③ リアクション理解', qd_voice_top: '④ 自分の対応',
  qd_contact_top: '④ 自分の対応', qd_transit_top: '④ 自分の対応',
  qd_contact_foul_type: '③ リアクション理解',
  // スキル
  qs1: '④ 自分の対応', qs_pass: '④ 自分の対応', qs_shoot: '④ 自分の対応', qs_121: '④ 自分の対応',
  // 試合状況
  qc1: '② 試合の状況', qc2_biglead: '② 試合の状況', qc2_lead: '② 試合の状況',
  qc2_behind: '② 試合の状況', qc2_bigbehind: '② 試合の状況',
  // じゃんけん
  qj1: '② 相手の状況', qj2_06: '② 相手の状況', qj2_15: '② 相手の状況',
  qj2_man: '② 相手の状況', qj_self: '② 相手の状況',
  qj_school: '② 相手の状況',
  // 相手GK分析
  qg1: '② 相手の状況', qg2_wave: '③ リアクション理解', qg2_spot: '③ リアクション理解',
  qg_unknown: '② 相手の状況',
  // GK（自分視点）
  qgs_start: '① 自分の立場',
  qgs_shot_type: '② 相手の状況', qgs_react: '③ リアクション理解',
  qgs_throw: '④ 自分の対応', qgs_link: '④ 自分の対応', qgs_setplay: '② 相手の状況',
  // フィジカル
  qph_start: '① 自分の立場', qph_fatigue: '③ リアクション理解', qph_pain: '② 相手の状況',
  qph_throw_when: '③ リアクション理解', qph_sprint_when: '③ リアクション理解',
  qph_jump_when: '③ リアクション理解', qph_cond_factor: '② 相手の状況',
  // 7m シューター
  qsm_start: '① 自分の立場', qsm_method_good: '④ 自分の対応', qsm_method_miss: '③ リアクション理解',
  qsm_offframe_why: '③ リアクション理解', qsm_post_why: '③ リアクション理解',
  // サインプレー
  qsg_start: '① 自分の立場', qsg_result: '③ リアクション理解', qsg_why_good: '④ 自分の対応',
  qsg_break_where: '④ 自分の対応', qsg_read_what: '③ リアクション理解', qsg_turnover_why: '④ 自分の対応',
};

function axisStyle(axis) {
  if (!axis) return null;
  if (axis.startsWith('②')) return { color: '#fbbf24', border: '1px solid #92400e' };
  if (axis.startsWith('③')) return { color: '#22d3ee', border: '1px solid #155e75' };
  if (axis.startsWith('④')) return { color: '#c084fc', border: '1px solid #6b21a8' };
  return { color: '#94a3b8', border: '1px solid #334155' };
}

// ─────────────────────────────────────────────
// モード設定
// ─────────────────────────────────────────────
const MODES = {
  of:       { label: 'OF',           color: '#3b82f6', firstQ: 'qof_top',     icon: '⚡',  desc: 'OF全要素：判断/シュート/突破/フェイント/パス/ポスト/コンタクト' },
  df:       { label: 'DF',           color: '#ef4444', firstQ: 'qd_top',      icon: '🛡️', desc: 'DF全要素：全体感覚/陣形/個人/カバー/声/コンタクト/戻り' },
  gk_self:  { label: 'GK（自分）',   color: '#10b981', firstQ: 'qgs_start',   icon: '🧤', desc: 'GK視点で自分のセーブ・先読みを振り返る' },
  physical: { label: 'フィジカル',   color: '#84cc16', firstQ: 'qph_start',   icon: '💪', desc: '体力・スプリント・投擲・ケガ気味を振り返る' },
  shot_7m:  { label: '7mシュート',   color: '#ec4899', firstQ: 'qsm_start',   icon: '🎯', desc: 'シューター視点で7mペナルティを振り返る' },
  sign:     { label: 'サインプレー', color: '#fb7185', firstQ: 'qsg_start',   icon: '🎬', desc: 'セットプレー・サイン・スクリーンの成否を振り返る' },
  skill:    { label: 'スキル',       color: '#a78bfa', firstQ: 'qs1',         icon: '🎯', desc: 'パス・シュート・1対1' },
  context:  { label: '試合状況',     color: '#f59e0b', firstQ: 'qc1',         icon: '⏱️', desc: '点差×残り時間 → 今取るべき戦術' },
  janken:   { label: 'じゃんけん',   color: '#06b6d4', firstQ: 'qj1',         icon: '🔄', desc: '相手DFのタイプ → 有効なOF戦術を逆引き' },
  gk:       { label: '相手GK分析',   color: '#f97316', firstQ: 'qg1',         icon: '🥅', desc: '相手GKのタイプを特定 → 有効なシュート戦略' },
};


function getProgress(phase, histLen) {
  if (phase === 'hub' || phase === 'start') return 0;
  if (phase === 'dictionary' || phase === 'dictionary-detail' || phase === 'solve' || phase === 'plan' || phase === 'build' || phase === 'chat') return 0;
  if (phase === 'result') return 100;
  return Math.min(20 + histLen * 20, 85);
}

// ─────────────────────────────────────────────
// ハブのモジュール定義
// ─────────────────────────────────────────────
const HUB_MODULES = [
  {
    id: 'reflect', cls: 'reflect', icon: '🤾', target: '選手',
    title: '振り返る',
    desc: '試合・練習のプレーを10モードで自己問答 → 良かった点／課題／改善案',
    enabled: true,
  },
  {
    id: 'chat', cls: 'chat', icon: '💬', target: '選手・指導者',
    title: '質問する',
    desc: `チャットで質問 → 辞書${DICT_SECTION_COUNT}セクションから該当箇所を探してその場で回答`,
    enabled: true,
  },
  {
    id: 'dictionary', cls: 'dict', icon: '📖', target: '選手・指導者',
    title: '辞書を読む',
    desc: `${DICT_FILES.length}ファイル${DICT_SECTION_COUNT}セクションの戦術辞書を横断検索・タグでフィルタ`,
    enabled: true,
  },
  {
    id: 'plan', cls: 'plan', icon: '📋', target: '指導者・選手',
    title: '練習を組む',
    desc: 'テーマ×レベル×時間 → 時間配分付き練習プランを生成（コピーして共有）',
    enabled: true,
  },
  {
    id: 'gk', cls: 'gk', icon: '🧤', target: 'GK・シューター',
    title: 'GK予測',
    desc: 'シュート前にコースを予測 → シュート後に的中/不的中を照合（6分割・シューター側が入力）',
    enabled: true,
  },
  {
    id: 'pv', cls: 'pv', icon: '🧲', target: 'ピヴォット・バック陣',
    title: 'ピヴォット認知',
    desc: '第0問（2軸）→ 類型選択 → 予測 → プレー → 事実と結果を照合（バック陣が入力）',
    enabled: true,
  },
  {
    id: 'playbook', cls: 'dict', icon: '🗂', target: '選手',
    title: 'マイ・プレイブック',
    desc: '振り返り回数・宣言達成率・読み的中率・効いた技 — 自分の記録が1枚で見える',
    enabled: true,
  },
];

// 振り返り10モードから「逆引きリファレンス」へ降格した3モード（設計書1-5）
const REFERENCE_MODES = ['janken', 'context', 'gk'];

// ─────────────────────────────────────────────
// localStorage helpers — version 管理＋安全な JSON 入出力
// ⚠ STORAGE_VERSION を上げると旧データが読まれなくなる＝選手の全記録リセットに等しい。
//   データ構造を変える時は上げるのではなく、lsGet 側に旧形式→新形式のマイグレーションを実装すること（破棄禁止）。
// ─────────────────────────────────────────────

export { FEINT_LEGEND, AXIS_MAP, axisStyle, MODES, getProgress, HUB_MODULES, REFERENCE_MODES };
