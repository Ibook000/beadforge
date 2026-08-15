import { describe, it, expect } from 'vitest';
import { getPalette, listPalettes, PALETTE_IDS } from './registry';
import { rgbToLab, hexToRgb } from '../color/space';

describe('色卡注册表', () => {
  it('五套色卡的色数应符合预期', () => {
    const expected: Record<string, number> = {
      mard: 291,
      'artkal-s': 199,
      'artkal-c': 174,
      perler: 103,
      hama: 92,
    };
    for (const id of PALETTE_IDS) {
      expect(getPalette(id).beads.length).toBe(expected[id]);
    }
  });

  it('每颗豆的 lab 应与 rgbToLab(rgb) 一致', () => {
    for (const id of PALETTE_IDS) {
      for (const bead of getPalette(id).beads) {
        const computed = rgbToLab(bead.rgb);
        for (let i = 0; i < 3; i++) {
          expect(Math.abs(bead.lab[i]! - computed[i]!)).toBeLessThan(0.001);
        }
      }
    }
  });

  it('hex 应与 rgb 一致', () => {
    for (const id of PALETTE_IDS) {
      for (const bead of getPalette(id).beads) {
        expect(hexToRgb(bead.hex)).toEqual(bead.rgb);
      }
    }
  });

  it('每颗豆都应有非空的中文名', () => {
    for (const id of PALETTE_IDS) {
      for (const bead of getPalette(id).beads) {
        expect(bead.nameZh.length).toBeGreaterThan(0);
      }
    }
  });

  it('同一色卡内色号不应重复', () => {
    for (const id of PALETTE_IDS) {
      const codes = getPalette(id).beads.map((b) => b.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it('rgb 各通道应在 0–255 且为整数', () => {
    for (const id of PALETTE_IDS) {
      for (const bead of getPalette(id).beads) {
        for (const c of bead.rgb) {
          expect(Number.isInteger(c)).toBe(true);
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it('按豆径筛选应生效', () => {
    expect(listPalettes(2.6).map((p) => p.id)).toEqual(['artkal-c']);
    expect(listPalettes(5).length).toBe(4);
    expect(listPalettes().length).toBe(5);
  });

  it('未知色卡应抛出明确错误', () => {
    // @ts-expect-error 故意传非法 id
    expect(() => getPalette('nope')).toThrow('未知色卡');
  });
});
