// 「チームと繋ぐ」の画面：つながっていない人への手順と、PINを聞く欄（オーナー指示 2026-11-20）
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConnectPanel } from '../app/src/components/connect.jsx';

const noop = () => {};
const base = { fbStatus: 'on', fbRoster: [{ rosterId: 'r1', name: '東 太郎' }, { rosterId: 'r2', name: '西 次郎' }], fbQueue: [], notice: null,
  manualNames: [], nameMap: {}, onConnect: noop, onDisconnect: noop, onPickRoster: noop, onSubmitPin: noop, onCancelPin: noop, onMapName: noop, onClose: noop };
const html = (props) => renderToStaticMarkup(React.createElement(ConnectPanel, { ...base, ...props }));

describe('チームと繋ぐの画面', () => {
  it('繋いでいない人：手順が出る', () => {
    const h = html({ fbLink: { enabled: 0 }, fbStatus: 'off', mentalLinked: false, pinAsk: null });
    expect(h).toContain('メンタルアプリとつなぐ手順');
    expect(h).toContain('名簿から自分の名前を押す');
  });
  it('繋いでいるがメンタルアプリとはまだの人：手順が出る', () => {
    const h = html({ fbLink: { enabled: 1, rosterId: null }, mentalLinked: false, pinAsk: null });
    expect(h).toContain('メンタルアプリとつなぐ手順');
  });
  it('メンタルアプリとつながっている人：手順は出ない', () => {
    const h = html({ fbLink: { enabled: 1, rosterId: 'r1', rosterName: '東 太郎' }, mentalLinked: true, pinAsk: null });
    expect(h).not.toContain('メンタルアプリとつなぐ手順');
  });
  it('名前を押してPINを聞かれているとき：その名前と入力欄が出て、手順は引っこむ', () => {
    const h = html({ fbLink: { enabled: 1, rosterId: null }, mentalLinked: false, pinAsk: { r: { rosterId: 'r2', name: '西 次郎' }, linkedUid: 'm2', msg: null, left: null, busy: false } });
    expect(h).toContain('「西 次郎」のPINを入れる');
    expect(h).toContain('maxLength="4"');
    expect(h).toContain('つなぐ');
    expect(h).not.toContain('メンタルアプリとつなぐ手順');
  });
  it('PINが合わなかったとき：理由を並べて、残りの回数を言う', () => {
    const h = html({ fbLink: { enabled: 1 }, mentalLinked: false, pinAsk: { r: { rosterId: 'r2', name: '西 次郎' }, linkedUid: 'm2', msg: 'denied', left: 7, busy: false } });
    expect(h).toContain('①PINが違う');
    expect(h).toContain('あと7回');
  });
  it('10回使い切ったとき：メンタルアプリで「PINを表示」を押すと言う', () => {
    const h = html({ fbLink: { enabled: 1 }, mentalLinked: false, pinAsk: { r: { rosterId: 'r2', name: '西 次郎' }, linkedUid: 'm2', msg: 'full', left: 0, busy: false } });
    expect(h).toContain('使い切っています');
    expect(h).toContain('PINを表示');
  });
});
