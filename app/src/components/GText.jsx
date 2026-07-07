// このファイルは index.html（Phase 0版）から Phase 1 S2 で機械分割された。
// 由来行: 8753-8769
import React from 'react';
import { decorateGlossary, escapeHtml, highlightInHtml } from '../lib/markdown.js';

function GText({ text, query, className, as }) {
  if (text == null || text === '') return null;
  let html = escapeHtml(String(text));
  html = decorateGlossary(html);
  if (query) html = highlightInHtml(html, query);
  const Tag = as || 'span';
  return React.createElement(Tag, { className, dangerouslySetInnerHTML: { __html: html } });
}

// ─────────────────────────────────────────────
// App
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// 課題ビルダー（自作課題）：選手が制約課題を自作→検証→実施→改訂するモジュール
// 設計原則：①課題自作自体がアプローチ能力の訓練 ②解の数・成功カウントはペアが観察
// ③次の一手テーブルは判定機でなく地図 ④1つの課題は攻防両面の教材
// ─────────────────────────────────────────────

export { GText };
