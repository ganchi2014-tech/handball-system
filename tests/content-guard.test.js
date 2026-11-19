// 文章の決まりを守るための見張り（辞書とアプリ文言に、直したはずの書き方が戻ってこないようにする）。
//
// 決まりの本体は CLAUDE.md の「辞書・アプリ文言の書き方」。ここは機械で見つけられるものだけを見る。
//  1. 外国語の用語をそのまま使わない（高校生が読めない）。
//  2. 「週◯回」のような回数の計画を、辞書の声として書かない（回数は部の計画と体の状態で決める）。
//  3. ハンドボールに無い用語（オフサイド・キックオフ）を使わない。
//  4. 相手の守り方を国の名前で呼ばない。
//  5. アプリの文言に辞書のファイル名（NN_xxx.md）をそのまま出さない。
//  6. 実用の章の見出しに、外国語の単語を入れない。
//
// 見ない場所：用語集・検索用の言いかえ表（外国語で調べる人のために元の語を残す）、
//             参考の章（13・14・15・24・29。読み物として元の語を「日本語（原語）」で残している）。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers/sections.js';
import BANNED_TERMS from './fixtures/foreign-terms.json';

const REFERENCE_CHAPTERS = new Set(['13', '14', '15', '24', '29']);
const SKIP_JSON = new Set(['glossary.json', 'chatSynonyms.json', 'dictFiles.json', 'dictLegacyIds.json', 'dictTitleRenames.json']);

const dictDir = path.join(ROOT, 'dictionary');
const dataDir = path.join(ROOT, 'app', 'src', 'data');
const chapters = fs.readdirSync(dictDir).filter(f => f.endsWith('.md')).sort()
  .map(f => ({ name: f, id: f.slice(0, 2), text: fs.readFileSync(path.join(dictDir, f), 'utf8') }));
const practical = chapters.filter(c => !REFERENCE_CHAPTERS.has(c.id));
const appTexts = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && !SKIP_JSON.has(f)).sort()
  .map(f => ({ name: f, text: fs.readFileSync(path.join(dataDir, f), 'utf8') }));

// 当たった行を「ファイル:行番号: 行の頭」で返す
function hits(files, re, allowLine) {
  const out = [];
  for (const f of files) {
    f.text.split('\n').forEach((line, i) => {
      if (re.test(line) && !(allowLine && allowLine(line))) out.push(`${f.name}:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
  }
  return out;
}

describe('文章の決まりの見張り', () => {
  it('1. 外国語の用語（カタカナ読み）が実用の章・アプリ文言に無い', () => {
    const terms = BANNED_TERMS.filter(t => t.length >= 5);
    const re = new RegExp(terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));
    const h = hits([...practical, ...appTexts], re);
    expect(h, '外国語の用語が残っている。日本語に言いかえる（元の語は用語集か参考の章に）:\n' + h.join('\n')).toEqual([]);
  });

  it('2. 「週◯回」の計画を辞書の声で書いていない', () => {
    // 研究・教材・元のプログラムの設定として紹介している行は通す（「部の計画ではない」と添える）
    const ok = (line) => /研究|教材|元のプログラム|部の計画|と言われる/.test(line);
    const h = hits([...practical, ...appTexts], /週\s*[0-9０-９一二三四五六七〜~\-]+\s*[回日]/, ok);
    expect(h, '回数の計画が書いてある。回数は部の計画と体の状態で決める、と書く:\n' + h.join('\n')).toEqual([]);
  });

  it('3. ハンドボールに無い用語を使っていない', () => {
    const h = hits([...chapters, ...appTexts], /オフサイド|キックオフ|PK戦/);
    expect(h, h.join('\n')).toEqual([]);
  });

  it('4. 相手の守り方を国の名前で呼んでいない（アプリ文言）', () => {
    const h = hits(appTexts, /(ソビエト|ソ連|韓国|フランス|ユーゴ|デンマーク|ポルトガル|ドイツ|スペイン|ノルウェー|クロアチア)(型|式)/);
    expect(h, '国の名前で型を呼んでいる。形そのもの（例：前に出てくる守り）で書く:\n' + h.join('\n')).toEqual([]);
  });

  it('5. アプリの文言に辞書のファイル名が出ていない', () => {
    const h = hits(appTexts, /\d{2}_[a-z_]+\.md/);
    expect(h, '「NN章『題』」の形で書く:\n' + h.join('\n')).toEqual([]);
  });

  it('6. 実用の章の見出しに外国語の単語が無い', () => {
    const OK = new Set(('IHF JHA DHB EHF NHF DHF GK DF OF CB LB RB LW RW PV FT ACL NG OK PK vs on Step OSTRC VBG ' +
      'RPE HIIT SSG CSSR Level min sec kg cm mm km ms').split(' '));
    const out = [];
    for (const c of practical) {
      c.text.split('\n').forEach((line, i) => {
        if (!/^#{1,4}\s/.test(line)) return;
        const bad = (line.match(/[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/g) || []).filter(w => !OK.has(w));
        if (bad.length) out.push(`${c.name}:${i + 1}: ${line.trim().slice(0, 80)}`);
      });
    }
    expect(out, '見出しは日本語で:\n' + out.join('\n')).toEqual([]);
  });
});
