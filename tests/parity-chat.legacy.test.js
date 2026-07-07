// 新旧パリティ: チャット検索（kw抽出＋top3ルーティング）が旧index.htmlと完全一致すること。
// 質問は chat_battery.js の内蔵68問＋回帰14問。切替時に削除する。
import { describe, it, expect } from 'vitest';
import { DICT_FILES, splitSections } from '../app/src/lib/dict.js';
import { chatSearch, chatExtractKeywords } from '../app/src/lib/chat.js';
import { legacyChat, buildSections } from './helpers/legacy.js';

const BATTERY = [
  'トラベリングって何歩から？', 'ボールを持って何秒まで動ける？', '7mスローになるのはどんな時？',
  'パッシブってどうなったら取られる？', '2分退場と失格の違いは？', 'どこまでの接触ならファウルじゃない？',
  'どこからが警告でどこからが2分退場？', 'キーパーがゴールエリアから出たらどうなる？', 'ボールが足に当たったら反則？',
  'イエローカードは何枚まで？', '交代で反則になるのはどんな時？', 'オーバーステップって何？',
  '5-1はどう攻略する？', '6-0の崩し方は？', '3-2-1ディフェンスの攻め方', 'ワイドとクローズの違いは？',
  'ダブルポストって何？', 'セットオフェンスの基本は？', '速攻の走り方は？', '7on6はいつ使う？',
  'フェイントの種類を教えて', 'DFが抜けない', 'シュートが入らない', '7mシュートのコツは？',
  'ループシュートの打ち方', 'バウンドシュートとは', '山側谷側って何？', '早打ちのやり方',
  'ステップシュートのコツ', 'コースの狙い方',
  '1対1で抜かれる', '当たり負けする', 'スクリーンの外し方', 'ファイトオーバーとは',
  'センターの役割は？', 'ウィングの役割', '左バックと右バックの違い', 'ピボットって何をする？',
  'ジャンプ力を上げるには', '筋トレメニューを教えて', 'スタミナをつけたい', '足を速くしたい',
  '肩が痛い', '足首の捻挫を防ぐには', '膝が痛いとき', 'ケガから復帰するには',
  '緊張して力が出ない', 'ミスを引きずる', '自信がない', 'プレッシャーに勝つには',
  '2対1の攻め方', '退場中の守り方は？', '数的不利のとき',
  'シューズの選び方', 'マウスピースは必要？', 'メガネはつけていい？', '松ヤニのルール',
  'アップは何をすればいい？', '試合前の食事は？', '試合当日の流れ',
  '相手の分析の仕方', 'ハーフタイムで何を直す？', 'サインプレーとは', 'ケンパとは', '点差があるときの戦い方',
  '判断が遅い', '声が出せない', '視野を広げるには',
  // 回帰14問のうちBATTERY未収録分
  'ディフェンスで抜かれる', '腰が痛い', '足がつる', 'ポストパスが通らない',
];

const legacy = legacyChat();
const legacySections = buildSections(legacy.splitSections, legacy.DICT_FILES);
const newSections = buildSections(splitSections, DICT_FILES);

describe('チャット新旧パリティ', () => {
  it('セクション分割が完全一致（数・id・title・body）', () => {
    expect(newSections.length).toBe(legacySections.length);
    for (let i = 0; i < newSections.length; i++) {
      expect(newSections[i].id).toBe(legacySections[i].id);
      expect(newSections[i].title).toBe(legacySections[i].title);
      expect(newSections[i].body).toBe(legacySections[i].body);
    }
  });

  for (const q of BATTERY) {
    it(`「${q}」: kw＋top3一致`, () => {
      const oldR = legacy.chatSearch(q, legacySections);
      const newR = chatSearch(q, newSections);
      const kw = (r) => (r.kws || []).map(k => `${k.raw}:${k.w}`);
      const top = (r) => (r.hits || []).slice(0, 3).map(h => `${h.fileId}|${h.title}`);
      expect(kw(newR)).toEqual(kw(oldR));
      expect(top(newR)).toEqual(top(oldR));
    });
  }
});
