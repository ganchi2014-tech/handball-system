#!/usr/bin/env node
// Apply the same translation map to index.html.
// Targets: specific text property values, tags arrays, bullet-array strings, JS comments.
// Protects: URLs, file paths, code identifiers via masking.
const fs = require('fs');

const T = require('./translation_map.js');
const entries = Object.entries(T).sort((a, b) => b[0].length - a[0].length);

function translatePlain(text) {
  const masks = [];
  const tok = i => `__MASK_${i}_MASK__`;
  text = text.replace(/https?:\/\/[^\s'")]+/g, m => { masks.push(m); return tok(masks.length-1); });
  text = text.replace(/\b\d{2}_[a-z_]+\.md\b/g, m => { masks.push(m); return tok(masks.length-1); });
  for (const [foreign, japanese] of entries) {
    const escaped = foreign.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(escaped, 'g'), japanese);
  }
  let prev;
  do {
    prev = text;
    text = text.replace(/__MASK_(\d+)_MASK__/g, (_, i) => masks[+i]);
  } while (text !== prev);
  return text;
}

function processFile(content) {
  // 1) Property values (single-quoted)
  const props = ['label', 'text', 'good', 'issue', 'body', 'improve', 'desc', 'term', 'match', 'title', 'tag'];
  const propPattern = props.join('|');

  let result = content.replace(
    new RegExp(`\\b(${propPattern}):\\s*'((?:[^'\\\\]|\\\\.)*)'`, 'g'),
    (full, prop, str) => {
      const decoded = str.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      const translated = translatePlain(decoded);
      const encoded = translated.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `${prop}: '${encoded}'`;
    }
  );
  // Same for double-quoted
  result = result.replace(
    new RegExp(`\\b(${propPattern}):\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'g'),
    (full, prop, str) => {
      const decoded = str.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      const translated = translatePlain(decoded);
      const encoded = translated.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `${prop}: "${encoded}"`;
    }
  );

  // 2) Tag arrays: tags: ['...', '...'] — translate each string element
  result = result.replace(/\btags:\s*\[([^\]]+)\]/g, (full, body) => {
    const newBody = body.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, str) => {
      const decoded = str.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      const translated = translatePlain(decoded);
      const encoded = translated.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `'${encoded}'`;
    });
    return `tags: [${newBody}]`;
  });

  // 3) Bullet strings: lines that are JUST a quoted string inside an array, like
  //    "    'ピボットと Blickkontakt（目合わせ）を作る...',"
  // We only translate if the line contains at least one ASCII letter sequence (foreign term)
  result = result.replace(/^(\s+)'((?:[^'\\\n]|\\.)*)'(,?)\s*$/gm, (full, indent, str, comma) => {
    if (!/[A-Za-zÀ-ž]{3,}/.test(str)) return full; // no foreign letters → skip
    const decoded = str.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    const translated = translatePlain(decoded);
    if (translated === decoded) return full;
    const encoded = translated.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `${indent}'${encoded}'${comma}`;
  });

  // 4) Single-line JS comments: // ... (only if they contain foreign letters)
  result = result.replace(/^(\s*)\/\/\s*(.*)$/gm, (full, indent, body) => {
    if (!/[A-Za-zÀ-ž]{3,}/.test(body)) return full;
    const translated = translatePlain(body);
    if (translated === body) return full;
    return `${indent}// ${translated}`;
  });

  return result;
}

const file = 'index.html';
const before = fs.readFileSync(file, 'utf8');
const after = processFile(before);
if (before !== after) {
  fs.writeFileSync(file, after, 'utf8');
  console.log(`${file}: ${before.length} → ${after.length} chars (${after.length - before.length > 0 ? '+' : ''}${after.length - before.length})`);
} else {
  console.log('No changes');
}
