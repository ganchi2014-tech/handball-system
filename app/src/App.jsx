// このファイルは index.html（Phase 0版）から Phase 1 S2 で機械分割された。
// 由来行: 9939-12348
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ALL_TAGS, DICT_FILES, DICT_SECTION_COUNT, GLOSSARY, splitSections } from './lib/dict.js';
import { renderMarkdown } from './lib/markdown.js';
import { AXIS_MAP, FEINT_LEGEND, HUB_MODULES, MODES, REFERENCE_MODES, axisStyle, getProgress } from './lib/appData.js';
import { QUESTIONS, RESULTS, SOLVE_DATA } from './lib/content.js';
import { DRILL_THEMES, DURATIONS, LEVELS, POSITIONS, POSITION_RECOMMENDED, buildPlan } from './lib/plan.js';
import { CHAT_SUGGESTIONS, buildChatReply } from './lib/chat.js';
import { lsGet, lsSet } from './lib/storage.js';
import { TB_CONSTRAINTS, tbExportAllText } from './lib/tb.js';
import { gkCalcTendencies } from './lib/gk.js';
import { RECORD_MODULES } from './lib/recordModules.jsx';
import { buildBackupText, collectAllData, mergeBackup, mergeExtraKey } from './lib/backup.js';
import { migrateReflectToCards, newMatchCard } from './lib/loop.js';
import { FB_NODES, fbConnect, fbUid, fbPush, fbFullSync, fbFlushQueue, fbSubscribeRoster, fbCheckRosterLink, fbQueueAdd, fbRosterToPlayers } from './lib/fb.js';
import { LoopHome, YomiWizard, CardFlow } from './components/loop.jsx';
// パネルはモーダルを開いたときだけロード（メインチャンク肥大防止。firebase とは無関係の小チャンク）
const ConnectPanel = React.lazy(() => import('./components/connect.jsx').then(m => ({ default: m.ConnectPanel })));
import { Playbook } from './components/playbook.jsx';
import { GText } from './components/GText.jsx';
import { TBHome, TBTaskDetail, TBWizard, tbCopy } from './components/tb.jsx';
import { RecordModule } from './components/record.jsx';

// ── Phase 3: 変更検知 push（1ノードにつき1フック）──
// 新規ID or オブジェクト参照が変わった記録（カード編集を含む）だけを fbPush する。
// ・マウント初回はスキップ（prevRef を初期配列で初期化 → 起動時の整合は fbFullSync が担う）
// ・削除は同期しない（リモート側は保持＝誤削除からの復元手段を残すデータ保全方針）
// ・未接続(enabled=0)なら何もしない。接続設定済みでもオフライン/エラー中はキューへ。
function useFbPushOnChange(node, arr, enabled, statusRef, addToQueue, skipIdsRef) {
  const prevRef = useRef(arr);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = arr;
    if (prev === arr || !enabled) return;
    const prevById = new Map((Array.isArray(prev) ? prev : []).map(r => [r && r.id, r]));
    const changed = (Array.isArray(arr) ? arr : []).filter(r => r && r.id && prevById.get(r.id) !== r);
    if (!changed.length) return;
    const st = statusRef.current;
    for (const rec of changed) {
      // fbFullSync で リモートから取り込んだ直後の記録は押し返さない（エコー送信防止）
      if (skipIdsRef && skipIdsRef.current.has(rec.id)) { skipIdsRef.current.delete(rec.id); continue; }
      if (st === 'on') {
        fbPush(node, rec).catch(() => addToQueue(node, rec.id));
      } else {
        // connecting/error/オフライン中はキューへ（接続完了時と online 復帰時に flush される）
        addToQueue(node, rec.id);
      }
    }
  }, [arr, enabled]);
}

function App() {
  const [phase, setPhase] = useState('hub');
  const [mode, setMode] = useState(null);
  const [currentQ, setCurrentQ] = useState(null);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [resultId, setResultId] = useState(null);
  const [nextStep, setNextStep] = useState('');

  // ── 振り返りの永続化（2026-07-06）──
  // 結果到達時に記録を作成し、「次に試すこと」は宣言として保存 → 次回ホームで「できた？」を照合する。
  // これまで振り返り結果は一切保存されず「やっても何も残らない」構造だった欠陥の修正。
  const [reflectHistory, setReflectHistory] = useState(() => lsGet('reflect-history') || []);
  const [declaration, setDeclaration] = useState(() => lsGet('next-declaration') || null);
  const [decSnooze, setDecSnooze] = useState(false); // 「まだこれから」＝このセッション中だけボタンを畳む
  const reflectIdRef = useRef(null);
  const activeCardIdRef = useRef(null);
  const recordReflectStart = (rid, hist) => {
    const entry = {
      id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: Date.now(), mode, resultId: rid,
      crumbs: (hist || []).map(h => h.text),
      next: '',
    };
    reflectIdRef.current = entry.id;
    setReflectHistory(prev => {
      const list = [entry, ...prev].slice(0, 200);
      lsSet('reflect-history', list);
      return list;
    });
    // Phase 2: カード起点の振り返りなら、カードにも接続する（reflect-history と二重保存＝旧経路互換）
    if (activeCardIdRef.current) {
      const cid = activeCardIdRef.current;
      setMatchCards(prev => prev.map(c => c.id === cid
        ? { ...c, reflect: { mode, resultId: rid, crumbs: (hist || []).map(h => h.text) } } : c));
    }
  };
  const commitNextStep = (text) => {
    const t = (text != null ? text : nextStep).trim();
    if (!reflectIdRef.current) return;
    setReflectHistory(prev => {
      const list = prev.map(e => e.id === reflectIdRef.current ? { ...e, next: t } : e);
      lsSet('reflect-history', list);
      return list;
    });
    if (t) {
      const dec = { text: t, ts: Date.now(), mode, done: null };
      setDeclaration(dec);
      lsSet('next-declaration', dec);
      if (activeCardIdRef.current) {
        const cid = activeCardIdRef.current;
        setMatchCards(prev => prev.map(c => c.id === cid ? { ...c, next: t } : c));
      }
    }
  };
  const answerDeclaration = (done) => {
    if (!declaration) return;
    const dec = { ...declaration, done, answeredTs: Date.now() };
    setDeclaration(dec);
    lsSet('next-declaration', dec);
  };

  // ── Phase 2: 1試合=1カード＋ループ状態 ──
  // match-cards は新規保存先。reflect-history は読み続ける（破棄禁止）が、初回起動時に
  // 変換コピーする（migrateReflectToCards は冪等なので多重実行しても安全）。
  const [matchCards, setMatchCards] = useState(() => lsGet('match-cards') || []);
  const [loopState, setLoopState] = useState(() => lsGet('loop-state') || { nextMatch: null, migrated: 0 });
  useEffect(() => { lsSet('match-cards', matchCards); }, [matchCards]);
  useEffect(() => { lsSet('loop-state', loopState); }, [loopState]);
  useEffect(() => {
    if (loopState.migrated) return;
    const { cards, added } = migrateReflectToCards(reflectHistory, matchCards);
    if (added > 0) setMatchCards(cards);
    setLoopState(prev => ({ ...prev, migrated: 1 }));
  }, []);  // 初回マウント時のみ
  const upsertCard = (card) => {
    setMatchCards(prev => {
      const i = prev.findIndex(c => c.id === card.id);
      const next = i >= 0 ? prev.map(c => c.id === card.id ? card : c) : [card, ...prev];
      return next.sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 300);
    });
  };

  // 保存失敗（容量超過・プライベートブラウズ等）の可視化 — lsSet が発火するイベントを受ける
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    const onErr = () => setStorageError(true);
    window.addEventListener('hb-storage-error', onErr);
    return () => window.removeEventListener('hb-storage-error', onErr);
  }, []);

  // 辞書ブラウザの状態
  const [dictLoaded, setDictLoaded] = useState(false);
  const [dictSections, setDictSections] = useState([]);
  const [dictError, setDictError] = useState(null);
  const [dictQuery, setDictQuery] = useState('');
  const [dictActiveTag, setDictActiveTag] = useState(null);
  const [dictActiveFileId, setDictActiveFileId] = useState(null);
  const [dictDetail, setDictDetail] = useState(null); // 選択中のセクション
  const [dictTagsExpanded, setDictTagsExpanded] = useState(false); // タグ展開

  // 質問チャット（辞書ボット）の状態
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatTyping, setChatTyping] = useState(false);
  const chatEndRef = useRef(null);
  // 現在のphaseを参照するref（イベントハンドラ内のstale closure対策）
  const phaseRef = useRef('hub');
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  // 辞書詳細を開いた元画面（'dictionary' | 'chat'）— 戻り先の判定に使う
  const dictOriginRef = useRef('dictionary');
  // チャット履歴の復元・保存
  useEffect(() => {
    const stored = lsGet('chat-history');
    if (Array.isArray(stored)) setChatMessages(stored);
  }, []);
  const saveChatHistory = (msgs) => {
    const capped = msgs.slice(-60);
    lsSet('chat-history', capped);
    return capped;
  };

  // 課題を解決する（Phase 2A）の状態
  const [solveRole, setSolveRole] = useState(null);       // 'player' | 'coach'
  const [solveCategory, setSolveCategory] = useState(null);
  const [solveSymptom, setSolveSymptom] = useState(null);
  const [solveHistory, setSolveHistory] = useState([]);   // 最近の診断履歴
  const [criticalPosFilter, setCriticalPosFilter] = useState(null);

  // 練習を組む（Phase 2B）の状態
  const [planPosition, setPlanPosition] = useState('all'); // ポジション選択
  const [planThemes, setPlanThemes] = useState([]);       // テーマID配列
  const [planLevel, setPlanLevel] = useState('mid');
  const [planDuration, setPlanDuration] = useState(60);
  const [planResult, setPlanResult] = useState(null);     // 生成結果
  const [planSaved, setPlanSaved] = useState([]);         // 保存済みプラン
  const [planCopyMsg, setPlanCopyMsg] = useState('');     // コピー成功表示

  // 課題ビルダー（自作課題）
  const [tbTasks, setTbTasks] = useState(() => lsGet('tb-tasks') || []);
  const [tbView, setTbView] = useState({ name: 'home' }); // home | wizard | detail
  const [tbToast, setTbToast] = useState(null);
  const [planMyTasks, setPlanMyTasks] = useState([]);     // プランに混ぜる自作課題ID
  useEffect(() => { lsSet('tb-tasks', tbTasks); }, [tbTasks]);
  // GK予測（2026-07 GK先行サイクル）
  const [gkPreds, setGkPreds] = useState(() => lsGet('gk_predictions') || []);
  const [gkPlayers, setGkPlayers] = useState(() => lsGet('gk_players') || { keepers: [], shooters: [] });
  const [gkView, setGkView] = useState({ name: 'home' }); // home | record
  const gkLastSetup = useRef({}); // 連続入力用に直前のGK・状況・シューターを保持
  useEffect(() => {
    lsSet('gk_predictions', gkPreds);
    lsSet('shooter_tendencies', gkCalcTendencies(gkPreds)); // 仕様キー：常に予測記録から再計算
  }, [gkPreds]);
  useEffect(() => { lsSet('gk_players', gkPlayers); }, [gkPlayers]);
  // ピヴォット認知（GKサイクル後続）
  const [pvRecords, setPvRecords] = useState(() => lsGet('pv_records') || []);
  const [pvPlayers, setPvPlayers] = useState(() => lsGet('pv_players') || { pivots: [] });
  const [pvView, setPvView] = useState({ name: 'home' }); // home | record
  const pvLastSetup = useRef({}); // 連続入力用に直前のピヴォットを保持
  useEffect(() => { lsSet('pv_records', pvRecords); }, [pvRecords]);
  useEffect(() => { lsSet('pv_players', pvPlayers); }, [pvPlayers]);
  // データバックアップ（書き出し/取り込み）
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupText, setBackupText] = useState('');
  const [backupMsg, setBackupMsg] = useState('');
  const handleBackupExport = () => {
    // hb_v1_* の全キーを機械列挙（振り返り・保存プラン・お気に入り等も漏らさない）
    const txt = buildBackupText(collectAllData());
    tbCopy(txt, setBackupMsg);
  };
  const handleBackupImport = () => {
    try {
      const r = mergeBackup({ gkPreds, gkPlayers, pvRecords, pvPlayers, tbTasks }, backupText);
      setGkPreds(r.gkPreds); setGkPlayers(r.gkPlayers);
      setPvRecords(r.pvRecords); setPvPlayers(r.pvPlayers); setTbTasks(r.tbTasks);
      // GK/PV/TB以外の記録キーも汎用マージ（配列=和集合／スカラー=ローカル優先）
      const d = JSON.parse(backupText).data || {};
      let extraAdded = 0;
      const applyExtra = (key, curVal, apply) => {
        const m = mergeExtraKey(curVal, d[key]);
        if (m.added > 0) { lsSet(key, m.val); if (apply) apply(m.val); extraAdded += m.added; }
      };
      applyExtra('reflect-history', reflectHistory, (v) => setReflectHistory(v.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 200)));
      applyExtra('match-cards', matchCards, (v) => setMatchCards(v.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 300)));
      applyExtra('loop-state', loopState, null);   // スカラー＝ローカル優先（端末設定なので上書きしない）
      applyExtra('solve-history', solveHistory, setSolveHistory);
      applyExtra('plan-saved', planSaved, setPlanSaved);
      applyExtra('dict-favs', dictFavs, setDictFavs);
      applyExtra('chat-history', chatMessages, (v) => setChatMessages(v.slice(-60)));
      if (!declaration && d['next-declaration']) { setDeclaration(d['next-declaration']); lsSet('next-declaration', d['next-declaration']); }
      setBackupText('');
      setBackupMsg(`取り込み完了：GK記録+${r.added.gk}・PV記録+${r.added.pv}・自作課題+${r.added.tb}・選手+${r.added.players}・その他+${extraAdded}（重複はスキップ）`);
    } catch (e) {
      setBackupMsg('取り込み失敗：' + e.message);
    }
  };
  const tbUpsert = (t) => {
    setTbTasks(prev => {
      const i = prev.findIndex(x => x.id === t.id);
      if (i >= 0) { const next = [...prev]; next[i] = t; return next; }
      return [t, ...prev];
    });
  };

  // ── Phase 3: チームと繋ぐ（fb-link.enabled のときだけ fb.js が firebase をロードする）──
  const [fbLink, setFbLink] = useState(() => lsGet('fb-link') || { enabled: 0, rosterId: null, rosterName: null, mismatch: 0 });
  const [fbQueue, setFbQueue] = useState(() => lsGet('fb-queue') || []);
  const [fbRoster, setFbRoster] = useState(() => lsGet('fb-roster-cache') || []);
  const [fbNameMap, setFbNameMap] = useState(() => lsGet('fb-name-map') || {});
  const [fbStatus, setFbStatus] = useState('off'); // off | connecting | on | error
  const [fbNotice, setFbNotice] = useState(null);  // none | mismatch | mine | checkfail（ConnectPanel の案内）
  const [connectOpen, setConnectOpen] = useState(false);
  useEffect(() => { lsSet('fb-link', fbLink); }, [fbLink]);
  useEffect(() => { lsSet('fb-queue', fbQueue); }, [fbQueue]);
  useEffect(() => { lsSet('fb-name-map', fbNameMap); }, [fbNameMap]);
  const fbEnabled = !!fbLink.enabled;
  // 最新値をイベントハンドラ/非同期処理から参照するための ref 群
  const fbStatusRef = useRef(fbStatus); fbStatusRef.current = fbStatus;
  const fbLinkRef = useRef(fbLink); fbLinkRef.current = fbLink;
  const fbQueueRef = useRef(fbQueue); fbQueueRef.current = fbQueue;
  const fbDataRef = useRef({});
  fbDataRef.current = { 'match-cards': matchCards, 'gk_predictions': gkPreds, 'pv_records': pvRecords, 'tb-tasks': tbTasks };
  const rosterUnsubRef = useRef(null);
  const fbSkipPushRef = useRef(new Set()); // fbFullSync で取り込んだIDの押し返し防止（レビュー反映）
  const resolveRecord = (node, id) => {
    const def = FB_NODES.find(n => n.node === node);
    const arr = def ? (fbDataRef.current[def.lsKey] || []) : [];
    return arr.find(r => r && r.id === id) || null;
  };
  const addToQueue = (node, id) => setFbQueue(q => fbQueueAdd(q, node, id));
  // キュー再送。snapshot に無い（送信中に積まれた）エントリは残す。残キュー配列を返す（null=送るものなし）
  const flushQueueNow = async () => {
    const snapshot = fbQueueRef.current;
    if (!snapshot.length) return null;
    const remaining = await fbFlushQueue(snapshot, resolveRecord);
    setFbQueue(prev => {
      const key = (e) => e.node + '|' + e.id;
      const snapKeys = new Set(snapshot.map(key));
      const newly = prev.filter(e => !snapKeys.has(key(e)));
      return fbQueueAdd([...remaining, ...newly]);
    });
    return remaining;
  };
  // 接続エフェクト: enabled=1 になったとき（起動時に既に1なら初回マウントでも）実行。
  // 接続失敗は非致命 — アプリはローカルで動き続け、記録はキューに積まれる。
  useEffect(() => {
    if (!fbEnabled) { setFbStatus('off'); return; }
    let cancelled = false;
    (async () => {
      setFbStatus('connecting');
      try {
        await fbConnect(); // 匿名サインイン（多重呼び出し安全）
      } catch (e) {
        if (!cancelled) setFbStatus('error');
        return;
      }
      // 名簿購読は /lab と独立（auth があれば read 可）— /lab 同期が失敗しても名簿は出す
      try {
        const unsub = await fbSubscribeRoster((r) => { setFbRoster(r); lsSet('fb-roster-cache', r); });
        if (cancelled) { unsub(); return; }
        rosterUnsubRef.current = unsub;
      } catch (e) { /* 非致命: fb-roster-cache で表示継続 */ }
      try {
        const { failed } = await fbFullSync(fbDataRef.current, (lsKey, merged) => {
          // リモート由来（ローカルに無かったID）を記録 → push-on-change がエコー送信しないように
          const prevIds = new Set((fbDataRef.current[lsKey] || []).map(r => r && r.id));
          merged.forEach(r => { if (r && r.id && !prevIds.has(r.id)) fbSkipPushRef.current.add(r.id); });
          const byTsDesc = (a, b) => (b.ts || 0) - (a.ts || 0);
          if (lsKey === 'match-cards') setMatchCards(merged.slice().sort(byTsDesc).slice(0, 300));
          else if (lsKey === 'gk_predictions') setGkPreds(merged.slice().sort(byTsDesc));
          else if (lsKey === 'pv_records') setPvRecords(merged.slice().sort(byTsDesc));
          else if (lsKey === 'tb-tasks') setTbTasks(merged); // 順序維持（ts降順の不変条件なし）
        });
        let queue = fbQueueRef.current;
        for (const f of failed) queue = fbQueueAdd(queue, f.node, f.id);
        const remaining = await fbFlushQueue(queue, resolveRecord);
        if (cancelled) return;
        setFbQueue(prev => {
          const key = (e) => e.node + '|' + e.id;
          const snapKeys = new Set(queue.map(key));
          const newly = prev.filter(e => !snapKeys.has(key(e)));
          return fbQueueAdd([...remaining, ...newly]);
        });
        setFbStatus('on');
        // connecting 中にキューへ積まれた保存分をここで排出（push は status='on' のみのため）
        flushQueueNow().catch(() => {});
      } catch (e) {
        if (!cancelled) setFbStatus('error'); // 例: /lab ルール未デプロイ → PERMISSION_DENIED。ローカルは無傷
      }
    })();
    return () => {
      cancelled = true;
      if (rosterUnsubRef.current) { rosterUnsubRef.current(); rosterUnsubRef.current = null; }
    };
  }, [fbEnabled]);
  // オンライン復帰 → 未送信キューを自動送信
  useEffect(() => {
    const onOnline = () => {
      if (!fbLinkRef.current.enabled || !fbUid()) return;
      flushQueueNow().then((remaining) => {
        // 全件送信できたときだけ error → on に回復（送信失敗が続くなら error のまま）
        if (remaining && remaining.length === 0 && fbStatusRef.current === 'error') setFbStatus('on');
      }).catch(() => {});
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);
  // 保存経路ごとの push（新規ID・参照変更のみ。削除は同期しない=リモート保持のデータ保全方針）
  useFbPushOnChange('matchCards', matchCards, fbEnabled, fbStatusRef, addToQueue, fbSkipPushRef);
  useFbPushOnChange('gkPredictions', gkPreds, fbEnabled, fbStatusRef, addToQueue, fbSkipPushRef);
  useFbPushOnChange('pvRecords', pvRecords, fbEnabled, fbStatusRef, addToQueue, fbSkipPushRef);
  useFbPushOnChange('tbTasks', tbTasks, fbEnabled, fbStatusRef, addToQueue, fbSkipPushRef);
  // 名簿 → RecordModule 用選手リスト（手入力リストとの和集合。gk_players/pv_players 自体は書き換えない）
  const effGkPlayers = useMemo(() => {
    if (!fbEnabled || !fbRoster.length) return gkPlayers;
    const rp = fbRosterToPlayers(fbRoster);
    const u = (a, b) => [...new Set([...(a || []), ...b])];
    return { keepers: u(gkPlayers.keepers, rp.keepers), shooters: u(gkPlayers.shooters, rp.shooters) };
  }, [fbEnabled, fbRoster, gkPlayers]);
  const effPvPlayers = useMemo(() => {
    if (!fbEnabled || !fbRoster.length) return pvPlayers;
    const rp = fbRosterToPlayers(fbRoster);
    return { pivots: [...new Set([...(pvPlayers.pivots || []), ...rp.pivots])] };
  }, [fbEnabled, fbRoster, pvPlayers]);
  // 名寄せ対象の手入力名（ConnectPanel に渡す）
  const fbManualNames = useMemo(
    () => [...new Set([...(gkPlayers.keepers || []), ...(gkPlayers.shooters || []), ...(pvPlayers.pivots || [])])],
    [gkPlayers, pvPlayers]);
  // 名簿タップ: rosterId をローカル保存し /rosterToUid を【読むだけ】で連携状態を判定（書き込みはしない）
  const handlePickRoster = async (r) => {
    setFbLink(prev => ({ ...prev, rosterId: r.rosterId, rosterName: r.name }));
    setFbNotice(null);
    try {
      const { linkedUid, mine } = await fbCheckRosterLink(r.rosterId);
      if (linkedUid == null) setFbNotice('none');
      else if (mine) { setFbLink(prev => ({ ...prev, mismatch: 0 })); setFbNotice('mine'); }
      else { setFbLink(prev => ({ ...prev, mismatch: 1 })); setFbNotice('mismatch'); }
    } catch (e) {
      setFbNotice('checkfail');
    }
  };

  // 用語集モーダル
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [glossaryHighlight, setGlossaryHighlight] = useState(null); // 強調対象 term
  const [glossaryQuery, setGlossaryQuery] = useState(''); // 用語集内検索

  // 本文中の用語装飾クリックを捕捉 → 用語集モーダルを開いて該当項目までスクロール
  useEffect(() => {
    const handler = (e) => {
      const el = e.target.closest && e.target.closest('.gl-term');
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      const term = el.dataset.term;
      setGlossaryHighlight(term);
      setGlossaryQuery('');
      setGlossaryOpen(true);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // モーダルが開いたら強調行へスクロール
  useEffect(() => {
    if (!glossaryOpen || !glossaryHighlight) return;
    setTimeout(() => {
      const target = document.querySelector(`[data-glossary-key="${CSS.escape(glossaryHighlight)}"]`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }, [glossaryOpen, glossaryHighlight]);

  // オンボーディング
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [onboardStep, setOnboardStep] = useState(0);
  useEffect(() => {
    const seen = lsGet('onboarded');
    if (!seen) setOnboardOpen(true);
  }, []);
  const ONBOARD_STEPS = [
    { icon: '🤾‍♂️', title: 'HANDBALL LAB へようこそ', desc: '近江兄弟社高校ハンドボール部の戦術ガイド。\n「わからない」をその場で解決します。' },
    { icon: '🧭',   title: '7つの使い方', desc: `🤾 振り返る — プレーを自己問答→「次に試すこと」を宣言\n💬 質問 — チャットで聞くと辞書から回答\n📖 辞書 — ${DICT_FILES.length}ファイル${DICT_SECTION_COUNT}セクションを検索\n🎯 課題解決 — ○○できないを3ステップで\n📋 練習 — プラン作成＋課題の自作（🛠ビルダー）\n🧤 GK予測 — シュートコースの読みを記録・照合\n🧲 ピヴォット認知 — DFの見え方→予測→照合` },
    { icon: '📲',   title: 'ホーム画面に追加しよう', desc: 'アプリとして入れておくと体育館（オフライン）でも開けて、記録も消えにくくなります。\n\niPhone：共有ボタン →「ホーム画面に追加」\nAndroid：ブラウザのメニュー →「アプリをインストール」' },
    { icon: '✨',   title: '始めましょう', desc: 'まずは「🤾 振り返る」で最近の1プレーを1つだけ。\n困ったら右下の 📘 用語 をタップ。ヘルプはホームから何度でも開けます。' },
  ];
  const handleOnboardNext = () => {
    if (onboardStep < ONBOARD_STEPS.length - 1) setOnboardStep(onboardStep + 1);
    else handleOnboardFinish();
  };
  const handleOnboardFinish = () => {
    lsSet('onboarded', 1);
    setOnboardOpen(false);
    setOnboardStep(0);
  };
  const handleOnboardOpen = () => {
    setOnboardStep(0);
    setOnboardOpen(true);
  };

  // 「続きから」最終アクセス
  const [resumeData, setResumeData] = useState(null);
  useEffect(() => {
    const stored = lsGet('last-context');
    if (stored) setResumeData(stored);
  }, []);
  const saveResume = (kind, payload) => {
    const r = { kind, payload, ts: Date.now() };
    lsSet('last-context', r);
    setResumeData(r);
  };
  const [pendingResumeDictId, setPendingResumeDictId] = useState(null);
  const handleResume = () => {
    if (!resumeData) return;
    if (resumeData.kind === 'dict' && resumeData.payload?.sectionId) {
      // 辞書セクション復元: 辞書ロード完了後に useEffect で解決
      setPhase('dictionary');
      setPendingResumeDictId(resumeData.payload.sectionId);
    } else if (resumeData.kind === 'solve' && resumeData.payload) {
      setSolveRole(resumeData.payload.role);
      setSolveCategory(resumeData.payload.category);
      setSolveSymptom(resumeData.payload.symptom);
      setPhase('solve');
    } else if (resumeData.kind === 'plan' && resumeData.payload) {
      setPlanThemes(resumeData.payload.themes || []);
      setPlanLevel(resumeData.payload.level || 'mid');
      setPlanDuration(resumeData.payload.duration || 60);
      const p = buildPlan(resumeData.payload.themes || [], resumeData.payload.level || 'mid', resumeData.payload.duration || 60);
      setPlanResult(p);
      setPhase('plan');
    }
  };

  // 辞書お気に入り
  const [dictFavs, setDictFavs] = useState([]); // [section.id, ...]
  useEffect(() => {
    const stored = lsGet('dict-favs');
    if (Array.isArray(stored)) setDictFavs(stored);
  }, []);
  const toggleFav = (sectionId) => {
    setDictFavs(prev => {
      const next = prev.includes(sectionId) ? prev.filter(x => x !== sectionId) : [sectionId, ...prev];
      lsSet('dict-favs', next);
      return next;
    });
  };

  // 起動時に保存済みプランを読み込む
  useEffect(() => {
    const stored = lsGet('plan-saved');
    if (Array.isArray(stored)) setPlanSaved(stored);
  }, []);

  // プランの狙いを自動生成
  const generatePlanAim = (themes, levelId, positionId) => {
    const labels = themes.map(tid => DRILL_THEMES.find(t => t.id === tid)?.label).filter(Boolean);
    if (labels.length === 0) return '';
    const lv = LEVELS.find(l => l.id === levelId)?.label || '';
    const posLabel = positionId && positionId !== 'all'
      ? (POSITIONS.find(p => p.id === positionId)?.label || '') + '特化・'
      : '';
    if (labels.length === 1) return `${posLabel}${labels[0]}の${lv}強化（単一テーマ集中）`;
    if (labels.length === 2) return `${posLabel}${labels[0]}と${labels[1]}の連動強化（${lv}）`;
    return `${posLabel}${labels.slice(0, -1).join('・')}＋${labels[labels.length - 1]}の総合強化（${lv}）`;
  };

  // プラン保存（タグ付き）
  const handlePlanSave = (tag) => {
    if (!planResult) return;
    const entry = {
      themes: planThemes,
      level: planLevel,
      duration: planDuration,
      position: planPosition,
      aim: generatePlanAim(planThemes, planLevel, planPosition),
      tag: tag || null,
      ts: Date.now(),
    };
    setPlanSaved(prev => {
      const next = [entry, ...prev].slice(0, 5);
      lsSet('plan-saved', next);
      return next;
    });
    setPlanCopyMsg(tag ? `「${tag}」として保存しました` : 'プランを保存しました');
    setTimeout(() => setPlanCopyMsg(''), 2000);
  };

  // 保存済みプランを復元
  const handlePlanRestore = (saved) => {
    setPlanThemes(saved.themes);
    setPlanLevel(saved.level);
    setPlanDuration(saved.duration);
    if (saved.position) setPlanPosition(saved.position);
    setPlanResult(buildPlan(saved.themes, saved.level, saved.duration, saved.position || 'all'));
    setTimeout(() => window.scrollTo(0, 0), 0);
  };

  // プランをテキスト形式でクリップボードへコピー
  const handlePlanCopy = () => {
    if (!planResult) return;
    const lv = LEVELS.find(l => l.id === planLevel)?.label || '';
    const posLabel = planPosition !== 'all' ? ` / ${POSITIONS.find(p => p.id === planPosition)?.label || ''}` : '';
    let txt = `【練習プラン】 ${planResult.totalAllocated}分 / ${lv}${posLabel}\n`;
    txt += `狙い: ${generatePlanAim(planThemes, planLevel, planPosition)}\n`;
    txt += `テーマ: ${planThemes.map(tid => DRILL_THEMES.find(t => t.id === tid)?.label).filter(Boolean).join('・')}\n`;
    txt += '\n';
    if (planResult.warmup) txt += `■ ウォームアップ (${planResult.warmup.minutes}分)\n  ${planResult.warmup.desc}\n\n`;
    planResult.blocks.forEach(b => {
      txt += `■ ${b.theme.label} (${b.blockMinutes}分)\n`;
      b.items.forEach(it => {
        const typeLabel = it.drillType === 'skill' ? '[スキル練習]' : it.drillType === 'eco' ? '[エコロジカル]' : '';
        txt += `  ・[${it.minutes}分] ${typeLabel} ${it.title}\n    ${it.desc}\n`;
        if (it.trainingNote) {
          txt += `    🔄 OF/DF表裏一体: ${it.trainingNote}\n`;
        }
        if (it.constraints && it.constraints.length > 0) {
          txt += `    📌 制約:\n`;
          it.constraints.forEach(c => {
            txt += `      - [${c.type}] ${c.text}\n`;
          });
        }
      });
      txt += '\n';
    });
    const tbMyTasks = planMyTasks.map(id => tbTasks.find(t => t.id === id)).filter(Boolean);
    if (tbMyTasks.length) {
      txt += `■ 自作課題 (約${tbMyTasks.length * 15}分)\n`;
      tbMyTasks.forEach(t => {
        txt += `  ・[15分] ${t.name}${(t.version || 1) > 1 ? `（v${t.version}）` : ''}\n    ${TB_CONSTRAINTS.find(c => c.id === t.constraintId)?.name}：${t.constraintDetail}\n    成功の定義: 結果=${t.successResult} / 過程=${t.successProcess}（${t.attempts}本・ペア観察）\n`;
      });
      txt += '\n';
    }
    if (planResult.cooldown) txt += `■ クールダウン (${planResult.cooldown.minutes}分)\n  ${planResult.cooldown.desc}\n`;
    if (planResult.mismatch > 0) txt += `\n※ 余裕時間 ${planResult.mismatch} 分（休憩・追加練習・質疑応答に活用）\n`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(txt).then(() => {
        setPlanCopyMsg('クリップボードにコピーしました');
        setTimeout(() => setPlanCopyMsg(''), 2500);
      }).catch(() => {
        setPlanCopyMsg('コピー失敗');
        setTimeout(() => setPlanCopyMsg(''), 2500);
      });
    } else {
      setPlanCopyMsg('クリップボード非対応');
      setTimeout(() => setPlanCopyMsg(''), 2500);
    }
  };

  // 起動時に履歴をlocalStorageから読み込む
  useEffect(() => {
    const stored = lsGet('solve-history');
    if (Array.isArray(stored)) setSolveHistory(stored);
  }, []);

  // 辞書詳細内のファイル名リンク→対象ファイルの先頭セクションへ遷移
  useEffect(() => {
    const handler = (e) => {
      const fileId = e.detail;
      const target = dictSections.find(s => s.fileId === fileId);
      if (target) {
        // チャット回答内のリンクから来た場合は戻り先をチャットにする
        dictOriginRef.current = phaseRef.current === 'chat' ? 'chat' : 'dictionary';
        setDictDetail(target);
        setPhase('dictionary-detail');
        setTimeout(() => window.scrollTo(0, 0), 0);
      }
    };
    window.addEventListener('dict-jump', handler);
    return () => window.removeEventListener('dict-jump', handler);
  }, [dictSections]);

  // 履歴に追加する
  const addSolveHistory = (role, category, symptom) => {
    const entry = { role, category, symptom, ts: Date.now() };
    setSolveHistory(prev => {
      // 同じ症状の重複は古い方を消す
      const filtered = prev.filter(h => !(h.role === role && h.category === category && h.symptom === symptom));
      const next = [entry, ...filtered].slice(0, 5);
      lsSet('solve-history', next);
      return next;
    });
  };

  // 辞書ロード進捗 (0..N)
  const [dictLoadedCount, setDictLoadedCount] = useState(0);

  // 辞書ファイルを一度だけfetch
  useEffect(() => {
    if (dictLoaded || dictError) return;
    // 辞書は dictionary 系のほか、solve・plan の関連リンク遷移、チャット回答でも使う
    if (phase !== 'hub' && phase !== 'dictionary' && phase !== 'dictionary-detail' && phase !== 'solve' && phase !== 'plan' && phase !== 'chat') return;

    (async () => {
      try {
        const allSections = [];
        let done = 0;
        await Promise.all(DICT_FILES.map(async (f) => {
          try {
            const res = await fetch(`./dictionary/${f.name}`, { cache: 'force-cache' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const md = await res.text();
            const sections = splitSections(md, f);
            allSections.push(...sections);
          } catch (e) {
            console.warn('Failed to load', f.name, e);
          } finally {
            done++;
            setDictLoadedCount(done);
          }
        }));
        // ファイルID順 + セクション順を維持
        allSections.sort((a, b) => {
          if (a.fileId !== b.fileId) return a.fileId.localeCompare(b.fileId);
          return 0;
        });
        setDictSections(allSections);
        setDictLoaded(true);
        // 自動復旧（リロード不要・SW迂回）：読めた辞書セクションが異常に少ない＝壊れたSWが空の.mdを返している。
        // クエリ付き(?fresh=)で取り直すとSWの「.md cache分岐」を外れ、index.html自体と同じ正常経路(network-first)で
        // 取得できる→壊れたSWを迂回してセクションを再構築する。リロードしないので競合・ちらつき・ループが起きない。
        if (allSections.length < 50 && navigator.serviceWorker && navigator.serviceWorker.controller) {
          try {
            const retry = [];
            await Promise.all(DICT_FILES.map(async (f) => {
              try {
                const res = await fetch(`./dictionary/${f.name}?fresh=${Date.now()}`, { cache: 'no-store' });
                if (res.ok) { const md = await res.text(); if (md && md.length > 50) retry.push(...splitSections(md, f)); }
              } catch (e) { /* skip file */ }
            }));
            if (retry.length > allSections.length) {
              // 壊れが確認できた（迂回取得の方が多い）→ セクション差し替え＋壊れたSW/キャッシュを掃除
              retry.sort((a, b) => (a.fileId !== b.fileId ? a.fileId.localeCompare(b.fileId) : 0));
              setDictSections(retry);
              const regs = await navigator.serviceWorker.getRegistrations();
              await Promise.all(regs.map(r => r.unregister()));
              if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }
            }
          } catch (e) { /* 復旧失敗は無視 */ }
        }
      } catch (e) {
        setDictError(String(e));
      }
    })();
  }, [phase, dictLoaded, dictError]);

  // pendingResumeDictId が立っており、辞書が読み込まれたら詳細遷移
  useEffect(() => {
    if (!pendingResumeDictId || !dictLoaded) return;
    const target = dictSections.find(s => s.id === pendingResumeDictId);
    if (target) {
      dictOriginRef.current = 'dictionary';
      setDictDetail(target);
      setPhase('dictionary-detail');
      setTimeout(() => window.scrollTo(0, 0), 0);
    }
    setPendingResumeDictId(null);
  }, [pendingResumeDictId, dictLoaded, dictSections]);

  // 検索＋フィルタ結果（ランキング付き：完全一致 > 前方一致 > 部分一致 > body一致 / 同位は新ファイル優先）
  // セクションが「実質的に空（ファイルタイトル+区切り線だけ）」かを判定
  const isStubSection = (s) => {
    const txt = s.body
      .replace(/^#.*$/gm, '')      // 見出し行
      .replace(/^[-=*]+$/gm, '')   // 区切り線
      .replace(/\s+/g, '');        // 空白
    return txt.length < 30;
  };

  const filteredSections = useMemo(() => {
    if (!dictLoaded) return [];
    const q = dictQuery.trim().toLowerCase();
    const filtered = dictSections.filter(s => {
      // 「冒頭」やファイルタイトルのみのスタブセクションは検索結果から除外
      // （お気に入りや関連リンクで明示的に開く時は別経路）
      if (isStubSection(s)) return false;
      if (dictActiveFileId && s.fileId !== dictActiveFileId) return false;
      if (dictActiveTag && !s.fileTags.includes(dictActiveTag)) return false;
      if (!q) return true;
      return s.title.toLowerCase().includes(q) ||
             s.body.toLowerCase().includes(q) ||
             s.fileTitle.toLowerCase().includes(q);
    });
    if (!q) return filtered;
    // スコア付け：title完全一致=4 / title前方一致=3 / title部分一致=2 / body一致=1
    const score = (s) => {
      const t = s.title.toLowerCase();
      if (t === q) return 4;
      if (t.startsWith(q)) return 3;
      if (t.includes(q)) return 2;
      if (s.body.toLowerCase().includes(q)) return 1;
      return 0;
    };
    return [...filtered].sort((a, b) => {
      const sa = score(a), sb = score(b);
      if (sa !== sb) return sb - sa;
      // 同スコアなら新ファイル(数字大)優先 — 30/31/32 を上位へ
      const fa = parseInt(a.fileId, 10) || 0;
      const fb = parseInt(b.fileId, 10) || 0;
      return fb - fa;
    });
  }, [dictSections, dictQuery, dictActiveTag, dictActiveFileId, dictLoaded]);

  // マークダウン記法を抜粋用にクリーンアップ（ハイフン・パイプは保持）
  const cleanExcerpt = (raw) => {
    return raw
      .replace(/```[\s\S]*?```/g, ' ')          // コードブロック削除
      .replace(/^#{1,6}\s+/gm, '')               // 見出しマーカー
      .replace(/^[->*]\s+/gm, '')                // 箇条書き・引用マーカー
      .replace(/^\|.*\|\s*$/gm, '')              // 表の行
      .replace(/\*\*([^*]+)\*\*/g, '$1')         // 太字
      .replace(/`([^`]+)`/g, '$1')               // インラインコード
      .replace(/\s+/g, ' ')
      .trim();
  };

  // 検索結果から抜粋ハイライト用テキストを取得
  const getExcerpt = (section, q) => {
    if (!q) return cleanExcerpt(section.body.slice(0, 280));
    const lower = section.body.toLowerCase();
    const idx = lower.indexOf(q.toLowerCase());
    if (idx === -1) return cleanExcerpt(section.body.slice(0, 240));
    const start = Math.max(0, idx - 60);
    const end = Math.min(section.body.length, idx + 160);
    let excerpt = cleanExcerpt(section.body.slice(start, end));
    if (start > 0) excerpt = '… ' + excerpt;
    if (end < section.body.length) excerpt = excerpt + ' …';
    return excerpt;
  };

  // ハイライトHTMLに変換
  const highlightExcerpt = (text, q) => {
    if (!q) return text;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'gi');
    return text.replace(re, m => `<mark>${m}</mark>`);
  };

  const progress = getProgress(phase, history.length);
  const modeInfo = mode ? MODES[mode] : null;

  const handleModeSelect = (m) => {
    setMode(m);
    setCurrentQ(MODES[m].firstQ);
    setPhase('question');
  };

  const handleChoice = (i) => setSelected(i);

  const handleNext = () => {
    const q = QUESTIONS[currentQ];
    const choice = q.choices[selected];
    const newHist = [...history, { label: q.label, text: choice.label.split('　')[0] }];
    setHistory(newHist);
    setSelected(null);
    if (RESULTS[choice.next]) {
      setResultId(choice.next);
      setPhase('result');
      recordReflectStart(choice.next, newHist);
    } else if (QUESTIONS[choice.next]) {
      setCurrentQ(choice.next);
    }
  };

  const handleReset = () => {
    if (phase === 'result') commitNextStep();
    // カード起点の連続振り返りでは activeCardIdRef を維持（カードには最新の振り返りが載る）
    setPhase('start'); setMode(null);
    setCurrentQ(null); setSelected(null); setHistory([]);
    setResultId(null); setNextStep('');
  };

  const handleBackToHub = () => {
    if (phase === 'result') commitNextStep();
    setPhase('hub'); setMode(null);
    setCurrentQ(null); setSelected(null); setHistory([]);
    setResultId(null); setNextStep('');
    setDictDetail(null);
    setSolveRole(null); setSolveCategory(null); setSolveSymptom(null);
    setPlanResult(null);
    activeCardIdRef.current = null;
  };

  // Phase 2B：テーマON/OFF切替
  const handleTogglePlanTheme = (themeId) => {
    setPlanThemes(prev => prev.includes(themeId)
      ? prev.filter(t => t !== themeId)
      : [...prev, themeId]);
  };

  // Phase 2B：練習プラン生成
  const handleGeneratePlan = () => {
    if (!planThemes.length) return;
    const plan = buildPlan(planThemes, planLevel, planDuration, planPosition);
    setPlanResult(plan);
    saveResume('plan', { themes: planThemes, level: planLevel, duration: planDuration, position: planPosition, aim: generatePlanAim(planThemes, planLevel, planPosition) });
    setTimeout(() => window.scrollTo(0, 0), 0);
  };

  const handlePlanReset = () => {
    setPlanResult(null);
  };

  // Phase 2B：プラン項目から辞書セクションを開く
  const handlePlanItemOpen = (item) => {
    const target = findRelatedSection({ fileId: item.fileId, match: item.match });
    if (target) {
      setDictDetail(target);
      setPhase('dictionary-detail');
      setTimeout(() => window.scrollTo(0, 0), 0);
    }
  };

  // 関連辞書のマッチ解決：完全一致 → 先頭一致 → 部分一致 → 括弧除去 → body検索
  const findRelatedSection = (related) => {
    const inFile = dictSections.filter(s => s.fileId === related.fileId);
    // 1. 完全一致
    let hit = inFile.find(s => s.title === related.match);
    if (hit) return hit;
    // 2. 先頭一致
    hit = inFile.find(s => s.title.startsWith(related.match));
    if (hit) return hit;
    // 3. 部分一致
    hit = inFile.find(s => s.title.includes(related.match));
    if (hit) return hit;
    // 4. 「A】DF個人...」形式のmatch → 【A】が「A. 」に変換されているため前置詞を除去して再探索
    const stripped = related.match.replace(/^[A-Za-z0-9\-]+】\s*/, '');
    if (stripped !== related.match && stripped.length > 0) {
      hit = inFile.find(s => s.title.includes(stripped));
      if (hit) return hit;
    }
    // 5. body内テキスト部分一致（最終fallback）
    return inFile.find(s => s.body && s.body.includes(related.match)) || null;
  };

  // 課題を解決する：処方箋の「関連辞書」をタップしたとき
  const handleOpenRelated = (related) => {
    const target = findRelatedSection(related);
    if (target) {
      setDictDetail(target);
      setPhase('dictionary-detail');
      setTimeout(() => window.scrollTo(0, 0), 0);
      return;
    }
    // フォールバック：セクション特定に失敗 → 辞書ブラウザ画面でファイル絞り込み＋match文字列検索
    setDictDetail(null);
    setDictQuery(related.match || '');
    setDictActiveTag(null);
    setDictActiveFileId(related.fileId || null);
    setPhase('dictionary');
    setTimeout(() => window.scrollTo(0, 0), 0);
  };

  const handleSolveReset = () => {
    setSolveRole(null); setSolveCategory(null); setSolveSymptom(null); setCriticalPosFilter(null);
  };

  // 振り返りモード → 課題解決カテゴリへの直通マッピング
  const MODE_TO_SOLVE = {
    'of':       { role: 'player', category: 'skill' },
    'skill':    { role: 'player', category: 'skill' },
    'shot_7m':  { role: 'player', category: 'skill' },
    'df':       { role: 'player', category: 'defense' },
    'gk_self':  { role: 'player', category: 'gk' },
    'context':  { role: 'player', category: 'tactics' },
    'sign':     { role: 'player', category: 'tactics' },
    'janken':   { role: 'player', category: 'tactics' },
    'game':     { role: 'player', category: 'game' },
    'physical': { role: 'player', category: 'condition' },
    'gk':       { role: 'player', category: 'skill' },
  };

  // 振り返り結果(result id) → 課題解決の特定症状への直接ジャンプ
  // 新辞書(30/31/32)と連動する精密マッピング
  const RESULT_TO_SYMPTOM = {
    // DF反則細分 → ルールカテゴリの「ファウル分からない」症状
    'r_df_foul_holding':  { role: 'player', category: 'rules', symptom: 'r1' },
    'r_df_foul_pushing':  { role: 'player', category: 'rules', symptom: 'r1' },
    'r_df_foul_hacking':  { role: 'player', category: 'rules', symptom: 'r1' },
    'r_df_foul_tripping': { role: 'player', category: 'rules', symptom: 'r1' },
    'r_df_foul_backhit':  { role: 'player', category: 'rules', symptom: 'r1' },
    'r_df_foul_face':     { role: 'player', category: 'rules', symptom: 'r3' }, // カードシステム
    // GK スローアウト → 試合当日マニュアル + アクセサリー
    'r_gk_self_throw_slow':      { role: 'player', category: 'critical', symptom: 'cgk7' },
    'r_gk_self_throw_schnelle':  { role: 'player', category: 'critical', symptom: 'cgk7' },
    'r_gk_self_throw_miss':      { role: 'player', category: 'critical', symptom: 'cgk7' },
    'r_gk_self_throw_noone':     { role: 'player', category: 'critical', symptom: 'cgk7' },
    // OFシュート不調 → 批判的思考のシュート診断
    'r_of_shoot_off':            { role: 'player', category: 'critical', symptom: 'cof2' },
    'r_of_shoot_gk_anticip':     { role: 'player', category: 'critical', symptom: 'cgk1' },
    'r_of_shoot_gk_position':    { role: 'player', category: 'critical', symptom: 'cgk1' },
    // OFフェイント関連 → 批判的思考の「フェイント7種使えない」
    'r_of_feint_df_read':        { role: 'player', category: 'critical', symptom: 'csb2' },
    'r_of_feint_df_self':        { role: 'player', category: 'critical', symptom: 'csb2' },
    'r_of_feint_gk_seen':        { role: 'player', category: 'critical', symptom: 'csb2' },
    // OFピボット失敗 → 批判的思考の「ピボットコンビ失敗」
    'r_of_post_pivot_blocked':   { role: 'player', category: 'critical', symptom: 'csb3' },
    'r_of_post_pivot_choice':    { role: 'player', category: 'critical', symptom: 'cpv1' },
    // DF コンタクト失敗 → 批判的思考のフェイント反応
    'r_df_contact_lose':         { role: 'player', category: 'critical', symptom: 'cdf2' },
    'r_df_contact_high':         { role: 'player', category: 'critical', symptom: 'cdf2' },
    'r_df_contact_arm':          { role: 'player', category: 'rules', symptom: 'r1' },
  };

  // 履歴から再診断
  const handleSolveFromHistory = (h) => {
    setSolveRole(h.role); setSolveCategory(h.category); setSolveSymptom(h.symptom);
  };

  // 「該当なし」→ 辞書ブラウザへ自由検索
  const handleSolveToDict = (preset) => {
    setDictDetail(null);
    setDictQuery(preset || '');
    setDictActiveTag(null);
    setPhase('dictionary');
  };

  const handleHubSelect = (modId) => {
    const mod = HUB_MODULES.find(m => m.id === modId);
    if (!mod || !mod.enabled) return;
    if (modId === 'reflect') { activeCardIdRef.current = null; setPhase('start'); }
    else if (modId === 'chat') setPhase('chat');
    else if (modId === 'dictionary') {
      setDictDetail(null);
      setPhase('dictionary');
    }
    else if (modId === 'solve') {
      handleSolveReset();
      setPhase('solve');
    }
    else if (modId === 'plan') {
      setPlanResult(null);
      setPhase('plan');
    }
    else if (modId === 'gk') {
      setGkView({ name: 'home' });
      setPhase('gk');
    }
    else if (modId === 'pv') {
      setPvView({ name: 'home' });
      setPhase('pv');
    }
    else if (modId === 'playbook') setPhase('playbook');
  };

  // 辞書一覧→詳細遷移時に一覧側のスクロール位置を覚えておく
  const dictListScrollRef = useRef(0);
  const handleDictSectionOpen = (section) => {
    dictListScrollRef.current = window.scrollY;
    dictOriginRef.current = 'dictionary';
    setDictDetail(section);
    setPhase('dictionary-detail');
    saveResume('dict', { sectionId: section.id, title: section.title, fileTitle: section.fileTitle });
    // スクロール位置を一番上にリセット
    setTimeout(() => window.scrollTo(0, 0), 0);
  };

  const handleDictBack = () => {
    setDictDetail(null);
    // チャットから開いた詳細はチャットへ戻す
    if (dictOriginRef.current === 'chat') {
      dictOriginRef.current = 'dictionary';
      setPhase('chat');
      setTimeout(() => {
        if (chatEndRef.current) chatEndRef.current.scrollIntoView({ block: 'end' });
      }, 0);
      return;
    }
    setPhase('dictionary');
    // 一覧側に戻ったら覚えていたスクロール位置を復元
    const y = dictListScrollRef.current;
    setTimeout(() => window.scrollTo(0, y), 0);
  };

  // ── 質問チャットのハンドラ ──
  const handleChatSend = (preset) => {
    const text = (typeof preset === 'string' ? preset : chatInput).trim();
    if (!text || !dictLoaded || chatTyping) return;
    setChatInput('');
    setChatMessages(prev => saveChatHistory([...prev, { role: 'user', text, ts: Date.now() }]));
    setChatTyping(true);
    setTimeout(() => {
      let reply;
      try {
        reply = buildChatReply(text, dictSections);
      } catch (e) {
        console.warn('chat reply failed', e);
        reply = { role: 'bot', kind: 'nokw', text: 'エラーが起きました。別の聞き方で試してみてください。', chips: CHAT_SUGGESTIONS, ts: Date.now() };
      }
      setChatMessages(prev => saveChatHistory([...prev, reply]));
      setChatTyping(false);
    }, 450);
  };

  const handleChatClear = () => {
    setChatMessages(saveChatHistory([]));
  };

  // チャットの出典カード → 辞書詳細（戻るとチャットに復帰）
  const handleChatOpenSection = (sectionId) => {
    const target = dictSections.find(s => s.id === sectionId);
    if (!target) return;
    dictOriginRef.current = 'chat';
    setDictDetail(target);
    setPhase('dictionary-detail');
    saveResume('dict', { sectionId: target.id, title: target.title, fileTitle: target.fileTitle });
    setTimeout(() => window.scrollTo(0, 0), 0);
  };

  // 新着メッセージ・入力中表示で最下部へスクロール
  useEffect(() => {
    if (phase !== 'chat') return;
    const t = setTimeout(() => {
      if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 60);
    return () => clearTimeout(t);
  }, [chatMessages.length, chatTyping, phase]);

  // 国別深掘り：現在のmodeから「じゃんけん→国別逆引き」へジャンプ
  const handleJumpToCountry = () => {
    setMode('janken');
    setCurrentQ('qj_school');
    setSelected(null);
    setHistory([]);
    setResultId(null);
    setNextStep('');
    setPhase('question');
  };

  const result = resultId ? RESULTS[resultId] : null;
  const q = currentQ ? QUESTIONS[currentQ] : null;

  return (
    <div className="app">
      <div className="header">
        <div className="header-row">
          <div className="header-brand">
            <div className="header-brand-main">
              {phase === 'hub' && 'HANDBALL LAB'}
              {(phase === 'dictionary' || phase === 'dictionary-detail') && '辞書を読む'}
              {phase === 'solve' && '課題を解決する'}
              {phase === 'plan' && '練習を組む'}
              {phase === 'build' && '課題を自作する'}
              {phase === 'gk' && 'GK予測'}
              {phase === 'pv' && 'ピヴォット認知'}
              {phase === 'chat' && '質問する'}
              {phase === 'yomi' && '読みを宣言する'}
              {phase === 'card' && '5分振り返り'}
              {phase === 'playbook' && 'マイ・プレイブック'}
              {(phase === 'start' || phase === 'question' || phase === 'result') && '振り返る'}
            </div>
            <div className="header-brand-sub">
              {phase === 'hub' && ''}
              {(phase === 'dictionary' || phase === 'dictionary-detail') && 'Dictionary'}
              {phase === 'solve' && 'Symptom Diagnosis'}
              {phase === 'plan' && 'Practice Planner'}
              {phase === 'build' && 'Task Builder'}
              {phase === 'gk' && 'GK Prediction'}
              {phase === 'pv' && 'Pivot Cognition'}
              {phase === 'chat' && 'Dictionary Chat'}
              {phase === 'yomi' && 'Yomi Declaration'}
              {phase === 'card' && 'Match Card'}
              {phase === 'playbook' && 'My Playbook'}
              {(phase === 'start' || phase === 'question' || phase === 'result') && 'Self Q&A'}
            </div>
          </div>
          {modeInfo && (
            <div className="header-mode" style={{ color: modeInfo.color, borderColor: modeInfo.color + '66' }}>
              {modeInfo.label}
            </div>
          )}
          {(phase === 'dictionary' || phase === 'dictionary-detail') && (
            <div className="header-mode" style={{ color: 'var(--c-dict)', borderColor: 'color-mix(in oklab, var(--c-dict) 40%, transparent)' }}>
              辞書
            </div>
          )}
          {phase === 'solve' && (
            <div className="header-mode" style={{ color: 'var(--c-solve)', borderColor: 'color-mix(in oklab, var(--c-solve) 40%, transparent)' }}>
              課題解決
            </div>
          )}
          {phase === 'plan' && (
            <div className="header-mode" style={{ color: 'var(--c-plan)', borderColor: 'color-mix(in oklab, var(--c-plan) 40%, transparent)' }}>
              計画
            </div>
          )}
          {phase === 'build' && (
            <div className="header-mode" style={{ color: '#34d399', borderColor: 'rgba(52,211,153,0.4)' }}>
              自作
            </div>
          )}
          {phase === 'gk' && (
            <div className="header-mode" style={{ color: '#5eead4', borderColor: 'rgba(45,212,191,0.4)' }}>
              予測
            </div>
          )}
          {phase === 'pv' && (
            <div className="header-mode" style={{ color: '#fda4af', borderColor: 'rgba(251,113,133,0.4)' }}>
              認知
            </div>
          )}
          {phase === 'chat' && (
            <div className="header-mode" style={{ color: 'var(--c-chat)', borderColor: 'color-mix(in oklab, var(--c-chat) 40%, transparent)' }}>
              質問
            </div>
          )}
        </div>
        <div className={`progress-bar ${phase === 'hub' || phase === 'dictionary' || phase === 'dictionary-detail' || phase === 'solve' || phase === 'plan' || phase === 'build' || phase === 'chat' || phase === 'gk' || phase === 'pv' ? 'hidden' : ''}`}>
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* 保存失敗の警告バナー */}
      {storageError && (
        <div className="storage-warn" onClick={() => setStorageError(false)}>
          ⚠ 記録の保存に失敗しています（空き容量不足やプライベートブラウズの可能性）。この端末では記録が残らないおそれがあります。ホームの「💾 データの書き出し」で控えを取ってください。（タップで閉じる）
        </div>
      )}

      {/* ハブ画面（最初の入口） */}
      {phase === 'hub' && (
        <LoopHome
          loopState={loopState}
          onSetNextMatch={(nm) => setLoopState(prev => ({ ...prev, nextMatch: nm }))}
          declaration={declaration} decSnooze={decSnooze}
          onAnswerDeclaration={answerDeclaration} onSnooze={() => setDecSnooze(true)}
          reflectCount={matchCards.length}
          onAction={(p) => {
            if (p === 'predict') setPhase('yomi');
            else if (p === 'verify') setPhase('card');
            else { setTbView({ name: 'home' }); setPhase('build'); }
          }}
        >
          <div className="hub-cards">
            {HUB_MODULES.map(mod => (
              <button
                key={mod.id}
                className={`hub-card ${mod.cls} ${mod.enabled ? '' : 'disabled'}`}
                onClick={() => handleHubSelect(mod.id)}
                disabled={!mod.enabled}
                aria-label={`${mod.title}（${mod.target}）：${mod.desc}`}
              >
                <div className="hub-card-icon" aria-hidden="true">{mod.icon}</div>
                <div className="hub-card-body">
                  <div className="hub-card-target">{mod.target}</div>
                  <div className="hub-card-title">{mod.title}</div>
                  <div className="hub-card-desc">{mod.desc}</div>
                </div>
                {mod.enabled && <div className="hub-card-arrow" aria-hidden="true">›</div>}
                {!mod.enabled && <div className="hub-card-soon">Soon</div>}
              </button>
            ))}
          </div>
          <div className="loop-ref-row">
            <div className="loop-ref-label">📖 リファレンス（逆引き）</div>
            {REFERENCE_MODES.map(key => (
              <button key={key} className="loop-ref-btn" onClick={() => handleModeSelect(key)}>
                {MODES[key].icon} {MODES[key].label}
              </button>
            ))}
          </div>
          <button
            className="help-btn"
            style={{marginTop: 12}}
            onClick={handleOnboardOpen}
          >🌱 初めての方はこちら</button>
          <button
            className="help-btn"
            style={{marginTop: 8}}
            onClick={() => setConnectOpen(true)}
          >{fbLink.enabled
            ? `🔗 接続中：${fbLink.rosterName || '名前未選択'}（記録は自動保存）`
            : '🔗 チームと繋ぐ（記録をクラウドに保存）'}</button>
          <button
            className="help-btn"
            style={{marginTop: 8}}
            onClick={() => setBackupOpen(true)}
          >💾 データの書き出し / 取り込み</button>
        </LoopHome>
      )}

      {phase === 'yomi' && (() => {
        const targetDate = loopState.nextMatch?.date;
        const existing = matchCards.find(c => !c.reflect && targetDate && c.date === targetDate);
        const target = existing
          || newMatchCard({ date: targetDate, kind: loopState.nextMatch ? 'match' : 'scrimmage', opponent: loopState.nextMatch?.opponent });
        return <YomiWizard card={target} onExit={handleBackToHub}
          onSave={(c) => { upsertCard(c); setPhase('hub'); }} />;
      })()}

      {phase === 'card' && (
        <CardFlow cards={matchCards} nextMatch={loopState.nextMatch}
          resumeCardId={activeCardIdRef.current}
          onUpsert={upsertCard} onExit={handleBackToHub}
          onStartReflect={(c) => { activeCardIdRef.current = c.id; setPhase('start'); }}
          onPickIssue={(c) => {
            const sym = c.reflect && RESULT_TO_SYMPTOM[c.reflect.resultId];
            const mm = c.reflect && MODE_TO_SOLVE[c.reflect.mode];
            if (sym) { setSolveRole(sym.role); setSolveCategory(sym.category); setSolveSymptom(sym.symptom); }
            else if (mm) { setSolveRole(mm.role); setSolveCategory(mm.category); setSolveSymptom(null); }
            else { handleSolveReset(); }
            setPhase('solve');
          }} />
      )}

      {/* オンボーディングモーダル */}
      {onboardOpen && (() => {
        const step = ONBOARD_STEPS[onboardStep];
        const isLast = onboardStep === ONBOARD_STEPS.length - 1;
        return (
          <div className="onboard-overlay">
            <div className="onboard-card">
              <div className="onboard-step-dots">
                {ONBOARD_STEPS.map((_, i) => (
                  <span key={i} className={`onboard-step-dot ${i === onboardStep ? 'active' : ''}`}></span>
                ))}
              </div>
              <div className="onboard-icon">{step.icon}</div>
              <div className="onboard-title">{step.title}</div>
              <div className="onboard-desc" style={{whiteSpace: 'pre-line'}}>{step.desc}</div>
              <div className="onboard-actions">
                {onboardStep > 0 && (
                  <button className="onboard-btn" onClick={() => setOnboardStep(onboardStep - 1)}>← 戻る</button>
                )}
                <button className="onboard-btn primary" onClick={handleOnboardNext}>
                  {isLast ? '✓ はじめる' : '次へ →'}
                </button>
              </div>
              {!isLast && (
                <button className="onboard-skip" onClick={handleOnboardFinish}>スキップ</button>
              )}
            </div>
          </div>
        );
      })()}

      {/* データバックアップモーダル */}
      {backupOpen && (
        <div className="onboard-overlay">
          <div className="onboard-card">
            <div className="onboard-title">💾 データの書き出し / 取り込み</div>
            <div className="onboard-desc" style={{textAlign: 'left', whiteSpace: 'pre-line'}}>
              アプリ内の全記録（GK予測・ピヴォット認知・自作課題・振り返り・保存プラン・お気に入り等）をテキスト1つで持ち運べます。{'\n'}
              書き出し → LINEのKeep等に保管（端末故障へのバックアップ）。{'\n'}
              取り込み → 別端末で記録したテキストを貼り付けて合流（記録ID単位で追加・重複はスキップ）。
            </div>
            <button className="tb-next-btn" onClick={handleBackupExport}>📤 全データを書き出す（コピー）</button>
            <div className="tb-field" style={{marginTop: 12}}>
              <div className="tb-field-label">取り込み（書き出したテキストを貼り付け）</div>
              <textarea value={backupText} onChange={e => setBackupText(e.target.value)} placeholder='{"app":"handball-lab-backup", ...}' />
            </div>
            <button className="tb-ghost-btn" style={{marginTop: 8}} onClick={handleBackupImport} disabled={!backupText.trim()}>📥 取り込む（重複スキップ）</button>
            {backupMsg && <div className="tb-q-hint" style={{marginTop: 8}}>{backupMsg}</div>}
            <div className="onboard-actions">
              <button className="onboard-btn" onClick={() => { setBackupOpen(false); setBackupMsg(''); setBackupText(''); }}>閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* チームと繋ぐ（Phase 3）モーダル */}
      {connectOpen && (
        <React.Suspense fallback={null}>
        <ConnectPanel
          fbLink={fbLink} fbStatus={fbStatus} fbRoster={fbRoster} fbQueue={fbQueue}
          notice={fbNotice} manualNames={fbManualNames} nameMap={fbNameMap}
          onConnect={() => { setFbNotice(null); setFbLink(prev => ({ ...prev, enabled: 1 })); }}
          onDisconnect={() => { setFbNotice(null); setFbLink(prev => ({ ...prev, enabled: 0 })); }}
          onPickRoster={handlePickRoster}
          onMapName={(name, val) => setFbNameMap(prev => ({ ...prev, [name]: val }))}
          onClose={() => setConnectOpen(false)}
        />
        </React.Suspense>
      )}

      {/* 辞書ブラウザ（一覧・検索） */}
      {phase === 'dictionary' && (
        <div className="dict-screen">
          <div className="dict-bar">
            <button className="dict-back" onClick={handleBackToHub}>← 戻る（ホーム）</button>
            <div className="dict-search-wrap">
              <input
                type="search"
                inputMode="search"
                enterKeyHint="search"
                className="dict-search-input"
                placeholder="キーワードで検索（例: クローズ、5-1、フェイント）"
                value={dictQuery}
                onChange={e => setDictQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
              />
            </div>
          </div>
          <div className="dict-tags-wrap">
            {/* ファイル絞り込み（L1 対応：辞書ファイル単位フィルタ） */}
            <select
              className="dict-file-filter"
              value={dictActiveFileId || ''}
              onChange={e => setDictActiveFileId(e.target.value || null)}
              style={{
                background: 'rgba(34,211,238,0.08)',
                border: '1px solid rgba(34,211,238,0.3)',
                color: 'var(--fg)',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: 'var(--fs-sm)',
                marginBottom: '8px',
                width: '100%',
              }}
            >
              <option value="">📁 ファイル絞り込み：すべて表示</option>
              {DICT_FILES.map(f => (
                <option key={f.id} value={f.id}>{f.icon} {f.id} / {f.title}</option>
              ))}
            </select>
            <div className={`dict-tags ${dictTagsExpanded ? 'expanded' : ''}`}>
              <button
                className={`dict-tag ${dictActiveTag === null ? 'active' : ''}`}
                onClick={() => setDictActiveTag(null)}
              >すべて</button>
              {ALL_TAGS.map(tag => (
                <button
                  key={tag}
                  className={`dict-tag ${dictActiveTag === tag ? 'active' : ''}`}
                  onClick={() => setDictActiveTag(dictActiveTag === tag ? null : tag)}
                >{tag}</button>
              ))}
              <button
                className="dict-tags-toggle"
                onClick={() => setDictTagsExpanded(v => !v)}
              >{dictTagsExpanded ? '× 折りたたむ' : '＋ 全タグ表示'}</button>
            </div>
          </div>
          <div className="dict-results">
            {!dictLoaded && !dictError && (
              <div className="dict-loading">📖 辞書を読み込み中… ({dictLoadedCount} / {DICT_FILES.length})</div>
            )}
            {dictError && (
              <div className="dict-empty">読み込みエラー：{dictError}<br /><br />ローカルで開いている場合、CORS制限でfetchが失敗することがあります。GitHub Pages 上で動作確認してください。</div>
            )}
            {dictLoaded && (
              <>
                {/* お気に入りセクション（フィルタに関わらず常時表示。検索中のみ非表示） */}
                {dictFavs.length > 0 && !dictQuery && (() => {
                  const favSections = dictFavs.map(fid => dictSections.find(s => s.id === fid)).filter(Boolean);
                  if (favSections.length === 0) return null;
                  return (
                    <div style={{marginBottom: 12}}>
                      <div className="dict-meta-line" style={{color: '#fbbf24'}}>★ お気に入り（{favSections.length}）</div>
                      {favSections.map(s => (
                        <div key={s.id} className="dict-result-card" onClick={() => handleDictSectionOpen(s)} style={{borderColor: 'rgba(251, 191, 36, 0.4)'}}>
                          <div className="dict-result-filename">{s.fileIcon} {s.fileTitle}（{s.fileId}）</div>
                          <div className="dict-result-section">{s.title}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* デフォルトビュー：ファイルカード一覧（検索・フィルターなし時） */}
                {!dictQuery && !dictActiveFileId && !dictActiveTag && (
                  <div className="dict-file-grid">
                    {DICT_FILES.map(f => {
                      const count = dictSections.filter(s => s.fileId === f.id && !isStubSection(s)).length;
                      return (
                        <div key={f.id} className="dict-file-card" onClick={() => setDictActiveFileId(f.id)}>
                          <div className="dict-file-card-icon">{f.icon}</div>
                          <div className="dict-file-card-body">
                            <div className="dict-file-card-title">{f.title}</div>
                            <div className="dict-file-card-meta">{f.id} · {count} セクション</div>
                          </div>
                          <div className="dict-file-card-arrow">›</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 検索・フィルター結果ビュー */}
                {(dictQuery || dictActiveFileId || dictActiveTag) && (
                  <>
                    {/* ファイル選択中のヘッダーバー */}
                    {dictActiveFileId && !dictQuery && (() => {
                      const f = DICT_FILES.find(f => f.id === dictActiveFileId);
                      return f ? (
                        <div className="dict-file-header-bar">
                          <span className="dict-file-header-icon">{f.icon}</span>
                          <span className="dict-file-header-title">{f.title}</span>
                          <button className="dict-file-back-btn" onClick={() => setDictActiveFileId(null)}>← ファイル一覧</button>
                        </div>
                      ) : null;
                    })()}
                    <div className="dict-meta-line">
                      {filteredSections.length} 件のセクション
                      {dictQuery && ` ／ 検索: "${dictQuery}"`}
                      {dictActiveTag && ` ／ タグ: ${dictActiveTag}`}
                    </div>
                    {filteredSections.length === 0 && (
                      <div className="dict-empty">
                        該当するセクションがありません。<br />キーワードやタグを変えてみてください。
                        {(dictQuery || dictActiveTag || dictActiveFileId) && (
                          <div style={{marginTop: 12}}>
                            <button
                              className="dict-back"
                              style={{background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.4)', color: '#67e8f9', padding: '8px 16px', borderRadius: 8}}
                              onClick={() => { setDictQuery(''); setDictActiveTag(null); setDictActiveFileId(null); }}
                            >× 検索・絞り込みを全部クリア</button>
                          </div>
                        )}
                      </div>
                    )}
                    {filteredSections.map(s => {
                      const excerpt = getExcerpt(s, dictQuery);
                      const highlighted = highlightExcerpt(excerpt, dictQuery);
                      return (
                        <div key={s.id} className="dict-result-card" onClick={() => handleDictSectionOpen(s)}>
                          <div className="dict-result-filename">{s.fileIcon} {s.fileTitle}（{s.fileId}）</div>
                          <div className="dict-result-section">{s.title}</div>
                          <div className="dict-result-excerpt" dangerouslySetInnerHTML={{__html: highlighted}} />
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 辞書セクションの詳細 */}
      {phase === 'dictionary-detail' && dictDetail && (
        <div className="dict-screen">
          <div className="dict-detail-header">
            <button className="dict-back" onClick={handleDictBack}>{dictOriginRef.current === 'chat' ? '← 戻る（質問チャット）' : '← 戻る（辞書一覧）'}</button>
            <div className="dict-detail-file">{dictDetail.fileIcon} {dictDetail.fileTitle}（{dictDetail.fileId}）</div>
            <div className="dict-detail-title">{dictDetail.title}</div>
            <div className="dict-detail-tags" style={{justifyContent: 'space-between', alignItems: 'center'}}>
              <div style={{display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1}}>
                {dictDetail.fileTags.map(t => (
                  <span key={t} className="dict-detail-tag">{t}</span>
                ))}
              </div>
              <button
                className={`fav-btn ${dictFavs.includes(dictDetail.id) ? 'active' : ''}`}
                onClick={() => toggleFav(dictDetail.id)}
              >
                {dictFavs.includes(dictDetail.id) ? '★ お気に入り済み' : '☆ お気に入り'}
              </button>
            </div>
          </div>
          {dictQuery && (() => {
            // 詳細本文中のマッチ数 / 次のマッチへジャンプ
            const re = new RegExp(dictQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            const matchCount = (dictDetail.body.match(re) || []).length;
            if (matchCount === 0) return null;
            const jumpNext = () => {
              const marks = [...document.querySelectorAll('.dict-detail-body mark.search-hit')];
              if (!marks.length) return;
              const curIdx = marks.findIndex(m => m.classList.contains('current'));
              const nextIdx = (curIdx + 1) % marks.length;
              marks.forEach(m => m.classList.remove('current'));
              marks[nextIdx].classList.add('current');
              marks[nextIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
            };
            return (
              <div className="search-jump-bar" role="status">
                <span>🔍 「{dictQuery}」が {matchCount} 件</span>
                <button className="search-jump-btn" onClick={jumpNext}>↓ 次へ</button>
              </div>
            );
          })()}
          <div className="dict-detail-body" dangerouslySetInnerHTML={{__html: renderMarkdown(dictDetail.body, dictQuery)}} />
          {/* 同じファイルの他セクション */}
          {(() => {
            const related = dictSections.filter(s => s.fileId === dictDetail.fileId && s.id !== dictDetail.id).slice(0, 8);
            if (!related.length) return null;
            return (
              <div className="dict-detail-related" style={{padding: '0 18px 24px'}}>
                <div className="dict-detail-related-label">▶ 同じファイルの他セクション</div>
                {related.map(s => (
                  <div key={s.id} className="dict-related-item" onClick={() => handleDictSectionOpen(s)}>
                    {s.title}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* 質問チャット（辞書ボット） */}
      {phase === 'chat' && (
        <div className="chat-screen animate-in">
          <div className="chat-topbar">
            <button className="dict-back" onClick={handleBackToHub}>← 戻る（ホーム）</button>
            {chatMessages.length > 0 && (
              <button className="chat-clear" onClick={handleChatClear}>🗑 履歴クリア</button>
            )}
          </div>
          <div className="chat-note">📖 辞書{DICT_FILES.length}ファイル・{dictLoaded ? dictSections.length : DICT_SECTION_COUNT}セクションから探して回答します（検索は端末内。一度開けば2回目以降はオフラインでも使えます）</div>
          {!dictLoaded && !dictError && (
            <div className="dict-loading">📖 辞書を読み込み中… ({dictLoadedCount} / {DICT_FILES.length})</div>
          )}
          {dictError && (
            <div className="dict-empty">読み込みエラー：{dictError}</div>
          )}
          <div className="chat-messages">
            {chatMessages.length === 0 && (
              <div className="chat-msg bot">
                <div className="chat-avatar" aria-hidden="true">📖</div>
                <div className="chat-bubble bot">
                  <div className="chat-text">{'こんにちは！辞書チャットです。\n質問を入力すると、戦術辞書から該当する内容を探して答えます。たとえば👇'}</div>
                  <div className="chat-chips">
                    {CHAT_SUGGESTIONS.map(c => (
                      <button key={c} className="chat-chip" onClick={() => handleChatSend(c)} disabled={!dictLoaded}>{c}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {chatMessages.map((m, i) => m.role === 'user' ? (
              <div key={i} className="chat-msg user">
                <div className="chat-bubble user"><div className="chat-text">{m.text}</div></div>
              </div>
            ) : (
              <div key={i} className="chat-msg bot">
                <div className="chat-avatar" aria-hidden="true">📖</div>
                <div className="chat-bubble bot">
                  {m.kind === 'answer' ? (
                    <React.Fragment>
                      <button className="chat-src-head" onClick={() => handleChatOpenSection(m.head.id)}>
                        <span className="chat-src-head-file">{m.head.icon} {m.head.fileTitle}（{m.head.id.split('-')[0]}）</span>
                        <span className="chat-src-head-title">{m.head.title}</span>
                      </button>
                      <div className="chat-md" dangerouslySetInnerHTML={{ __html: m.html }} />
                      <button className="chat-readmore" onClick={() => handleChatOpenSection(m.head.id)}>📖 全文を読む</button>
                      {m.srcs && m.srcs.length > 0 && (
                        <div className="chat-srcs">
                          <div className="chat-srcs-label">関連セクション</div>
                          {m.srcs.map(s => (
                            <button key={s.id} className="chat-src-card" onClick={() => handleChatOpenSection(s.id)}>
                              <span aria-hidden="true">{s.icon}</span>
                              <span className="chat-src-card-text">
                                <span className="chat-src-card-file">{s.fileTitle}</span>
                                <span className="chat-src-card-title">{s.title}</span>
                              </span>
                              <span className="chat-src-card-arrow" aria-hidden="true">›</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </React.Fragment>
                  ) : (
                    <React.Fragment>
                      <div className="chat-text">{m.text}</div>
                      {m.chips && (
                        <div className="chat-chips">
                          {m.chips.map(c => (
                            <button key={c} className="chat-chip" onClick={() => handleChatSend(c)}>{c}</button>
                          ))}
                        </div>
                      )}
                    </React.Fragment>
                  )}
                </div>
              </div>
            ))}
            {chatTyping && (
              <div className="chat-msg bot">
                <div className="chat-avatar" aria-hidden="true">📖</div>
                <div className="chat-bubble bot chat-typing">
                  <span className="chat-dot"/><span className="chat-dot"/><span className="chat-dot"/>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-input-bar">
            <input
              type="text"
              className="chat-input"
              enterKeyHint="send"
              placeholder={dictLoaded ? '質問を入力（例：5-1の攻略は？）' : '辞書を読み込み中…'}
              value={chatInput}
              disabled={!dictLoaded}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); handleChatSend(); }
              }}
            />
            <button
              className="chat-send"
              onClick={() => handleChatSend()}
              disabled={!dictLoaded || !chatInput.trim() || chatTyping}
              aria-label="送信"
            >➤</button>
          </div>
        </div>
      )}

      {/* 課題を解決する（Phase 2A） */}
      {phase === 'solve' && (() => {
        const roleData = solveRole ? SOLVE_DATA[solveRole] : null;
        const catData = roleData && solveCategory
          ? roleData.categories.find(c => c.id === solveCategory) : null;
        // solveSymptom は通常 string id だが、稀に object/古い ID が来ることへの防御
        let symData = null;
        if (catData && solveSymptom) {
          const symId = typeof solveSymptom === 'string' ? solveSymptom : (solveSymptom?.id || null);
          symData = symId ? catData.symptoms.find(s => s.id === symId) : null;
        }
        // 整合性破れ：solveSymptom があるのに symData が無い→state リセット
        if (solveSymptom && catData && !symData) {
          // 次の再描画で症状リストに戻す
          setTimeout(() => setSolveSymptom(null), 0);
          return <div className="solve-screen"><div className="solve-loading">読み込み中…</div></div>;
        }
        // 整合性破れ：solveCategory があるのに catData が無い（旧データ等）→state リセット
        if (solveCategory && roleData && !catData) {
          setTimeout(() => { setSolveCategory(null); setSolveSymptom(null); }, 0);
          return <div className="solve-screen"><div className="solve-loading">読み込み中…</div></div>;
        }
        // 整合性破れ：solveRole があるのに roleData が無い→state リセット
        if (solveRole && !roleData) {
          setTimeout(() => { setSolveRole(null); setSolveCategory(null); setSolveSymptom(null); }, 0);
          return <div className="solve-screen"><div className="solve-loading">読み込み中…</div></div>;
        }

        // ステップ1：役割選択
        if (!solveRole) {
          // 履歴のフォーマット
          const fmtTime = (ts) => {
            const d = new Date(ts); const now = new Date();
            const diff = (now - d) / 1000;
            if (diff < 60) return 'いま';
            if (diff < 3600) return Math.floor(diff/60) + '分前';
            if (diff < 86400) return Math.floor(diff/3600) + '時間前';
            return Math.floor(diff/86400) + '日前';
          };
          return (
            <div className="solve-screen">
              <button className="dict-back" onClick={handleBackToHub}>← 戻る（ホーム）</button>
              <div className="solve-bar">
                <span className="solve-step-pill">STEP 1 / 3</span>
                <span className="solve-step-label">どの立場で相談</span>
              </div>
              <div className="step-dots">
                <span className="step-dot current"></span>
                <span className="step-bar"></span>
                <span className="step-dot"></span>
                <span className="step-bar"></span>
                <span className="step-dot"></span>
              </div>
              <div className="solve-title">あなたは？</div>
              <div className="solve-sub">立場に合わせて症状リストが変わります。</div>
              <div className="solve-role-grid">
                {Object.entries(SOLVE_DATA).map(([role, data]) => (
                  <button key={role} className="solve-role-btn" onClick={() => setSolveRole(role)}>
                    <span className="solve-role-icon">{data.icon}</span>
                    <span className="solve-role-label">{data.label}</span>
                  </button>
                ))}
              </div>

              {/* 最近の診断履歴 */}
              {solveHistory.length > 0 && (
                <div className="solve-history">
                  <div className="solve-history-label">▶ 最近の診断</div>
                  {solveHistory.slice(0, 3).map((h, i) => {
                    const roleData = SOLVE_DATA[h.role];
                    const catData = roleData?.categories.find(c => c.id === h.category);
                    const symData = catData?.symptoms.find(s => s.id === h.symptom);
                    if (!symData) return null;
                    return (
                      <div key={i} className="solve-history-item" onClick={() => handleSolveFromHistory(h)}>
                        <span style={{fontSize: 16}}>{catData.icon}</span>
                        <div className="solve-history-meta">
                          <div>{symData.title}</div>
                          <div className="solve-history-time">{roleData.icon} {fmtTime(h.ts)}</div>
                        </div>
                        <span style={{color: '#475569'}}>›</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        // ステップ2：カテゴリ選択
        if (!solveCategory) {
          return (
            <div className="solve-screen">
              <button className="dict-back" onClick={() => setSolveRole(null)}>← 戻る（立場の選び直し）</button>
              <div className="solve-bar">
                <span className="solve-step-pill">STEP 2 / 3</span>
                <span className="solve-step-label">どんな種類の困りごと</span>
              </div>
              <div className="step-dots">
                <span className="step-dot done"></span>
                <span className="step-bar done"></span>
                <span className="step-dot current"></span>
                <span className="step-bar"></span>
                <span className="step-dot"></span>
              </div>
              <div className="solve-title">どこで困っている？</div>
              <div className="solve-sub">{roleData.label}</div>
              <div className="solve-cat-list">
                {roleData.categories.map(c => (
                  <button key={c.id} className="solve-cat-btn" onClick={() => setSolveCategory(c.id)}>
                    <span className="solve-cat-icon">{c.icon}</span>
                    <span className="solve-cat-title">{c.title}</span>
                  </button>
                ))}
              </div>

              {/* 該当なしフォールバック */}
              <div className="solve-fallback">
                <div className="solve-fallback-label">▶ ここにない／わからない場合</div>
                <button className="solve-fallback-btn" onClick={() => handleSolveToDict('')}>
                  📖 辞書を自由に検索する（キーワード／タグ）
                </button>
              </div>
            </div>
          );
        }

        // ステップ3：症状選択
        if (!solveSymptom) {
          return (
            <div className="solve-screen">
              <button className="dict-back" onClick={() => { setSolveCategory(null); setCriticalPosFilter(null); }}>← 戻る（カテゴリの選び直し）</button>
              <div className="solve-bar">
                <span className="solve-step-pill">STEP 3 / 3</span>
                <span className="solve-step-label">具体的な症状</span>
              </div>
              <div className="step-dots">
                <span className="step-dot done"></span>
                <span className="step-bar done"></span>
                <span className="step-dot done"></span>
                <span className="step-bar done"></span>
                <span className="step-dot current"></span>
              </div>
              <div className="solve-title">どれが一番近い？</div>
              <div className="solve-sub">{catData.icon} {catData.title}</div>
              {catData.id === 'critical' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 4px' }}>
                  {['すべて', 'SB', 'WB', 'CB', 'PV', 'GK', 'DF'].map(lbl => {
                    const val = lbl === 'すべて' ? null : lbl;
                    const active = criticalPosFilter === val;
                    return (
                      <button key={lbl} onClick={() => setCriticalPosFilter(val)}
                        style={{
                          padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                          border: active ? '1.5px solid #818cf8' : '1px solid var(--border)',
                          background: active ? 'rgba(99,102,241,0.18)' : 'var(--surface-1)',
                          color: active ? '#c7d2fe' : 'var(--tx-muted)',
                          transition: 'all 0.15s',
                        }}>
                        {lbl}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="solve-sym-list">
                {catData.symptoms
                  .filter(s => catData.id !== 'critical' || !criticalPosFilter || s.title.startsWith('[' + criticalPosFilter + ']'))
                  .map(s => (
                    <button key={s.id} className="solve-sym-btn" onClick={() => {
                      setSolveSymptom(s.id);
                      addSolveHistory(solveRole, solveCategory, s.id);
                      saveResume('solve', { role: solveRole, category: solveCategory, symptom: s.id, symptomTitle: s.title });
                    }}>
                      <div className="solve-sym-title">{s.title}</div>
                      <div className="solve-sym-desc">{s.desc}</div>
                    </button>
                  ))
                }
              </div>

              {/* 該当なしフォールバック */}
              <div className="solve-fallback">
                <div className="solve-fallback-label">▶ どれもピンとこない場合</div>
                <button className="solve-fallback-btn" onClick={() => handleSolveToDict(catData.title.replace(/で困っている$/, ''))}>
                  📖 「{catData.title.replace(/で困っている$/, '')}」で辞書を検索する
                </button>
              </div>
            </div>
          );
        }

        // 処方箋（=結果）表示
        return (
          <div className="solve-screen">
            <button className="dict-back" onClick={() => setSolveSymptom(null)}>← 戻る（症状を選び直す）</button>
            <div className="solve-bar">
              <span className="solve-step-pill">✓ 完了（アドバイス）</span>
              <span className="solve-step-label">辞書からのヒント</span>
            </div>
            <div className="step-dots">
              <span className="step-dot done"></span>
              <span className="step-bar done"></span>
              <span className="step-dot done"></span>
              <span className="step-bar done"></span>
              <span className="step-dot done"></span>
            </div>
            <div className="solve-rx">
              {/* 症状サマリー */}
              <div className="solve-rx-card">
                <div className="solve-rx-label">⚠ 困っていること</div>
                <GText as="div" className="solve-rx-title" text={symData.title} />
                <GText as="div" className="solve-rx-desc" text={symData.desc} />
              </div>
              {/* 具体的アクション */}
              <div className="solve-rx-card">
                <div className="solve-rx-label">✓ 試してみよう（具体的アクション）</div>
                <div className="solve-rx-actions">
                  {symData.actions.map((a, i) => (
                    <div key={i} className="solve-rx-action">
                      <span className="solve-rx-action-num">{i + 1}</span>
                      <GText text={a} />
                    </div>
                  ))}
                </div>
                {/* アクションに①〜⑦が含まれていたらフェイント凡例を出す */}
                {symData.actions.some(a => /[①②③④⑤⑥⑦]/.test(a)) && (
                  <div className="feint-legend">
                    <div className="feint-legend-label">🔖 フェイント番号の意味（①〜⑦）</div>
                    <div className="feint-legend-grid">
                      {FEINT_LEGEND.map(f => (
                        <div key={f.n} className="feint-legend-row">
                          <span className="feint-legend-num">{f.n}</span>
                          <span className="feint-legend-name">{f.name}</span>
                          <span className="feint-legend-desc">{f.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {/* 関連辞書 */}
              <div className="solve-rx-card">
                <div className="solve-rx-label">📖 関連する辞書セクション</div>
                {dictLoaded ? (
                  <div className="solve-rx-related-list">
                    {symData.related.map((r, i) => {
                      const fileMeta = DICT_FILES.find(f => f.id === r.fileId);
                      const section = findRelatedSection(r);
                      return (
                        <div
                          key={i}
                          className="solve-rx-related-item"
                          onClick={() => handleOpenRelated(r)}
                        >
                          <span className="solve-rx-related-icon">{fileMeta?.icon}</span>
                          <div className="solve-rx-related-meta">
                            <div className="solve-rx-related-file">{r.fileId} / {fileMeta?.title}</div>
                            <div className="solve-rx-related-title">{section ? section.title : `「${r.match}」で検索 →`}</div>
                          </div>
                          <span className="solve-rx-arrow">›</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="solve-rx-missing">辞書を読み込み中…</div>
                )}
              </div>
            </div>
            {/* 操作ボタン */}
            <button className="reset-btn" style={{borderColor: '#6b21a8', color: '#c084fc', marginTop: 8}} onClick={handleSolveReset}>
              ← もう一度診断する
            </button>
            <button className="reset-btn" style={{marginTop: 6}} onClick={handleBackToHub}>
              ホームに戻る
            </button>
          </div>
        );
      })()}

      {/* 練習を組む（Phase 2B） */}
      {phase === 'plan' && !planResult && (
        <div className="plan-screen">
          <button className="dict-back" onClick={handleBackToHub}>← 戻る（ホーム）</button>

          {/* STEPインジケーター：1=ポジション(done固定), 2=テーマ, 3=レベル, 4=時間 */}
          <div className="step-dots plan">
            <span className="step-dot done"></span>
            <span className="step-bar done"></span>
            <span className={`step-dot ${planThemes.length > 0 ? 'done' : 'current'}`}></span>
            <span className={`step-bar ${planThemes.length > 0 ? 'done' : ''}`}></span>
            <span className={`step-dot ${planThemes.length > 0 ? 'done' : ''}`}></span>
            <span className={`step-bar ${planThemes.length > 0 ? 'done' : ''}`}></span>
            <span className={`step-dot ${planThemes.length > 0 ? 'current' : ''}`}></span>
          </div>

          {/* STEP 1：ポジション選択 */}
          <div className="solve-bar"><span className="plan-step-pill">STEP 1 / 4</span><span className="plan-step-label">ポジション（任意）</span></div>
          <div className="plan-title">誰の練習？</div>
          <div className="plan-sub">選ぶと推奨テーマに★が付きます。チーム全体の場合はそのまま。</div>
          <div className="plan-pos-chips">
            {POSITIONS.map(p => (
              <button key={p.id} className={`plan-pos-chip ${planPosition === p.id ? 'active' : ''}`}
                onClick={() => setPlanPosition(prev => prev === p.id && p.id !== 'all' ? 'all' : p.id)}>
                <span className="plan-pos-chip-icon">{p.icon}</span>{p.label}
              </button>
            ))}
          </div>

          {/* STEP 2：テーマ複数選択 */}
          <div className="solve-bar" style={{marginTop: 4}}><span className="plan-step-pill">STEP 2 / 4</span><span className="plan-step-label">テーマ（複数可）</span></div>
          <div className="plan-title">何を強化する？</div>
          <div className="plan-sub">複数選んでOK。★はポジション推奨テーマ。練習時間は自動配分されます。</div>
          {/* 一括選択ボタン（ポジション選択時のみ表示） */}
          {planPosition !== 'all' && (() => {
            const recs = POSITION_RECOMMENDED[planPosition] || [];
            const posLabel = POSITIONS.find(p => p.id === planPosition)?.label || '';
            const allSelected = recs.length > 0 && recs.every(id => planThemes.includes(id));
            return (
              <button className="plan-rec-select-btn" onClick={() => {
                if (allSelected) {
                  setPlanThemes(prev => prev.filter(id => !recs.includes(id)));
                } else {
                  setPlanThemes(prev => [...new Set([...prev, ...recs])]);
                }
              }}>
                {allSelected ? '✓ ' : '⚡ '}{posLabel} 推奨テーマを{allSelected ? '解除' : '一括選択'}（{recs.length}件）
              </button>
            );
          })()}
          <div className="plan-themes">
            {DRILL_THEMES.map(t => {
              const recs = POSITION_RECOMMENDED[planPosition] || [];
              const isRec = recs.includes(t.id);
              // ポジション専用テーマには所属ポジションのバッジを表示
              const posOwner = t.forPositions
                ? POSITIONS.find(p => p.id === t.forPositions[0])
                : null;
              return (
                <button key={t.id} className={`plan-theme-chip ${planThemes.includes(t.id) ? 'active' : ''}`} onClick={() => handleTogglePlanTheme(t.id)}>
                  <span className="plan-theme-chip-icon">{t.icon}</span>{t.label}
                  {posOwner && !isRec && planPosition !== 'all' && (
                    <span className="pos-badge">({posOwner.label})</span>
                  )}
                  {isRec && <span className="rec-star">★</span>}
                </button>
              );
            })}
          </div>

          {/* ＋α：自作課題をプランに混ぜる */}
          <div className="solve-bar" style={{marginTop: 8}}><span className="plan-step-pill">＋α</span><span className="plan-step-label">自作課題（任意）</span></div>
          <div className="plan-title">自分の課題を混ぜる</div>
          <div className="plan-sub">自作した制約課題を生成プランの最後に追加できます（各 約15分目安）。まだ無ければ「課題ビルダー」で作る。</div>
          {tbTasks.length > 0 && (
            <div className="plan-themes">
              {tbTasks.map(t => (
                <button key={t.id} className={`plan-theme-chip ${planMyTasks.includes(t.id) ? 'active' : ''}`}
                  onClick={() => setPlanMyTasks(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id])}>
                  <span className="plan-theme-chip-icon">🛠</span>{t.name}{(t.version || 1) > 1 ? ` v${t.version}` : ''}
                </button>
              ))}
            </div>
          )}
          <button className="plan-rec-select-btn" onClick={() => { setTbView({ name: 'home' }); setPhase('build'); setTimeout(() => window.scrollTo(0, 0), 0); }}>
            🛠 課題ビルダーを開く（自作・検証・振り返り）
          </button>

          {/* STEP 3：レベル選択 */}
          <div className="solve-bar" style={{marginTop: 8}}><span className="plan-step-pill">STEP 3 / 4</span><span className="plan-step-label">レベル</span></div>
          <div className="plan-levels">
            {LEVELS.map(l => (
              <button key={l.id} className={`plan-level-btn ${planLevel === l.id ? 'active' : ''}`} onClick={() => setPlanLevel(l.id)}>
                <span className="plan-level-label">{l.label}</span>
                <span className="plan-level-desc">{l.desc}</span>
              </button>
            ))}
          </div>

          {/* STEP 4：時間選択 */}
          <div className="solve-bar" style={{marginTop: 8}}><span className="plan-step-pill">STEP 4 / 4</span><span className="plan-step-label">時間</span></div>
          <div className="plan-durations">
            {DURATIONS.map(d => (
              <button key={d} className={`plan-duration-btn ${planDuration === d ? 'active' : ''}`} onClick={() => setPlanDuration(d)}>
                {d}<small>分</small>
              </button>
            ))}
          </div>

          {/* 生成ボタン */}
          <button className="plan-gen-btn" disabled={planThemes.length === 0} onClick={handleGeneratePlan}>
            ▶ 練習プランを生成（{planDuration}分・{LEVELS.find(l => l.id === planLevel)?.label}）
          </button>
          {planThemes.length === 0 && (
            <div style={{fontSize: 11, color: '#64748b', textAlign: 'center'}}>テーマを1つ以上選んでください</div>
          )}

          {/* 保存済みプラン */}
          {planSaved.length > 0 && (
            <div className="plan-saved-section">
              <div className="plan-saved-label">▶ 保存済みプラン</div>
              {planSaved.slice(0, 5).map((sv, i) => (
                <div key={i} className="plan-saved-item" onClick={() => handlePlanRestore(sv)}>
                  <div className="plan-saved-meta">
                    <div className="plan-saved-aim">
                      {sv.tag && <span style={{background: 'rgba(251,191,36,0.2)', color: '#fcd34d', fontSize: 10, padding: '1px 6px', borderRadius: 4, marginRight: 6, fontWeight: 800}}>{sv.tag}</span>}
                      {sv.aim}
                    </div>
                    <div className="plan-saved-detail">
                      {sv.position && sv.position !== 'all' && <>{POSITIONS.find(p => p.id === sv.position)?.icon}{' '}</>}
                      {sv.duration}分 / {LEVELS.find(l => l.id === sv.level)?.label} /
                      {' '}{sv.themes.map(tid => DRILL_THEMES.find(t => t.id === tid)?.icon).filter(Boolean).join(' ')}
                    </div>
                  </div>
                  <span style={{color: '#475569'}}>›</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 練習プラン表示 */}
      {phase === 'plan' && planResult && (
        <div className="plan-screen">
          <button className="dict-back" onClick={handlePlanReset}>← 戻る（条件を変更）</button>
          <div className="plan-output">
            <div className="plan-header">
              <div className="plan-header-time">⏱ {planResult.totalAllocated} 分プラン</div>
              <div className="plan-header-meta">
                {planPosition !== 'all' && <>{POSITIONS.find(p => p.id === planPosition)?.icon}{' '}{POSITIONS.find(p => p.id === planPosition)?.label}{' ／ '}</>}
                {LEVELS.find(l => l.id === planLevel)?.label} ／
                {' '}テーマ: {planThemes.map(tid => DRILL_THEMES.find(t => t.id === tid)?.label).filter(Boolean).join('・')}
              </div>
            </div>

            {/* 狙い */}
            <div className="plan-aim">🎯 狙い：{generatePlanAim(planThemes, planLevel, planPosition)}</div>

            {/* ポジション特化バナー */}
            {planPosition !== 'all' && (
              <div className="plan-pos-banner">
                <span className="plan-pos-banner-icon">{POSITIONS.find(p => p.id === planPosition)?.icon}</span>
                <span className="plan-pos-banner-text">
                  <strong>{POSITIONS.find(p => p.id === planPosition)?.label} 特化ドリル</strong>を適用中 — このポジションに最適化された練習内容が表示されています
                </span>
              </div>
            )}

            {/* スキル練習 vs エコロジカルの凡例 */}
            <details className="plan-eco-banner" style={{padding: 0}}>
              <summary style={{cursor: 'pointer', padding: '8px 12px', listStyle: 'none', color: 'var(--c-dict)', fontSize: 11, fontWeight: 800}}>
                📌 練習タイプの読み方（スキル／エコロジカル）— 詳しく見る
              </summary>
              <div style={{padding: '0 12px 12px', borderTop: '1px solid rgba(34,211,238,0.2)', marginTop: 4, paddingTop: 8}}>
                <div style={{marginBottom: 8, fontSize: 11, color: '#94a3b8', lineHeight: 1.6}}>
                  どちらも<strong style={{color:'#67e8f9'}}>相手と勝負する</strong>練習です。勝負がないと表裏一体にはなりません。
                </div>
                <div style={{display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5}}>
                  <span className="plan-drill-type skill">スキル練習</span>
                  <span style={{fontSize: 11}}>相手役の動きを固定して勝負（パーだけ出させてチョキを練習）</span>
                </div>
                <div style={{display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8}}>
                  <span className="plan-drill-type eco">エコロジカル</span>
                  <span style={{fontSize: 11}}>環境制限の中で双方が自由に勝負（パーなしのじゃんけん）</span>
                </div>
                <div style={{marginBottom: 8, fontSize: 11, color: '#94a3b8', lineHeight: 1.6}}>
                  <strong style={{color:'#c7d2fe'}}>🔄 OF/DF表裏一体：</strong>攻撃の練習は守備の練習でもあります。各メニューの「表裏」を確認してください。
                </div>
                <div style={{marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap'}}>
                  <span style={{background: '#155e75', color: '#67e8f9', fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700}}>タスク</span>
                  <span style={{fontSize: 11}}>=ルール（時間・回数・声出し等）</span>
                </div>
                <div style={{marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap'}}>
                  <span style={{background: '#155e75', color: '#67e8f9', fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700}}>環境</span>
                  <span style={{fontSize: 11}}>=道具・配置（コーン・スペース・対戦相手の動き）</span>
                </div>
                <div style={{marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap'}}>
                  <span style={{background: '#155e75', color: '#67e8f9', fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700}}>選手</span>
                  <span style={{fontSize: 11}}>=役割（誰がどう振る舞うかの制限）</span>
                </div>
                <div
                  style={{marginTop: 8, color: '#67e8f9', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline'}}
                  onClick={() => handleOpenRelated({ fileId: '04', match: 'エコロジカル' })}
                >
                  ▶ エコロジカルアプローチをもっと学ぶ（辞書04）
                </div>
              </div>
            </details>

            {/* ウォームアップ */}
            {planResult.warmup && (
              <div className="plan-wc">
                <div><span className="plan-wc-label">▶ ウォームアップ</span><span className="plan-wc-time">{planResult.warmup.minutes}分</span></div>
                <div className="plan-wc-desc">{planResult.warmup.desc}</div>
              </div>
            )}

            {/* テーマ別ブロック */}
            {planResult.blocks.map((b, i) => (
              <div key={i} className="plan-block">
                <div className="plan-block-title">
                  <span>{b.theme.icon}</span>
                  <span>{b.theme.label}</span>
                  <span className="plan-block-time">{b.blockMinutes}分</span>
                </div>
                {b.items.map((it, j) => (
                  <div key={j} className="plan-item" onClick={() => handlePlanItemOpen(it)}>
                    <div className="plan-item-row">
                      <span className="plan-item-time">{it.minutes}分</span>
                      <span className="plan-item-title">{it.title}</span>
                      <span className="plan-item-arrow">›</span>
                    </div>
                    {/* ドリルタイプバッジ */}
                    {it.drillType && (
                      <div style={{marginTop: 4}}>
                        <span className={`plan-drill-type ${it.drillType}`}>
                          {it.drillType === 'skill' ? '🔧 スキル練習' : '🌿 エコロジカル'}
                        </span>
                      </div>
                    )}
                    <div className="plan-item-desc">{it.desc}</div>
                    {/* 表裏一体ノート */}
                    {it.trainingNote && (
                      <div className="plan-training-note">
                        <div className="plan-training-note-label">🔄 OF/DF 表裏一体</div>
                        {it.trainingNote}
                      </div>
                    )}
                    {it.constraints && it.constraints.length > 0 && (
                      <div className="plan-constraints">
                        <div className="plan-constraints-label">📌 制約（勝負の構図）</div>
                        {it.constraints.map((c, ci) => (
                          <div key={ci} className="plan-constraint-item">
                            <span className="plan-constraint-tag">{c.type}</span>
                            <span>{c.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}

            {/* 自作課題ブロック */}
            {planMyTasks.length > 0 && (() => {
              const myTasks = planMyTasks.map(id => tbTasks.find(t => t.id === id)).filter(Boolean);
              if (!myTasks.length) return null;
              return (
                <div className="plan-block">
                  <div className="plan-block-title">
                    <span>🛠</span><span>自作課題</span>
                    <span className="plan-block-time">＋約{myTasks.length * 15}分</span>
                  </div>
                  {myTasks.map(t => (
                    <div key={t.id} className="plan-item" onClick={() => { setTbView({ name: 'detail', id: t.id }); setPhase('build'); setTimeout(() => window.scrollTo(0, 0), 0); }}>
                      <div className="plan-item-row">
                        <span className="plan-item-time">15分</span>
                        <span className="plan-item-title">{t.name}{(t.version || 1) > 1 ? ` v${t.version}` : ''}</span>
                        <span className="plan-item-arrow">›</span>
                      </div>
                      <div style={{marginTop: 4}}>
                        <span className="plan-drill-type eco">🌿 エコロジカル（自作）</span>
                      </div>
                      <div className="plan-item-desc">{TB_CONSTRAINTS.find(c => c.id === t.constraintId)?.name}：{t.constraintDetail}</div>
                      <div className="plan-constraints">
                        <div className="plan-constraints-label">📌 成功の定義（{t.attempts}本・ペアが観察）</div>
                        <div className="plan-constraint-item"><span className="plan-constraint-tag">結果</span><span>{t.successResult}</span></div>
                        <div className="plan-constraint-item"><span className="plan-constraint-tag">過程</span><span>{t.successProcess}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* クールダウン */}
            {planResult.cooldown && (
              <div className="plan-wc">
                <div><span className="plan-wc-label">▶ クールダウン</span><span className="plan-wc-time">{planResult.cooldown.minutes}分</span></div>
                <div className="plan-wc-desc">{planResult.cooldown.desc}</div>
              </div>
            )}

            {planResult.blocks.length === 0 && (
              <div className="dict-empty">選択したテーマ・レベルの組み合わせに練習メニューが定義されていません。<br />別のレベルを試してください。</div>
            )}

            {/* 余裕時間 */}
            {planResult.mismatch > 0 && (
              <div className="plan-extra">
                ＋ 余裕 {planResult.mismatch} 分：休憩・追加練習・質疑応答・ストレッチ等で活用
              </div>
            )}
            {planResult.mismatch < 0 && (
              <div className="plan-extra" style={{borderColor: '#7f1d1d', color: '#fca5a5'}}>
                ⚠ {Math.abs(planResult.mismatch)} 分オーバー：時間調整が必要です（メニュー削減 or 時間延長）
              </div>
            )}
          </div>

          {/* 操作ボタン：コピー（LINE共有）を主役に。紙は全廃方針のため印刷ボタンは置かない */}
          <div className="plan-actions">
            <button className="plan-action-btn primary" onClick={handlePlanCopy}>📋 コピー</button>
            <button className="plan-action-btn" onClick={() => handlePlanSave(null)}>★ 保存</button>
          </div>
          {/* タグ付き保存（時系列ラベル） */}
          <div className="plan-actions" style={{marginTop: 4}}>
            <button className="plan-action-btn" style={{fontSize: 11}} onClick={() => handlePlanSave('今日')}>📅 今日として保存</button>
            <button className="plan-action-btn" style={{fontSize: 11}} onClick={() => handlePlanSave('明日')}>📅 明日として保存</button>
            <button className="plan-action-btn" style={{fontSize: 11}} onClick={() => handlePlanSave('来週')}>📅 来週として保存</button>
          </div>
          <button className="reset-btn" style={{marginTop: 6}} onClick={handlePlanReset}>条件を変更</button>
          <button className="reset-btn" style={{marginTop: 4}} onClick={handleBackToHub}>← ホームに戻る</button>

          {/* トースト */}
          {planCopyMsg && <div className="plan-toast">{planCopyMsg}</div>}
        </div>
      )}

      {/* 用語集FAB（全画面で表示：オンボーディング案内と整合） */}
      <button
        className="help-fab"
        style={phase === 'chat' ? { bottom: 'calc(var(--nav-h) + 80px + env(safe-area-inset-bottom, 0px))' } : undefined}
        onClick={() => setGlossaryOpen(true)} title="用語集" aria-label="用語集を開く"
      >📘 用語</button>

      {/* 用語集モーダル */}
      {glossaryOpen && (
        <div className="glossary-overlay" onClick={() => { setGlossaryOpen(false); setGlossaryHighlight(null); setGlossaryQuery(''); }}>
          <div className="glossary-modal" onClick={e => e.stopPropagation()}>
            <div className="glossary-head">
              <span className="glossary-title">📘 用語集</span>
              <button className="glossary-close" onClick={() => { setGlossaryOpen(false); setGlossaryHighlight(null); setGlossaryQuery(''); }} aria-label="閉じる">×</button>
            </div>
            <div className="glossary-search">
              <input
                type="text"
                value={glossaryQuery}
                placeholder="🔍 用語をさがす（例: フェイント、6-0）"
                onChange={e => setGlossaryQuery(e.target.value)}
                aria-label="用語集内を検索"
              />
            </div>
            <div className="glossary-body">
              {(() => {
                const q = glossaryQuery.trim().toLowerCase();
                const shown = GLOSSARY
                  .map(g => ({ ...g, items: q ? g.items.filter(it => (it.term + it.desc).toLowerCase().includes(q)) : g.items }))
                  .filter(g => g.items.length > 0);
                if (!shown.length) return <div className="glossary-empty">「{glossaryQuery}」に一致する用語はありません</div>;
                return shown.map((g, gi) => (
                <div key={gi}>
                  <div className="glossary-group">{g.group}</div>
                  {g.items.map((it, ii) => {
                    const key = it.term.replace(/[（(].*$/, '').trim();
                    const isHi = glossaryHighlight === key;
                    return (
                      <div key={ii} className="glossary-item" data-glossary-key={key}
                        style={isHi ? {background: 'rgba(34,211,238,0.15)', borderRadius: 6, padding: 4, margin: '-4px 0', transition: 'background .3s'} : {}}>
                        <div className="glossary-term">{it.term}</div>
                        <div className="glossary-desc">{it.desc}</div>
                      </div>
                    );
                  })}
                </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* スタート画面（振り返るモード入口・グループ表示） */}
      {phase === 'start' && (() => {
        // Phase 2: 逆引き3種（janken/context/gk）はホームの「📖リファレンス」へ降格（設計書1-5）
        const MODE_GROUPS = [
          { label: '🟦 自分のプレー（① 自分の立場から選ぶ）', ids: ['of', 'df', 'gk_self', 'skill'] },
          { label: '🟢 特殊場面', ids: ['physical', 'shot_7m', 'sign'] },
        ];
        return (
          <div className="start-screen">
            <button className="dict-back" style={{alignSelf: 'flex-start', padding: '4px 0'}} onClick={handleBackToHub}>← 戻る（ホーム）</button>
            <div className="start-icon">🤾</div>
            <div className="start-title">今日の自分と<br />向き合う</div>
            <div className="start-sub">どのモードで振り返る？</div>
            <div className="mode-select">
              {MODE_GROUPS.map(g => (
                <div key={g.label} style={{display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4}}>
                  <div style={{fontSize: 11, fontWeight: 800, color: 'var(--tx-muted)', letterSpacing: '0.06em', padding: '4px 4px 2px'}}>
                    {g.label}
                  </div>
                  {g.ids.map(key => {
                    const m = MODES[key];
                    if (!m) return null;
                    return (
                      <button key={key} className="mode-btn" onClick={() => handleModeSelect(key)}>
                        <div className="mode-btn-icon">{m.icon}</div>
                        <div className="mode-btn-text">
                          <div className="mode-btn-label" style={{ color: m.color }}>{m.label}</div>
                          <div className="mode-btn-desc">{m.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--tx-muted)', marginTop: 8 }}>
              🔍 相手の分析（じゃんけん・試合状況・相手GK）はホームの「📖 リファレンス」へ移動しました
            </div>
          </div>
        );
      })()}


      {/* 問い */}
      {phase === 'question' && q && (
        <div className="content">
          {history.length > 0 && (
            <div className="breadcrumb">
              {history.map((h, i) => <span key={i} className="crumb">{h.text}</span>)}
            </div>
          )}
          <div>
            {AXIS_MAP[currentQ] && (() => {
              const s = axisStyle(AXIS_MAP[currentQ]);
              return (
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: s.color, border: s.border, borderRadius: 6, padding: '2px 8px', display: 'inline-block', marginBottom: 6, background: '#0f172a' }}>
                  {AXIS_MAP[currentQ]}
                </div>
              );
            })()}
            <div className="q-label">{q.label}</div>
            <div className="q-text">{q.text}</div>
            {q.hint && <div className="q-hint">{q.hint}</div>}
          </div>
          <div className="choices">
            {q.choices.map((c, i) => (
              <button key={i}
                className={`choice-btn ${selected === i ? 'selected' : ''}`}
                onClick={() => handleChoice(i)}>
                {c.label}
              </button>
            ))}
          </div>
          <button className="next-btn" disabled={selected === null} onClick={handleNext}>
            次へ →
          </button>
        </div>
      )}

      {/* 結果（3部構成） */}
      {phase === 'result' && result && (
        <div className="content">
          {history.length > 0 && (
            <div className="breadcrumb">
              {history.map((h, i) => <span key={i} className="crumb">{h.text}</span>)}
            </div>
          )}

          <div className="result-sections">
            {/* 良かった */}
            <div className="rs good">
              <div className="rs-label">✓ 良かった点</div>
              <GText as="div" className="rs-body" text={result.good} />
            </div>

            {/* 課題 */}
            <div className="rs issue">
              <div className="rs-label">△ 課題</div>
              <GText as="div" className="rs-title" text={result.issue} />
              <GText as="div" className="rs-body" text={result.body} />
            </div>

            {/* 改善案 */}
            <div className="rs improve">
              <div className="rs-label">▶ 改善案</div>
              <GText as="div" className="rs-body" text={result.improve} />
              {result.approaches && result.approaches.length > 0 && (
                <div className="approach-section">
                  {result.approaches.map((a, i) => (
                    <div key={i} className="approach-item">
                      <div className="approach-tag">{a.tag}</div>
                      <GText as="div" className="approach-text" text={a.text} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 次のステップ */}
          {mode !== 'context' && mode !== 'janken' && mode !== 'gk' && (
            <div className="next-step-section">
              <div className="next-step-label">次のプレーで一つだけ試すことを書く</div>
              <div className="next-step-hint">正解はない。「これを試したい」と思うこと。</div>
              <textarea
                className="next-step-input"
                placeholder="例：もらう前に隣のDFを一度見てから動き出す"
                value={nextStep}
                onChange={e => setNextStep(e.target.value)}
                onBlur={e => commitNextStep(e.target.value)}
              />
            </div>
          )}

          {/* 国別深掘り誘導（OF/DF/スキルモードのみ） */}
          {(mode === 'of' || mode === 'df' || mode === 'skill') && (
            <button
              className="reset-btn"
              style={{ borderColor: '#06b6d4', color: '#06b6d4', marginBottom: 8 }}
              onClick={handleJumpToCountry}
            >
              🌍 相手の戦術DNAで深掘りする →
            </button>
          )}

          {/* 課題解決モジュールへの連携（振り返りモードからカテゴリ直通） */}
          {/* 連動ボタン：結果ID に対応する症状があれば直接ジャンプ、なければカテゴリ */}
          {(() => {
            const symptomMap = RESULT_TO_SYMPTOM[resultId];
            const modeMap = MODE_TO_SOLVE[mode];
            const targetLabel = symptomMap
              ? '🎯 この悩みに対応する症状を直接見る →'
              : '🎯 同じ悩みで「課題を解決する」を開く →';
            return (
              <button
                className="reset-btn"
                style={{borderColor: 'var(--c-solve)', color: '#d8b4fe', marginBottom: 8}}
                onClick={() => {
                  if (symptomMap) {
                    setSolveRole(symptomMap.role);
                    setSolveCategory(symptomMap.category);
                    // 既存コードは string ID 形式を期待するので id 文字列を渡す
                    setSolveSymptom(symptomMap.symptom);
                  } else if (modeMap) {
                    setSolveRole(modeMap.role);
                    setSolveCategory(modeMap.category);
                    setSolveSymptom(null);
                  } else {
                    handleSolveReset();
                  }
                  setPhase('solve');
                }}
              >
                {targetLabel}
              </button>
            );
          })()}
          {activeCardIdRef.current && (
            <button className="reset-btn" style={{ borderColor: '#22d3ee', color: '#67e8f9', marginBottom: 8 }}
              onClick={() => {
                commitNextStep();
                setPhase('card'); setMode(null); setHistory([]);
                setResultId(null); setCurrentQ(null); setSelected(null); setNextStep('');
              }}>
              ← カードに戻る（読みの丸付け・課題選び）
            </button>
          )}
          <button className="reset-btn" onClick={handleReset}>
            もう一度振り返る
          </button>
          <button className="reset-btn" style={{marginTop: 8}} onClick={handleBackToHub}>
            ← ホームに戻る
          </button>
        </div>
      )}

      {/* 課題ビルダー画面 */}
      {phase === 'build' && (
        <div className="plan-screen">
          {tbView.name === 'home' && (
            <TBHome tasks={tbTasks}
              onBackPlan={() => { setPlanResult(null); setPhase('plan'); }}
              onNew={() => setTbView({ name: 'wizard' })}
              onOpen={(id) => setTbView({ name: 'detail', id })}
              onExport={() => tbCopy(tbExportAllText(tbTasks), setTbToast)} />
          )}
          {tbView.name === 'wizard' && (
            <TBWizard baseTask={tbView.base || null}
              onCancel={() => setTbView({ name: 'home' })}
              onSave={(t) => {
                let next = t;
                if (tbView.revise) {
                  const old = tbTasks.find(x => x.id === t.id);
                  if (old) {
                    const lastS = (old.sessions || [])[(old.sessions || []).length - 1] || null;
                    const snap = {
                      v: old.version || 1, date: new Date().toLocaleDateString('ja-JP'),
                      constraintId: old.constraintId, constraintDetail: old.constraintDetail,
                      successResult: old.successResult, successProcess: old.successProcess,
                      attempts: old.attempts, q0Targets: old.q0Targets, q0Note: old.q0Note,
                      movedBy: lastS ? { move: lastS.move, reason: lastS.reason } : null,
                    };
                    next = { ...t, version: (old.version || 1) + 1, history: [...(old.history || []), snap], sessions: old.sessions || [] };
                  }
                }
                tbUpsert(next); setTbView({ name: 'detail', id: next.id });
                setTbToast('保存した'); setTimeout(() => setTbToast(null), 1800);
              }} />
          )}
          {tbView.name === 'detail' && (() => {
            const cur = tbTasks.find(t => t.id === tbView.id);
            if (!cur) return <TBHome tasks={tbTasks} onBackPlan={() => { setPlanResult(null); setPhase('plan'); }} onNew={() => setTbView({ name: 'wizard' })} onOpen={(id) => setTbView({ name: 'detail', id })} onExport={() => tbCopy(tbExportAllText(tbTasks), setTbToast)} />;
            return (
              <TBTaskDetail task={cur} setToast={setTbToast}
                onUpdate={tbUpsert}
                onRevise={() => setTbView({ name: 'wizard', base: cur, revise: true })}
                onBack={() => setTbView({ name: 'home' })} />
            );
          })()}
          {tbToast && <div className="tb-toast">{tbToast}</div>}
        </div>
      )}

      {/* GK予測・ピヴォット認知画面（共通エンジン） */}
      {(phase === 'gk' || phase === 'pv') && (
        <div className="plan-screen">
          <RecordModule
            key={phase}
            def={RECORD_MODULES[phase]}
            records={phase === 'gk' ? gkPreds : pvRecords}
            setRecords={phase === 'gk' ? setGkPreds : setPvRecords}
            players={phase === 'gk' ? effGkPlayers : effPvPlayers}
            setPlayers={phase === 'gk' ? setGkPlayers : setPvPlayers}
            view={phase === 'gk' ? gkView : pvView}
            setView={phase === 'gk' ? setGkView : setPvView}
            lastSetupRef={phase === 'gk' ? gkLastSetup : pvLastSetup}
            onBackHub={handleBackToHub}
          />
        </div>
      )}

      {phase === 'playbook' && (
        <Playbook cards={matchCards} gkPreds={gkPreds} pvRecords={pvRecords}
          gkPlayers={gkPlayers} pvPlayers={pvPlayers} onBack={handleBackToHub} />
      )}

      {/* ── Bottom Navigation ── */}
      {(() => {
        const isReflect = ['start','emotion','question','result'].includes(phase);
        const isDict    = ['dictionary','dictionary-detail'].includes(phase);
        const isSolve   = phase === 'solve';
        const isPlan    = phase === 'plan' || phase === 'build';
        const isChat    = phase === 'chat';
        const isHub     = phase === 'hub';
        const go = (target) => {
          if (target === 'hub')    { handleBackToHub(); }
          else if (target === 'reflect') { if (phase === 'result') commitNextStep(); activeCardIdRef.current = null; setPhase('start'); setMode(null); setHistory([]); setResultId(null); setCurrentQ(null); setSelected(null); }
          else if (target === 'dict')  { setDictDetail(null); setPhase('dictionary'); }
          else if (target === 'solve') { handleSolveReset(); setPhase('solve'); }
          else if (target === 'plan')  { setPlanResult(null); setPhase('plan'); }
          else if (target === 'chat')  { setPhase('chat'); }
        };
        return (
          <nav className="bottom-nav" aria-label="メインナビゲーション">
            <button className={`bn-item ${isHub ? 'active-hub' : ''}`} onClick={() => go('hub')} aria-label="ホームへ" aria-current={isHub ? 'page' : undefined}>
              <span className="bn-icon" aria-hidden="true">🏠</span>
              <span className="bn-label">ホーム</span>
              <span className="bn-dot" aria-hidden="true"/>
            </button>
            <button className={`bn-item ${isReflect ? 'active-reflect' : ''}`} onClick={() => go('reflect')} aria-label="振り返る画面へ" aria-current={isReflect ? 'page' : undefined}>
              <span className="bn-icon" aria-hidden="true">🤾</span>
              <span className="bn-label">振り返る</span>
              <span className="bn-dot" aria-hidden="true"/>
            </button>
            <button className={`bn-item ${isDict ? 'active-dict' : ''}`} onClick={() => go('dict')} aria-label="辞書を読む画面へ" aria-current={isDict ? 'page' : undefined}>
              <span className="bn-icon" aria-hidden="true">📖</span>
              <span className="bn-label">辞書</span>
              <span className="bn-dot" aria-hidden="true"/>
            </button>
            <button className={`bn-item ${isChat ? 'active-chat' : ''}`} onClick={() => go('chat')} aria-label="質問チャット画面へ" aria-current={isChat ? 'page' : undefined}>
              <span className="bn-icon" aria-hidden="true">💬</span>
              <span className="bn-label">質問</span>
              <span className="bn-dot" aria-hidden="true"/>
            </button>
            <button className={`bn-item ${isSolve ? 'active-solve' : ''}`} onClick={() => go('solve')} aria-label="課題解決画面へ" aria-current={isSolve ? 'page' : undefined}>
              <span className="bn-icon" aria-hidden="true">🎯</span>
              <span className="bn-label">課題解決</span>
              <span className="bn-dot" aria-hidden="true"/>
            </button>
            <button className={`bn-item ${isPlan ? 'active-plan' : ''}`} onClick={() => go('plan')} aria-label="練習プラン作成画面へ" aria-current={isPlan ? 'page' : undefined}>
              <span className="bn-icon" aria-hidden="true">📋</span>
              <span className="bn-label">練習</span>
              <span className="bn-dot" aria-hidden="true"/>
            </button>
          </nav>
        );
      })()}
    </div>
  );
}

export default App;
