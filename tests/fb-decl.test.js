import { describe, it, expect } from 'vitest';
import { fbNormalizeMentalDecls } from '../app/src/lib/fb.js';

describe('fbNormalizeMentalDecls（declShared スナップショット → 表示モデル）', () => {
  it('null・非オブジェクト・declarations欠落は null', () => {
    expect(fbNormalizeMentalDecls(null)).toBeNull();
    expect(fbNormalizeMentalDecls('x')).toBeNull();
    expect(fbNormalizeMentalDecls({})).toBeNull();
    expect(fbNormalizeMentalDecls({ declarations: 'not-array' })).toBeNull();
  });

  it('進行中のみ active に入り、完了は completedCount に数える', () => {
    const v = fbNormalizeMentalDecls({
      declarations: [
        { id: 'a', declaration: '毎朝ストレッチ', startDate: '2026-07-01', checkCount: 5, completed: false },
        { id: 'b', declaration: '夜スマホ断ち', startDate: '2026-06-01', checkCount: 20, completed: true },
      ],
      updatedAt: 123,
    });
    expect(v.active).toHaveLength(1);
    expect(v.active[0].declaration).toBe('毎朝ストレッチ');
    expect(v.completedCount).toBe(1);
    expect(v.updatedAt).toBe(123);
  });

  it('declaration テキストが空のエントリは除外する', () => {
    const v = fbNormalizeMentalDecls({
      declarations: [{ id: 'a', declaration: '', completed: false }, null],
      updatedAt: 0,
    });
    expect(v.active).toHaveLength(0);
    expect(v.completedCount).toBe(0);
  });
});
