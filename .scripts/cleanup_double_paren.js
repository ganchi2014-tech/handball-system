export const meta = {
  name: 'cleanup-double-paren',
  description: '二重括弧（訳語）（訳語）の純重複・音訳破損のみを慎重に除去。argsでファイル群',
  phases: [
    { title: 'クリーンアップ', detail: '各ファイルの純重複括弧・破損外国語を修復' },
    { title: 'メタ監査', detail: 'git diffで情報損失・意味変更がないか独立確認' },
  ],
}

const DIR = 'C:/Users/togan1080/handball-system';
let BATCH = args;
if (typeof BATCH === 'string') {
  const s = BATCH.trim();
  try { const p = JSON.parse(s); BATCH = Array.isArray(p) ? p : [String(p)]; }
  catch (e) { BATCH = s.split(/[,\n]+/).map(x => x.trim().replace(/^["'\[\]]+|["'\[\]]+$/g, '')).filter(Boolean); }
}
if (!Array.isArray(BATCH)) BATCH = BATCH ? [BATCH] : [];
BATCH = BATCH.map(x => String(x).trim()).filter(Boolean);

const SCHEMA = { type:'object', properties:{
  applied:{type:'number'},
  fixes:{ type:'array', items:{ type:'object', properties:{ before:{type:'string'}, after:{type:'string'}, kind:{type:'string'} }, required:['before','after','kind'] } },
  skipped:{ type:'array', items:{ type:'object', properties:{ text:{type:'string'}, reason:{type:'string'} }, required:['text','reason'] } },
}, required:['applied','fixes','skipped'] };

function prompt(f) {
  return `あなたは辞書の校正担当。対象ファイル: ${DIR}/dictionary/${f} を Read して全文確認する。\n\n【背景】このファイルには過去の自動訳語付与パスの事故で、二重括弧「用語（訳語A）（訳語B）」や、外国語が片仮名に化けた破損（例: ノルウェー語 ønske が「イェンスケ（願望）」等）が残っている可能性がある。これを高校生に読みやすく直す。\n\n【直すもの（純粋な冗長・破損のみ）】\n1. 純重複の二重括弧: 「（X）（X）」や「（X）（Xとほぼ同義）」→ 1つに統合（例:「ロブヴルフ（ループシュート）（ループ）」→「ロブヴルフ（ループシュート）」、「クロイツシュリット（クロスステップ）（クロスステップ）」→「クロイツシュリット（クロスステップ）」）\n2. 「用語（訳語）中（訳語）」のように同じ訳が重複→重複側を削除（例:「ヘラウスリュッケン（前飛び出し）中（飛び出し）」→「ヘラウスリュッケン（前飛び出し）中」）\n3. 外国語の片仮名化け（前後がローマ字の外国語句なのに一語だけ片仮名+括弧訳になっている明白な破損）→ 元の綴りに復元。確証が持てない綴りは触らない。\n\n【絶対に直さないもの（残す）】\n- 「（訳語A）（別の情報B）」でAとBが異なる情報を持つもの（例:「シュタントヴルフ（立ち打ちシュート）（直球）」「ポーレン（ポーランド式）（中央混乱系）」「ナハシュテルシュリット（サイドステップ）（継ぎ足し）」）は**残す**。情報量が減る統合は禁止。\n- 見出し行（#で始まる行）は一切変更しない。\n- 表の列数（|の数）を壊さない。\n- 数値・固有名詞・出典は変更しない。\n\n【手順】Read→該当箇所をGrep等で正確に把握→Edit で1件ずつ修正（old_stringは一意に特定できる長さ）。各修正を fixes に before/after/kind(redundant|broken)で記録。直さず残した曖昧ケースは skipped に記録。\n判断に迷ったら「残す」を選ぶ。情報を減らすより冗長を残す方が安全。`;
}

phase('クリーンアップ');
log(`二重括弧クリーンアップ: ${BATCH.length}ファイル`);

const results = await pipeline(BATCH,
  (f) => agent(prompt(f), { label: `校正:${f.slice(0,2)}`, phase: 'クリーンアップ', schema: SCHEMA })
    .then(r => ({ file: f, applied: r ? r.applied : 0, fixes: r ? r.fixes : [], skipped: r ? r.skipped : [] }))
);

const valid = results.filter(Boolean);
log(`クリーンアップ完了: 適用合計 ${valid.reduce((s,v)=>s+(v.applied||0),0)}件`);

phase('メタ監査');
const metaList = BATCH.map(f => `dictionary/${f}`).join(' ');
const metaResult = await agent(
  `あなたは校正のメタ監査担当。リポジトリ ${DIR}(git管理下)。PowerShell で「git -C ${DIR} diff -- ${metaList}」を実行し差分を確認。\nチェック: ①見出し行(#)の変更が無いか ②情報の削除（異なる情報を持つ括弧が消えていないか）③表の列数(|)が壊れていないか ④外国語復元が綴りとして妥当か（疑わしければ要確認フラグ）。\nviolations に file・issue・severity(critical/major/minor) で報告。問題なければ note に記載。`,
  { label: 'メタ監査', phase: 'メタ監査', schema: { type:'object', properties:{
    violations:{ type:'array', items:{ type:'object', properties:{ file:{type:'string'}, issue:{type:'string'}, severity:{type:'string'} }, required:['file','issue','severity'] } },
    note:{type:'string'}
  }, required:['violations','note'] } }
);

return { per_file: valid, meta_audit: metaResult || { violations: [], note: 'meta failed' },
  totals: { files: valid.length, fixes: valid.reduce((s,v)=>s+(v.applied||0),0) } };
