export const meta = {
  name: 'glossary-integration',
  description: '357用語を部長統合：グループ割当・近似語マージ・誤マッチ語の除外判定',
  phases: [{ title: '部長統合', detail: '全用語をグループ分け・マージ・ドロップ判定' }],
}

const DIR = 'C:/Users/togan1080/handball-system';

const GROUPS = [
  '基本ポジション・役割','OF（攻撃）の動き・概念','DF（守備）の動き・概念','シュート・フェイント技術',
  'GK（ゴールキーパー）','速攻・切り替え','ルール・反則・審判','陣形・システム',
  'フィジカル・トレーニング','ケガ予防・身体','メンタル・認知・判断','試合運営・装備',
  '海外用語（独・仏・西・ノル）','分析・スカウティング'
];

phase('部長統合');

const result = await agent(
  `あなたは開発部長。高校ハンドボール辞書アプリの用語集(GLOSSARY)を大幅拡充する。33ファイルの監査で各部門の批判担当の検証を通過した新規用語357件を、アプリの用語集モーダルへ追加できる形に整理する。

【最重要・前提】
- 各用語の説明文(desc)は既に検証済みなので変更しない（surfaceとdescはそのまま使う）。あなたの仕事は「グループ分け」「近似語マージ」「誤ハイライト語のドロップ判定」の3つだけ。
- 用語データは ${DIR}/.scripts/consolidated_terms.json を Read して取得する（surface, key, desc, count, files を持つ357件の配列）。
- アプリは用語集の各 surface を本文中で単純文字列一致でハイライトしタップ説明を出す（surfaceの「（」より前がハイライトキー）。

【タスク1: グループ割当】357件すべてを次の14グループのどれか1つに割り当てる。1件も漏らさない。
${GROUPS.map((g,i)=>`  ${i}: ${g}`).join('\n')}

【タスク2: 近似語マージ】同義・ほぼ同義で別表記の用語ペアを見つけ、merges に記録（例: 「静的ストレッチ」と「静的ストレッチング」、「数的優位」と「数的有利」、「クワイエット・アイ」と「クワイエット Eye」、「ハムストリング」と「ハムストリングス」、「大腿四頭筋」重複など）。マージは「どちらを残すか(keep)・どれを統合で消すか(drop)・残す方のdescをどう補強するか」を記録。判断は慎重に：本当に同義のものだけ。

【タスク3: 誤ハイライト・低価値ドロップ判定】次に該当する surface は drops に理由つきで記録（用語集に入れない）：
  - 2文字以下のLatin略語で、本文の他の語に部分一致して誤ハイライトを多発させる恐れが高いもの（ただしDF/OF/CB/LB/RB/LW/RW/PV/GK等の頻出ポジション・攻守略語は高校生に有用なので原則残す。残す場合も判断を keep_short にメモ）
  - 「7m」「4-2」など数字記号で他の文脈（スコア等）に誤マッチしうるもの→ 残すなら surface をより安全な形にできるか提案、無理ならdrop
  - 一般語すぎて辞書本文の無関係箇所で誤爆するもの

【出力】
- assignments: 全357件分の {surface, group_index}（マージで消す側も含め全件。ただしdropしたものは除く）
- merges: [{keep, drops:[...], merged_desc(任意)}]
- drops: [{surface, reason}]
- keep_short_notes: 短いsurfaceで残す判断をしたもののメモ（任意）
- group_order: 14グループの推奨表示順（読者が探しやすい順。index配列）
- stats: {input:357, assigned, merged_away, dropped}

assignments の件数 + dropped + merged_away が 357 と一致すること。`,
  { label: '部長: 用語統合', phase: '部長統合', schema: {
    type: 'object',
    properties: {
      assignments: { type: 'array', items: { type: 'object', properties: { surface: { type: 'string' }, group_index: { type: 'number' } }, required: ['surface','group_index'] } },
      merges: { type: 'array', items: { type: 'object', properties: { keep: { type: 'string' }, drops: { type: 'array', items: { type: 'string' } }, merged_desc: { type: 'string' } }, required: ['keep','drops'] } },
      drops: { type: 'array', items: { type: 'object', properties: { surface: { type: 'string' }, reason: { type: 'string' } }, required: ['surface','reason'] } },
      keep_short_notes: { type: 'array', items: { type: 'string' } },
      group_order: { type: 'array', items: { type: 'number' } },
      stats: { type: 'object', properties: { input: { type: 'number' }, assigned: { type: 'number' }, merged_away: { type: 'number' }, dropped: { type: 'number' } }, required: ['input','assigned','merged_away','dropped'] }
    },
    required: ['assignments','merges','drops','group_order','stats']
  } }
);

return { groups: GROUPS, ...result };
