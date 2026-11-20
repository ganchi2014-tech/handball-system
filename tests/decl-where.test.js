// 宣言を書いた本人に「どこに出るか」を見せる文（オーナー指示 2026-11-20）
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { declWhere } from '../app/src/lib/declWhere.js';
import { ROOT } from './helpers/sections.js';

describe('宣言が出る所の文', () => {
  it('どの状態でも、ホームの「前回の宣言」が1行目に出る', () => {
    for (const st of [{}, { enabled: false }, { enabled: true, status: 'error' }, { enabled: true, status: 'on', hasRoster: true, mental: 'yes' }]) {
      expect(declWhere(st).lines[0]).toContain('ホーム「前回の宣言」');
    }
  });
  it('「チームと繋ぐ」を押していない：この端末の中だけ', () => {
    const r = declWhere({ enabled: false, status: 'off' });
    expect(r.short).toBe('この端末の中だけ');
    expect(r.lines.join('')).toContain('ほかの場所には出ない');
    expect(r.lines.join('')).not.toContain('兄弟社ホーム');
  });
  it('押しているが接続できていない：クラウドに出ていると言わない', () => {
    for (const status of ['connecting', 'error', 'off']) {
      const r = declWhere({ enabled: true, status, hasRoster: true, mental: 'yes' });
      expect(r.lines.join(''), status).toContain('クラウドにはまだ出ていない');
      expect(r.lines.join(''), status).not.toContain('兄弟社ホーム');
    }
  });
  it('接続ずみで兄弟社ホームと繋がっている：行動宣言の画面に出ると言う', () => {
    const r = declWhere({ enabled: true, status: 'on', hasRoster: true, mental: 'yes' });
    expect(r.lines.join('')).toContain('クラウド');
    expect(r.lines.join('')).toContain('兄弟社ホームの「行動宣言」の画面');
    expect(r.short).toContain('兄弟社ホーム');
  });
  it('接続ずみでも兄弟社ホームと繋がっていない：出ると言わない（理由を添える）', () => {
    const cases = { noreg: '登録すると出る', other: '別の端末', nolink: '選び直すと出る' };
    for (const [mental, word] of Object.entries(cases)) {
      const r = declWhere({ enabled: true, status: 'on', hasRoster: true, mental });
      expect(r.lines.join(''), mental).toContain('兄弟社ホームには出ない');
      expect(r.lines.join(''), mental).toContain(word);
      expect(r.short, mental).toContain('出ない');
    }
    const n = declWhere({ enabled: true, status: 'on', hasRoster: false, mental: 'yes' });
    expect(n.lines.join('')).toContain('名簿から自分の名前を選ぶと出る');
  });
  it('確かめられなかったときは、出るとも出ないとも言わない', () => {
    const r = declWhere({ enabled: true, status: 'on', hasRoster: true, mental: 'unknown' });
    expect(r.lines.join('')).toContain('確かめられなかった');
    expect(r.short).toBe('この端末・クラウド');
  });
  it('宣言を書く3か所（辞書の節・課題解決の結果・振り返り）とホームに、出る所の表示がある', () => {
    const app = fs.readFileSync(path.join(ROOT, 'app/src/App.jsx'), 'utf8');
    expect((app.match(/<DecideOne [^>]*where=\{declWhereInfo\}/g) || []).length).toBe(2);
    expect(app).toMatch(/onBlur=\{e => commitNextStep\(e\.target\.value\)\}\s*\/>\s*<DeclWhere info=\{declWhereInfo\}/);
    const loop = fs.readFileSync(path.join(ROOT, 'app/src/components/loop.jsx'), 'utf8');
    expect(loop).toContain('<DeclWhere info={declWhere} />');
  });
  it('つなぎ方の案内は、本人が自分でつなげる状態のときだけ出す', () => {
    expect(declWhere({ enabled: false }).howto).toBe(true);
    expect(declWhere({ enabled: true, status: 'error', hasRoster: true, mental: 'nolink' }).howto).toBe(false);
    for (const m of ['noreg', 'nolink']) expect(declWhere({ enabled: true, status: 'on', hasRoster: true, mental: m }).howto, m).toBe(true);
    expect(declWhere({ enabled: true, status: 'on', hasRoster: false, mental: 'unknown' }).howto).toBe(true);
    for (const m of ['yes', 'other', 'unknown']) expect(declWhere({ enabled: true, status: 'on', hasRoster: true, mental: m }).howto, m).toBe(false);
  });
  it('fb.js に /rosterToUid へ書く所が無いまま（足したのは読むだけの確かめ）', () => {
    const fb = fs.readFileSync(path.join(ROOT, 'app/src/lib/fb.js'), 'utf8');
    for (const name of ['fbCheckLabLink', 'fbHasPinRules']) {
      const from = fb.indexOf('export async function ' + name);
      const body = fb.slice(from, fb.indexOf('\n}\n', from));
      expect(body, name).toContain('dbMod.get(');
      expect(body, name).not.toMatch(/dbMod\.(set|update|push|remove)\(/);
    }
    expect(fb).not.toMatch(/(set|update|push|remove)\([^)]*rosterToUid/);
  });
});
