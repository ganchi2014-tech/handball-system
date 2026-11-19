// 選手が聞きそうな言い方で質問したとき、いちばん上に出る節が「開いてほしい章」に入っているかを見る。
// 「開いてほしい章」は、質問ごとに先に決めてある（その章のどの節が出てもよい）。
// 落ちたら：辞書の見出しに選手の言葉を足すか、app/src/data/chatSynonyms.json に言いかえを足す。
import { describe, it, expect } from 'vitest';
import { DICT_FILES, splitSections } from '../app/src/lib/dict.js';
import { chatSearch } from '../app/src/lib/chat.js';
import { buildSections } from './helpers/sections.js';

const sections = buildSections(splitSections, DICT_FILES);

// [質問, 開いてほしい章]
const CASES = [
  ['今のファウルって何が悪かった？', ['30', '08']],
  ['シューズは何を選べばいい？', ['31']],
  ['明日大会、何時に起きればいい？', ['32']],
  ['アップ20分、何をやればいい？', ['32', '25']],
  ['ハーフタイムの使い方', ['32', '10', '28']],
  ['ボールが滑る。松ヤニ使っていい？', ['31']],
  ['パッシブであと何回パスできる？', ['30', '08']],
  ['2分退場中どう守る？', ['03', '08', '26', '05']],
  ['試合後の振り返り方', ['17', '28', '32']],
  ['負けた後、次の試合までの切り替え', ['18', '32']],
  ['シュートがGKに止められる', ['05', '01', '17', '20']],
  ['フェイントが効かない', ['02']],
  ['ポストにパスが通らない', ['06']],
  ['5-1の攻め方', ['26', '07', '16', '20', '17']],
  ['速攻で戻れない', ['03']],
  ['緊張する', ['18']],
  ['ミスを引きずる', ['18']],
  ['サイドシュートが入らない', ['01', '05', '09']],
  ['DFで声が出ない', ['04', '23', '05']],
  ['タイツは履いていい？', ['31']],
  ['クロスのタイミング', ['16', '27']],
  ['7mが入らない', ['22']],
  ['スクリーンで反則を取られる', ['12']],
  ['肩が痛い', ['25']],
  ['相手のエースを止めたい', ['23', '26', '10']],
];

describe('探しやすさ（選手の言い方 → 開いてほしい章）', () => {
  for (const [q, want] of CASES) {
    it(`「${q}」→ ${want.join('・')}章`, () => {
      const { hits } = chatSearch(q, sections);
      const top = hits && hits[0];
      expect(top, '何も出なかった').toBeTruthy();
      expect(want, `いちばん上に出たのは ${top.fileId}章「${top.title}」`).toContain(top.fileId);
    });
  }
  it('参考の章（読み物）が、名指ししていない質問でいちばん上に出ない', () => {
    const ref = new Set(DICT_FILES.filter(f => (f.group || '').startsWith('参考')).map(f => f.id));
    const bad = CASES.map(([q]) => [q, chatSearch(q, sections).hits[0]]).filter(([, h]) => h && ref.has(h.fileId));
    expect(bad.map(([q, h]) => `${q} → ${h.fileId}章`)).toEqual([]);
  });
});
