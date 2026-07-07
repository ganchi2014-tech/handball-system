// 辞書33ファイルを読み込んで sections を構築する共通ヘルパー（splitSectionsは呼び出し側の実装を渡す）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function buildSections(splitSections, dictFiles) {
  const sections = [];
  for (const fm of dictFiles) {
    const p = path.join(ROOT, 'dictionary', fm.name);
    if (!fs.existsSync(p)) continue;
    sections.push(...splitSections(fs.readFileSync(p, 'utf8'), fm));
  }
  return sections;
}
