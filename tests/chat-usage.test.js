// 場面を想定して使ってみたときに外れた質問を、同じ形で見張る。
// 落ちたら：app/src/data/chatSynonyms.json（言いかえ）、用語集、課題解決の題、辞書の見出しのどれかが変わっていないかを見る。
import { describe, it, expect } from 'vitest';
import { DICT_FILES, splitSections } from '../app/src/lib/dict.js';
import { renderMarkdown } from '../app/src/lib/markdown.js';
import { normalizeFavs } from '../app/src/lib/dictFav.js';
import { HUB_MODULES, FEATURE_PLAN } from '../app/src/lib/appData.js';
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

// 直しを10場面に合わせすぎていないかを見るために、後から別の言い方で打った質問
describe('別の言い方でも外れない（後から足した質問）', () => {
  const CASES = [
    ['ポストの後ろのDF外せない', ['06']],
    ['2枚目来ないとき1人でどう止める', ['33', '23', '26']],
    ['7mでGKのどこ見ればいい', ['22']],
    ['足首ひねった 冷やす？温める？', ['25']],
    ['ミスると頭まっ白になる', ['18']],
    ['相手サイド速すぎて無理', ['23', '03']],
    ['タイムアウト何回まで？', ['30']],
    ['シュートで肘下がるって言われる', ['01']],
    // 3回目（直さずに数えた12問）のうち、外れた3問
    ['サイドの守りで抜かれまくる', ['23']],
    ['声出せって言われるけど何て言えばいい', ['04', '23']],
    ['ベンチで出番待つとき何見てればいい', ['10', '04', '17']],
  ];
  for (const [q, want] of CASES) {
    it(`「${q}」→ ${want.join('・')}章`, () => {
      const r = reply(q);
      expect(r.kind, '何も返らない').toBe('answer');
      expect(want).toContain(r.head.id.split('-')[0]);
    });
  }
  it('「タイムアウト何回まで？」の答えに回数が出る', () => {
    expect(reply('タイムアウト何回まで？').html).toContain('各1回');
  });
  it('7m：打つ側の「GKのどこを見る」は打つ側の節、GK側の「シューターのどこを見る」はGKの節', () => {
    expect(reply('7mでGKのどこ見ればいい').head.title).toContain('シューター');
    expect(reply('7mでシューターのどこを見る').head.title).toContain('GK');
  });
});

describe('答えの見た目', () => {
  const QS = ['GK 同じ動き 2本目', 'サイド 角度ない', '5-1はどう攻略する？', '速攻で戻れない', 'ミスを引きずる', '7mが入らない',
    'ポスト ボール 入らない', 'フェイントが効かない', 'シュートがGKに止められる', '2分退場中どう守る？', 'クロスのタイミング', '相手のエースを止めたい'];
  for (const q of QS) {
    it(`「${q}」の答えで、表が文字のまま出ない`, () => {
      const html = reply(q).html || '';
      expect(html.includes('|---|')).toBe(false);
      expect(/<pre[^>]*><code>\s*\|/.test(html)).toBe(false);
    });
  }
});

describe('顧問が確かめた言葉の説明・陣形の数字・肘', () => {
  it('「前回りってどうやるの」に、用語の説明（動き）が先に出る', () => {
    const html = reply('前回りってどうやるの').html;
    expect(html).toContain('chat-gloss');
    expect(html).toContain('ポストの前');
  });
  it('「0-6の攻め方」と前から数える言い方で聞いても、6-0の話が返る', () => {
    const r = reply('0-6の攻め方');
    expect(r.kind).toBe('answer');
    expect(['26', '20', '16', '17']).toContain(r.head.id.split('-')[0]);
    expect(r.html).toContain('6-0');
    expect(r.solve, '「攻撃」のような広い言葉だけで相談を出さない').toEqual([]);
  });
  it('「シュートで肘下がるって言われる」→ 01章の「肘が下がる」の段落', () => {
    const r = reply('シュートで肘下がるって言われる');
    expect(r.head.id.startsWith('01-')).toBe(true);
    expect(r.html).toContain('肘が下がる');
  });
});

describe('用語集「アウト」「3枚目」（顧問が確かめた説明）', () => {
  it('「アウトって何」「3枚目って何」に説明が出る', () => {
    expect(chatGlossaryHit('アウトって何').desc).toContain('サイドライン側');
    expect(chatGlossaryHit('3枚目って何').desc).toContain('中央寄り');
  });
  it('長いカタカナの言葉の一部の「アウト」には当てない', () => {
    const g = chatGlossaryHit('パスアウトって何');
    expect(g === null || !String(g.term).startsWith('アウト')).toBe(true);
    expect(chatGlossaryHit('タイムアウトって何').term).toContain('タイムアウト');
  });
  it('本文でも、別の言葉の中の「アウト」「フォロー」は飾らない', () => {
    expect(renderMarkdown('45がアウトを取る')).toContain('data-term="アウト"');
    expect(renderMarkdown('プレッシャーアウトする')).not.toContain('data-term="アウト"');
    expect(renderMarkdown('フォローアップの確認')).not.toContain('data-term="フォロー"');
    expect(renderMarkdown('フォロー中心で寄る')).toContain('data-term="フォロー"');
  });
});

describe('呼び方を「ポスト」にそろえた後（2026-11-20）', () => {
  it('「ピボット」「ピヴォット」と打って質問しても、ポストの話が返る', () => {
    for (const q of ['ピボットにパスが入らない', 'ピヴォットの動き方']) {
      const r = reply(q);
      expect(r.kind, q).toBe('answer');
      expect(r.head.id.startsWith('06-'), q + ' → ' + r.head.id).toBe(true);
    }
  });
  it('「ピボットにパスが入らない」の近い相談は、ポストの相談', () => {
    const r = reply('ピボットにパスが入らない');
    expect(r.solve.length).toBeGreaterThan(0);
    expect(r.solve[0].title.startsWith('【ポスト】'), r.solve[0].title).toBe(true);
  });
  it('「ピボットって何」に、用語集の説明（ポストの別の呼び方）が出る', () => {
    expect(chatGlossaryHit('ピボットって何').desc).toContain('ポスト');
  });
  it('見出しを変えた節のお気に入りは、新しい見出しに付いていく', () => {
    expect(normalizeFavs(['06::トピックK：重心移動の物理（小柄ピボットが大柄DFを動かせる理由）']))
      .toEqual(['06::トピックK：重心移動の物理（小柄ポストが大柄DFを動かせる理由）']);
  });
});

describe('「練習を組む」を一旦消した（2026-11-20）', () => {
  it('旗が下りている間は、ホームのカードに出ない', () => {
    expect(FEATURE_PLAN).toBe(false);
    expect(HUB_MODULES.some(m => m.id === 'plan')).toBe(false);
    expect(HUB_MODULES.some(m => m.id === 'dictionary')).toBe(true);
  });
});
