#!/usr/bin/env node
// Translate foreign-language notation in dictionary/*.md to Japanese/katakana.
// URL/code-block aware: masks unsafe regions before translation, restores after.
const fs = require('fs');
const path = require('path');
const T = require('./translation_map.js');

// Sort by length descending (longest first to avoid partial matches)
const entries = Object.entries(T).sort((a, b) => b[0].length - a[0].length);

function translateText(text) {
  const masks = [];
  const tok = i => `__MASK_${i}_MASK__`;

  // Mask URLs
  text = text.replace(/https?:\/\/[^\s)）'"]+/g, m => { masks.push(m); return tok(masks.length - 1); });
  // Mask markdown image refs
  text = text.replace(/!\[[^\]]*\]\([^)]+\)/g, m => { masks.push(m); return tok(masks.length - 1); });
  // Mask markdown link targets ](URL)
  text = text.replace(/\]\(([^)]+)\)/g, m => { masks.push(m); return tok(masks.length - 1); });
  // Mask file-path references like 01_basics.md
  text = text.replace(/\b\d{2}_[a-z_]+\.md\b/g, m => { masks.push(m); return tok(masks.length - 1); });
  // Note: code blocks ```...``` are NOT masked — they contain narrative prose in
  // dictionary files (diagrams/structured text), not real code. They MUST be translated.
  // Inline code `...` IS masked (preserves verbatim refs)
  text = text.replace(/`[^`\n]+`/g, m => { masks.push(m); return tok(masks.length - 1); });

  // Apply translations
  for (const [foreign, japanese] of entries) {
    const escaped = foreign.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(escaped, 'g'), japanese);
  }

  // Restore masks — loop until no more masks remain (handles nested references)
  let prev;
  do {
    prev = text;
    text = text.replace(/__MASK_(\d+)_MASK__/g, (_, i) => masks[+i]);
  } while (text !== prev);
  return text;
}

function processFile(filepath) {
  const before = fs.readFileSync(filepath, 'utf8');
  const after = translateText(before);
  if (before !== after) {
    fs.writeFileSync(filepath, after, 'utf8');
    const diff = before.length - after.length;
    console.log(`  ${path.basename(filepath)}: ${diff > 0 ? '-' : '+'}${Math.abs(diff)} chars`);
    return true;
  }
  return false;
}

const dictDir = path.join(process.cwd(), 'dictionary');
const files = fs.readdirSync(dictDir).filter(f => f.endsWith('.md')).sort();
console.log(`Processing ${files.length} dictionary files...`);
let changed = 0;
for (const f of files) {
  if (processFile(path.join(dictDir, f))) changed++;
}
console.log(`\n${changed}/${files.length} files modified.`);
