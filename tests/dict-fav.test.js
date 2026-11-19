// 辞書のお気に入り・履歴が、辞書の更新で「別の節」を指してしまわないことを守るテスト。
//
// しくみ：お気に入りは「章番号::節の見出し」で覚える（app/src/lib/dictFav.js）。
// なので、節を足す・消す・並べ替えるのは自由。ただし「見出し（# / ## の行）を変える」「節を消す」と、
// その節を登録していた人のお気に入りが外れる。それを防ぐために：
//   - 見出しを変えたら app/src/data/dictTitleRenames.json に  "05::旧い見出し": "05::新しい見出し"  を足す
//   - 節を消したら同じ所に  "05::消した見出し": null  を足す
//   - 新しい節を足したら、下の「控え」を更新する：  UPDATE_DICT_KEYS=1 npx vitest run tests/dict-fav.test.js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DICT_FILES, DICT_SECTION_COUNT, splitSections } from '../app/src/lib/dict.js';
import { favKey, normalizeFavs, resolveSection, legacyToKey } from '../app/src/lib/dictFav.js';
import LEGACY from '../app/src/data/dictLegacyIds.json';
import RENAMES from '../app/src/data/dictTitleRenames.json';
import { buildSections, ROOT } from './helpers/sections.js';

const sections = buildSections(splitSections, DICT_FILES);
const keys = new Set(sections.map(favKey));
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'dict-section-keys.json');

describe('辞書の節の数え方', () => {
  it('同じ章の中に同じ見出しの節が無い（お気に入りの目印が重ならない）', () => {
    expect(keys.size).toBe(sections.length);
  });
  it('DICT_SECTION_COUNT が実際の節の数と合っている', () => {
    expect(DICT_SECTION_COUNT).toBe(sections.length);
  });
});

describe('お気に入り：切り替え前の番号からの引き継ぎ', () => {
  it('対応表の行き先が、今の辞書に全部ある', () => {
    const lost = Object.keys(LEGACY).map(id => [id, legacyToKey(id)]).filter(([, k]) => k && !keys.has(normalizeFavs([k])[0]));
    expect(lost, '行き先の見出しが今の辞書に無い（dictLegacyIds.json の新しい見出しを直すか、dictTitleRenames.json に付け替えを足す）:\n' + lost.map(x => x.join(' → ')).join('\n')).toEqual([]);
  });
  it('旧番号は見出しの目印に変わり、消えた節は落ち、重なりは1つになる', () => {
    const removed = Object.keys(LEGACY).find(id => legacyToKey(id) === null);
    const kept = Object.keys(LEGACY).find(id => legacyToKey(id));
    const out = normalizeFavs([kept, removed, kept, legacyToKey(kept), '99-99', 42]);
    expect(out).toEqual([legacyToKey(kept)]);
  });
  it('新しい形のお気に入りはそのまま残る', () => {
    const k = favKey(sections[10]);
    expect(normalizeFavs([k])).toEqual([k]);
  });
});

describe('履歴から節を開き直す', () => {
  it('番号と見出しが合っていればその節', () => {
    const s = sections[20];
    expect(resolveSection(sections, s.id, s.title)).toBe(s);
  });
  it('番号がずれていても、見出しで同じ章の節を見つける', () => {
    const s = sections[20];
    const wrongId = s.fileId + '-999';
    expect(resolveSection(sections, wrongId, s.title)).toBe(s);
  });
  it('見出しが見つからなければ、別の節を開かない', () => {
    const s = sections[20];
    expect(resolveSection(sections, s.id, 'どこにも無い見出し')).toBe(null);
  });
  it('切り替え前の記録（旧番号＋当時の見出し）は対応表で今の節へ', () => {
    const id = Object.keys(LEGACY).find(i => Array.isArray(LEGACY[i]) && LEGACY[i][1]);
    const hit = resolveSection(sections, id, LEGACY[id][0]);
    expect(hit && favKey(hit)).toBe(normalizeFavs([id])[0]);
  });
});

describe('見出しを変えた・節を消したときの届け出', () => {
  it('控えにある節は、今もあるか、付け替え表に載っている', () => {
    if (process.env.UPDATE_DICT_KEYS) {
      const prev = fs.existsSync(FIXTURE) ? JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) : [];
      const all = Array.from(new Set([...prev, ...keys])).sort();
      fs.writeFileSync(FIXTURE, JSON.stringify(all, null, 0).replace(/","/g, '",\n"') + '\n');
    }
    const known = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    const gone = known.filter(k => !keys.has(k) && !Object.prototype.hasOwnProperty.call(RENAMES, k));
    expect(gone, '見出しが変わった／節が消えたのに届け出が無い（dictTitleRenames.json に足す）:\n' + gone.join('\n')).toEqual([]);
    const dead = Object.entries(RENAMES).filter(([, v]) => v && !keys.has(normalizeFavs([v])[0]));
    expect(dead, '付け替え表の行き先が今の辞書に無い:\n' + dead.map(x => x.join(' → ')).join('\n')).toEqual([]);
  });
  it('今ある節は全部、控えに載っている（新しい節を足したら控えを更新する）', () => {
    const known = new Set(JSON.parse(fs.readFileSync(FIXTURE, 'utf8')));
    const fresh = [...keys].filter(k => !known.has(k));
    expect(fresh, '控えに無い節がある。次を実行して控えを更新：\n  UPDATE_DICT_KEYS=1 npx vitest run tests/dict-fav.test.js\n' + fresh.join('\n')).toEqual([]);
  });
});
