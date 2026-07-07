// コンテンツ整合性監査（旧 .scripts/audit_all.js / audit_completeness.js / audit_results.js のJSON移植）。
// 旧版はindex.htmlのソーステキストを正規表現で解析していたが、データがJSON化されたため実データを直接歩く。
// 対象も拡大: POSITION_DRILL_VARIANTS の90ドリル（旧監査では未チェック）を含む全参照を検証する。
import { describe, it, expect } from 'vitest';
import { DICT_FILES, splitSections } from '../app/src/lib/dict.js';
import { SOLVE_DATA, RESULTS, GK_SELF_RESULTS, PHYSICAL_RESULTS, PHYSICAL_RESULTS_EXTRA,
         OF_EXTRA_RESULTS, DF_EXTRA_RESULTS } from '../app/src/lib/content.js';
import { DRILL_THEMES, POSITION_DRILL_VARIANTS } from '../app/src/lib/plan.js';
import { buildSections } from './helpers/sections.js';

const sections = buildSections(splitSections, DICT_FILES);

// App.jsx の findRelatedSection と同じ解決順序（exact→prefix→contains→stripped→body）
function resolveRelated(fileId, match) {
  const inFile = sections.filter(s => s.fileId === fileId);
  let hit = inFile.find(s => s.title === match);
  if (hit) return { type: 'exact', hit };
  hit = inFile.find(s => s.title.startsWith(match));
  if (hit) return { type: 'prefix', hit };
  hit = inFile.find(s => s.title.includes(match));
  if (hit) return { type: 'contains', hit };
  const stripped = match.replace(/^[A-Za-z0-9\-]+】\s*/, '');
  if (stripped !== match && stripped.length > 0) {
    hit = inFile.find(s => s.title.includes(stripped));
    if (hit) return { type: 'stripped', hit };
  }
  hit = inFile.find(s => s.body && s.body.includes(match));
  if (hit) return { type: 'body', hit }; // タイトルに無く本文だけで当たる低品質マッチ
  return null;
}

// 全 {fileId, match} 参照を収集
function collectRefs(node, source, out) {
  if (Array.isArray(node)) { node.forEach((n, i) => collectRefs(n, source, out)); return; }
  if (node && typeof node === 'object') {
    if (typeof node.fileId === 'string' && typeof node.match === 'string') {
      out.push({ source, fileId: node.fileId, match: node.match });
    }
    for (const [k, v] of Object.entries(node)) collectRefs(v, `${source}.${k}`, out);
  }
}

describe('参照整合性（related / ドリル→辞書リンク）', () => {
  const groups = [
    ['SOLVE_DATA', SOLVE_DATA],
    ['DRILL_THEMES', DRILL_THEMES],
    ['POSITION_DRILL_VARIANTS', POSITION_DRILL_VARIANTS],
  ];
  for (const [name, data] of groups) {
    it(`${name}: 全参照が辞書セクションに解決する（broken=0・body-only=0）`, () => {
      const refs = [];
      collectRefs(data, name, refs);
      expect(refs.length).toBeGreaterThan(0);
      const broken = [], bodyOnly = [];
      for (const r of refs) {
        const res = resolveRelated(r.fileId, r.match);
        if (!res) broken.push(`${r.source} → file${r.fileId} "${r.match}"`);
        else if (res.type === 'body') bodyOnly.push(`${r.source} → file${r.fileId} "${r.match}" (本文のみ: ${res.hit.title})`);
      }
      expect(broken, `辞書に解決しない参照:\n${broken.join('\n')}`).toEqual([]);
      expect(bodyOnly, `本文のみで当たる低品質マッチ:\n${bodyOnly.join('\n')}`).toEqual([]);
    });
  }
});

describe('SOLVE_DATA 完備性（desc / related / actions）', () => {
  const symptoms = [];
  for (const [role, roleData] of Object.entries(SOLVE_DATA)) {
    for (const cat of roleData.categories || []) {
      for (const sym of cat.symptoms || []) {
        symptoms.push({ key: `${role}/${cat.id}/${sym.id}`, sym });
      }
    }
  }
  it('symptom が存在する', () => expect(symptoms.length).toBeGreaterThan(30));
  it('全 symptom: desc必須・related≧1・actions≧1・related重複なし', () => {
    const fatal = [];
    for (const { key, sym } of symptoms) {
      if (!sym.desc) fatal.push(`${key}: descなし`);
      if (!Array.isArray(sym.related) || sym.related.length === 0) fatal.push(`${key}: relatedなし`);
      if (!Array.isArray(sym.actions) || sym.actions.length === 0) fatal.push(`${key}: actionsなし`);
      const seen = new Set();
      for (const r of sym.related || []) {
        const k = `${r.fileId}/${r.match}`;
        if (seen.has(k)) fatal.push(`${key}: related重複 ${k}`);
        seen.add(k);
      }
    }
    expect(fatal, fatal.join('\n')).toEqual([]);
  });
});

describe('DRILL_THEMES 完備性（basic/mid/adv 全レベルにドリルがある）', () => {
  it('空レベルのテーマがない', () => {
    const empty = [];
    for (const t of DRILL_THEMES) {
      for (const lv of ['basic', 'mid', 'adv']) {
        if (!Array.isArray(t.drills?.[lv]) || t.drills[lv].length === 0) empty.push(`${t.id}(${t.label}): ${lv}が空`);
      }
    }
    expect(empty, empty.join('\n')).toEqual([]);
  });
});

describe('RESULTS 系 完備性（good / issue / body / improve / approaches）', () => {
  // content.js のマージでRESULTSに全て合流済みだが、旧監査と同じくセット別にも検査する
  const sets = [
    ['RESULTS(マージ後)', RESULTS],
    ['GK_SELF_RESULTS', GK_SELF_RESULTS],
    ['PHYSICAL_RESULTS', PHYSICAL_RESULTS],
    ['PHYSICAL_RESULTS_EXTRA', PHYSICAL_RESULTS_EXTRA],
    ['OF_EXTRA_RESULTS', OF_EXTRA_RESULTS],
    ['DF_EXTRA_RESULTS', DF_EXTRA_RESULTS],
  ];
  for (const [name, set] of sets) {
    it(`${name}: 全エントリが必須フィールドを充足`, () => {
      const entries = Object.entries(set);
      expect(entries.length).toBeGreaterThan(0);
      const issues = [];
      for (const [id, e] of entries) {
        for (const f of ['good', 'issue', 'body', 'improve']) {
          if (!e[f] || String(e[f]).trim() === '') issues.push(`${id}: ${f}欠落`);
        }
        if (!Array.isArray(e.approaches) || e.approaches.length === 0) issues.push(`${id}: approaches欠落`);
        else if (!e.approaches.every(a => a && a.tag)) issues.push(`${id}: approachesにtagなし要素`);
      }
      expect(issues, issues.join('\n')).toEqual([]);
    });
  }
});
