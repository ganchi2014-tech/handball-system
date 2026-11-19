// このファイルは index.html（Phase 0版）から Phase 1 S2 で機械分割された。
// 由来行: 4963-5163
import { GLOSSARY, DICT_FILES } from './dict.js';

// 章番号 → 短い章名（本文中の「18_mental.md」を「18章 メンタル」と表示するため）
const FILE_SHORT = Object.fromEntries(DICT_FILES.map(f => [f.id, f.short || f.title]));
// 罫線などで形を作っている枠（図）は折り返さない。文章だけの枠は折り返す。
const ART_RE = /[━─│┃┌┐└┘├┤┬┴┼╋═║]/g;

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// HTMLタグ外のテキスト部分のみ検索ワードを <mark> でハイライト
function highlightInHtml(html, q) {
  if (!q || !q.trim()) return html;
  const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'gi');
  return html.replace(/(<[^>]+>)|([^<]+)/g, (m, tag, text) => {
    if (tag) return tag;
    return text.replace(re, mt => `<mark class="search-hit">${mt}</mark>`);
  });
}

// ほかの言葉の一部になりやすい短いカタカナの用語。前後がカタカナのときは別の言葉として扱う。
const GLOSSARY_WHOLE_WORD = new Set(['アウト', 'フォロー']);
const KATAKANA_RE = /[ァ-ヶー＆&・]/;

// GLOSSARY の用語自動装飾（lazy init: GLOSSARY const 定義の後で動的構築）
let __glossaryRegex = null;
let __glossaryMap = null;
function getGlossaryDecorator() {
  if (__glossaryRegex !== null) return { regex: __glossaryRegex, map: __glossaryMap };
  if (typeof GLOSSARY === 'undefined') return null;
  const terms = [];
  __glossaryMap = {};
  for (const grp of GLOSSARY) {
    for (const item of grp.items) {
      // term は時々「ABC（原語）」のような形式 → メインの ABC 部分だけ key にする
      // ただし全文も含めてマッチ候補に
      const main = item.term.replace(/[（(].*$/, '').trim();
      if (main && main.length >= 2 && !__glossaryMap[main]) {
        terms.push(main);
        __glossaryMap[main] = item.desc;
      }
    }
  }
  // 長い順にソート（"フェイント7種" を "フェイント" より先にマッチ）
  terms.sort((a, b) => b.length - a.length);
  // 正規表現エスケープ
  const esc = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  __glossaryRegex = new RegExp('(' + esc.join('|') + ')', 'g');
  return { regex: __glossaryRegex, map: __glossaryMap };
}
// 既存HTML文字列の中で、タグ外のテキストだけに用語装飾を適用
function decorateGlossary(html) {
  const dec = getGlossaryDecorator();
  if (!dec) return html;
  // <tag>...</tag> を保持しつつテキスト部分のみ置換
  // 一度しか装飾しないように Set で追跡（同セクション内で同じ用語が繰り返される場合は初回のみ）
  const used = new Set();
  return html.replace(/(<[^>]+>)|([^<]+)/g, (m, tag, text) => {
    if (tag) return tag;
    return text.replace(dec.regex, (_, term, offset, whole) => {
      if (used.has(term)) return term;
      // 短いカタカナの言葉は、もっと長いカタカナの言葉の一部のときは飾らない（「パスアウト」の中の「アウト」など）
      if (GLOSSARY_WHOLE_WORD.has(term) &&
          (KATAKANA_RE.test(whole[offset - 1] || '') || KATAKANA_RE.test(whole[offset + term.length] || ''))) return term;
      used.add(term);
      return `<span class="gl-term" data-term="${term.replace(/"/g, '&quot;')}">${term}</span>`;
    });
  });
}

function renderMarkdown(md, query) {
  if (!md) return '';
  // CRLF / CR を正規化（Windows改行対応）
  md = md.replace(/\r\n?/g, '\n');
  const lines = md.split('\n');
  let html = '';
  let i = 0;
  let inCode = false, inTable = false, tableHeader = false;
  let subIdx = 0;
  let codeLang = '';

  const flushPara = (buf) => {
    if (!buf.length) return '';
    const text = buf.join(' ').trim();
    if (!text) return '';
    return '<p>' + inlineMd(text) + '</p>';
  };

  function inlineMd(t) {
    t = escapeHtml(t);
    // コードインライン
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    // 太字
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // 斜体
    t = t.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    // [text](url) → そのまま装飾だけ
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span style="color:#67e8f9">$1</span>');
    // [[ref]] 内部参照
    t = t.replace(/\[\[([^\]]+)\]\]/g, '<span style="color:#fbbf24">[[$1]]</span>');
    // 辞書ファイル名（XX_name.md 形式）→ クリック可能リンクに
    t = t.replace(/(\d{2})_([a-z_]+)\.md/g, (m, id) => `<a class="dict-inline-link" data-file-id="${id}" href="#" onclick="event.preventDefault(); window.dispatchEvent(new CustomEvent('dict-jump', {detail: '${id}'}));">${id}章 ${FILE_SHORT[id] || ''}</a>`);
    return t;
  }

  let paraBuf = [];
  while (i < lines.length) {
    const line = lines[i];

    // コードブロック
    if (line.startsWith('```')) {
      html += flushPara(paraBuf); paraBuf = [];
      if (!inCode) {
        inCode = true; codeLang = line.slice(3).trim();
        // 枠の中身を先読みして、図か文章かを見分ける
        let j = i + 1, box = 0;
        while (j < lines.length && !lines[j].startsWith('```')) { box += (lines[j].match(ART_RE) || []).length; j++; }
        html += box >= 6 ? '<pre class="art"><code>' : '<pre><code>';
      } else {
        inCode = false; codeLang = '';
        html += '</code></pre>';
      }
      i++; continue;
    }
    if (inCode) {
      html += escapeHtml(line) + '\n';
      i++; continue;
    }

    // テーブル
    if (line.includes('|') && line.trim().startsWith('|')) {
      html += flushPara(paraBuf); paraBuf = [];
      if (!inTable) {
        inTable = true; tableHeader = true;
        html += '<table>';
      }
      // ヘッダ区切り行（---）をスキップ
      if (/^\|\s*[-:|\s]+\|/.test(line)) {
        tableHeader = false; i++; continue;
      }
      const cells = line.split('|').slice(1, -1).map(c => inlineMd(c.trim()));
      if (tableHeader) {
        html += '<tr>' + cells.map(c => `<th>${c}</th>`).join('') + '</tr>';
      } else {
        html += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
      }
      i++; continue;
    }
    if (inTable && !line.includes('|')) {
      inTable = false;
      html += '</table>';
    }

    // 見出し
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      html += flushPara(paraBuf); paraBuf = [];
      const level = h[1].length;
      // ### の小見出しには連番のidを付ける（節の頭の「この節の中身」から飛べるように）
      const idAttr = level === 3 ? ` id="sub-${subIdx++}"` : '';
      html += `<h${level}${idAttr}>${inlineMd(h[2])}</h${level}>`;
      i++; continue;
    }

    // 区切り
    if (/^---+\s*$/.test(line)) {
      html += flushPara(paraBuf); paraBuf = [];
      html += '<hr/>';
      i++; continue;
    }

    // 引用の中の空行（">" だけの行）は区切り。文字として出さない
    if (/^>\s*$/.test(line)) {
      html += flushPara(paraBuf); paraBuf = [];
      i++; continue;
    }

    // 引用
    if (line.startsWith('> ')) {
      html += flushPara(paraBuf); paraBuf = [];
      html += '<blockquote>' + inlineMd(line.slice(2)) + '</blockquote>';
      i++; continue;
    }

    // リスト
    if (/^[-*]\s+/.test(line)) {
      html += flushPara(paraBuf); paraBuf = [];
      let listHtml = '<ul>';
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        listHtml += '<li>' + inlineMd(lines[i].replace(/^[-*]\s+/, '')) + '</li>';
        i++;
      }
      listHtml += '</ul>';
      html += listHtml; continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      html += flushPara(paraBuf); paraBuf = [];
      let listHtml = '<ol>';
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        listHtml += '<li>' + inlineMd(lines[i].replace(/^\d+\.\s+/, '')) + '</li>';
        i++;
      }
      listHtml += '</ol>';
      html += listHtml; continue;
    }

    // 空行
    if (!line.trim()) {
      html += flushPara(paraBuf); paraBuf = [];
      i++; continue;
    }

    paraBuf.push(line);
    i++;
  }
  if (inTable) html += '</table>';
  html += flushPara(paraBuf);
  let out = decorateGlossary(html);
  if (query) out = highlightInHtml(out, query);
  return out;
}

// ─────────────────────────────────────────────
// 辞書テキストをセクションに分割（## 見出しで区切る）
// ─────────────────────────────────────────────

export { escapeHtml, highlightInHtml, getGlossaryDecorator, decorateGlossary, renderMarkdown, GLOSSARY_WHOLE_WORD, KATAKANA_RE };
