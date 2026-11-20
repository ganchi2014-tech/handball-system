// 兄弟社ホームとつなぐときのPIN（オーナー指示 2026-11-20）
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { linkPinHash, isPin4, linkDeniedText, LINK_FULL_TEXT, LINK_TRY_SLOTS } from '../app/src/lib/linkPin.js';
import { LINK_STEPS, isFromMental, declWhere } from '../app/src/lib/declWhere.js';
import { HOME_APP_URL, inHome, homeAppLink, readHomeLocal, placeNotice } from '../app/src/lib/place.js';
import { ROOT } from './helpers/sections.js';

describe('つなぐときのPIN', () => {
  it('照合用の形は64文字で、兄弟社ホーム側と同じ作り方（決まった入力に決まった答え）', async () => {
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
    expect(body.slice(ask, body.indexOf('\n', ask) + 20)).toContain('return;');
  });
});

describe('2つのアプリを行き来する（オーナー指示 2026-11-20）', () => {
  it('兄弟社ホームを開く行き先は1か所で決めてある（画面の側に住所を直に書かない）', () => {
    expect(HOME_APP_URL).toBe('https://ganchi2014-tech.github.io/handball-mental/');
    const src = ['app/src/App.jsx', 'app/src/components/connect.jsx', 'app/src/components/loop.jsx', 'app/src/components/decide.jsx', 'app/src/components/homeLink.jsx']
      .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
    expect(src).not.toContain('github.io/handball-mental');
    expect((src.match(/<HomeAppLink /g) || []).length).toBeGreaterThanOrEqual(6); // ホーム・場所の知らせ・手順・PINの欄・つながっている人・メンタルの宣言・宣言の下
  });
  it('兄弟社ホームの中のLABからは同じ画面のまま戻る。前の住所からは別の画面で開く', () => {
    for (const p of ['/handball-mental/lab/', '/handball-mental/lab/index.html', '/handball-mental/lab']) {
      expect(inHome(p), p).toBe(true);
      expect(homeAppLink(p)).toEqual({ href: '../', sameWindow: true });
    }
    for (const p of ['/handball-system/', '/handball-system/index.html', '/handball-mental/', '/handball-mental/labs/', '/', '']) {
      expect(inHome(p), p).toBe(false);
      expect(homeAppLink(p)).toEqual({ href: 'https://ganchi2014-tech.github.io/handball-mental/#from=lab', sameWindow: false });
    }
  });
  it('場所の知らせ：記録のある所では邪魔をしない／前の住所では入口が変わったことを知らせる', () => {
    expect(placeNotice({ pathname: '/handball-mental/lab/', hasData: false })).toBe('homeFresh');
    expect(placeNotice({ pathname: '/handball-mental/lab/', hasData: true })).toBe(null);
    expect(placeNotice({ pathname: '/handball-mental/lab/', hasData: true, standalone: true })).toBe(null);
    expect(placeNotice({ pathname: '/handball-system/', standalone: true, hasData: true })).toBe('oldIos');
    expect(placeNotice({ pathname: '/handball-system/', standalone: false, hasData: true })).toBe('old');
    expect(placeNotice({ pathname: '/handball-system/', standalone: true, hasData: true, dismissed: true })).toBe(null);
    expect(placeNotice({ pathname: '/handball-system/', standalone: false, hasData: false, dismissed: true })).toBe(null);
  });
  it('兄弟社ホームの控えを読む：照合用の形（64文字）と持ち主の番号がそろっているときだけ使う', () => {
    const mk = (o) => ({ getItem: (k) => (k in o ? o[k] : null) });
    const H = 'a'.repeat(64);
    const ok = readHomeLocal(mk({ mental_link_pin_cache: JSON.stringify({ src: 'v2:x:y', uid: 'm1', hash: H }), 'handball-mental-v2': JSON.stringify({ user: { name: '東 太郎', rosterId: 'r1' } }) }));
    expect(ok).toEqual({ uid: 'm1', hash: H, rosterId: 'r1', name: '東 太郎' });
    expect(readHomeLocal(mk({ mental_link_pin_cache: JSON.stringify({ uid: 'm1', hash: H }) }))).toEqual({ uid: 'm1', hash: H, rosterId: null, name: null });
    for (const bad of [{}, { mental_link_pin_cache: 'こわれた文字' }, { mental_link_pin_cache: JSON.stringify({ uid: 'm1', hash: '1234' }) }, { mental_link_pin_cache: JSON.stringify({ hash: H }) }, { mental_link_pin_cache: 'null' }]) {
      expect(readHomeLocal(mk(bad))).toBe(null);
    }
    expect(readHomeLocal({ getItem() { throw new Error('使えない'); } })).toBe(null);
  });
  it('控えでつなぐのは、押した名前の持ち主と控えの持ち主が同じときだけ。外れたらPINを打つ欄に切りかえる', () => {
    const app = fs.readFileSync(path.join(ROOT, 'app/src/App.jsx'), 'utf8');
    expect(app).toContain('localHash: (home && home.uid === linkedUid) ? home.hash : null');
    expect(app).toContain("setPinAsk({ ...ask, localHash: null, busy: false, msg:");
  });
  it('つなぎを外す書き込みは labLinks だけ。/rosterToUid には触れない', () => {
    const fb = fs.readFileSync(path.join(ROOT, 'app/src/lib/fb.js'), 'utf8');
    const from = fb.indexOf('export async function fbRemoveLabLink');
    const body = fb.slice(from, fb.indexOf('\n}\n', from));
    expect(body).toContain("dbMod.remove(dbMod.ref(db, 'labLinks/' + mentalUid))");
    expect(body).not.toContain('rosterToUid/');
  });
  it('兄弟社ホームから来た目印を見分ける', () => {
    for (const h of ['#from=mental', '#x=1&from=mental', '#from=mental&y=2']) expect(isFromMental(h), h).toBe(true);
    for (const h of ['', '#s=33%3A%3A%E3%82%AB', '#from=mentalx', '#notfrom=mental', '#from=lab', null]) expect(isFromMental(h), String(h)).toBe(false);
  });
  it('宣言が兄弟社ホームに出ている人にだけ、宣言の下に「兄弟社ホームを開く」を出す', () => {
    expect(declWhere({ enabled: true, status: 'on', hasRoster: true, mental: 'yes' }).mental).toBe(true);
    for (const st of [{ enabled: false }, { enabled: true, status: 'on', hasRoster: true, mental: 'nolink' }, { enabled: true, status: 'error', hasRoster: true, mental: 'yes' }]) {
      expect(!!declWhere(st).mental).toBe(false);
    }
  });
});
