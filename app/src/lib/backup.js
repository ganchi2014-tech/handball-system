// このファイルは index.html（Phase 0版）から Phase 1 S2 で機械分割された。
// 由来行: 9643-9714
import { STORAGE_PREFIX } from './storage.js';

function collectAllData() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(STORAGE_PREFIX)) continue;
      try { data[k.slice(STORAGE_PREFIX.length)] = JSON.parse(localStorage.getItem(k)); } catch (e) {}
    }
  } catch (e) {}
  return data;
}

// GK/PV/TB以外の追加キーの汎用マージ：配列はID（無ければ内容）単位の和集合、それ以外はローカル優先
function mergeExtraKey(curVal, impVal) {
  if (impVal == null) return { val: curVal, added: 0 };
  if (Array.isArray(impVal) || Array.isArray(curVal)) {
    const curArr = Array.isArray(curVal) ? curVal : [];
    const impArr = Array.isArray(impVal) ? impVal : [];
    const keyOf = (x) => (x && typeof x === 'object' && x.id) ? 'id:' + x.id : 'j:' + JSON.stringify(x);
    const seen = new Set(curArr.map(keyOf));
    const added = impArr.filter(x => !seen.has(keyOf(x)));
    return { val: [...curArr, ...added], added: added.length };
  }
  if (curVal == null) return { val: impVal, added: 1 };
  return { val: curVal, added: 0 };
}

function buildBackupText(data) {
  return JSON.stringify({
    app: 'handball-lab-backup',
    v: 1,
    exportedAt: new Date().toLocaleString('ja-JP'),
    data,
  });
}

// ID付きレコード配列のマージ。既存IDはスキップし、追加件数を返す
function mergeById(curArr, impArr) {
  const ids = new Set(curArr.map(x => x && x.id));
  const added = (Array.isArray(impArr) ? impArr : []).filter(x => x && x.id && !ids.has(x.id));
  return { merged: [...curArr, ...added], added: added.length };
}

// バックアップテキストを現在データにマージ。形式不正は Error を投げる
function mergeBackup(current, text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { throw new Error('JSONとして読めませんでした'); }
  if (!obj || obj.app !== 'handball-lab-backup' || !obj.data) throw new Error('このアプリのバックアップ形式ではありません');
  const d = obj.data;
  const gk = mergeById(current.gkPreds, d.gk_predictions);
  const pv = mergeById(current.pvRecords, d.pv_records);
  const tb = mergeById(current.tbTasks, d['tb-tasks']);
  // 記録系は新しい順の不変条件を維持（ts降順）。自作課題はtsを持たないため順序維持のみ
  gk.merged = gk.merged.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  pv.merged = pv.merged.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const unionArr = (a, b) => [...new Set([...(a || []), ...(Array.isArray(b) ? b : [])])];
  const gkPlayers = {
    keepers: unionArr(current.gkPlayers.keepers, d.gk_players && d.gk_players.keepers),
    shooters: unionArr(current.gkPlayers.shooters, d.gk_players && d.gk_players.shooters),
  };
  const pvPlayers = { pivots: unionArr(current.pvPlayers.pivots, d.pv_players && d.pv_players.pivots) };
  const playersAdded =
    (gkPlayers.keepers.length - current.gkPlayers.keepers.length) +
    (gkPlayers.shooters.length - current.gkPlayers.shooters.length) +
    (pvPlayers.pivots.length - current.pvPlayers.pivots.length);
  return {
    gkPreds: gk.merged, pvRecords: pv.merged, tbTasks: tb.merged, gkPlayers, pvPlayers,
    added: { gk: gk.added, pv: pv.added, tb: tb.added, players: playersAdded },
  };
}

// ─── GK中間照合（第5週運用の材料）：基準期（最初の1〜2週）と直近週の比較 ───

export { collectAllData, mergeExtraKey, buildBackupText, mergeById, mergeBackup };
