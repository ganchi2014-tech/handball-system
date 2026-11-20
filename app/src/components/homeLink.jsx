// 兄弟社ホーム（前の兄弟社ホーム）を開くリンク。行き先は lib/place.js の1か所で決める。
// 兄弟社ホームの中のLABなら同じ画面のまま戻る。前の住所のLABなら別の画面で開く。
import React from 'react';
import { homeAppLink } from '../lib/place.js';

function HomeAppLink({ className, style, children }) {
  const l = homeAppLink();
  return l.sameWindow
    ? <a className={className} style={style} href={l.href}>{children}</a>
    : <a className={className} style={style} href={l.href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

export { HomeAppLink };
