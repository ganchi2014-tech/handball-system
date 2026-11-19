// 辞書のお気に入り・履歴が「指している節」を、節の並びが変わってもずらさないための仕組み。
//
// 以前は節を「05-12」のような並び順の番号で覚えていた。辞書の節を足したり消したりすると番号がずれ、
// お気に入りが別の節を指してしまう。そこで、お気に入りは「章番号::節の見出し」で覚える形に変えた。
//
// - dictLegacyIds.json   … 切り替え前の番号 → 今の見出し（切り替え時に1回だけ作った対応表）
// - dictTitleRenames.json … 見出しを変えた・節を消したときに書き足す対応表（旧キー → 新キー／null）
import LEGACY from '../data/dictLegacyIds.json';
import RENAMES from '../data/dictTitleRenames.json';

const SEP = '::';
const favKey = (s) => `${s.fileId}${SEP}${s.title}`;

// 旧番号 → 今のキー。消えた節は null、対応表に無い番号は undefined。
function legacyToKey(id) {
  if (!Object.prototype.hasOwnProperty.call(LEGACY, id)) return undefined;
  const v = LEGACY[id];
  const fileId = String(id).split('-')[0];
  if (typeof v === 'string') return fileId + SEP + v;
  return v[1] ? fileId + SEP + v[1] : null;
}
const legacyOldTitle = (id) => {
  const v = LEGACY[id];
  return v === undefined ? undefined : (typeof v === 'string' ? v : v[0]);
};

// 見出しの付け替えをたどる（付け替えが重なっても追えるよう、回数に上限を付けて繰り返す）
function followRenames(key) {
  let k = key;
  for (let i = 0; i < 10 && k && Object.prototype.hasOwnProperty.call(RENAMES, k); i++) k = RENAMES[k];
  return k;
}

// 保存されているお気に入り（旧番号と新キーが混ざっていてよい）を新キーにそろえる。消えた節は落とす。
function normalizeFavs(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const x of arr) {
    if (typeof x !== 'string') continue;
    let k = x.includes(SEP) ? x : legacyToKey(x);
    k = k ? followRenames(k) : null;
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

// 履歴などに残っている「番号＋見出し」から節を探す。番号がずれていたら見出しで探し直し、
// どちらでも見つからなければ null（別の節を開いてしまうより、開かないほうを選ぶ）。
function resolveSection(sections, id, title) {
  const byId = sections.find(s => s.id === id);
  if (byId && title && byId.title === title) return byId;
  const fileId = String(id).split('-')[0];
  if (title) {
    const k = followRenames(fileId + SEP + title);
    const byTitle = k && sections.find(s => favKey(s) === k);
    if (byTitle) return byTitle;
  }
  // 切り替え前に保存された記録：その番号の当時の見出しと合うときだけ、対応表を使う
  if (!title || legacyOldTitle(id) === title) {
    const k = legacyToKey(id);
    if (k === null) return null;
    if (k) return sections.find(s => favKey(s) === followRenames(k)) || null;
  }
  return title ? null : (byId || null);
}

export { favKey, normalizeFavs, resolveSection, legacyToKey };
