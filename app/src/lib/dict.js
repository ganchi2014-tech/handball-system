// このファイルは index.html（Phase 0版）から Phase 1 S2 で機械分割された。
// 由来行: 1453-1462, 5164-5222
import DICT_FILES from '../data/dictFiles.json';
import GLOSSARY from '../data/glossary.json';

const ALL_TAGS = Array.from(new Set(DICT_FILES.flatMap(f => f.tags))).sort();

// 辞書の総セクション数（dictionary/*.md の #/## 見出し実測値）。
// 読み込み完了後は dictSections.length（実数）を優先して表示し、これは読み込み前のフォールバック。
// 辞書を増減したらこの値を更新する。
const DICT_SECTION_COUNT = 406;

// ─────────────────────────────────────────────
// 用語集（知識浅めユーザー向け）
// ─────────────────────────────────────────────

function splitSections(md, fileMeta) {
  // CRLF / CR を正規化（Windows改行対応）
  md = md.replace(/\r\n?/g, '\n');
  const lines = md.split('\n');
  const sections = [];
  let current = null;
  let preamble = [];

  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.*)$/);
    if (m && m[1].length <= 2) {
      if (current) sections.push(current);
      else if (preamble.length) {
        sections.push({
          id: fileMeta.id + '-pre',
          fileId: fileMeta.id,
          fileName: fileMeta.name,
          fileTitle: fileMeta.title,
          fileIcon: fileMeta.icon,
          fileTags: fileMeta.tags,
          title: '冒頭',
          level: m[1].length,
          body: preamble.join('\n').trim(),
        });
      }
      current = {
        id: fileMeta.id + '-' + sections.length,
        fileId: fileMeta.id,
        fileName: fileMeta.name,
        fileTitle: fileMeta.title,
        fileIcon: fileMeta.icon,
        fileTags: fileMeta.tags,
        // 【A】→ A の連結バグ防止：単一英数字括弧は「A. 」形式、複数文字は中身のみ＋スペース
        title: m[2]
          .replace(/【([A-Za-z0-9]{1,2})】/g, '$1. ')
          .replace(/【([^】]+)】/g, '$1 ')
          .replace(/「([^」]+)」/g, '$1 ')
          .replace(/\s+/g, ' ')
          .trim(),
        level: m[1].length,
        body: line + '\n',
      };
    } else {
      if (current) current.body += line + '\n';
      else preamble.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

// ─────────────────────────────────────────────
// 質問チャット（辞書検索ボット）
// LLM・外部API不使用：質問からキーワードを抽出し、読み込み済みの
// 辞書の全セクションを採点して最良の箇所から回答を合成する。
// 辞書はSWがキャッシュするためオフラインでも動作する。
// ─────────────────────────────────────────────

// 全角英数→半角・ダッシュ統一・小文字化

export { DICT_FILES, GLOSSARY, ALL_TAGS, DICT_SECTION_COUNT, splitSections };
