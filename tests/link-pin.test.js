// メンタルアプリとつなぐときのPIN（オーナー指示 2026-11-20）
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { linkPinHash, isPin4, linkDeniedText, LINK_FULL_TEXT, LINK_TRY_SLOTS } from '../app/src/lib/linkPin.js';
import { LINK_STEPS, MENTAL_APP_URL, isFromMental, declWhere } from '../app/src/lib/declWhere.js';
import { ROOT } from './helpers/sections.js';

describe('つなぐときのPIN', () => {
  it('照合用の形は64文字で、メンタルアプリ側と同じ作り方（決まった入力に決まった答え）', async () => {
    // この答えは handball-mental の tests/link-pin.test.js と同じ値。片方だけ変わったら、正しいPINでもつながらなくなる。
    expect(await linkPinHash('uidX', '1234')).toBe('2ea9cc4dda73238f785a360edea79ed76f5143f0470598d969a7d7d768d78a45');
    expect((await linkPinHash('uidX', '1234')).length).toBe(64);
  });
  it('人が違えば、同じPINでも違う形になる', async () => {
    expect(await linkPinHash('uidX', '1234')).not.toBe(await linkPinHash('uidY', '1234'));
    expect(await linkPinHash('uidX', '1234')).not.toBe(await linkPinHash('uidX', '1235'));
  });
  it('PINは数字4桁だけを受ける', () => {
    for (const ok of ['0000', '1234', '9999']) expect(isPin4(ok), ok).toBe(true);
    for (const ng of ['', '123', '12345', '12a4', ' 1234', null, undefined, '１２３４']) expect(isPin4(ng), String(ng)).toBe(false);
  });
  it('つなげなかったときの文：理由を決めつけない・残りの回数を言う', () => {
    expect(linkDeniedText(3)).toContain('①PINが違う');
    expect(linkDeniedText(3)).toContain('③別の端末');
    expect(linkDeniedText(3)).toContain('あと3回');
    expect(linkDeniedText(0)).toContain('もう試せません');
    expect(LINK_FULL_TEXT).toContain('PINを表示');
    expect(LINK_TRY_SLOTS).toBe(10);
  });
  it('手順にPINの見方が入っている', () => {
    expect(LINK_STEPS.length).toBe(4);
    expect(LINK_STEPS.join('')).toContain('LABとつなぐ');
  });
  it('PINを付けてつなぐ書き込みは、試しの席→つなぎ の順で、/rosterToUid には書かない', () => {
    const fb = fs.readFileSync(path.join(ROOT, 'app/src/lib/fb.js'), 'utf8');
    const from = fb.indexOf('export async function fbLinkWithPin');
    const body = fb.slice(from, fb.indexOf('\n}\n', from));
    expect(body.indexOf("'linkTries/'")).toBeGreaterThan(0);
    expect(body.indexOf("'labLinks/'")).toBeGreaterThan(body.indexOf("'linkTries/'"));
    expect(body).not.toContain('rosterToUid/');
    expect(body).toContain("try: String(slot)");
  });
  it('名前を選ぶのは、PINが合ったあと（聞く前には選ばない）', () => {
    const app = fs.readFileSync(path.join(ROOT, 'app/src/App.jsx'), 'utf8');
    const from = app.indexOf('const handlePickRoster = async');
    const body = app.slice(from, app.indexOf('const handleSubmitPin', from));
    const ask = body.indexOf('setPinAsk({ r, linkedUid');
    expect(ask).toBeGreaterThan(0);
    // PINを聞く前に名前を選ぶ行（pick）は、どれも return で抜けている（そのままPINの欄へ進む道に pick が無い）
    const before = body.slice(0, ask).split('\n').filter(l => l.includes('pick(') && !l.includes('const pick'));
    for (const l of before) expect(l, l.trim()).toContain('return;');
    expect(body.slice(ask, ask + 80)).toContain('return;');
  });
});

describe('2つのアプリを行き来する（オーナー指示 2026-11-20）', () => {
  it('メンタルアプリを開く行き先は1か所で決めてあり、LABから来た目印が付いている', () => {
    expect(MENTAL_APP_URL).toBe('https://ganchi2014-tech.github.io/handball-mental/#from=lab');
    const src = ['app/src/App.jsx', 'app/src/components/connect.jsx', 'app/src/components/loop.jsx', 'app/src/components/decide.jsx']
      .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
    expect(src).not.toContain('github.io/handball-mental');           // 画面の側に行き先を直に書かない
    expect((src.match(/href=\{MENTAL_APP_URL\}/g) || []).length).toBeGreaterThanOrEqual(5); // ホーム・手順・PINの欄・メンタルの宣言・宣言の下
    expect((src.match(/href=\{MENTAL_APP_URL\}(?! target="_blank" rel="noopener noreferrer")/g) || []).length).toBe(0);
  });
  it('メンタルアプリから来た目印を見分ける', () => {
    for (const h of ['#from=mental', '#x=1&from=mental', '#from=mental&y=2']) expect(isFromMental(h), h).toBe(true);
    for (const h of ['', '#s=33%3A%3A%E3%82%AB', '#from=mentalx', '#notfrom=mental', '#from=lab', null]) expect(isFromMental(h), String(h)).toBe(false);
  });
  it('宣言がメンタルアプリに出ている人にだけ、宣言の下に「メンタルアプリを開く」を出す', () => {
    expect(declWhere({ enabled: true, status: 'on', hasRoster: true, mental: 'yes' }).mental).toBe(true);
    for (const st of [{ enabled: false }, { enabled: true, status: 'on', hasRoster: true, mental: 'nolink' }, { enabled: true, status: 'error', hasRoster: true, mental: 'yes' }]) {
      expect(!!declWhere(st).mental).toBe(false);
    }
  });
});
