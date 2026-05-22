#!/usr/bin/env node
// Restore PMC inside URLs that the translation pass corrupted
const fs = require('fs');
const path = require('path');

const dictDir = path.join(process.cwd(), 'dictionary');
const files = fs.readdirSync(dictDir).filter(f => f.endsWith('.md'));

let totalFixed = 0;
for (const f of files) {
  const fp = path.join(dictDir, f);
  let txt = fs.readFileSync(fp, 'utf8');
  const before = txt;
  // Replace "PMC（PubMed Central）N..." (followed by digit) back to "PMCN..."
  txt = txt.replace(/PMC（PubMed Central）(\d)/g, 'PMC$1');
  if (txt !== before) {
    fs.writeFileSync(fp, txt, 'utf8');
    const count = (before.match(/PMC（PubMed Central）\d/g) || []).length;
    console.log(`  ${f}: restored ${count} PMC ids in URLs/refs`);
    totalFixed += count;
  }
}
console.log(`Total: ${totalFixed} PMC ids restored.`);
