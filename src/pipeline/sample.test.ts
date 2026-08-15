import { describe, it, expect } from 'vitest';
import { sampleImage, type RgbaGrid } from './sample';

function makeGrid(
  w: number,
  h: number,
  fill: (x: number, y: number) => [number, number, number, number],
): RgbaGrid {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { width: w, height: h, data };
}

function px(g: RgbaGrid, x: number, y: number): [number, number, number, number] {
  const i = (y * g.width + x) * 4;
  return [g.data[i]!, g.data[i + 1]!, g.data[i + 2]!, g.data[i + 3]!];
}

describe('sampleImage', () => {
  it('纯色图降采样后仍是纯色', () => {
    const src = makeGrid(40, 40, () => [200, 100, 50, 255]);
    const out = sampleImage(src, 8, 8, 'average');
    expect(out.width).toBe(8);
    expect(out.height).toBe(8);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const [r, g, b] = px(out, x, y);
        expect(Math.abs(r - 200)).toBeLessThanOrEqual(1);
        expect(Math.abs(g - 100)).toBeLessThanOrEqual(1);
        expect(Math.abs(b - 50)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('黑白棋盘格的 average 应在 linear 空间平均（约 188，不是 128）', () => {
    const src = makeGrid(16, 16, (x, y) => {
      const v = (x + y) % 2 === 0 ? 255 : 0;
      return [v, v, v, 255];
    });
    const out = sampleImage(src, 1, 1, 'average');
    const [r] = px(out, 0, 0);
    // linearToSrgb(0.5) * 255 ≈ 188。若得到 128 说明在 sRGB 空间平均了，结果会整体偏暗。
    expect(r).toBeGreaterThan(180);
    expect(r).toBeLessThan(196);
  });

  it('median 模式应抗单点噪声', () => {
    const src = makeGrid(4, 4, (x, y) =>
      x === 1 && y === 1 ? [255, 255, 255, 255] : [100, 100, 100, 255],
    );
    const out = sampleImage(src, 1, 1, 'median');
    expect(px(out, 0, 0)[0]).toBe(100);
  });

  it('nearest 模式应取区域中心像素', () => {
    const src = makeGrid(4, 1, (x) => (x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const out = sampleImage(src, 2, 1, 'nearest');
    expect(px(out, 0, 0)[0]).toBe(0);
    expect(px(out, 1, 0)[0]).toBe(255);
  });

  it('alpha 应被保留并参与平均', () => {
    const src = makeGrid(4, 4, (x) => (x < 2 ? [255, 0, 0, 0] : [255, 0, 0, 255]));
    const out = sampleImage(src, 1, 1, 'average');
    expect(px(out, 0, 0)[3]).toBeGreaterThan(100);
    expect(px(out, 0, 0)[3]).toBeLessThan(155);
  });

  it('目标尺寸大于源尺寸时不应崩（每格至少覆盖一个源像素）', () => {
    const src = makeGrid(2, 2, () => [10, 20, 30, 255]);
    const out = sampleImage(src, 5, 5, 'average');
    expect(out.width).toBe(5);
    expect(px(out, 4, 4)[0]).toBe(10);
  });

  it('降到 29×29 时不应有未覆盖的格子', () => {
    const src = makeGrid(1000, 1000, () => [77, 88, 99, 255]);
    const out = sampleImage(src, 29, 29, 'average');
    for (let i = 0; i < 29 * 29; i++) {
      expect(out.data[i * 4 + 3]).toBe(255);
    }
  });
});
