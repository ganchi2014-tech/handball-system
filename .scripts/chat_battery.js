#!/usr/bin/env node
// 質問バッテリー：index.html の実チャット検索ロジック(splitSections/chatSearch/CHAT_SYNONYMS/
// chatLexicon=GLOSSARY+tags) をそのまま抽出・eval して、幅広い想定質問の top1 ルーティングを一括診断する。
// 実機と完全一致（GLOSSARY語彙も含む）。index.htmlを編集すれば自動追従。
// 使い方: node .scripts/chat_battery.js            （内蔵バッテリーを実行）
//        node .scripts/chat_battery.js "質問"      （単発）
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const DICT_DIR = path.join(ROOT, 'dictionary');

function sliceBlock(startAnchor, endAnchor) {
  const s = html.indexOf(startAnchor);
  if (s < 0) throw new Error('anchor not found: ' + startAnchor);
  const e = html.indexOf(endAnchor, s + startAnchor.length);
  if (e < 0) throw new Error('end anchor not found: ' + endAnchor);
  return html.slice(s, e);
}

// 実機コードを抽出
const dictFilesSrc = sliceBlock('const DICT_FILES = [', '\n];') + '\n];';
const glossarySrc  = sliceBlock('const GLOSSARY = [', '\n];') + '\n];';
const chatSrc      = sliceBlock('function splitSections(md, fileMeta) {', 'function chatBestExcerpt');

// サンドボックスで実機ロジックを構築
const factorySrc = `
${dictFilesSrc}
const ALL_TAGS = Array.from(new Set(DICT_FILES.flatMap(f => f.tags))).sort();
${glossarySrc}
${chatSrc}
return { splitSections, chatSearch, chatExtractKeywords, DICT_FILES };
`;
const { splitSections, chatSearch, DICT_FILES } = (new Function(factorySrc))();

// 全セクション構築（実機と同じく各.mdをsplitSections）
const sections = [];
for (const fm of DICT_FILES) {
  const p = path.join(DICT_DIR, fm.name);
  if (!fs.existsSync(p)) continue;
  sections.push(...splitSections(fs.readFileSync(p, 'utf8'), fm));
}

// 想定質問バッテリー（高校生が実際に打ちそうな自然文。カテゴリ網羅）
const BATTERY = [
  // ルール
  'トラベリングって何歩から？', 'ボールを持って何秒まで動ける？', '7mスローになるのはどんな時？',
  'パッシブってどうなったら取られる？', '2分退場と失格の違いは？', 'どこまでの接触ならファウルじゃない？',
  'どこからが警告でどこからが2分退場？', 'キーパーがゴールエリアから出たらどうなる？', 'ボールが足に当たったら反則？',
  'イエローカードは何枚まで？', '交代で反則になるのはどんな時？', 'オーバーステップって何？',
  // OF戦術
  '5-1はどう攻略する？', '6-0の崩し方は？', '3-2-1ディフェンスの攻め方', 'ワイドとクローズの違いは？',
  'ダブルポストって何？', 'セットオフェンスの基本は？', '速攻の走り方は？', '7on6はいつ使う？',
  // 1on1・フェイント・シュート
  'フェイントの種類を教えて', 'DFが抜けない', 'シュートが入らない', '7mシュートのコツは？',
  'ループシュートの打ち方', 'バウンドシュートとは', '山側谷側って何？', '早打ちのやり方',
  'ステップシュートのコツ', 'コースの狙い方',
  // DF個人
  '1対1で抜かれる', '当たり負けする', 'スクリーンの外し方', 'ファイトオーバーとは',
  // ポジション
  'センターの役割は？', 'ウィングの役割', '左バックと右バックの違い', 'ピボットって何をする？',
  // フィジカル
  'ジャンプ力を上げるには', '筋トレメニューを教えて', 'スタミナをつけたい', '足を速くしたい',
  // ケガ
  '肩が痛い', '足首の捻挫を防ぐには', '膝が痛いとき', 'ケガから復帰するには',
  // メンタル
  '緊張して力が出ない', 'ミスを引きずる', '自信がない', 'プレッシャーに勝つには',
  // 数的
  '2対1の攻め方', '退場中の守り方は？', '数的不利のとき',
  // 装備・試合当日
  'シューズの選び方', 'マウスピースは必要？', 'メガネはつけていい？', '松ヤニのルール',
  'アップは何をすればいい？', '試合前の食事は？', '試合当日の流れ',
  // 相手分析・セット・文脈
  '相手の分析の仕方', 'ハーフタイムで何を直す？', 'サインプレーとは', 'ケンパとは', '点差があるときの戦い方',
  // 認知・声
  '判断が遅い', '声が出せない', '視野を広げるには',
];

// 入力: 引数なし=内蔵バッテリー / "質問"=単発 / --file path=ファイル(1行1問・#と空行は無視)
let list = BATTERY;
const arg = process.argv[2];
if (arg === '--file') {
  const qpath = process.argv[3];
  list = fs.readFileSync(qpath, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
} else if (arg) {
  list = [arg];
}

function topN(q, n) {
  const { kws, hits } = chatSearch(q, sections);
  return { kws, hits: hits.slice(0, n) };
}

console.log('総セクション数:', sections.length, '/ 質問数:', list.length);
console.log('='.repeat(90));
for (const q of list) {
  const { kws, hits } = topN(q, 3);
  if (!kws.length) { console.log(`❓ ${q}\n   → [nokw] キーワード抽出できず`); console.log('-'.repeat(90)); continue; }
  if (!hits.length) { console.log(`❓ ${q}\n   → [nohit] 該当なし  (kw: ${kws.map(k=>k.raw).join('/')})`); console.log('-'.repeat(90)); continue; }
  const fmt = h => `file${h.fileId} ${h.title}`;
  console.log(`Q: ${q}`);
  console.log(`   ①${fmt(hits[0])}` + (hits[1]?`  ②${fmt(hits[1])}`:'') + (hits[2]?`  ③${fmt(hits[2])}`:''));
  console.log(`   kw: ${kws.map(k=>k.raw+'·w'+k.w).join(' / ')}`);
  console.log('-'.repeat(90));
}
