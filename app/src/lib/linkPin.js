// 兄弟社ホームとつなぐときのPIN（4桁）まわりの、通信しない部分。
// オーナー指示（2026-11-20）：「つなげるときに名前を押したらPIN入力させて同じなら許可して」。
//
// 照合用の形（64文字）は、兄弟社ホーム側（handball-mental の index.html の linkPinHash）と
// 【同じ作り方】でなければならない。片方だけ変えると、正しいPINでもつながらなくなる。
// 合っているかを比べるのはデータベースの決まり（handball-mental の database.rules.json）。
// このアプリは、相手の照合用の形を読めない。
const LINK_TRY_SLOTS = 10; // 1人につき試せる回数（データベースの決まりの「席」の数と同じ）

async function linkPinHash(mentalUid, pin) {
  const data = new TextEncoder().encode('handball-link|' + String(mentalUid) + '|' + String(pin));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isPin4(s) { return /^[0-9]{4}$/.test(String(s == null ? '' : s)); }

// つなげなかったときに出す文（理由はこのアプリからは見分けられないので、考えられるものを並べる）
function linkDeniedText(left) {
  const tail = (typeof left === 'number')
    ? (left > 0 ? `あと${left}回試せます。` : 'もう試せません。兄弟社ホームで「PINを表示」を押すと、また試せます。')
    : '';
  return 'つなげませんでした。考えられる理由：①PINが違う ②兄弟社ホームで「PINを表示」をまだ押していない ③別の端末が先につながっている。' + tail;
}
const LINK_FULL_TEXT = '試せる回数（10回）を使い切っています。兄弟社ホームを開いて「PINを表示」を押すと、また試せます。';

export { LINK_TRY_SLOTS, linkPinHash, isPin4, linkDeniedText, LINK_FULL_TEXT };
