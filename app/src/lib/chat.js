// このファイルは index.html（Phase 0版）から Phase 1 S2 で機械分割された。
// 由来行: 5223-5258, 5335-5543
import CHAT_SYNONYMS from '../data/chatSynonyms.json';
import { ALL_TAGS, DICT_FILES, GLOSSARY } from './dict.js';
import { renderMarkdown } from './markdown.js';

function chatNormalize(s) {
  return String(s || '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ')
    .replace(/[‐－―−–—]/g, '-')
    .toLowerCase();
}

// 短い英数キーワード（of/gk/5-1等）は前後が英数だと誤ヒット（offense等）するため境界チェック
function chatIsAsciiKey(k) { return /^[a-z0-9-]+$/.test(k); }
function chatHasTerm(text, k) {
  if (!k) return false;
  if (!chatIsAsciiKey(k)) return text.includes(k);
  let idx = 0;
  while ((idx = text.indexOf(k, idx)) !== -1) {
    const before = idx > 0 ? text[idx - 1] : '';
    const after = idx + k.length < text.length ? text[idx + k.length] : '';
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    idx += 1;
  }
  return false;
}
function chatCountTerm(text, k, cap) {
  if (!k) return 0;
  let cnt = 0, idx = 0;
  const ascii = chatIsAsciiKey(k);
  while (cnt < cap && (idx = text.indexOf(k, idx)) !== -1) {
    const before = idx > 0 ? text[idx - 1] : '';
    const after = idx + k.length < text.length ? text[idx + k.length] : '';
    if (!ascii || (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after))) cnt++;
    idx += k.length;
  }
  return cnt;
}

// 言い換え・話し言葉 → 辞書側の表記キーワード（file: 優先ブーストする辞書ファイルID）

const CHAT_STOPWORDS = new Set([
  'こと', 'もの', 'とき', 'ため', 'よう', '感じ', '場合', 'ところ', 'どこ', 'どう',
  'なに', '何', 'いつ', 'だれ', '誰', '自分', '相手', 'チーム', '試合', 'プレー',
  'ハンドボール', '選手', '今日', '明日', '今度', 'する', 'なる', 'ある', 'いる',
  'たい', 'ほしい', 'いい', 'よい', 'ない', 'もっと', 'すごく', 'とても', 'これ', 'それ', 'あれ',
]);

// 依頼・疑問の飾り表現 → 区切りに変換
const CHAT_NOISE_RE = /(について|を?教えてほしい|お?しえてください|を?教えて|ください|下さい|お願いします|お願い|したいです|したいんですけど|したい|できるようになりたい|できないです|できません|できない|出来ない|わからないです|わからない|分からない|わかりません|どうすればいい|どうすれば|どうやって|どうしたら|どんな感じ|なんですか|何ですか|ですか|でしょうか|ますか|とはなに|とは何|とは|って何|ってなに|のやり方|やり方|の方法|方法|のコツ|コツ|攻略法|攻略|対策|です|ます)/g;

// レキシコン（タグ・用語集・補助語彙から構築、長い順）
let CHAT_LEXICON_CACHE = null;
function chatLexicon() {
  if (CHAT_LEXICON_CACHE) return CHAT_LEXICON_CACHE;
  const set = new Set();
  const addTerm = (raw) => {
    if (!raw) return;
    const base = raw.split('（')[0].trim();
    if (base.length >= 2) set.add(base);
    const m = raw.match(/（([^）]+)）/);
    if (m) m[1].split(/[／/・,、]/).forEach(x => { x = x.trim(); if (x.length >= 2) set.add(x); });
  };
  ALL_TAGS.forEach(addTerm);
  GLOSSARY.forEach(g => g.items.forEach(it => addTerm(it.term)));
  [
    'ピボット', 'ポスト', 'スクリーン', 'カットイン', 'ドライブ', 'ステップシュート',
    'ジャンプシュート', 'ループシュート', 'バウンドシュート', 'ドリブル', 'ロングパス',
    'トラベリング', 'オーバーステップ', 'ダブルドリブル', 'キックボール', 'チャージング',
    'プッシング', 'ホールディング', 'ハッキング', 'ケンパ', 'クロス', 'パラレル',
    'デンマーク', 'フランス', 'ドイツ', 'スペイン', 'クロアチア', 'ノルウェー',
    'アイスランド', 'ポルトガル', 'スロベニア', 'スウェーデン', 'ソビエト', 'ロシア',
    '日本', '韓国', 'カタール', 'エジプト', 'バーレーン',
    '逆速攻', 'トランジション', '戻り', '勝ち位置', '山側', '谷側', '早打ち',
    '飛び出し', '受け渡し', 'スライド', 'スイッチ', 'ブロック', 'リバウンド',
    'ルーズボール', 'スローイン', 'スローオフ', 'ゴールスロー', 'フリースロー',
    'パッシブ', '退場', '警告', 'イエローカード', 'レッドカード', '2分',
    'ウォームアップ', 'クールダウン', 'ストレッチ', 'V字', 'フラッシュ', '回転プレー',
  ].forEach(addTerm);
  CHAT_LEXICON_CACHE = [...set]
    .map(raw => ({ raw, n: chatNormalize(raw) }))
    .filter(t => t.n.length >= 2)
    .sort((a, b) => b.n.length - a.n.length);
  return CHAT_LEXICON_CACHE;
}

// 1文字でもキーワードとして許可する体部位語
const CHAT_BODY_CHARS = new Set(['肩', '膝', '腰', '肘', '指']);

// 質問 → キーワード抽出（シノニム w=2 / レキシコン w=2 / 自由トークン w=1）
function chatExtractKeywords(question) {
  const qn = chatNormalize(question);
  const kws = new Map();
  const fileBoosts = new Set();
  const addKw = (raw, w) => {
    const n = chatNormalize(raw);
    // 体の部位は1文字でも識別力が高い（「肩が痛い」等）ため除外しない
    if (n.length < 2 && !CHAT_BODY_CHARS.has(n)) return;
    const cur = kws.get(n);
    if (!cur || cur.w < w) kws.set(n, { raw, w });
  };
  for (const syn of CHAT_SYNONYMS) {
    if (syn.m.some(m => chatHasTerm(qn, chatNormalize(m)))) {
      syn.kw.forEach(k => addKw(k, 2));
      if (syn.file) fileBoosts.add(syn.file);
    }
  }
  for (const t of chatLexicon()) {
    if (chatHasTerm(qn, t.n)) addKw(t.raw, 2);
  }
  // 自由トークン：飾り表現を区切り化 → 記号で分割 → ひらがな助詞で分割
  qn.replace(CHAT_NOISE_RE, '|')
    .split(/[|、。．，,.!?！？\s・:：;；()（）「」『』〜~*％%]+/)
    .flatMap(chunk => chunk.split(/(?:の|は|が|を|に|で|や|も|へ)/))
    .map(tok => tok.trim())
    .filter(tok => tok.length >= 2 && !CHAT_STOPWORDS.has(tok))
    .forEach(tok => addKw(tok, 1));
  const sorted = [...kws.values()]
    .sort((a, b) => b.w - a.w || b.raw.length - a.raw.length)
    .slice(0, 10);
  return { kws: sorted, fileBoosts };
}

// セクション本文の正規化キャッシュ
const CHAT_NBODY = new WeakMap();
function chatNBody(s) {
  let v = CHAT_NBODY.get(s);
  if (v == null) { v = chatNormalize(s.body); CHAT_NBODY.set(s, v); }
  return v;
}
function chatIsStub(s) {
  const txt = s.body.replace(/^#.*$/gm, '').replace(/^[-=*]+$/gm, '').replace(/\s+/g, '');
  return txt.length < 30;
}

// リダイレクト専用ファイル（「○○に統合済み」の道標）はチャット回答から除外する
const CHAT_EXCLUDED_FILES = new Set(DICT_FILES.filter(f => f.redirect).map(f => f.id));

// 全セクション採点 → 上位4件
function chatSearch(question, sections) {
  const { kws, fileBoosts } = chatExtractKeywords(question);
  if (!kws.length) return { kws, hits: [] };
  const scored = [];
  for (const s of sections) {
    // 冒頭/ファイル見出し(H1=ファイル名)/スタブ/リダイレクト専用ファイルは回答にしない
    // （H1タイトルはファイル名で広いKWを含み、具体的な節より誤って上位化するため除外）
    if (s.title === '冒頭' || s.level === 1 || chatIsStub(s) || CHAT_EXCLUDED_FILES.has(s.fileId)) continue;
    const nTitle = chatNormalize(s.title);
    const nMeta = chatNormalize(s.fileTitle + ' ' + s.fileTags.join(' '));
    const nBody = chatNBody(s);
    let score = 0, cover = 0;
    for (const { raw, w } of kws) {
      const k = chatNormalize(raw);
      let pts = 0;
      if (chatHasTerm(nTitle, k)) pts += 8;
      if (chatHasTerm(nMeta, k)) pts += 2;
      pts += chatCountTerm(nBody, k, 5);
      if (pts > 0) { cover++; score += pts * w; }
    }
    if (score <= 0) continue;
    if (cover > 1) score *= 1 + 0.5 * (cover - 1);  // 複数キーワード網羅ボーナス
    if (fileBoosts.has(s.fileId)) score *= 1.6;      // 意図ファイルブースト
    scored.push({ s, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return { kws, hits: scored.slice(0, 4).map(x => x.s) };
}

// 最良セクションからキーワード密度の高いブロックを抜粋（表は行単位で安全に切る）
function chatBestExcerpt(section, kws) {
  const body = section.body.replace(/\r\n?/g, '\n');
  let blocks = body.split(/\n{2,}/).map(b => b.trim()).filter(b => {
    if (!b) return false;
    const lines = b.split('\n');
    if (lines.length === 1 && /^#{1,6}\s/.test(b)) return false; // 見出しのみ
    if (/^[-=*]{3,}$/.test(b)) return false;                      // 区切り線のみ
    return true;
  });
  // ASCII図（罫線アート）はチャット内で崩れるため、散文ブロックを優先
  const isArtBlock = (b) => (b.match(/[━─│┃┌┐└┘├┤┬┴╋]/g) || []).length >= 6;
  const proseBlocks = blocks.filter(b => !isArtBlock(b));
  if (proseBlocks.length) blocks = proseBlocks;
  if (!blocks.length) return '';
  const scoreBlock = (b) => {
    const nb = chatNormalize(b);
    let sc = 0;
    for (const { raw, w } of kws) sc += chatCountTerm(nb, chatNormalize(raw), 5) * w;
    return sc;
  };
  const ranked = blocks.map((b, i) => ({ b, i, sc: scoreBlock(b) }))
    .sort((x, y) => y.sc - x.sc || x.i - y.i);
  const picked = [ranked[0]];
  if (ranked[0].b.length < 220 && ranked[1] && ranked[1].sc > 0) picked.push(ranked[1]);
  picked.sort((x, y) => x.i - y.i);
  let out = picked.map(p => p.b).join('\n\n');
  const LIMIT = 900;
  if (out.length > LIMIT) {
    if (/^\s*\|/m.test(out)) {
      const cutAt = out.lastIndexOf('\n', LIMIT);
      out = out.slice(0, cutAt > 100 ? cutAt : LIMIT);
    } else {
      let cut = out.lastIndexOf('。', LIMIT);
      if (cut < 100) cut = LIMIT;
      out = out.slice(0, cut + 1);
    }
    out += '\n\n…（続きは「全文を読む」へ）';
  }
  return out;
}

const CHAT_SUGGESTIONS = [
  '5-1はどう攻略する？',
  'フェイントの種類を教えて',
  '7mシュートのコツは？',
  '速攻の走り方は？',
  'パッシブプレーとは？',
  '緊張に勝つには？',
];

// 質問 → ボット返信メッセージを構築
function buildChatReply(question, sections) {
  const { kws, hits } = chatSearch(question, sections);
  if (!kws.length) {
    return {
      role: 'bot', kind: 'nokw',
      text: 'うまく読み取れませんでした…。「5-1 攻略」「フェイント 種類」のように、プレー用語を入れて聞いてみてください。',
      chips: CHAT_SUGGESTIONS, ts: Date.now(),
    };
  }
  if (!hits.length) {
    return {
      role: 'bot', kind: 'nohit',
      text: `「${kws.slice(0, 3).map(k => k.raw).join('・')}」に当てはまるセクションが見つかりませんでした。別の言い方で試すか、下の例から選んでみてください。`,
      chips: CHAT_SUGGESTIONS, ts: Date.now(),
    };
  }
  const best = hits[0];
  const excerpt = chatBestExcerpt(best, kws);
  return {
    role: 'bot', kind: 'answer',
    head: { id: best.id, icon: best.fileIcon, fileTitle: best.fileTitle, title: best.title },
    html: renderMarkdown(excerpt),
    srcs: hits.slice(1).map(s => ({ id: s.id, icon: s.fileIcon, fileTitle: s.fileTitle, title: s.title })),
    ts: Date.now(),
  };
}

// ─────────────────────────────────────────────
// 問いの定義
// ─────────────────────────────────────────────

export { chatNormalize, chatIsAsciiKey, chatHasTerm, chatCountTerm, CHAT_SYNONYMS, CHAT_STOPWORDS, CHAT_NOISE_RE, chatLexicon, CHAT_BODY_CHARS, chatExtractKeywords, chatNBody, chatIsStub, CHAT_EXCLUDED_FILES, chatSearch, chatBestExcerpt, CHAT_SUGGESTIONS, buildChatReply };
