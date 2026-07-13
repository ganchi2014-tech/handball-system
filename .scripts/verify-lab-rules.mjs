// .scripts/verify-lab-rules.mjs
//
// 目的: mental (handball-mental) の database.rules.json に /lab, /labShared を
//       追加デプロイした「後」に、本番 RTDB に対して匿名2ユーザーで権限マトリクスを
//       実測検証するスクリプト。
//       新パス（/lab, /labShared）は本番でまだ空のため実行しても安全。
//       生成したテストデータはスクリプト自身が最後に自削除する（自削除失敗時も
//       finally で必ずクリーンアップを試みる）。
//
// 使い方:
//   node .scripts/verify-lab-rules.mjs
//
// 前提: LABリポに `firebase` (modular SDK) が npm install 済みであること
//       （Phase 3 Task 2 で導入。本スクリプトは Task 1 時点では firebase 未インストールのため実行不可）。
//
// 注意（絶対厳守）: このスクリプトは /rosterToUid に対して一切書き込みを行わない。
//   現行 mental ルール上、/rosterToUid/{rid} は
//   `newData.val() === auth.uid || root.child('coaches').child(auth.uid).exists()`
//   により「自分のuidを値として書く」操作が成功してしまう。DENY期待のテストとして
//   書き込みを試すこと自体が、本番の名簿ひも付け（rosterId→uid）を書き換え/破壊しうる
//   ため、read以外のテストを /rosterToUid に対して行ってはならない。

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  deleteUser,
} from 'firebase/auth';
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  remove,
} from 'firebase/database';

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

// ガード: このスクリプトが触れてよいパスは以下のみ（ハードコード。パラメータ化しない）。
//   - /lab/{ownUid}/...         （書き込みは常に自分のuid配下のみ）
//   - /labShared/vtest1, vtest2 （テスト専用の固定id）
//   - /matches, /roster, /rosterToUid への「read専用」get
// 上記以外のパスへの書き込みは本スクリプトに一切実装しない。
//
// 以下の isAllowedWritePath()/assertWritePathAllowed() は「保険」の実行時ガード: 万一コードが
// 変更されて想定外パスへの書き込み（set/update/remove）が追加されても、許可リストに一致
// しない限り即座に process.exit(2) してプログラムを停止する。read (get) はガード対象外
// （読み取りは安全なため）。

// 実行中に登場する「既知のuid」の集合。signInAnonymously 完了後に registerKnownUid() で
// 登録される。書き込みガードは「lab/<既知uidのいずれか>/...」または固定の labShared テストid
// 以外のパスを一切許可しない（テスト対象がA/Bどちらの操作でも、パス自体が /lab/{既知uid}/... の
// 形をしていれば許可＝実際に許可されるかどうかはDB側のルールが判定する。ガードは「無関係の
// パスを叩いていないか」だけを見る安全装置）。
const knownUids = new Set();
function registerKnownUid(uid) {
  if (uid) knownUids.add(uid);
}

const FIXED_LABSHARED_TEST_IDS = new Set(['labShared/vtest1', 'labShared/vtest2']);

function isAllowedWritePath(path) {
  if (FIXED_LABSHARED_TEST_IDS.has(path)) return true;
  for (const uid of knownUids) {
    if (path === `lab/${uid}` || path.startsWith(`lab/${uid}/`)) return true;
    // labLinks はキーが「mental側uid」。テストでは既知uid（A/B）を mentalUid 役に使うため
    // labLinks/{既知uid} のみ許可（実在選手の mentalUid には決して触れない）。
    if (path === `labLinks/${uid}`) return true;
    // declShared はキーが「mental側uid」。テストでは既知uid（A/B）を mentalUid 役に使う。
    if (path === `declShared/${uid}`) return true;
  }
  return false;
}

function assertWritePathAllowed(path) {
  if (!isAllowedWritePath(path)) {
    console.error(`GUARD: write path "${path}" is not in the allowlist (/lab/{known uid}/*, /labShared/vtest1, /labShared/vtest2). Refusing to run.`);
    process.exit(2);
  }
}

// ref() のラッパー: 書き込み系操作（set/update/remove）の前に必ずこれを通す。
function guardedWriteRef(db, path) {
  assertWritePathAllowed(path);
  return ref(db, path);
}

const results = [];

function record(name, expected, actual, pass) {
  results.push({ name, expected, actual, pass });
}

function isPermissionDenied(err) {
  const msg = String(err && (err.code || err.message) || err);
  // 書き込み拒否は code=PERMISSION_DENIED、読み取り(get)拒否は message='Permission denied' で飛ぶ（SDK仕様差）
  return /PERMISSION_DENIED/i.test(msg) || /permission[ _]denied/i.test(msg);
}

async function expectAllow(name, fn) {
  try {
    await fn();
    record(name, 'ALLOW', 'ALLOW', true);
  } catch (err) {
    if (isPermissionDenied(err)) {
      record(name, 'ALLOW', 'DENY (PERMISSION_DENIED)', false);
    } else {
      record(name, 'ALLOW', `ERROR: ${err && err.message ? err.message : err}`, false);
    }
  }
}

async function expectDeny(name, fn) {
  try {
    await fn();
    record(name, 'DENY', 'ALLOW', false);
  } catch (err) {
    if (isPermissionDenied(err)) {
      record(name, 'DENY', 'DENY (PERMISSION_DENIED)', true);
    } else {
      record(name, 'DENY', `ERROR: ${err && err.message ? err.message : err}`, false);
    }
  }
}

async function main() {
  const appA = initializeApp(firebaseConfig, 'userA');
  const appB = initializeApp(firebaseConfig, 'userB');

  const authA = getAuth(appA);
  const authB = getAuth(appB);
  const dbA = getDatabase(appA);
  const dbB = getDatabase(appB);

  let uidA = null;
  let uidB = null;

  try {
    const credA = await signInAnonymously(authA);
    uidA = credA.user.uid;
    const credB = await signInAnonymously(authB);
    uidB = credB.user.uid;

    // ガードに既知uidを登録（これ以降、lab/{uidA}/... と lab/{uidB}/... への書き込みのみ許可される）
    registerKnownUid(uidA);
    registerKnownUid(uidB);

    // 1. A writes /lab/{A.uid}/matchCards/test1 -> ALLOW
    await expectAllow('A write /lab/{A}/matchCards/test1', async () => {
      await set(guardedWriteRef(dbA, `lab/${uidA}/matchCards/test1`), { id: 'test1', ts: 1 });
    });

    // 2. A reads /lab/{A.uid} -> ALLOW
    await expectAllow('A read /lab/{A}', async () => {
      await get(ref(dbA, `lab/${uidA}`));
    });

    // 3. B reads /lab/{A.uid} -> DENY
    await expectDeny('B read /lab/{A}', async () => {
      await get(ref(dbB, `lab/${uidA}`));
    });

    // 4. B writes /lab/{A.uid}/matchCards/x -> DENY
    // (パスの形は許可リスト内=lab/{既知uid}/...。実際に許可されるかはDBのルールが判定する。
    //  期待はDENYであり、ガードはあくまで「無関係パスへの誤爆」を防ぐための保険)
    await expectDeny('B write /lab/{A}/matchCards/x', async () => {
      await set(guardedWriteRef(dbB, `lab/${uidA}/matchCards/x`), { id: 'x', ts: 1 });
    });

    // 5. A writes /labShared/vtest1 = {author:A, text:'t'} -> ALLOW
    await expectAllow('A create /labShared/vtest1', async () => {
      await set(guardedWriteRef(dbA, 'labShared/vtest1'), { author: uidA, text: 't' });
    });

    // 6. B reads /labShared/vtest1 -> ALLOW
    await expectAllow('B read /labShared/vtest1', async () => {
      await get(ref(dbB, 'labShared/vtest1'));
    });

    // 7. B updates /labShared/vtest1 (set {author:B, text:'hack'}) -> DENY
    await expectDeny('B overwrite /labShared/vtest1 (hijack)', async () => {
      await set(guardedWriteRef(dbB, 'labShared/vtest1'), { author: uidB, text: 'hack' });
    });

    // 8. B creates /labShared/vtest2 = {author:A} (author spoof) -> DENY
    await expectDeny('B create /labShared/vtest2 (author spoof)', async () => {
      await set(guardedWriteRef(dbB, 'labShared/vtest2'), { author: uidA });
    });

    // 9. A updates /labShared/vtest1 = {author:A, text:'edited'} -> ALLOW
    await expectAllow('A update /labShared/vtest1 (own text)', async () => {
      await update(guardedWriteRef(dbA, 'labShared/vtest1'), { text: 'edited' });
    });

    // 10. A sets /labShared/vtest1 = {author:B} (self reassign) -> DENY
    await expectDeny('A reassign /labShared/vtest1 author to B', async () => {
      await set(guardedWriteRef(dbA, 'labShared/vtest1'), { author: uidB });
    });

    // 11. A removes /labShared/vtest1 -> ALLOW
    await expectAllow('A remove /labShared/vtest1', async () => {
      await remove(guardedWriteRef(dbA, 'labShared/vtest1'));
    });

    // 12. A reads /matches -> DENY (coach-only)
    await expectDeny('A read /matches (coach-only)', async () => {
      await get(ref(dbA, 'matches'));
    });

    // 13. A reads /roster -> ALLOW (auth read)
    await expectAllow('A read /roster', async () => {
      await get(ref(dbA, 'roster'));
    });

    // 14. A reads /rosterToUid -> ALLOW (auth-level read only).
    //     重要: /rosterToUid への書き込みテストは絶対に追加しないこと。
    //     現行ルールでは「自分のuidを値として書く」self-write が成功してしまうため、
    //     DENY期待のテストとして書き込みを試みるだけで本番の名簿マッピングを
    //     書き換え／破壊するおそれがある。read専用に留める。
    await expectAllow('A read /rosterToUid (read-only, no writes ever)', async () => {
      await get(ref(dbA, 'rosterToUid'));
    });

    // ── labLinks UIDブリッジ（Phase B-1）。B を「mental側uid」、A を「LAB側uid」役として検証 ──
    // 実在選手の mentalUid・rosterId には一切触れない（rosterId はダミー文字列。
    // rosterToUid との突合は mental クライアント側の責務でありルールでは検証しない設計）。

    // 15. ブリッジ未登録の時点で B が /lab/{A} を読む -> DENY（前提確認）
    await expectDeny('B read /lab/{A} before bridge', async () => {
      await get(ref(dbB, `lab/${uidA}`));
    });

    // 16. A(labUid) が labLinks/{B} = {labUid:A, rosterId:'vtest-rid'} を作成 -> ALLOW
    await expectAllow('A create /labLinks/{B} (labUid=A)', async () => {
      await set(guardedWriteRef(dbA, `labLinks/${uidB}`), { labUid: uidA, rosterId: 'vtest-rid', updatedAt: 1 });
    });

    // 17. B(mentalUid) が labLinks/{B} を読む -> ALLOW
    await expectAllow('B read /labLinks/{B}', async () => {
      await get(ref(dbB, `labLinks/${uidB}`));
    });

    // 18. B がブリッジ経由で /lab/{A} を読む -> ALLOW（ブリッジの本丸）
    await expectAllow('B read /lab/{A} via bridge', async () => {
      await get(ref(dbB, `lab/${uidA}`));
    });

    // 19. B が labLinks/{B} を {labUid:B} で上書き -> DENY（既存labUid=Aの乗っ取り防止）
    await expectDeny('B overwrite /labLinks/{B} (takeover)', async () => {
      await set(guardedWriteRef(dbB, `labLinks/${uidB}`), { labUid: uidB, rosterId: 'vtest-rid' });
    });

    // 20. B が labLinks/{A} = {labUid:A} を作成（labUidなりすまし） -> DENY
    await expectDeny('B create /labLinks/{A} with labUid=A (spoof)', async () => {
      await set(guardedWriteRef(dbB, `labLinks/${uidA}`), { labUid: uidA, rosterId: 'vtest-rid' });
    });

    // 21. B が存在しない labLinks/{A} を読む -> DENY（第三者read遮断）
    await expectDeny('B read /labLinks/{A} (not owner)', async () => {
      await get(ref(dbB, `labLinks/${uidA}`));
    });

    // 22. A が labLinks/{B} を rosterId 欠落で上書き -> DENY（validate）
    await expectDeny('A update /labLinks/{B} without rosterId (validate)', async () => {
      await set(guardedWriteRef(dbA, `labLinks/${uidB}`), { labUid: uidA });
    });

    // 23. B(mentalUid) が labLinks/{B} を削除 -> ALLOW（mental側からの連携解除）
    await expectAllow('B remove /labLinks/{B} (mental-side unlink)', async () => {
      await remove(guardedWriteRef(dbB, `labLinks/${uidB}`));
    });

    // 24. 削除後、B が /lab/{A} を読む -> DENY（解除が効く）
    await expectDeny('B read /lab/{A} after unlink', async () => {
      await get(ref(dbB, `lab/${uidA}`));
    });

    // ── declShared（Phase 1 宣言ミラー）。B を「mental側uid」、A を「LAB側uid」役として検証 ──

    // 25. B(mental役) が declShared/{B} を書く -> ALLOW（本人write）
    await expectAllow('B write /declShared/{B} (own mirror)', async () => {
      await set(guardedWriteRef(dbB, `declShared/${uidB}`), {
        declarations: [{ id: 'vd1', declaration: 'test', startDate: '2026-07-13', checkCount: 0, completed: false }],
        updatedAt: 1,
      });
    });

    // 26. B が declShared/{B} を読む -> ALLOW（本人read）
    await expectAllow('B read /declShared/{B}', async () => {
      await get(ref(dbB, `declShared/${uidB}`));
    });

    // 27. ブリッジ未登録の A が declShared/{B} を読む -> DENY（第三者read遮断）
    await expectDeny('A read /declShared/{B} before bridge', async () => {
      await get(ref(dbA, `declShared/${uidB}`));
    });

    // 28. A が labLinks/{B} を再作成（16番と同じ）後、declShared/{B} を読む -> ALLOW（ブリッジread）
    await expectAllow('A read /declShared/{B} via bridge', async () => {
      await set(guardedWriteRef(dbA, `labLinks/${uidB}`), { labUid: uidA, rosterId: 'vtest-rid', updatedAt: 1 });
      await get(ref(dbA, `declShared/${uidB}`));
    });

    // 29. A が declShared/{B} を書く -> DENY（LAB側からは読むだけ・書けない）
    await expectDeny('A write /declShared/{B} (read-only for LAB)', async () => {
      await set(guardedWriteRef(dbA, `declShared/${uidB}`), { declarations: [], updatedAt: 2 });
    });

    // 30. B が declShared/{B} を削除 -> ALLOW（本人による撤去・クリーンアップ兼用）
    await expectAllow('B remove /declShared/{B}', async () => {
      await remove(guardedWriteRef(dbB, `declShared/${uidB}`));
    });
  } finally {
    // クリーンアップ: 失敗時も可能な限り実施する（すべて guardedWriteRef 経由）。
    try {
      if (uidA) {
        await remove(guardedWriteRef(dbA, `lab/${uidA}`)).catch(() => {});
      }
    } catch (_) {
      // ignore
    }
    try {
      // vtest1 は既に11番でAが削除済みのはずだが、途中失敗で残っている場合に備えて再試行。
      await remove(guardedWriteRef(dbA, 'labShared/vtest1')).catch(() => {});
    } catch (_) {
      // ignore
    }
    try {
      // vtest2 はテスト8でBの書き込みがDENYされる想定＝存在しないはずだが、
      // 万一ルール不備で作成されてしまった場合の後始末として author=A なので A で削除を試みる。
      await remove(guardedWriteRef(dbA, 'labShared/vtest2')).catch(() => {});
    } catch (_) {
      // ignore
    }
    try {
      if (uidB) {
        await remove(guardedWriteRef(dbB, `declShared/${uidB}`)).catch(() => {});
      }
    } catch (_) {
      // ignore
    }
    try {
      // labLinks/{B} は23番でB自身が削除済みのはずだが、途中失敗に備え labUid=A でも削除を試みる。
      if (uidB) {
        await remove(guardedWriteRef(dbA, `labLinks/${uidB}`)).catch(() => {});
      }
    } catch (_) {
      // ignore
    }
    try {
      // labLinks/{A} は20番でDENYされる想定＝存在しないはずだが、万一に備え本人(A)で削除。
      if (uidA) {
        await remove(guardedWriteRef(dbA, `labLinks/${uidA}`)).catch(() => {});
      }
    } catch (_) {
      // ignore
    }
    try {
      if (authA.currentUser) await deleteUser(authA.currentUser);
    } catch (_) {
      // ignore
    }
    try {
      if (authB.currentUser) await deleteUser(authB.currentUser);
    } catch (_) {
      // ignore
    }
  }

  // 結果を表形式で出力
  const nameWidth = Math.max(...results.map((r) => r.name.length), 'TEST'.length);
  const expWidth = Math.max(...results.map((r) => String(r.expected).length), 'EXPECTED'.length);
  const actWidth = Math.max(...results.map((r) => String(r.actual).length), 'ACTUAL'.length);

  const pad = (s, w) => String(s).padEnd(w, ' ');

  console.log(`${pad('TEST', nameWidth)}  ${pad('EXPECTED', expWidth)}  ${pad('ACTUAL', actWidth)}  RESULT`);
  console.log(`${'-'.repeat(nameWidth)}  ${'-'.repeat(expWidth)}  ${'-'.repeat(actWidth)}  ------`);
  let allPass = true;
  for (const r of results) {
    if (!r.pass) allPass = false;
    console.log(`${pad(r.name, nameWidth)}  ${pad(r.expected, expWidth)}  ${pad(r.actual, actWidth)}  ${r.pass ? 'PASS' : 'FAIL'}`);
  }

  console.log('');
  console.log(allPass ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
