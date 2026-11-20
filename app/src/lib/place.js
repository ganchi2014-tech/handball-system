// このLABが「どこで動いているか」と、兄弟社ホーム（前の兄弟社ホーム）との行き来。
// オーナー指示（2026-11-20）：「兄弟社ホームを『兄弟社ホーム』にして、入口を統一」。
//
// LAB は2つの住所で動く（中身は同じ。置き場所を選ばない作り）：
//   ・…/handball-system/        … 前からの住所（アイコンやブックマークを壊さないため、消さない）
//   ・…/handball-mental/lab/    … 兄弟社ホームの住所の下。兄弟社ホームの中から開くとここになる
// iPhoneでホーム画面のアイコンから使っている人は、アイコンごとに保存場所が別なので、
// 兄弟社ホームのアイコンの中で開いたLAB（下の住所）が、兄弟社ホームと同じ保存場所になる。
const HOME_APP_NAME = '兄弟社ホーム';
const HOME_APP_URL = 'https://ganchi2014-tech.github.io/handball-mental/';

function inHome(pathname) {
  return /\/handball-mental\/lab(\/|$)/.test(String(pathname || ''));
}

// 兄弟社ホームを開く行き先。中にいるときは同じ画面のまま戻る。前の住所からは別の画面で開く
// （末尾の #from=lab は、兄弟社ホーム側が「LABから来た」と分かるための目印。通信には乗らない）。
function homeAppLink(pathname) {
  const p = pathname != null ? pathname : (typeof window !== 'undefined' ? window.location.pathname : '');
  return inHome(p) ? { href: '../', sameWindow: true } : { href: HOME_APP_URL + '#from=lab', sameWindow: false };
}

// 兄弟社ホームが、この保存場所に控えているもの（同じ保存場所なら読める）。
// つなぐときに、PINを打たずに済ませるために使う。読むだけ。PINそのものは控えられていない（照合用の形だけ）。
function readHomeLocal(storage) {
  try {
    const c = JSON.parse(storage.getItem('mental_link_pin_cache') || 'null');
    if (!c || !c.uid || !/^[0-9a-f]{64}$/.test(String(c.hash || ''))) return null;
    let user = null;
    try { user = (JSON.parse(storage.getItem('handball-mental-v2') || 'null') || {}).user || null; } catch (e) { user = null; }
    return { uid: String(c.uid), hash: String(c.hash), rosterId: (user && user.rosterId) || null, name: (user && user.name) || null };
  } catch (e) {
    return null;
  }
}

// ホームの頭に出す「場所の知らせ」。
//   homeFresh … 兄弟社ホームの中のLABで、ここに記録がまだ無い（前のLABに記録がある人へ、移し方）
//   oldIos    … 前の住所を、iPhoneのホーム画面のアイコンから開いている（これからの入口と、移し方）
//   old       … 前の住所を、ブラウザやAndroidで開いている（記録は同じ保存場所なので、入口の知らせだけ）
function placeNotice({ pathname, standalone, hasData, dismissed } = {}) {
  if (inHome(pathname)) return hasData ? null : 'homeFresh';
  if (dismissed) return null;
  return standalone ? 'oldIos' : 'old';
}

export { HOME_APP_NAME, HOME_APP_URL, inHome, homeAppLink, readHomeLocal, placeNotice };
