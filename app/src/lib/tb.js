// このファイルは index.html（Phase 0版）から Phase 1 S2 で機械分割された。
// 由来行: 8770-8847

const TB_CONSTRAINTS = [
  { id: 'space',  name: '空間',     order: 1, desc: 'コート幅・ゾーン・距離を変える。知覚そのものが変わる',
    examples: ['センターゾーン幅12mに制限', '9m〜FTライン間のみ使用可', 'サイドライン側1/3を使用禁止'] },
  { id: 'number', name: '人数',     order: 2, desc: 'OF/DFの人数比を変える。知覚そのものが変わる',
    examples: ['4対3（遅攻限定）', '3対3＋フリーマン1', '6対5から10秒後に6対6へ'] },
  { id: 'score',  name: '得点条件', order: 3, desc: '特定の崩し方に価値を付ける。意図を誘導する（副次的）',
    examples: ['逆サイド展開からの得点は2点', '受け前に空きを指差してからの得点は2点', 'スクリーン経由の得点は2点'] },
  { id: 'rule',   name: 'ルール',   order: 4, desc: 'タッチ数・時間などを変える。意図を誘導する（副次的）',
    examples: ['3秒以内にパスかシュート', 'ドリブル1回まで', '攻撃時間20秒以内'] },
];
const TB_COGNITION_OPTS = [
  'Nia（近い空間）が見えていなかった',
  'Space（中間の空間）が見えていなかった',
  'Far（遠い展開先）が見えていなかった',
  'DFの重心を見ていなかった',
  '隣DFとの連結（カバー関係）を見ていなかった',
  'GKの位置・タイプを見ていなかった',
];
const TB_Q0_TARGETS = ['重心', '意識', '連結'];
const TB_CHECKS = [
  { id: 'living', text: 'その練習中、生きたDFを見続けるか？', back: 2, hint: 'Noならドリル化している。制約の設定を見直す' },
  { id: 'multi',  text: '答え（攻め方）は2つ以上あるか？', back: 2, hint: 'Noなら解が1つに固定。得点条件などで複数解を残す' },
  { id: 'count',  text: '成功と失敗をペアが数えられるか？', back: 3, hint: 'Noなら成功の定義が曖昧。結果指標を観察可能な形に' },
  { id: 'single', text: '変えた制約は1つだけか？', back: 2, hint: 'Noなら原因が特定できない。制約を1つに絞る' },
];
const TB_NEXT_MOVE_MAP = [
  { id: 'hi-multi', cond: '成功率8割超 × 解が複数', read: '探索の余地が減ってきた',
    opts: ['空間を狭める', 'DFを1人増やす'], note: 'どちらが「見るもの」を増やすかを考えて選ぶ' },
  { id: 'hi-one',   cond: '成功率8割超 × 解が1つ', read: '難易度ではなく構造の問題',
    opts: ['その解の得点価値を下げる', '別ルートに2点ボーナスを付ける'], note: '解の禁止は「解の指定」になるため最終手段' },
  { id: 'band-multi', cond: '70%帯 × 解が複数', read: '学習が進行中',
    opts: ['変えない（継続する）'], note: '「変えない」も選択。理由を記録する' },
  { id: 'band-one', cond: '70%帯 × 解が1つ', read: '成功しているが決めつけが進行中',
    opts: ['別解にボーナスを付ける', 'ペアに「他に何が見えてた？」を聞いてから決める'], note: '' },
  { id: 'low',      cond: '成功率5割未満', read: '探索が止まる水準',
    opts: ['直近で変えた変数を1段戻す', '戻しても5割未満ならDFを1人減らす'], note: '' },
];
function tbJudgeRow(rate, solutions) {
  if (rate < 0.5) return 'low';
  if (rate > 0.8) return solutions >= 2 ? 'hi-multi' : 'hi-one';
  return solutions >= 2 ? 'band-multi' : 'band-one';
}
function tbTaskToCardText(t) {
  const c = TB_CONSTRAINTS.find(x => x.id === t.constraintId);
  return [
    `【自作課題】${t.name}${(t.version || 1) > 1 ? `（v${t.version}）` : ''}`,
    `■ 起点（受け前に見えていなかったもの）`,
    `  ${[...(t.cognition || []), t.cognitionNote].filter(Boolean).join(' / ')}`,
    `■ 制約（1つ）：${c ? c.name : ''}`,
    `  ${t.constraintDetail}`,
    `■ 成功の定義（${t.attempts}本セット）`,
    `  結果：${t.successResult}`,
    `  プロセス：${t.successProcess}（ペアが観察）`,
    `■ この課題がDFに変えさせるもの：${(t.q0Targets || []).join('・')}`,
    `  ${t.q0Note}`,
    t.overrideReason ? `■ 検証を通過せず実施する理由：${t.overrideReason}` : null,
    `■ ペアへの依頼：解の数と成功数を数えてください`,
  ].filter(x => x !== null).join('\n');
}
function tbExportAllText(tasks) {
  const lines = ['# 自作課題 全履歴エクスポート', `# ${new Date().toLocaleString('ja-JP')}`, ''];
  tasks.forEach(t => {
    lines.push(tbTaskToCardText(t), '');
    (t.history || []).forEach(h => {
      lines.push(`  [旧版 v${h.v}] ${h.constraintDetail}` + (h.movedBy ? `　→ 一手：${h.movedBy.move}（${h.movedBy.reason}）` : ''));
    });
    if ((t.history || []).length) lines.push('');
    (t.sessions || []).forEach((s, i) => {
      lines.push(`  [実施${i + 1}${s.version ? ` v${s.version}` : ''}] ${s.date}　成功 ${s.success}/${s.attempts}（${Math.round(s.success / s.attempts * 100)}%）　解の数 ${s.solutions}（ペア観察）`);
      lines.push(`  → 次の一手：${s.move}`);
      lines.push(`  → 理由：${s.reason}`);
      if (s.insight) lines.push(`  → 見えるようになったもの：${s.insight}`);
      lines.push('');
    });
    lines.push('────────────────', '');
  });
  return lines.join('\n');
}

export { TB_CONSTRAINTS, TB_COGNITION_OPTS, TB_Q0_TARGETS, TB_CHECKS, TB_NEXT_MOVE_MAP, tbJudgeRow, tbTaskToCardText, tbExportAllText };
