# HANDBALL LAB（handball-system）

高校ハンドボール部（近江兄弟社高校）の**自己組織化学習アプリ**。選手が自分で振り返り、課題を選び、練習を組む。
本番: https://ganchi2014-tech.github.io/handball-system/ ／ リポジトリ: https://github.com/ganchi2014-tech/handball-system

> **全面刷新 2026-07-07（Phase 1）**。旧CLAUDE.mdには「4軸未実装」等の実装と乖離した記載があり削除した。
> 全体計画は `C:\Users\togan1080\HANDBALL_LAB_羽化設計図_2026-07-06.md`（Critical/ロードマップ/YOMI LOOP構想）を必読。
> **切替完了 2026-07-07**: 旧・単一index.html（Babel CDN版）は撤去済み。本番はViteビルドが直接配信されている。
> 問題発生時のロールバックは `git revert`（旧アプリ復元は切替コミットのrevertで可能）。

## 憲法（オーナー決裁済 2026-07-07・変更禁止）

1. **顧問向け集計ビューは作らない**。記録は選手自身のもの（自己組織化の優先）。データ接続は選手の保全・マイ統計のみ。
2. **選手データ無傷**: localStorageキーは `hb_v1_*` を維持。`STORAGE_VERSION` を上げると旧データ破棄＝実質全損なので上げない。
3. **本番URLは不変**。選手のホーム画面アイコン・ブックマークを壊さない。

## アーキテクチャ（Phase 1 以降）

```
app/                     ← アプリ本体（Vite + React 18）
  index.html               エントリ
  src/
    main.jsx               起動＋ErrorBoundary＋旧世代キャッシュ掃除
    App.jsx                画面全体（Phase 2でループホーム化・分割予定）
    styles.css             全スタイル
    data/*.json            ★コンテンツ正本（GLOSSARY/SOLVE_DATA/DRILL_THEMES/QUESTIONS/RESULTS…13ファイル）
    lib/                   純ロジック（テスト対象）: dict/chat/markdown/plan/storage/gk/pv/tb/backup/content/appData
    components/            GText / tb / gk / pv
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

- `tests/chat-regression.test.js` — 回帰14問（「肩が痛い」→file25等）。チャットロジックを触ったら必ず見る。
- `tests/aggregation.test.js` — GK/PV/TB集計とmergeBackupの期待値。**選手に見せる数字**の退行検知。
- `tests/content-integrity.test.js` — 旧 .scripts/audit_*.js のJSON移植＋拡大版。全 related/ドリル参照の辞書解決、
  SOLVE_DATA・DRILL_THEMES・RESULTS系の完備性。コンテンツを足したら必ず通す。
- 新旧パリティテスト（*.legacy.test.js）は切替完了に伴い削除済み（旧index.htmlと共に）。移行の正しさは
  2026-07-07時点の136テスト全緑で証明済み（git履歴 25a222c 以前を参照）。

## 辞書ファイル（母データ・33ファイル406セクション）

情報が必要なときは `dictionary/` 直下を Read すること。概要: 00=じゃんけんマップ／01=基礎技術／02=個人対決／03=数的状況／04=認知・判断／05=GK辞書／06=ポスト／07=陣形基礎／08=ゲームマネジメント／09=個人差／10=スカウティング／11=試合文脈／12=セットプレー／13=欧州国別戦術／14=ポジション役割・多言語／15=ノルウェー式GK/DF／16=OFコンビ／17=場面逆引き＋振り返りチェックリスト／18=メンタル／19=練習メニュー／20=バック判断プレイブック／21=フィジカル／22=7mスロー／23=バック個人DF／24=日本・アジア／25=ケガ予防／26=戦術フォーメーション／27=サインプレー大全／28=ビデオ分析／29=バック育成・各国メソッド／30=ルール・レフェリー／31=装備／32=試合当日。

`redirect` フラグ付きのファイル（07/10/11）はスタブでチャット検索から除外される（`lib/dict.js` の DICT_FILES 参照）。

## 普遍原則（コンテンツを書くときの憲法）

1. 先に読んだ方が選択肢を持てる 2. 2/3閉じて1/3開ける 3. じゃんけん構造（絶対最強なし）
4. 認知→アクション→リアクション 5. 「正解はない」— 事実のみ記録、選手が自分で決める
6. 用語はドリル正典（HB男子 効果最大化ガイド・4か月フィジカル計画）と突き合わせる

## 次のフェーズ（羽化設計図 §4）

- **Phase 2 ループ化**: ループホーム／1試合=1カード（4軸統合・10モード降格）／SOLVE・課題ビルダー吸収／記録モジュールのスキーマ駆動共通化（削除量≧追加量が検収条件）
- **Phase 3 Firebase**: `handball-mental` RTDBの `/roster` 購読で名簿手入力廃止→ `/lab/...` 同期→ mental マイ統計に的中率タイル
- **Phase 4 展開**: 90分コンパイラ／マイ・プレイブック／読みの回覧（選手発意のみ）

**mainへのpush・本番切替は必ずユーザー（オーナー）の承認を得ること。**
