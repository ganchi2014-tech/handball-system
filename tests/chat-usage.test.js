// 場面を想定して使ってみたときに外れた質問を、同じ形で見張る。
// 落ちたら：app/src/data/chatSynonyms.json（言いかえ）、用語集、課題解決の題、辞書の見出しのどれかが変わっていないかを見る。
import { describe, it, expect } from 'vitest';
import { DICT_FILES, splitSections } from '../app/src/lib/dict.js';
import { buildChatReply, chatSolveMatches, chatGlossaryHit, CHAT_SAFETY_NOTE } from '../app/src/lib/chat.js';
import { buildSections } from './helpers/sections.js';
import QUESTIONS from '../app/src/data/questions.json';
import OF_EXTRA from '../app/src/data/ofExtraResults.json';

const sections = buildSections(splitSections, DICT_FILES);
const reply = (q) => buildChatReply(q, sections);

describe('質問の答えに、近い相談（課題解決）が付く', () => {
  it('「サイド 角度ない」→ サイドシュートの角度の相談', () => {
    const r = reply('サイド 角度ない');
    expect(r.solve[0].title).toContain('サイドシュートの角度');
  });
  it('「ポスト ボール 入らない」→ ポストの相談だけが並ぶ', () => {
    const r = reply('ポスト ボール 入らない');
    expect(r.solve.length).toBeGreaterThan(0);
    for (const s of r.solve) expect(s.title.startsWith('【ポスト】')).toBe(true);
  });
  it('「手が上がった 何回」→ 30章のパッシブプレーと「4回まで」', () => {
    const r = reply('手が上がった 何回');
    expect(r.head.title).toContain('パッシブプレー');
    expect(r.solve[0].action).toContain('4回まで');
    expect(r.solve[0].action.includes('**')).toBe(false); // 飾りの記号を出さない
  });
  it('相談は多くても2つ', () => {
    expect(chatSolveMatches(['シュート', '入らない'], 'シュートが入らない').length).toBeLessThanOrEqual(2);
  });
});

describe('「〜って何」は用語集から先に答える', () => {
  for (const term of ['牽制', 'フォロー', '前回り', 'クロスアタック', '1枚目']) {
    it(`「${term}って何」`, () => {
      const g = chatGlossaryHit(`${term}って何`);
      expect(g, '用語集に無い').toBeTruthy();
      expect(g.desc).toContain('33章');
      expect(reply(`${term}って何`).html).toContain('chat-gloss');
    });
  }
  it('意味をたずねていない質問には付けない', () => {
    expect(chatGlossaryHit('牽制がうまくいかない')).toBe(null);
  });
});

describe('痛みの質問には、運動のやり方を下に付けない', () => {
  for (const q of ['肩が痛いけど、投げる以外の練習ならやっていい？', '膝が痛い', '足首をひねったけど試合に出たい', '腰が痛いときのストレッチ']) {
    it(`「${q}」`, () => {
      const r = reply(q);
      expect(r.html).toBe('<p class="chat-safety">' + CHAT_SAFETY_NOTE + '</p>');
      expect(r.solve).toEqual([]);
    });
  }
  it('「やっていい？」「出たい」は、復帰の進め方をいちばん上に出す', () => {
    expect(reply('肩が痛いけど、投げる以外の練習ならやっていい？').head.title).toContain('復帰の進め方');
    expect(reply('足首をひねったけど試合に出たい').head.title).toContain('復帰の進め方');
  });
});

describe('緊張・GKの質問の行き先', () => {
  it('「緊張 手が震える」→ 18章「緊張との向き合い方」と、できることの表', () => {
    const r = reply('緊張 手が震える');
    expect(r.head.title).toBe('緊張との向き合い方');
    expect(r.html).toContain('落ち着かせる');
    expect(r.html).toContain('間を取る');
  });
  it('「9mから打ってくる どこを見る」→ 05章の視線の話', () => {
    const r = reply('9mから打ってくる どこを見る');
    expect(r.head.id.startsWith('05-')).toBe(true);
    expect(r.html).toContain('視線');
    for (const x of r.solve) expect(x.title.startsWith('【GK】'), 'GKの場面にほかのポジションの相談が出ている').toBe(true);
  });
  it('GKの場面でない「どこを見る」は、04章のまま', () => {
    expect(reply('パスをもらう前にどこを見る？').head.id.startsWith('04-')).toBe(true);
  });
  it('「ロングを打たれる」→ 05章', () => {
    expect(reply('ロングを打たれる').head.id.startsWith('05-')).toBe(true);
  });
});

describe('振り返り：GKに止められた', () => {
  it('「同じコース・同じタイミングで打っていた」を選べて、結果が33章を指す', () => {
    const c = QUESTIONS.qof_shoot_gk_how.choices.find(x => x.label.includes('同じコース'));
    expect(c).toBeTruthy();
    const res = OF_EXTRA[c.next];
    expect(res).toBeTruthy();
    expect(JSON.stringify(res)).toContain('33章「部でそろえること」');
  });
});
