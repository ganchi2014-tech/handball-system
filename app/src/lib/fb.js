// app/src/lib/fb.js — Firebase接続層（Phase 3）。firebase を import してよいのはこのファイルだけ。
// ・未接続なら firebase チャンクは一切ロードされない（全APIが内部で dynamic import・二層原則）
// ・⚠ /rosterToUid への書き込みAPIはこのモジュールに存在しない（read専用。fbCheckRosterLink の get のみ）。
//   uid分裂端末で書くと mental の名簿連携を無言で破壊するため（設計書§2-4）、今後も追加禁止。
import { mergeExtraKey } from './backup.js';

// mental (handball-mental) 公開 web コンフィグ（index.html:33-42 と同一。apiKey等は公開情報）
const firebaseConfig = {
  apiKey: "AIzaSyC7PV1Q5Fzk-SirYHQR0BBbCU7WiFrMOhQ",
  authDomain: "handball-mental.firebaseapp.com",
  databaseURL: "https://handball-mental-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "handball-mental",
  storageBucket: "handball-mental.firebasestorage.app",
  messagingSenderId: "155616116061",
  appId: "1:155616116061:web:1f2bd827637dd445cf3cb4",
  measurementId: "G-03HGEZKYT7"
};

// RTDBノード ⇔ localStorageキー（hb_v1_ prefix は lsGet/lsSet 側で付与）の対応表
export const FB_NODES = [
  { node: 'matchCards',    lsKey: 'match-cards' },
  { node: 'gkPredictions', lsKey: 'gk_predictions' },
  { node: 'pvRecords',     lsKey: 'pv_records' },
  { node: 'tbTasks',       lsKey: 'tb-tasks' },
];

// ─── モジュール状態（接続は1回だけ・多重呼び出し安全） ───
let app = null;
let auth = null;
let db = null;
let uid = null;
let connectPromise = null; // 進行中の fbConnect を共有（並行呼び出しガード）

async function importFirebase() {
  // firebase/* は必ずここ（関数内 dynamic import）経由。トップレベル import 禁止。
  const [appMod, authMod, dbMod] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/database'),
  ]);
  return { appMod, authMod, dbMod };
}

// 匿名サインイン＋初期化。冪等: 2回目以降・並行呼び出しは同じ uid を返す。
export async function fbConnect() {
  if (uid) return { uid };
  if (!connectPromise) {
    connectPromise = (async () => {
      const { appMod, authMod, dbMod } = await importFirebase();
      app = appMod.initializeApp(firebaseConfig, 'lab');
      auth = authMod.getAuth(app);
      db = dbMod.getDatabase(app);
      const cred = await authMod.signInAnonymously(auth);
      uid = cred.user.uid;
      return { uid };
    })().catch((err) => {
      connectPromise = null; // 失敗時は次回リトライ可能に
      throw err;
    });
  }
  return connectPromise;
}

export function fbUid() {
  return uid;
}

// 1レコード送信（冪等set）。失敗は throw（呼び元が fb-queue に積む）。
export async function fbPush(node, record) {
  if (!record || !record.id) throw new Error('fbPush: record.id が必要です');
  if (!uid || !db) throw new Error('fbPush: 未接続です（fbConnect を先に）');
  const { dbMod } = await importFirebase();
  await dbMod.set(dbMod.ref(db, 'lab/' + uid + '/' + node + '/' + record.id), record);
}

// 1ノード全取得 → 配列で返す（RTDBは {id: record} 形なので Object.values）
export async function fbPullNode(node) {
  if (!uid || !db) throw new Error('fbPullNode: 未接続です（fbConnect を先に）');
  const { dbMod } = await importFirebase();
  const snap = await dbMod.get(dbMod.ref(db, 'lab/' + uid + '/' + node));
  const val = snap.val();
  return val ? Object.values(val) : [];
}

// 全ノード同期: pull → ID和集合マージ（ローカル優先）→ applyMerged → ローカルのみの記録を push。
// push失敗は throw せず failed に集めて返す（呼び元がキューへ）。
export async function fbFullSync(localData, applyMerged) {
  const pulled = {};
  const pushed = {};
  const failed = [];
  for (const { node, lsKey } of FB_NODES) {
    const localArr = Array.isArray(localData[lsKey]) ? localData[lsKey] : [];
    const remoteArr = await fbPullNode(node);
    const m = mergeExtraKey(localArr, remoteArr);
    pulled[lsKey] = m.added;
    applyMerged(lsKey, m.val, m.added);
    const remoteIds = new Set(remoteArr.map((r) => r && r.id).filter(Boolean));
    let count = 0;
    for (const rec of localArr) {
      if (!rec || !rec.id || remoteIds.has(rec.id)) continue;
      try {
        await fbPush(node, rec);
        count++;
      } catch (e) {
        failed.push({ node, id: rec.id });
      }
    }
    pushed[lsKey] = count;
  }
  return { pulled, pushed, failed };
}

// 未送信キューの再送。resolveRecord(node,id) が null（ローカルで削除済）ならキューから落とす。
// 残った失敗分だけを返す。
export async function fbFlushQueue(queue, resolveRecord) {
  const deduped = fbQueueAdd(Array.isArray(queue) ? queue : []);
  const remaining = [];
  for (const entry of deduped) {
    const rec = resolveRecord(entry.node, entry.id);
    if (!rec) continue; // ローカル削除済 → 送らずキューからも除去
    try {
      await fbPush(entry.node, rec);
    } catch (e) {
      remaining.push(entry);
    }
  }
  return remaining;
}

// /roster 購読。cb には {name, isGK, rosterId} の配列を渡す。返り値は解除関数。
export async function fbSubscribeRoster(cb) {
  if (!uid || !db) throw new Error('fbSubscribeRoster: 未接続です（fbConnect を先に）');
  const { dbMod } = await importFirebase();
  return dbMod.onValue(dbMod.ref(db, 'roster'), (snap) => {
    const val = snap.val();
    const arr = Array.isArray(val) ? val : (val && typeof val === 'object' ? Object.values(val) : []);
    cb(arr.filter(Boolean).map((r) => ({ name: r.name, isGK: !!r.isGK, rosterId: r.rosterId })));
  });
}

// /rosterToUid/{rosterId} を【getで読むだけ】。書き込みAPIは存在しない（絶対追加禁止）。
export async function fbCheckRosterLink(rosterId) {
  if (!uid || !db) throw new Error('fbCheckRosterLink: 未接続です（fbConnect を先に）');
  const { dbMod } = await importFirebase();
  const snap = await dbMod.get(dbMod.ref(db, 'rosterToUid/' + rosterId));
  const linkedUid = snap.val() || null;
  return { linkedUid, mine: linkedUid === uid };
}

// ─── 純関数（firebase 非依存・テスト対象） ───

// キューに {node,id} を追加した新配列を返す（node+id で重複除去・順序維持）。
// 引数1つ（配列のみ）でも呼べる=既存キューの重複除去としても使える。
export function fbQueueAdd(queue, node, id) {
  const src = Array.isArray(queue) ? queue.slice() : [];
  if (node && id) src.push({ node, id });
  const seen = new Set();
  const out = [];
  for (const e of src) {
    if (!e || !e.node || !e.id) continue;
    const k = e.node + '|' + e.id;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ node: e.node, id: e.id });
  }
  return out;
}

// roster 配列 → RecordModule に渡す players 形（trim・重複除去・順序維持）。
// keepers = isGK の選手のみ、shooters/pivots = 全員。
export function fbRosterToPlayers(roster) {
  const arr = Array.isArray(roster) ? roster : [];
  const clean = (list) => {
    const seen = new Set();
    const out = [];
    for (const n of list) {
      const name = typeof n === 'string' ? n.trim() : '';
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
    return out;
  };
  const all = clean(arr.map((r) => r && r.name));
  const keepers = clean(arr.filter((r) => r && r.isGK).map((r) => r.name));
  return { keepers, shooters: all, pivots: all };
}
