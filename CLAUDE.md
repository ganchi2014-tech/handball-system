# HANDBALL LAB（handball-system）

高校ハンドボール部（近江兄弟社高校）の**自己組織化学習アプリ**。選手が自分で振り返り、課題を選び、練習を組む。
本番: https://ganchi2014-tech.github.io/handball-system/ ／ リポジトリ: https://github.com/ganchi2014-tech/handball-system

> **全面刷新 2026-07-07（Phase 1）**。旧CLAUDE.mdには「4軸未実装」等の実装と乖離した記載があり削除した。
> 全体計画は `C:\Users\togan1080\OneDrive\Claude\HANDBALL_LAB_羽化設計図_2026-07-06.md`（Critical/ロードマップ/YOMI LOOP構想）と
> `HANDBALL_LAB_Phase2-3_設計書.md`（同フォルダ）を必読。
> **Phase 2 YOMI LOOP 実装済 2026-07-07（ブランチ phase2-loop）**: ループホーム／1試合=1カード（match-cards）／
> 読み宣言→丸付け／SOLVE吸収／GK・PV共通エンジン化／マイ・プレイブック。実装計画: docs/superpowers/plans/2026-07-07-phase2-yomi-loop.md
> **切替完了 2026-07-07**: 旧・単一index.html（Babel CDN版）は撤去済み。本番はViteビルドが直接配信されている。
> 問題発生時のロールバックは `git revert`（旧アプリ復元は切替コミットのrevertで可能）。

## 憲法（オーナー決裁済 2026-07-07・変更禁止）

1. **顧問向け集計ビューは作らない**。記録は選手自身のもの（自己組織化の優先）。データ接続は選手の保全・マイ統計のみ。
2. **選手データ無傷**: localStorageキーは `hb_v1_*` を維持。`STORAGE_VERSION` を上げると旧データ破棄＝実質全損なので上げない。
   Phase 2追加キー: `match-cards`（1試合=1カード。reflect-history は破棄せず初回起動時に冪等変換コピー）と `loop-state`（次の試合日・端末設定）。
   どちらもバックアップの書き出し（全キー機械列挙）・取り込み（ID単位マージ）対象。
3. **本番URLは不変**。選手のホーム画面アイコン・ブックマークを壊さない。

## アーキテクチャ（Phase 1 以降）

```
app/                     ← アプリ本体（Vite + React 18）
  index.html               エントリ
  src/
    main.jsx               起動＋ErrorBoundary＋旧世代キャッシュ掃除
    App.jsx                画面全体の配線（ホーム=ループホーム。Phase 2でハブ画面を置換済み）
    styles.css             全スタイル
    data/*.json            ★コンテンツ正本（GLOSSARY/SOLVE_DATA/DRILL_THEMES/QUESTIONS/RESULTS…13ファイル）
    lib/                   純ロジック（テスト対象）: dict/chat/markdown/plan/storage/gk/pv/tb/backup/content/appData
                           ＋ loop.js（位相判定・match-cards・変換コピー・cardStats）
                           ＋ recordModules.jsx（GK/PV記録モジュールの宣言的スキーマ＋集計カード）
    components/            GText / tb / record（GK・PV共通エンジン。旧 gk.jsx/pv.jsx は削除済み）
                           ＋ loop（LoopHome/YomiWizard/CardFlow）／ playbook
dictionary/*.md          ← 辞書33ファイル（母データ・唯一の正本。ビルドで dist へ複製）
tests/                   ← Vitest（回帰・集計・コンテンツ整合性監査）
.github/workflows/ci.yml ← テスト→ビルド→Pagesデプロイ（dist直接配信）
.scripts/                ← 辞書製造の一回性ツール群＋phase1_split_modules.js（移行記録）
```

- **データを直すときは `app/src/data/*.json`**。JSXやJSリテラルにコンテンツを書き戻さない（構文エラーで白画面になる歴史への逆行）。
- 参照（related / ドリルのfileId+match）を書くときはタイトル正引きで書く。`tests/content-integrity.test.js` が
  リンク切れと「本文フォールバック着地」をCIで検出する（2026-07-07に旧監査の正規表現漏れで残っていた55件を修正済み）。

## コマンド

```bash
npm ci            # 依存導入
npm test          # Vitest 全部（回帰14問・パリティ・集計単体 = 136+ tests）
npm run dev       # 開発サーバー http://localhost:5173
npm run build     # dist/ へビルド（辞書・icons・manifest.jsonもコピーされる）
npm run preview   # ビルド産物の確認
```

## デプロイ（運用者の体験は「pushするだけ」）

1. mainへpush → GitHub Actions がテスト→ビルド→デプロイ。**CIが赤だと本番に届かない**（白画面デプロイの構造的封鎖）。
2. 配信物は `dist/`（ビルド資産＋辞書＋icons＋manifest.json）だけ。リポジトリのソースや作業ファイルは公開されない。
3. Pages のソースは「GitHub Actions」（ci.yml の configure-pages が維持する）。
4. ロールバック: 問題のあるコミットを `git revert` して push すれば前の状態が再デプロイされる。

## 地雷（実際に起きた障害。絶対に踏まない）

- **SWの条件付きGET禁止**: `no-cache`等でIf-None-Matchを送るとGitHub Pagesの304で辞書全滅（旧sw.js v5事故）。現SW（vite-plugin-pwa/Workbox）は条件付きヘッダを付けないので安全。辞書.mdは StaleWhileRevalidate を維持。
- **CDN Babel v8白画面事故（2026-06・歴史）**: 旧構成が捨てられた理由。無ビルド＋CDN＋手書きSWに戻さない。
- **main.jsx の旧世代キャッシュ掃除（`handball-lab-*` 削除）は残す**: 選手の端末には旧SWのキャッシュが残っており、切替後の初回訪問で掃除される。
- **STORAGE_VERSION は上げない**（上げると選手の旧データが自動破棄される仕様が lib/storage.js に残っている）。

## テストの読み方

- `tests/loop.test.js` — ループ位相（D-3/D-2〜D-0/+1〜+2/+3の境界）・カード生成・reflect-history変換コピーの冪等性・cardStats。
- `tests/chat-regression.test.js` — 回帰14問（「肩が痛い」→file25等）。チャットロジックを触ったら必ず見る。
- `tests/aggregation.test.js` — GK/PV/TB集計とmergeBackupの期待値。**選手に見せる数字**の退行検知。
- `tests/content-integrity.test.js` — 旧 .scripts/audit_*.js のJSON移植＋拡大版。全 related/ドリル参照の辞書解決、
  SOLVE_DATA・DRILL_THEMES・RESULTS系の完備性。コンテンツを足したら必ず通す。
- 新旧パリティテスト（*.legacy.test.js）は切替完了に伴い削除済み（旧index.htmlと共に）。移行の正しさは
  2026-07-07時点の136テスト全緑で証明済み（git履歴 25a222c 以前を参照）。

## 辞書ファイル（母データ・33ファイル）

情報が必要なときは `dictionary/` 直下を Read すること。概要: 00=じゃんけんマップ／01=基礎技術／02=個人対決／03=数的状況／04=認知・判断／05=GK辞書／06=ポスト／07=陣形基礎／08=ゲームマネジメント／09=個人差／10=スカウティング／11=試合文脈／12=セットプレー／13=欧州国別戦術／14=ポジション役割・多言語／15=ノルウェー式GK/DF／16=OFコンビ／17=場面逆引き＋振り返りチェックリスト／18=メンタル／19=練習メニュー／20=バック判断プレイブック／21=フィジカル／22=7mスロー／23=バック個人DF／24=日本・アジア／25=ケガ予防／26=戦術フォーメーション／27=サインプレー大全／28=ビデオ分析／29=バック育成・各国メソッド／30=ルール・レフェリー／31=装備／32=試合当日。

`redirect` フラグ付きのファイルはスタブでチャット検索から除外される（2026-11-19 時点で該当は 11 のみ。07・10 は検索対象。判定は `lib/chat.js` の CHAT_EXCLUDED_FILES）。

## 普遍原則（コンテンツを書くときの憲法）

1. 先に読んだ方が選択肢を持てる 2. 2/3閉じて1/3開ける 3. じゃんけん構造（絶対最強なし）
4. 認知→アクション→リアクション 5. 「正解はない」— 事実のみ記録、選手が自分で決める
6. 用語はドリル正典（HB男子 効果最大化ガイド・4か月フィジカル計画）と突き合わせる

## 辞書の書き方の決まり（オーナー方針 2026-11-17）

オーナーの言葉：「私の哲学観が全ての生徒に合うわけではない。攻めや守りは相手に合わせて必要なことを選択するため単一的にする必要はない。ただし共通認識などは揃える必要がある。」

- **揃えるもの**（場面の名前・選択肢の名前・誰が選ぶか・合図・既定の立ち方）の原本は `docs/kyotsu-ninshiki.md`。
  オーナー本人の言葉だけを根拠にAIが更新する（オーナーは列挙しない）。行動まで決めるのは安全と記録の付け方だけ。
- **選ぶもの**（攻め方・守り方・打ち方）：「必ず」「禁止」「最優先」で一つに決めない。決まりではなく「これをすると相手はこうなりやすい」と書く。
- **人によるもの**（メンタル・体づくり・試合前の過ごし方）：方法の種類を並べる。計画の形で載せるときは「例であって部の計画ではない」と明記。
- 指示する文には出どころを付ける（〔教材〕〔まとめ〕〔未確認〕）。根拠を確かめられない因果は「〜と言われる」。
- 顧問の考えを顧問の名前で載せるのは、オーナーが指定した節だけ（既存の「コーチ直伝」）。
- **ルール・装具・審判の合図は、日本ハンドボール協会の最新の競技規則（handball.or.jp/rule/）で確かめてから書く**。記憶で書かない。調べれば分かることを顧問に聞かない（オーナー指示 2026-11-19）
- **選手名・監督名・大会成績・クラブ別の話など、年が変わると古くなる情報は辞書に入れない**（オーナー決定 2026-11-17。13・24章から削除済み）。型と返し手だけを書く。
- 週の回数や期間を決めたトレーニング計画の表は載せない（同日決定。21章の12週間プログラムを削除済み）。方法の種類と目安だけ。

## 次のフェーズ（羽化設計図 §4）

- ~~Phase 2 ループ化~~ ✅ **本番デプロイ済 2026-07-07**（検証フロー実測14タップ／GK・PV共通エンジン化は-534/+517行。
  ループ新設分を含む全体では +1053/-576 で「削除量≧追加量」は未達＝検収記録参照）
- ~~Phase 3 Firebase~~ ✅ **実装済 2026-07-07**（ブランチ phase3-firebase）: `lib/fb.js`（firebase@12.15.0固定・**全APIがdynamic import**＝
  未接続なら1バイトもロードしない・SWプリキャッシュからも除外）／「チームと繋ぐ」（components/connect.jsx・選手発意オプトイン）／
  `/lab/{uid}/{matchCards|gkPredictions|pvRecords|tbTasks}/{id}` へ push-on-change＋オフラインキュー（fb-queue）／
  `/roster` 購読で選手チップ拡張（手入力リストは温存・和集合）／名寄せ（fb-name-map・既存キーは書き換えない）。
  ルールは mental の database.rules.json に lab/labShared 追加済み（本番デプロイ済・権限マトリクス14項目PASS）。
  ⚠ **`/rosterToUid` への書き込みは絶対禁止 — fb.js に write API は存在しない（get のみ）。今後も追加禁止**（uid分裂端末で
  mental の名簿連携を破壊するため）。削除は同期しない（リモート保持＝誤削除復元のデータ保全方針）。
  §2-5 の analyzer実測コース表示は**オーナー決裁待ちでスコープ外**のまま。
- **Phase 4 展開**: 90分コンパイラ／プレイブック拡張（自分の辞書転記の判断）／読みの回覧（labSharedルールは整備済み・UIが未実装・選手発意のみ）

**mainへのpush・本番切替は必ずユーザー（オーナー）の承認を得ること。**
