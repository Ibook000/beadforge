import { describe, it, expect } from 'vitest';
import { computeGeometry, formatGeometry } from './geometry';

describe('computeGeometry', () => {
  it('5mm 豆 29×29 应为一块标准底板、约 14.5cm 见方', () => {
    const g = computeGeometry(29, 29, 5);
    expect(g.widthCm).toBeCloseTo(14.5, 2);
    expect(g.heightCm).toBeCloseTo(14.5, 2);
    expect(g.boardsX).toBe(1);
    expect(g.boardsY).toBe(1);
    expect(g.totalCells).toBe(841);
  });

  it('5mm 豆 29×34 应需要 1×2 块底板', () => {
    const g = computeGeometry(29, 34, 5);
    expect(g.boardsX).toBe(1);
    expect(g.boardsY).toBe(2);
  });

  it('5mm 豆 58×58 应需要 2×2 块底板', () => {
    const g = computeGeometry(58, 58, 5);
    expect(g.boardsX).toBe(2);
    expect(g.boardsY).toBe(2);
  });

  it('2.6mm 豆的底板为 57×57 钉', () => {
    expect(computeGeometry(57, 57, 2.6).boardsX).toBe(1);
    expect(computeGeometry(58, 57, 2.6).boardsX).toBe(2);
    expect(computeGeometry(57, 57, 2.6).boardPegs).toBe(57);
  });

  it('2.6mm 豆的物理尺寸应按 2.6mm 算', () => {
    expect(computeGeometry(100, 100, 2.6).widthCm).toBeCloseTo(26, 2);
  });
});

describe('formatGeometry', () => {
  it('应输出人类可读的一行摘要', () => {
    const s = formatGeometry(computeGeometry(29, 34, 5), 986);
    expect(s).toContain('29 × 34 格');
    expect(s).toContain('986 颗');
    expect(s).toContain('14.5');
    expect(s).toContain('17.0');
    expect(s).toContain('1×2');
  });

  it('大数字应带千分位', () => {
    expect(formatGeometry(computeGeometry(100, 100, 5), 10000)).toContain('10,000');
  });
});
