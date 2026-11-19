// このファイルは index.html（Phase 0版）から Phase 1 S2 で機械分割された。
// 由来行: 5223-5258, 5335-5543
import CHAT_SYNONYMS from '../data/chatSynonyms.json';
import { ALL_TAGS, DICT_FILES, GLOSSARY } from './dict.js';
import SOLVE_DATA from '../data/solve.json';
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
  // 言いかえ表。場面がはっきりした言いかえ（only: true）が当たったら、広い言いかえ（「どこを見る」など）は使わない。
  // with があるときは、m のどれか と with のどれか の両方が質問に入っているときだけ当てる（例：「どこを見る」＋GKの場面）。
  let matched = CHAT_SYNONYMS.filter(syn => syn.m.some(m => chatHasTerm(qn, chatNormalize(m)))
    && (!syn.with || syn.with.some(m => chatHasTerm(qn, chatNormalize(m)))));
  if (matched.some(syn => syn.only)) matched = matched.filter(syn => syn.only);
  const tags = new Set(); // 言いかえが教えてくれるポジション（例：「9mから打ってくる」はGKの場面）
  for (const syn of matched) {
    syn.kw.forEach(k => addKw(k, 2));
    if (syn.file) fileBoosts.add(syn.file);
    if (syn.tag) tags.add(syn.tag);
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
  return { kws: sorted, fileBoosts, tags: [...tags] };
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
// 参考の章（読み物。外国語の用語を元の形で残している）は、実用の章より後ろに出す。
// 質問がその章を名指ししているとき（言いかえ表の file 指定）は下げない。
const CHAT_REFERENCE_FILES = new Set(DICT_FILES.filter(f => (f.group || '').startsWith('参考')).map(f => f.id));

// 切り直しで拾っても手がかりにならない言葉
const CHAT_WEAK_RUNS = new Set(['相手', '自分', '無理', '場合', '全然', '全部', '最近', '練習', '試合', '時間', '方法', '理由', '本当', '絶対']);

function chatSearchOnce(question, sections, extraTokens = []) {
  const ex = chatExtractKeywords(question);
  const { fileBoosts, tags } = ex;
  const kws = [...ex.kws, ...extraTokens.map(raw => ({ raw, w: 1 }))];
  if (!kws.length) return { kws, hits: [], tags };
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
    else if (CHAT_REFERENCE_FILES.has(s.fileId)) score *= 0.6; // 参考の章は控えめに
    scored.push({ s, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return { kws, hits: scored.slice(0, 4).map(x => x.s), tags };
}

// 全セクション採点 → 上位4件
// 何も当たらなかったときだけ、質問をカタカナ・漢字のかたまりに切り直してもう一度探す
// （「相手サイド速すぎて無理」のように、切れ目のない言い方でも何か返せるように）。
function chatSearch(question, sections) {
  const first = chatSearchOnce(question, sections);
  if (first.hits.length) return first;
  const runs = chatNormalize(question).match(/[ァ-ヶー]{2,}|[一-龠々]{2,}/g) || [];
  const extra = [...new Set(runs)].filter(t => !CHAT_STOPWORDS.has(t) && !CHAT_WEAK_RUNS.has(t));
  if (!extra.length) return first;
  return chatSearchOnce(question, sections, extra);
}

// 最良セクションからキーワード密度の高いブロックを抜粋（表は行単位で安全に切る）
function chatBestExcerpt(section, kws) {
  const body = section.body.replace(/\r\n?/g, '\n');
  // 小見出し（###）だけの段落は、次の段落の頭に付ける。
  // 小見出しの言葉でその段落を選べるようにし、答えにも「何の話か」が出るようにするため。
  const rawBlocks = body.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  let blocks = [];
  let pendingHead = '';
  for (const b of rawBlocks) {
    if (/^[-=*]{3,}$/.test(b)) { pendingHead = ''; continue; }            // 区切り線のみ
    if (!b.includes('\n') && /^#{1,6}\s/.test(b)) {                      // 見出しのみ
      pendingHead = /^#{3,6}\s/.test(b) ? b : '';
      continue;
    }
    if (/^\*出典[:：]/.test(b) && !b.includes('\n')) continue;             // 出典だけの行は答えに選ばない
    blocks.push(pendingHead ? pendingHead + '\n\n' + b : b);
    pendingHead = '';
  }
  // ASCII図（罫線アート）はチャット内で崩れるため、散文ブロックを優先
  const isArtBlock = (b) => (b.match(/[━─│┃┌┐└┘├┤┬┴╋]/g) || []).length >= 6;
  const proseBlocks = blocks.filter(b => !isArtBlock(b));
  if (proseBlocks.length) blocks = proseBlocks;
  if (!blocks.length) return '';
  const scoreBlock = (b) => {
    const nb = chatNormalize(b);
    let sc = 0;
    for (const { raw, w } of kws) sc += chatCountTerm(nb, chatNormalize(raw), 5) * w;
    // 横に長い表（5列以上）はスマホの質問画面では読めないので、ほかの段落を先に選ぶ
    const row = (b.match(/^\s*\|.*\|\s*$/m) || [''])[0];
    if (row && row.split('|').length - 2 >= 5) sc *= 0.35;
    return sc;
  };
  const ranked = blocks.map((b, i) => ({ b, i, sc: scoreBlock(b) }))
    .sort((x, y) => y.sc - x.sc || x.i - y.i);
  const picked = [ranked[0]];
  if (ranked[0].b.length < 220 && ranked[1] && ranked[1].sc > 0) picked.push(ranked[1]);
  // 「〜：」で終わる段落は前置きなので、続きの表や箇条書きも一緒に出す
  for (const pk of [...picked]) {
    const next = blocks[pk.i + 1];
    if (/[：:]\s*$/.test(pk.b) && next && !picked.some(x => x.i === pk.i + 1)) picked.push({ b: next, i: pk.i + 1, sc: 0 });
  }
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
const CHAT_SAFETY_RE = /痛|けが|ケガ|怪我|腫れ|はれて|しびれ|捻挫|ねんざ|ひねっ|脱臼|骨折|肉離れ|めまい|頭を打|吐き気|熱中症|息が苦し/;
const CHAT_SAFETY_NOTE = '痛みや体の異変があるときは、無理に続けず、まず指導者に伝える。強い痛み・続く痛み・頭を打ったときは医療機関で診てもらう。下の章には予防の運動も載っているが、痛みがある間は自分の判断で始めない。';
// 「練習していいか」「試合に出たい」「いつ戻れるか」のように、続けてよいかをたずねているか
const CHAT_RETURN_RE = /やっていい|やってもいい|していい|してもいい|出ていい|出たい|出られ|休むべき|休んだ方|休んだほう|復帰|いつから|戻れ/;

// 「〜って何」「〜とは」のように、言葉の意味をたずねているか
const CHAT_DEFINE_RE = /(って何|ってなに|って、何|とは|の意味|ってどういう|どういう意味|ってなんですか|って何ですか)/;

// 用語集から、質問に出てくる言葉を探す（長い言葉を優先）。意味をたずねる質問のときだけ使う
function chatGlossaryHit(question) {
  if (!CHAT_DEFINE_RE.test(question)) return null;
  const qn = chatNormalize(question);
  let best = null;
  for (const g of GLOSSARY) {
    for (const it of g.items || []) {
      const base = chatNormalize(String(it.term).split(/[（(／/]/)[0].trim());
      if (base.length < 2 || !chatHasTerm(qn, base)) continue;
      if (!best || base.length > best.len) best = { term: it.term, desc: it.desc, len: base.length };
    }
  }
  return best;
}

// 課題解決（選手の相談）の中から、質問に近いものを探す。
// 「入らない」「来ない」のような困りごとは、辞書の抜粋より相談の項目のほうが答えになることが多い。
// 質問に出てくるポジションの言葉 → 相談の題の頭に付いている札
const CHAT_POS_TAGS = [
  [/ポスト|ピボット|ピヴォット/, '【ポスト】'], [/サイド|ウィング|ウイング/, '【サイド】'], [/センター/, '【センター】'],
  [/バック|45|よんご/, '【バック】'],
  // GKは、打つ側の質問にもよく出てくる言葉なので、「GKとして」聞いていると分かる言い方のときだけ
  [/(gk|キーパー)(だけど|です|として|をやって|やってて|なんだけど)/, '【GK】'],
];

const CHAT_POS_TAG_SET = new Set(CHAT_POS_TAGS.map(([, tag]) => tag));

function chatSolveMatches(kws, question = '', synTags = []) {
  const qn = chatNormalize(question);
  const wantTags = [...new Set([...CHAT_POS_TAGS.filter(([re]) => re.test(qn)).map(([, tag]) => tag), ...synTags])];
  const out = [];
  for (const c of SOLVE_DATA.player.categories) {
    for (const s of c.symptoms) {
      const nT = chatNormalize(s.title.replace(/^【[^】]+】/, '')); // 札（【GK】など）の文字では当てない
      const nD = chatNormalize(s.desc || '');
      const nA = chatNormalize((s.actions || []).join(' '));
      let score = 0, cover = 0, titleHit = 0;
      for (const { raw, w } of kws) {
        const k = chatNormalize(raw);
        let pts = 0;
        if (chatHasTerm(nT, k)) { pts += 6 + Math.min(6, k.length); titleHit++; } // 長い言葉が題に当たるほど近い
        if (chatHasTerm(nD, k)) pts += 2;
        pts += chatCountTerm(nA, k, 2);
        if (pts > 0) { cover++; score += pts * w; }
      }
      // 題に質問の言葉が無いもの、当たった言葉が1つだけのもの（質問の言葉が1つのときは別）は出さない
      if (!titleHit || (cover < 2 && kws.length > 1)) continue;
      score *= 1 + 0.5 * (cover - 1);
      // 質問がポジションを言っているときは、そのポジションの相談を先に出し、別のポジションの相談は出さない
      const tag = (s.title.match(/^【[^】]+】/) || [''])[0];
      if (wantTags.length && CHAT_POS_TAG_SET.has(tag)) {
        if (!wantTags.includes(tag)) continue;
        score *= 1.8;
      }
      const action = String((s.actions || [])[0] || '').replace(/\*\*/g, '');
      out.push({ score, role: 'player', category: c.id, symptom: s.id, title: s.title, action });
    }
  }
  out.sort((a, b) => b.score - a.score);
  // 2つ目は、1つ目と同じくらい近いときだけ出す
  return out.filter((x, i) => i === 0 || (i === 1 && x.score >= out[0].score * 0.6)).map(({ score, ...rest }) => rest);
}

function buildChatReply(question, sections) {
  const { kws, hits, tags } = chatSearch(question, sections);
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
      text: `「${kws.slice(0, 3).map(k => k.raw).join('・')}」に当てはまる節が見つかりませんでした。別の言い方で試すか、下の例から選んでみてください。`,
      chips: CHAT_SUGGESTIONS, ts: Date.now(),
    };
  }
  let best = hits[0];
  let rest = hits.slice(1);
  // 痛み・ケガ・体の異変の質問には「まず伝える・診てもらう」を必ず先に出す。
  // 予防の運動のやり方は抜粋で見せない（痛みがある人が、それだけ読んで自分の判断で始めないように）。
  const isSafety = CHAT_SAFETY_RE.test(question);
  if (isSafety && CHAT_RETURN_RE.test(question)) {
    const ret = sections.find(s => s.fileId === '25' && s.title.includes('復帰の進め方'));
    if (ret && ret !== best) { rest = [best, ...rest.filter(s => s !== ret)].slice(0, 3); best = ret; }
  }
  const excerpt = isSafety ? '' : chatBestExcerpt(best, kws);
  const safety = isSafety ? `<p class="chat-safety">${CHAT_SAFETY_NOTE}</p>` : '';
  // 言葉の意味をたずねる質問には、用語集の説明を先に出す
  const gl = chatGlossaryHit(question);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const gloss = gl ? `<p class="chat-gloss"><b>${esc(gl.term)}</b>：${esc(gl.desc)}</p>` : '';
  return {
    role: 'bot', kind: 'answer',
    head: { id: best.id, icon: best.fileIcon, fileTitle: best.fileTitle, title: best.title },
    solve: isSafety ? [] : chatSolveMatches(kws, question, tags),
    html: safety + gloss + renderMarkdown(excerpt),
    srcs: rest.map(s => ({ id: s.id, icon: s.fileIcon, fileTitle: s.fileTitle, title: s.title })),
    ts: Date.now(),
  };
}

// ─────────────────────────────────────────────
// 問いの定義
// ─────────────────────────────────────────────

export { CHAT_SAFETY_NOTE, chatGlossaryHit, chatSolveMatches, chatNormalize, chatIsAsciiKey, chatHasTerm, chatCountTerm, CHAT_SYNONYMS, CHAT_STOPWORDS, CHAT_NOISE_RE, chatLexicon, CHAT_BODY_CHARS, chatExtractKeywords, chatNBody, chatIsStub, CHAT_EXCLUDED_FILES, chatSearch, chatBestExcerpt, CHAT_SUGGESTIONS, buildChatReply };
