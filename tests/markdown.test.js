// 辞書の本文を画面に出す変換（lib/markdown.js）の、崩れやすい所だけを見る。
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../app/src/lib/markdown.js';

describe('本文の表示', () => {
  it('引用の中の空行（">" だけの行）を文字として出さない', () => {
    const html = renderMarkdown('> 一行目\n>\n> 二行目');
    expect(html).toContain('一行目');
    expect(html).toContain('二行目');
    expect(html.replace(/<[^>]+>/g, '')).not.toMatch(/&gt;|>/);
  });
  it('章のファイル名は「NN章 題」のリンクになる', () => {
    const html = renderMarkdown('くわしくは `18_mental.md` にある。');
    expect(html).toContain('18章');
    expect(html).not.toContain('18_mental.md<');
  });
});
