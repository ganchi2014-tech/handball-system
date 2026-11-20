// 宣言（次に試すこと）が「どこに出るか」を、書いた本人に見せるための文を作る。
// オーナー指示（2026-11-20）：「書き込んだ人がどこに反映されたかわかるように」。
//
// enabled  … 「チームと繋ぐ」を押しているか
// status   … 接続の状態（off | connecting | on | error）
// hasRoster… 名簿から自分の名前を選んでいるか
// mental   … 兄弟社ホームと繋がっているか
//            yes | noreg（兄弟社ホームで名前を登録していない）| other（別の端末が繋がっている）
//            | nolink（まだ繋がっていない）| unknown（確かめられなかった）
const HOME_LINE = 'このアプリのホーム「前回の宣言」（この端末に保存）';
const MENTAL_LINES = {
  yes: '兄弟社ホームの「行動宣言」の画面に「⚡プレーの宣言」として出る（自分の画面）',
  noname: '兄弟社ホームには出ない（「チームと繋ぐ」で名簿から自分の名前を選ぶと出る）',
  noreg: '兄弟社ホームには出ない（兄弟社ホームで自分の名前を登録すると出る）',
  other: '兄弟社ホームには出ない（別の端末が兄弟社ホームと繋がっているため）',
  nolink: '兄弟社ホームには出ない（「チームと繋ぐ」で自分の名前を選び直すと出る）',
  unknown: '兄弟社ホームに出るかは、いま確かめられなかった',
};

function declWhere({ enabled, status, hasRoster, mental } = {}) {
  const lines = [HOME_LINE];
  if (!enabled) {
    lines.push('ほかの場所には出ない（「チームと繋ぐ」を押していないため）');
    return { lines, short: 'この端末の中だけ', howto: true };
  }
  if (status !== 'on') {
    lines.push('クラウドにはまだ出ていない（いま接続できていない。接続できたときに保存される）');
    return { lines, short: 'この端末（クラウドは接続待ち）', howto: false };
  }
  lines.push('クラウド（部のデータベースの、自分の場所）にも保存される');
  const m = !hasRoster ? 'noname' : (MENTAL_LINES[mental] ? mental : 'unknown');
  lines.push(MENTAL_LINES[m]);
  const short = m === 'yes' ? 'この端末・クラウド・兄弟社ホームの「行動宣言」'
    : m === 'unknown' ? 'この端末・クラウド'
    : 'この端末・クラウド（兄弟社ホームには出ない）';
  // つなぎ方の案内を出すのは、本人が自分でつなげる状態のときだけ
  // （もうつながっている・別の端末がつながっている・確かめられなかった、のときは出さない）
  const howto = m === 'noname' || m === 'noreg' || m === 'nolink';
  return { lines, short, howto, mental: m === 'yes' };
}

// 兄弟社ホームから来た目印（前の版の兄弟社ホームのリンクが #from=mental を付けていた。残っていたら消すだけ）
function isFromMental(hash) { return /(^|[#&])from=mental(&|$)/.test(String(hash || '')); }

// 兄弟社ホームとつなぐ手順（つながっていない人に見せる。オーナー指示 2026-11-20）
const LINK_STEPS = [
  '兄弟社ホーム（前のメンタルアプリ）で、名簿から自分を選んで登録する（まだの人だけ）',
  '兄弟社ホームの「辞書・振り返り（LAB）」から、このアプリを開く',
  'ホームの下のほうにある「🔗 チームと繋ぐ」を押し、名簿から自分の名前を押す',
  '「つなぐ」を押す。PINを聞かれたら、兄弟社ホームの「マイ統計」の「LABとつなぐ」で見られる4桁を入れる',
];
const LINK_STEPS_NOTE = 'つながると、宣言が兄弟社ホームの「行動宣言」の画面に出て、このアプリの記録が兄弟社ホームの「マイ統計」に出る。つながなくても、このアプリは全部使える。';

export { declWhere, LINK_STEPS, LINK_STEPS_NOTE, isFromMental };
