import { describe, it, expect } from 'vitest';
import { rgbToLab, labToRgb, hexToRgb, rgbToHex, luma, srgbToLinear, linearToSrgb } from './space';

describe('srgb ↔ linear', () => {
  it('往返转换应还原', () => {
    for (const c of [0, 0.04, 0.5, 0.9, 1]) {
      expect(linearToSrgb(srgbToLinear(c))).toBeCloseTo(c, 10);
    }
  });

  it('线性段与幂函数段的分界点应连续', () => {
    // sRGB 传输函数在 0.04045 处切换分段
    expect(srgbToLinear(0.04045)).toBeCloseTo(0.04045 / 12.92, 6);
  });
});

describe('rgbToLab', () => {
  it('纯白应为 L=100, a=0, b=0', () => {
    const [L, a, b] = rgbToLab([255, 255, 255]);
    expect(L).toBeCloseTo(100, 3);
    expect(a).toBeCloseTo(0, 3);
    expect(b).toBeCloseTo(0, 3);
  });

  it('纯黑应为 L=0', () => {
    expect(rgbToLab([0, 0, 0])[0]).toBeCloseTo(0, 3);
  });

  it('中灰的 a/b 应为 0', () => {
    const [, a, b] = rgbToLab([128, 128, 128]);
    expect(a).toBeCloseTo(0, 3);
    expect(b).toBeCloseTo(0, 3);
  });

  it('往返 rgb → lab → rgb 应还原（误差 ≤ 1）', () => {
    const samples: Array<[number, number, number]> = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [252, 40, 60],
      [29, 20, 20],
      [245, 236, 210],
    ];
    for (const rgb of samples) {
      const back = labToRgb(rgbToLab(rgb));
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(back[i]! - rgb[i]!)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('hex', () => {
  it('解析与还原', () => {
    expect(hexToRgb('#FC283C')).toEqual([252, 40, 60]);
    expect(rgbToHex([252, 40, 60])).toBe('#FC283C');
  });

  it('应接受不带 # 和小写', () => {
    expect(hexToRgb('fc283c')).toEqual([252, 40, 60]);
  });
});

describe('luma', () => {
  it('白接近 1，黑为 0', () => {
    expect(luma([255, 255, 255])).toBeCloseTo(1, 6);
    expect(luma([0, 0, 0])).toBeCloseTo(0, 6);
  });

  it('绿的亮度应高于红和蓝（Rec.709 权重）', () => {
    expect(luma([0, 255, 0])).toBeGreaterThan(luma([255, 0, 0]));
    expect(luma([255, 0, 0])).toBeGreaterThan(luma([0, 0, 255]));
  });
});
