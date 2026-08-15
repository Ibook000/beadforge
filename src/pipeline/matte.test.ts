import { describe, it, expect } from 'vitest';
import { buildMask } from './matte';
import type { RgbaGrid } from './sample';

function grid(
  w: number,
  h: number,
  pixels: Array<[number, number, number, number]>,
): RgbaGrid {
  const data = new Uint8ClampedArray(w * h * 4);
  pixels.forEach(([r, g, b, a], i) => {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  });
  return { width: w, height: h, data };
}

const WHITE: [number, number, number, number] = [255, 255, 255, 255];
const BLACK: [number, number, number, number] = [0, 0, 0, 255];

describe('buildMask', () => {
  it('alpha < 阈值的格子应为空', () => {
    const g = grid(3, 1, [
      [0, 0, 0, 255],
      [0, 0, 0, 127],
      [0, 0, 0, 0],
    ]);
    expect([...buildMask(g, 128, 0)]).toEqual([1, 0, 0]);
  });

  it('bgTolerance = 0 时不做背景剔除', () => {
    const g = grid(3, 3, [WHITE, WHITE, WHITE, WHITE, BLACK, WHITE, WHITE, WHITE, WHITE]);
    expect([...buildMask(g, 128, 0)].every((v) => v === 1)).toBe(true);
  });

  it('bgTolerance > 0 应剔除接近四角中位色的格子', () => {
    const g = grid(3, 3, [WHITE, WHITE, WHITE, WHITE, BLACK, WHITE, WHITE, WHITE, WHITE]);
    const m = buildMask(g, 128, 30);
    expect(m[4]).toBe(1); // 中心黑保留
    expect(m[0]).toBe(0); // 角落白剔除
    expect(m.reduce((a, v) => a + v, 0)).toBe(1);
  });

  it('容差应能吃掉接近但不完全相同的背景色', () => {
    const g = grid(2, 2, [
      [250, 250, 250, 255],
      [248, 251, 249, 255],
      [252, 249, 250, 255],
      [10, 10, 10, 255],
    ]);
    const m = buildMask(g, 128, 20);
    expect(m[3]).toBe(1);
    expect(m[0]).toBe(0);
  });

  it('已因 alpha 判空的格子不应被背景逻辑重复处理', () => {
    const g = grid(2, 1, [
      [255, 255, 255, 0],
      [255, 255, 255, 255],
    ]);
    const m = buildMask(g, 128, 50);
    expect(m[0]).toBe(0);
  });
});
