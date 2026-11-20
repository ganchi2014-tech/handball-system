// 宣言（次に試すこと）が「どこに出るか」を、書いた本人に見せるための文を作る。
// オーナー指示（2026-11-20）：「書き込んだ人がどこに反映されたかわかるように」。
//
// enabled  … 「チームと繋ぐ」を押しているか
// status   … 接続の状態（off | connecting | on | error）
// hasRoster… 名簿から自分の名前を選んでいるか
// mental   … メンタルアプリと繋がっているか
//            yes | noreg（メンタルアプリで名前を登録していない）| other（別の端末が繋がっている）
//            | nolink（まだ繋がっていない）| unknown（確かめられなかった）
const HOME_LINE = 'このアプリのホーム「前回の宣言」（この端末に保存）';
const MENTAL_LINES = {
  yes: 'メンタルアプリの「行動宣言」の画面に「⚡プレーの宣言」として出る（自分の画面）',
  noname: 'メンタルアプリには出ない（「チームと繋ぐ」で名簿から自分の名前を選ぶと出る）',
  noreg: 'メンタルアプリには出ない（メンタルアプリで自分の名前を登録すると出る）',
  other: 'メンタルアプリには出ない（別の端末がメンタルアプリと繋がっているため）',
  nolink: 'メンタルアプリには出ない（「チームと繋ぐ」で自分の名前を選び直すと出る）',
  unknown: 'メンタルアプリに出るかは、いま確かめられなかった',
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
  const short = m === 'yes' ? 'この端末・クラウド・メンタルアプリの「行動宣言」'
    : m === 'unknown' ? 'この端末・クラウド'
    : 'この端末・クラウド（メンタルアプリには出ない）';
  // つなぎ方の案内を出すのは、本人が自分でつなげる状態のときだけ
  // （もうつながっている・別の端末がつながっている・確かめられなかった、のときは出さない）
  const howto = m === 'noname' || m === 'noreg' || m === 'nolink';
  return { lines, short, howto };
}

// メンタルアプリとつなぐ手順（つながっていない人に見せる。オーナー指示 2026-11-20）
const LINK_STEPS = [
  'メンタルアプリで、名簿から自分を選んで登録する（PINを決める）',
  'このアプリのホームの下のほうにある「🔗 チームと繋ぐ」を押す',
  '名簿から自分の名前を押す',
  'PINを聞かれたら、メンタルアプリのPIN（4桁）を入れる。PINは、メンタルアプリの「マイ統計」の「LABとつなぐ」で見られる',
];
const LINK_STEPS_NOTE = 'つながると、宣言がメンタルアプリの「行動宣言」の画面に出て、このアプリの記録がメンタルアプリの「マイ統計」に出る。つながなくても、このアプリは全部使える。';

export { declWhere, LINK_STEPS, LINK_STEPS_NOTE };
