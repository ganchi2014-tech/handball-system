# Phase 3 Firebase接続（最小配線）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ログインなし＝現状どおり全機能（二層原則）を守ったまま、「チームと繋ぐ」を選んだ選手の記録（match-cards / gk_predictions / pv_records / tb-tasks）を `handball-mental` RTDB の `/lab/{uid}/...` に同期し、名簿を `/roster` 購読に置き換える。

**仕様正本:** `C:\Users\togan1080\OneDrive\Claude\HANDBALL_LAB_Phase2-3_設計書.md` §2（2026-07-07 検証部門改訂版）。

**憲法・地雷（違反したら実装却下）:**
1. **LABから `/rosterToUid` に書き込むコードを1行も書かない（readのみ）**。uid分裂端末で書くと mental の名簿連携を無言で破壊する（設計書§2-4・地雷6）。検収でgrep証明。
2. **顧問不関与**: 顧問向け画面・集計を作らない。顧問uid（frwC7WOeunaZixk6Nkegk7cRDIr2）に /lab 特権readを与えない。
3. **二層原則**: 未接続なら Firebase コードを1バイトもロードしない（dynamic import）。新規端末コールドスタートで全機能が動く。手入力選手リスト（gk_players/pv_players）はフォールバックとして残す。
4. **mental の database.rules.json は全置換式**: 既存パスのルール文字列はバイト不変のまま、トップレベルに lab / labShared を追加するだけ。
5. §2-5 の analyzer実測コース表示は**オーナー決裁待ちのためスコープ外**（gkCalcTendencies 継続）。読みの回覧UI（labShared公開ボタン）は Phase 4（ルールだけ先行整備）。
6. mainへのpush・ルールデプロイ・本番切替はオーナー承認必須。

**環境事実（2026-07-07調査）:**
- firebase-tools / Java なし → RTDBエミュレータ不可。**ルールはオーナーが Firebase Console に貼り付けてデプロイ**（mental従来方式・FIREBASE_SETUP.md方式）。検証は**デプロイ後に匿名2ユーザーで権限マトリクスを実測する Node スクリプト**で行う（新パスは空なので本番検証のリスクなし・テストデータは自削除）。
- firebaseConfig は mental index.html:33-42 の公開webコンフィグを転記（apiKey等は公開情報）。databaseURL: `https://handball-mental-default-rtdb.asia-southeast1.firebasedatabase.app`
- mental の既存ルール構造: ルートdeny＋パス別許可。`/roster` read=auth・write=coach、`/rosterToUid` read=auth・$rid write=本人uid値 or coach。
- roster エントリ形状（analyzer実装より）: `{ name, isGK, rosterId }` の配列（/roster 直下）。
- 作業ブランチ: handball-system=`phase3-firebase`（mainから）、handball-mental=`phase3-lab-tile`（mainから）。

**新規 localStorage キー（LAB・`hb_v1_` 自動prefix）:**
- `fb-link` — `{ enabled: 0|1, rosterId: string|null, rosterName: string|null, mismatch: 0|1 }`（端末設定。バックアップ取り込みはローカル優先スカラー）
- `fb-queue` — `[{ node, id }]` 未送信キュー（重複可・送信は冪等setなので安全）
- `fb-roster-cache` — 最後に取得した roster 配列（オフライン時の選手チップ用）
- `fb-name-map` — `{ 手入力名: rosterId | 'legacy:手入力名' }` 名寄せ結果

**同期モデル（設計§2-1「localStorageはオフラインバッファに格下げ・正はRTDB」の最小実装）:**
- 接続時（enable時と起動時）: ノードごとに **pull（get）→ ID単位で和集合マージ→ローカルへ反映 → ローカルにしかない記録を push（set）**。同一IDは内容同一前提でリモート優先もローカル優先も等価（IDは生成時一意・編集はカードのみ→カードはローカル優先で上書きpush）。
- 保存時: 接続中なら即 push、失敗/オフラインなら `fb-queue` に積み、`online` イベント/次回接続で flush。set は冪等なので多重送信無害。
- RTDBパス: `/lab/{uid}/matchCards/{id}` `/lab/{uid}/gkPredictions/{id}` `/lab/{uid}/pvRecords/{id}` `/lab/{uid}/tbTasks/{id}`（キー名は設計§2-2どおり camelCase）。

---

## Task 1: ルール追記＋デプロイ後検証スクリプト（mental リポ）

**Files:**
- Modify: `C:\Users\togan1080\OneDrive\Claude\handball-mental\database.rules.json`
- Create: `C:\Users\togan1080\OneDrive\Claude\handball-system\.scripts\verify-lab-rules.mjs`（LABリポ側に置く。公開Pagesには出ない=.scripts はデプロイ対象外）

- [ ] **Step 1: database.rules.json のトップレベル（"matches" の直後）に追加** — 既存部分は1文字も変えない:

```json
    "lab": {
      "$uid": {
        ".read": "auth != null && $uid === auth.uid",
        ".write": "auth != null && $uid === auth.uid"
      }
    },

    "labShared": {
      ".read": "auth != null",
      "$id": {
        ".write": "auth != null && ((!data.exists() && newData.exists() && newData.child('author').val() === auth.uid) || (data.exists() && data.child('author').val() === auth.uid && (!newData.exists() || newData.child('author').val() === auth.uid)))"
      }
    }
```

（意味: labShared は 新規作成=author自分必須／更新=既存authorが自分かつ付け替え不可／削除=既存authorが自分。設計§2-3の草案の意図を、削除時 `newData` 不存在でも判定できる形に展開したもの）

- [ ] **Step 2: JSON構文チェック** — `node -e "JSON.parse(require('fs').readFileSync('database.rules.json','utf8')); console.log('OK')"`
- [ ] **Step 3: 既存部分バイト不変の証明** — `git diff database.rules.json` が追加行のみ（既存行の変更0）であることを確認し記録。
- [ ] **Step 4: verify-lab-rules.mjs 作成**（LABリポ `.scripts/`）。firebase modular SDK（LAB側 node_modules を利用）で:
  1. 匿名ユーザーA・B を別Appインスタンスでサインイン
  2. A: `/lab/{A}/matchCards/test1` write → **成功**を期待
  3. A: 自分の `/lab/{A}` read → 成功
  4. B: `/lab/{A}` read → **PERMISSION_DENIED** を期待
  5. B: `/lab/{A}/matchCards/x` write → DENIED
  6. A: `/labShared/t1 = {author: A.uid, ...}` → 成功、B: `/labShared/t1` read → 成功、B: `/labShared/t1` update → DENIED、B: `/labShared/t2 = {author: A.uid}`（なりすまし）→ DENIED、A: `/labShared/t1` 削除 → 成功
  7. A: `/matches` read → DENIED（顧問専用の確認）
  8. 後始末: A の `/lab/{A}` と labShared テストノードを削除、`deleteUser()` で両匿名ユーザー削除
  9. 期待どおり=exit 0・全結果を表形式で標準出力。1件でも不一致なら exit 1
- [ ] **Step 5: mental リポでブランチ＋コミット** — `git -C ..\handball-mental checkout -b phase3-lab-tile && git add database.rules.json && git commit`（メッセージ: `feat(rules): /lab（本人only）と /labShared（作者固定）を追加 — LAB Phase 3`）。**デプロイはまだしない。**
- [ ] **Step 6: LABリポに検証スクリプトをコミット**

## Task 2: lib/fb.js — Firebase接続層（dynamic import・rosterToUid書き込みゼロ）

**Files:**
- Create: `app/src/lib/fb.js`
- Test: `tests/fb.test.js`（純ロジックのみ: キュー整形・マージは既存 mergeExtraKey を再利用するので薄く）
- Modify: `package.json`（`firebase` を追加・**exact固定**。`npm install firebase@latest --save-exact`）

構成（全コードは実装者が書くが、境界は固定）:

```js
// app/src/lib/fb.js — Firebase接続層。ここ以外のファイルは firebase を import しない。
// ⚠ /rosterToUid への書き込みAPIはこのモジュールに存在しない（read専用。設計書§2-4の絶対禁止）。
// 未接続なら firebase チャンクはロードされない（dynamic import・二層原則）。
const NODES = [
  { node: 'matchCards',    lsKey: 'match-cards' },
  { node: 'gkPredictions', lsKey: 'gk_predictions' },
  { node: 'pvRecords',     lsKey: 'pv_records' },
  { node: 'tbTasks',       lsKey: 'tb-tasks' },
];
// export される関数（すべて enabled 時のみ内部で dynamic import）:
//   fbConnect() → { uid } 匿名サインイン＋初期化（多重呼び出し安全）
//   fbFullSync(localData, applyCb) → ノードごとに get→mergeExtraKey→applyCb(lsKey, mergedArr)→差分push
//   fbPush(node, record) → set(/lab/{uid}/{node}/{record.id})。失敗時 throw（呼び元がキューへ）
//   fbFlushQueue(queue, localData) → 成功分を除いた残キューを返す
//   fbSubscribeRoster(cb) → /roster を onValue 購読、cb(rosterArray)。解除関数を返す
//   fbCheckRosterLink(rosterId) → /rosterToUid/{rosterId} を【getで読むだけ】→ { linkedUid|null, mine: bool }
//   fbDisconnect() → 購読解除（サインアウトはしない: uid維持）
```

- [ ] Step 1: `npm install firebase --save-exact`（バージョンを記録）
- [ ] Step 2: fb.js 実装（firebaseConfig は mental のものを転記。initializeApp は名前付き `'lab'` インスタンス）
- [ ] Step 3: `grep -rn "rosterToUid" app/` の結果が **fb.js の read（get）1箇所のみ**であることを確認
- [ ] Step 4: tests/fb.test.js — NODES の対応表と、キュー重複除去などfirebase非依存の純関数だけをテスト（SDKはモックしない方針: 接続系は Task 6 の実機検証で担保）
- [ ] Step 5: `npm test`・`npm run build`（build後 `dist/assets` に firebase チャンクが**分離**されていること=メインチャンク肥大なしを確認）→ Commit

## Task 3: 「チームと繋ぐ」UI＋同期配線（App.jsx）

**Files:**
- Create: `app/src/components/connect.jsx`（ConnectPanel: 説明→名簿から自分をタップ→接続。解除・状態表示・uid分裂案内・LINE廃止アナウンス）
- Modify: `app/src/App.jsx`, `app/src/components/loop.jsx`（ホーム下段にボタン）, `app/src/styles.css`（最小）

仕様:
- ループホーム下段（💾バックアップボタンの上）に「🔗 チームと繋ぐ（記録をクラウドに保存）」/ 接続済なら「🔗 接続中：{rosterName}（記録は自動保存）」。
- ConnectPanel（onboard-overlayモーダル流用）:
  - 未接続: 説明文（「繋がなくても全機能使えます。繋ぐと記録が消えなくなり、複数端末で合流します」）→ 接続ボタン → fbConnect → fbSubscribeRoster で名簿表示 → 自分の名前をタップ（rosterId 保存・**書き込みはしない**）→ fbCheckRosterLink: `linkedUid==null` → 案内「メンタルアプリで先に自分の名前を登録すると全部つながる（このアプリからは登録しない）」／`mine=false` → **mismatch=1 保存＋案内**「メンタルアプリと同じブラウザ/入れ方で開くと記録がつながります。このままでも記録は安全に保存されます」（上書きしない・エラーにしない）
  - 接続済: 状態表示＋「同期を解除」（fb-link.enabled=0・ローカルデータは無傷）＋ LINE廃止アナウンス文「接続中は週次テキストのコピーはバックアップ用途では不要になりました（共有用には引き続き使えます）」
- App.jsx 配線:
  - 起動時 `fb-link.enabled` なら fbConnect→fbFullSync（4ノードを既存 setter へ: setMatchCards/setGkPreds/setPvRecords/setTbTasks。mergeExtraKey でID和集合）→fbFlushQueue
  - 各保存経路（upsertCard・RecordModule onSave・tbUpsert・削除は対象外=削除は端末内のみ/リモートは残す=データ保全優先）で enabled なら fbPush、失敗時 `fb-queue` 追加。`window.addEventListener('online', flush)`
  - **名簿→選手チップ**: enabled かつ roster 取得済なら、RecordModule に渡す players を `{ keepers: roster.filter(isGK).map(name), shooters: 全員, pivots: 全員 }` に**手入力リストと和集合**で拡張（フォールバック要件と名寄せ猶予の両立）。roster はオフライン時 `fb-roster-cache`。
  - **名寄せ（最小）**: 接続完了時に手入力名（gk_players/pv_players）のうち roster 名と完全一致しないものがあれば ConnectPanel 内に1回だけマッピングUI（手入力名→rosterチップ or「そのまま残す」=legacy:名前）→ `fb-name-map` 保存。**既存キーの名前は書き換えない**（表示・将来の突合にのみ使用）。
- [ ] 実装 → `npm test`・build → dev で未接続時に Network タブで firebase チャンク未ロードを確認 → Commit

## Task 4: 【オーナー作業】ルールデプロイ → 本番権限検証

- [ ] Step 1: オーナーに依頼: Firebase Console → Realtime Database → ルール → `handball-mental\database.rules.json` の全文を貼り付けて「公開」（従来どおりの手順）
- [ ] Step 2: `node .scripts/verify-lab-rules.mjs` を実行 → 全項目PASS を記録（1件でもFAILなら**即オーナーに報告**し、必要なら旧ルールに戻す指示を仰ぐ）
- [ ] Step 3: LAB実機（dev）で「チームと繋ぐ」→記録→リロードで復元、devtoolsオフライン→記録→オンライン復帰→自動送信 を確認

## Task 5: mental マイ統計に「読み的中率」タイル（mental リポ・phase3-lab-tile）

- Modify: `handball-mental\index.html`（**Babel standalone 7.26.4 固定を崩さない**・既存タイル群のパターンに従う）
- 仕様（設計§2-5）: 本人uidで `/lab/{auth.uid}/matchCards` を**1回get**（購読不要）→ yomi の hit true/false を集計 → タイル「🔮 読み的中率 X%（N件）」。**データ0件 or 読めない場合はタイルを描画しない**（沈黙故障させない=非表示が正・案内はLAB側の責務）。顧問アカウントでは /lab が読めない=自然に非表示（憲法整合）。
- [ ] 実装 → mental のチャット回帰等はないが**手動スモーク**（ログイン→マイ統計表示・タイル出現/非出現）→ mental リポにコミット（pushはオーナー承認後）

## Task 6: 検収（設計§2-6の7項目）＋ドキュメント

1. [ ] 新規端末コールドスタート（localStorage空・未接続）で全機能動作＋firebaseチャンク未ロード（Network実測）
2. [ ] オフライン→記録→復帰→自動同期（devtools offline で実測。実機機内モードはオーナー確認項目として報告書に明記）
3. [ ] ルール: verify-lab-rules.mjs 全PASS（他人read不可・なりすまし不可・付け替え不可・本人削除可）
4. [ ] 顧問で /lab 不可視: ルール構造（labに顧問特権なし）＋スクリプトの他人read DENIED で担保。**顧問実機での最終確認はオーナー項目**
5. [ ] `grep -rn "rosterToUid" app/ .scripts/` → 書き込みAPI（set/update/push/remove）ゼロ・fb.js の get のみ
6. [ ] uid分裂シナリオ: 2つの別ブラウザ（=別匿名uid）で同一rosterIdを選択 → 後発側に案内表示・/rosterToUid が**変化しない**こと（値をget で前後比較）
7. [ ] LINE廃止アナウンスが接続時に表示される
- [ ] CLAUDE.md 更新（fb.js・新キー・Phase 3完了・rosterToUid禁止の明記）→ 最終コミット → **オーナーへ報告・push承認**（handball-system と handball-mental の両方）

---

## Self-Review 記録
- §2カバレッジ: 二層原則=T2/T3/検収1、データパス=T2、ルール=T1/T4、認証・名寄せ・uid分裂=T3/検収6、マイ統計タイル=T5、廃止アナウンス=T3/検収7。§2-5実測コース表示=スコープ外（決裁待ち）を明記。
- 削除系の同期は意図的に「端末内のみ」（リモート保持）: 誤削除からの復元手段を残す。設計書に削除同期の要求なし。
- labShared の公開UIは作らない（Phase 4）。ルールとスクリプト検証のみ先行。
