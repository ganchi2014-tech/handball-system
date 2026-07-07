// このファイルは index.html（Phase 0版）から Phase 1 S2 で機械分割された。
// 由来行: 8715-8752
import { GLOSSARY } from './dict.js';
import { GText } from '../components/GText.jsx';

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = `hb_v${STORAGE_VERSION}_`;
const lsGet = (key) => {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw !== null) return JSON.parse(raw);
    // 一度限りの旧キー移行（v1 PREFIX 未導入の旧データ）
    const legacy = localStorage.getItem(key);
    if (legacy !== null) {
      try {
        localStorage.setItem(STORAGE_PREFIX + key, legacy);
        localStorage.removeItem(key);
        return JSON.parse(legacy);
      } catch (e) { return null; }
    }
    return null;
  } catch (e) { return null; }
};
const lsSet = (key, value) => {
  try {
    localStorage.setItem(STORAGE_PREFIX + key,
      typeof value === 'string' ? value : JSON.stringify(value));
  } catch (e) {
    // 保存失敗（容量超過・プライベートブラウズ等）を黙殺しない — App がバナーで知らせる
    try { window.dispatchEvent(new CustomEvent('hb-storage-error', { detail: { key } })); } catch (e2) {}
  }
};
const lsRemove = (key) => {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
    localStorage.removeItem(key); // 旧キーも削除
  } catch (e) {}
};

// ─────────────────────────────────────────────
// GText: プレーンテキストを HTML エスケープしたうえで GLOSSARY 用語自動装飾＋
// （オプション）検索ハイライトを適用。solve-rx / 振り返り結果 / プラン項目で使用。
// ─────────────────────────────────────────────

export { STORAGE_VERSION, STORAGE_PREFIX, lsGet, lsSet, lsRemove };
