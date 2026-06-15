#!/usr/bin/env node
// 7バッチの出力ファイルから approved_terms を全抽出 → surface で重複排除 →
// 既存GLOSSARYに無いものだけを consolidated_terms.json に出力する。
const fs = require('fs');
const path = require('path');

const TASK_DIR = 'C:/Users/TOGAN1~1/AppData/Local/Temp/claude/C--Users-togan1080/be44c057-8d48-4546-83be-6718ed4d8aa8/tasks';
const BATCHES = ['wajxna1cs','wy1gxdbpt','w6v47x61k','w7rty2oe8','w10mww8k2','w54s30uyq','woc56srhg'];

// 既存GLOSSARYの主表記キー（index.html の GLOSSARY から。term の「（」前）
const EXISTING = new Set(['バックプレーヤー','ピボット','ウィング','センター','GK','クローズ','ワイド','0-6','5-1','2-4 / 3-2-1 / 3-3','マンツーマン','速攻','セットOF','7on6','5on6','クロス','ギブ＆ゴー','ピック＆ロール','フェイント','ダブルフェイント','早打ち','バックハンドフェイク','山側／谷側','勝ち位置','フェアシーベン（シフト）','ヘラウスリュッケン（前飛び出し）','ユーバーゲーベン（引き渡し）','パル/インパル（偶数/奇数システム）','ブリックコンタクト（目合わせ）','メストリング（達成感）','セルヴティリット（自信）','マティアス・ギゼル','Nikolaj Jacobsen','カルロス・オルテガ','シャビ・パスクァル','ステファン・マドセン','ベネット・ヴィーガート','じゃんけん構造','エコロジカルアプローチ','制約主導','認知→判断→行動','2秒の壁']);
// 既存の主表記の「（」前だけも除外対象に
const existingKeys = new Set([...EXISTING].map(t => t.replace(/[（(].*$/, '').trim()));

function loadResult(file) {
  const raw = fs.readFileSync(path.join(TASK_DIR, file + '.output'), 'utf8');
  const obj = JSON.parse(raw);
  return obj.result || obj;
}

const bySurface = new Map();   // surface -> { surface, desc, files:[], descs:[] }
let totalApproved = 0;

for (const b of BATCHES) {
  let res;
  try { res = loadResult(b); } catch (e) { console.error('parse fail', b, e.message); continue; }
  const perFile = res.per_file || [];
  for (const pf of perFile) {
    const fileName = pf.file && !pf.file.startsWith('[') ? pf.file : '(batch1)';
    for (const t of (pf.approved_terms || [])) {
      if (!t.surface || !t.desc) continue;
      totalApproved++;
      const key = t.surface.replace(/[（(].*$/, '').trim();   // 主表記キー
      if (existingKeys.has(key)) continue;                     // 既存GLOSSARYと重複は除外
      if (!bySurface.has(key)) bySurface.set(key, { surface: t.surface, key, desc: t.desc, files: [], descs: [] });
      const rec = bySurface.get(key);
      if (!rec.files.includes(fileName)) rec.files.push(fileName);
      rec.descs.push(t.desc);
    }
  }
}

// desc は最頻 or 最長を代表に（情報量重視で最長を採用、ただし60字以内優先）
const out = [];
for (const rec of bySurface.values()) {
  const within60 = rec.descs.filter(d => d.length <= 60);
  const pool = within60.length ? within60 : rec.descs;
  const desc = pool.sort((a, b) => b.length - a.length)[0];
  out.push({ surface: rec.surface, key: rec.key, desc, count: rec.descs.length, files: rec.files });
}
out.sort((a, b) => a.key.localeCompare(b.key, 'ja'));

fs.writeFileSync(path.join(__dirname, 'consolidated_terms.json'), JSON.stringify(out, null, 2), 'utf8');
console.log('総approved（重複込み）:', totalApproved);
console.log('ユニーク（既存GLOSSARY除外後）:', out.length);
console.log('複数バッチ出現の用語数:', out.filter(t => t.count > 1).length);
console.log('短いsurface(<=3文字, 誤マッチ要注意):', out.filter(t => t.key.length <= 3).map(t => t.key).join(', '));
console.log('\n書き出し: .scripts/consolidated_terms.json');
