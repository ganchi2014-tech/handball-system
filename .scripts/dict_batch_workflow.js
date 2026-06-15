export const meta = {
  name: 'dict-batch-improve',
  description: '辞書バッチ改善：監査(素人+用語レンズ)→批判的修正→メタ監査。argsでファイル群を渡す',
  phases: [
    { title: '監査', detail: '各ファイル: 分かりづらい説明 + 不足用語を摘出' },
    { title: '批判的修正', detail: '原文照合で承認分のみ適用・却下は理由記録' },
    { title: 'メタ監査', detail: 'git diffを独立チェック（見出し不変・情報損失なし）' },
  ],
}

const DIR = 'C:/Users/togan1080/handball-system';
// args は配列でも、JSON文字列化された配列でも、カンマ区切り文字列でも受ける（ハーネスが文字列化する場合に対応）
let BATCH = args;
if (typeof BATCH === 'string') {
  const s = BATCH.trim();
  try {
    const parsed = JSON.parse(s);
    BATCH = Array.isArray(parsed) ? parsed : [String(parsed)];
  } catch (e) {
    BATCH = s.split(/[,\n]+/).map(x => x.trim().replace(/^["'\[\]]+|["'\[\]]+$/g, '')).filter(Boolean);
  }
}
if (!Array.isArray(BATCH)) BATCH = BATCH ? [BATCH] : [];
BATCH = BATCH.map(x => String(x).trim()).filter(Boolean);

const CONTEXT = `【プロジェクト】高校ハンドボール部・バックプレーヤー向け「自己問答・辞書アプリ」(GitHub Pages配信、index.html + dictionary/*.md 33ファイル)。読者は高校生(全国レベル部員だが新入部員・知識浅めの選手も読む)。コーチ哲学=じゃんけん構造(絶対最強の戦術はない・相性のみ)・自己組織化(選手が自分で学び自分で決める)。
【アプリの仕組み】辞書本文はmdをアプリ内でレンダリング表示。用語集(GLOSSARY)収録語は本文中で自動ハイライトされタップで説明が出る(各セクション初出のみ・単純文字列一致)。
【任務】ユーザー指示「足らない言葉や分かりづらい説明を補完して完璧な辞書にしてほしい」。`;

const CURRENT_GLOSSARY_KEYS = `バックプレーヤー,ピボット,ウィング,センター,GK,クローズ,ワイド,0-6,5-1,2-4/3-2-1/3-3,マンツーマン,速攻,セットOF,7on6,5on6,クロス,ギブ＆ゴー,ピック＆ロール,フェイント,ダブルフェイント,早打ち,バックハンドフェイク,山側/谷側,勝ち位置,フェアシーベン,ヘラウスリュッケン,ユーバーゲーベン,パル/インパル,ブリックコンタクト,メストリング,セルヴティリット,じゃんけん構造,エコロジカルアプローチ,制約主導,認知→判断→行動,2秒の壁,マティアス・ギゼル,Nikolaj Jacobsen,カルロス・オルテガ,シャビ・パスクァル,ステファン・マドセン,ベネット・ヴィーガート`;

const SCHEMA_AUDIT = { type:'object', properties:{
  unclear:{ type:'array', items:{ type:'object', properties:{ quote:{type:'string'}, problem:{type:'string'}, proposal:{type:'string'} }, required:['quote','problem','proposal'] } },
  terms:{ type:'array', items:{ type:'object', properties:{ surface:{type:'string'}, draft_desc:{type:'string'}, evidence:{type:'string'} }, required:['surface','draft_desc','evidence'] } },
}, required:['unclear','terms'] };

const SCHEMA_FIX = { type:'object', properties:{
  applied:{type:'number'},
  approved_terms:{ type:'array', items:{ type:'object', properties:{ surface:{type:'string'}, desc:{type:'string'} }, required:['surface','desc'] } },
  rejected:{ type:'array', items:{ type:'object', properties:{ what:{type:'string'}, reason:{type:'string'} }, required:['what','reason'] } },
  skipped:{ type:'array', items:{ type:'object', properties:{ quote:{type:'string'}, reason:{type:'string'} }, required:['quote','reason'] } },
}, required:['applied','approved_terms','rejected','skipped'] };

function promptAudit(f) {
  return `あなたは検証部の監査担当（素人レンズ＋用語網羅レンズの2役）。\n${CONTEXT}\n対象ファイル: ${DIR}/dictionary/${f} を Read ツールで全文読むこと。\n\n現在の用語集に既に収録済みのキー（これらは再提案しない）:\n${CURRENT_GLOSSARY_KEYS}\n\n【A: 分かりづらい説明(unclear)】高校1年の新入部員(知識ほぼゼロ)が一人で読んで意味が取れない箇所を摘出:\n①専門用語が説明なしで使われ文脈からも推測不能 ②論理の飛躍 ③一文が長すぎ ④表の略語・記号が未定義 ⑤外国語用語の初出に日本語訳がない ⑥指示語が不明 ⑦数値の意味・単位・根拠が不明\n- quote=原文の連続した文字列を一字一句正確にコピー(行番号やタブは含めない・1〜2行の短い範囲)\n- proposal=改善後の文(元の意味を変えない・情報を削らない・括弧で平易な補足を足す形が基本)\n- 見出し行(#で始まる行)の変更・新規見出し追加は禁止\n- 件数: 0〜15件。本当に分かりづらい箇所だけ厳選。文体の好みは挙げない。\n\n【B: 不足用語(terms)】本文で使われるのに用語集に無い専門用語(読者がタップで調べられない):\n基準=複数回登場or理解の鍵/高校生が知らない可能性/surfaceは本文の表記そのまま正確に(自動ハイライトは文字列一致のため)\n対象例=日本語戦術概念・カタカナ外国語(独西ノル丁)・略語(OF/DF/CB/LW等)・陣形戦術名・ルール用語・トレ用語\n除外=一度しか出ない雑学的固有名詞/毎回十分な説明が直後にある語/超一般語(パス・ボール等)\n- draft_desc=60字以内・平易・体言止め基調・正確性最優先\n- evidence=登場する本文の一節(短く)\n- 件数: 3〜25件。雑に水増ししない。`;
}

function promptFix(f, audit) {
  return `あなたは検証部・批判担当 兼 実用部・修正適用担当。チャーター=成果物を疑い、採用/不採用を理由つきで必ず記録する(握りつぶし禁止)。\n${CONTEXT}\n対象ファイル: ${DIR}/dictionary/${f}\n\n監査担当の指摘:\n${JSON.stringify(audit)}\n\n【手順】\n0. ${DIR}/.scripts/_terms_accumulator.json を Read し seen_surfaces(他バッチで承認済みの用語一覧)を把握。これに含まれる surface は approved_terms に入れず rejected に「既出」と記録。\n1. まず Read で対象ファイルを読む。\n2. unclear の各指摘を検証: quote が原文に一字一句存在するか(必要なら Grep)。proposal が元の意味を変えていないか・事実として正しいか・情報を削っていないか・見出し行でないか。\n   - 妥当なものだけ Edit ツールで適用(old_string=原文の正確な連続文字列・一意に特定できる長さ。複数一致するなら前後を含めて一意化)。\n   - 不採用や適用不能は skipped に quote と理由を記録。\n3. terms の各用語を検証: 本当に未収録か・surface が本文に実在する表記か(必要なら Grep)・draft_desc が正確で60字以内か(問題あれば desc を自分で修正)。妥当なものを approved_terms に。却下は rejected に記録。\n4. applied=実際に Edit で適用した unclear 修正の件数。\n【絶対ルール】見出し行(#)の変更・追加・削除禁止。情報の削除禁止(明確化・追記のみ)。表の列数(|の数)を壊さない。意味を変える修正禁止。監査指摘以外の箇所は触らない。`;
}

phase('監査');
log(`バッチ処理: ${BATCH.length}ファイル [${BATCH.join(', ')}]`);

const results = await pipeline(BATCH,
  (f) => agent(promptAudit(f), { label: `監査:${f.slice(0,2)}`, phase: '監査', schema: SCHEMA_AUDIT }),
  async (audit, f) => {
    const a = audit || { unclear: [], terms: [] };
    const r = await agent(promptFix(f, a), { label: `批判修正:${f.slice(0,2)}`, phase: '批判的修正', schema: SCHEMA_FIX });
    return { file: f, applied: r ? r.applied : 0, approved_terms: r ? r.approved_terms : [], rejected: r ? r.rejected : [], skipped: r ? r.skipped : [], audit_unclear: a.unclear.length, audit_terms: a.terms.length };
  }
);

const valid = results.filter(Boolean);
log(`監査・修正完了: ${valid.length}/${BATCH.length}ファイル, 適用合計 ${valid.reduce((s,v)=>s+(v.applied||0),0)}件, 用語候補 ${valid.reduce((s,v)=>s+(v.approved_terms||[]).length,0)}件`);

phase('メタ監査');
const metaList = BATCH.map(f => `dictionary/${f}`).join(' ');
const metaResult = await agent(
  `あなたは検証部・批判担当(メタ監査)。チャーター=検証そのものを疑う。\nリポジトリ: ${DIR}(git管理下。直前のコミットはクリーン状態＝git diff で今回の変更だけが見える)\n対象ファイル: ${JSON.stringify(BATCH)}\n\n手順: PowerShell で「git -C ${DIR} diff -- ${metaList}」を実行し差分を確認。\nチェック: ①見出し行(#〜###)が変更/追加/削除されていないか(差分の+/-行に#始まりが無いか) ②情報の削除(内容損失)がないか ③修正が意味を変えたり事実誤りを持ち込んでいないか(疑わしければReadで前後確認) ④Markdown表の列構造(|の数)が壊れていないか ⑤サンプル数件、本当に高校生に分かりやすくなったか\nviolations に file・issue・severity(critical/major/minor)で全件報告。問題なければ note にその旨。`,
  { label: 'メタ監査', phase: 'メタ監査', schema: { type:'object', properties:{
    violations:{ type:'array', items:{ type:'object', properties:{ file:{type:'string'}, issue:{type:'string'}, severity:{type:'string'} }, required:['file','issue','severity'] } },
    note:{type:'string'}
  }, required:['violations','note'] } }
);

log(`メタ監査完了: violation ${metaResult ? metaResult.violations.length : '?'}件`);

return {
  batch: BATCH,
  per_file: valid,
  all_terms: valid.flatMap(v => (v.approved_terms||[]).map(t => ({...t, file: v.file}))),
  meta_audit: metaResult || { violations: [], note: 'meta agent failed' },
  totals: {
    files: valid.length,
    fixes_applied: valid.reduce((s,v)=>s+(v.applied||0),0),
    terms: valid.reduce((s,v)=>s+(v.approved_terms||[]).length,0),
  },
};
