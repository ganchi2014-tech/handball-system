// チャット回帰テスト（.scripts/chat_battery.js --check の Vitest 移植）
// 2026-07-06レビューで外れた質問＋守るべき代表質問。top1 が期待ファイル（とtitle部分一致）を外したら失敗。
import { describe, it, expect } from 'vitest';
import { DICT_FILES, splitSections } from '../app/src/lib/dict.js';
import { chatSearch } from '../app/src/lib/chat.js';
import { buildSections } from './helpers/legacy.js';

const sections = buildSections(splitSections, DICT_FILES);

const EXPECTED = [
  // 2026-07-06 検証で外れていた質問（修正済み・再発防止）
  // ※file26の各陣形は###（セクション化されない）ため、着地点は親のOF陣形節
  { q: 'ダブルポストって何？',       file: '26', title: 'OF（オフェンス）陣形' },
  { q: '肩が痛い',                   file: '25', title: '肩傷害予防' },
  { q: '膝が痛いとき',               file: '25', title: '膝傷害予防' },
  { q: 'ケガから復帰するには',       file: '25', title: '復帰プロトコル' },
  { q: '退場中の守り方は？',         file: '03' },
  { q: '点差があるときの戦い方',     file: '08' },
  { q: 'ディフェンスで抜かれる',     file: '23' },
  { q: '腰が痛い',                   file: '25' },
  { q: '足がつる',                   file: '25' },
  // 元から正しい代表質問（デグレ防止の見張り）
  { q: '緊張して力が出ない',         file: '18' },
  { q: 'ポストパスが通らない',       file: '06' },
  { q: 'トラベリングって何歩から？', file: '30' },
  { q: '5-1はどう攻略する？',        file: '26' },
  { q: '7mシュートのコツは？',       file: '22' },
];

describe('チャット回帰（14問）', () => {
  it('辞書33ファイルからセクションが構築される', () => {
    expect(sections.length).toBeGreaterThan(300);
  });

  for (const ex of EXPECTED) {
    it(`「${ex.q}」→ file${ex.file}${ex.title ? ' ' + ex.title : ''}`, () => {
      const { hits } = chatSearch(ex.q, sections);
      const top = hits && hits[0];
      expect(top, 'top1がヒットしない').toBeTruthy();
      expect(top.fileId).toBe(ex.file);
      if (ex.title) expect(top.title).toContain(ex.title);
    });
  }
});
