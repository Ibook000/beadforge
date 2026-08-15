import { describe, it, expect } from 'vitest';
import { quantizeToCells } from './dither';
import { createMatcher } from './matcher';
import type { RgbaGrid } from '../pipeline/sample';
import { rgbToLab, srgbToLinear, type RGB } from './space';
import type { Bead } from '../palette/types';

function bead(code: string, rgb: RGB): Bead {
  return { code, name: code, nameZh: code, hex: '#000000', rgb, lab: rgbToLab(rgb) };
}

/** 只有黑白两色的调色板 —— 抖动效果最容易观察 */
const BW = [bead('K', [0, 0, 0]), bead('W', [255, 255, 255])];

function solid(w: number, h: number, v: number): RgbaGrid {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

describe('quantizeToCells', () => {
  it('none 模式：纯色应全部落到同一豆号', () => {
    const cells = quantizeToCells(
      solid(8, 8, 250),
      new Uint8Array(64).fill(1),
      createMatcher(BW),
      BW,
      'none',
    );
    expect([...new Set(cells)]).toEqual([1]);
  });

  it('none 模式：50% 灰在黑白调色板下不应出现混合', () => {
    const cells = quantizeToCells(
      solid(8, 8, 128),
      new Uint8Array(64).fill(1),
      createMatcher(BW),
      BW,
      'none',
    );
    expect(new Set(cells).size).toBe(1);
  });

  it('atkinson：中灰应产生黑白混合', () => {
    const cells = quantizeToCells(
      solid(16, 16, 128),
      new Uint8Array(256).fill(1),
      createMatcher(BW),
      BW,
      'atkinson',
    );
    expect(new Set(cells).size).toBe(2);
  });

  it('floyd-steinberg：白豆比例应符合 linear 光通量而非 sRGB 数值', () => {
    // sRGB 128 是「感知」中灰，物理上只反射 srgbToLinear(128/255) ≈ 21.6% 的光。
    // 黑白豆交替摆放、远看融合时，眼睛积分的是光通量，所以正确的白豆比例是 ~21.6%
    // 而不是 50%。这条断言守护「误差在 linear RGB 空间累加」这个决定 ——
    // 一旦有人把它改回 sRGB 空间，比例会跳到 ~50%，这里立刻炸。
    const cells = quantizeToCells(
      solid(32, 32, 128),
      new Uint8Array(1024).fill(1),
      createMatcher(BW),
      BW,
      'floyd-steinberg',
    );
    const ratio = [...cells].filter((c) => c === 1).length / cells.length;
    expect(ratio).toBeGreaterThan(0.16);
    expect(ratio).toBeLessThan(0.28);
  });

  it('抖动后的平均光通量应逼近原图（这才是抖动的意义）', () => {
    const target = srgbToLinear(128 / 255);
    const cells = quantizeToCells(
      solid(40, 40, 128),
      new Uint8Array(1600).fill(1),
      createMatcher(BW),
      BW,
      'atkinson',
    );
    // 黑豆 linear = 0，白豆 linear = 1，所以平均光通量就是白豆占比
    const mean = [...cells].filter((c) => c === 1).length / cells.length;
    expect(Math.abs(mean - target)).toBeLessThan(0.06);
  });

  it('空格不应参与误差扩散，且输出值不越界', () => {
    const mask = new Uint8Array(16).fill(1);
    mask[5] = 0;
    const cells = quantizeToCells(solid(4, 4, 128), mask, createMatcher(BW), BW, 'atkinson');
    expect(cells.length).toBe(16);
    for (const c of cells) expect(c).toBeLessThan(BW.length);
  });

  it('输出长度应等于像素数', () => {
    const cells = quantizeToCells(
      solid(5, 3, 100),
      new Uint8Array(15).fill(1),
      createMatcher(BW),
      BW,
      'none',
    );
    expect(cells.length).toBe(15);
  });

  it('同样输入应产出同样结果（确定性）', () => {
    const src = solid(12, 12, 160);
    const mask = new Uint8Array(144).fill(1);
    const a = quantizeToCells(src, mask, createMatcher(BW), BW, 'atkinson');
    const b = quantizeToCells(src, mask, createMatcher(BW), BW, 'atkinson');
    expect([...a]).toEqual([...b]);
  });
});
