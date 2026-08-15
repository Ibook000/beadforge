import { describe, it, expect } from 'vitest';
import { adjust, DEFAULT_ADJUST } from './adjust';
import type { RgbaGrid } from './sample';

function grid(pixels: Array<[number, number, number, number]>): RgbaGrid {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a], i) => {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  });
  return { width: pixels.length, height: 1, data };
}

describe('adjust', () => {
  it('默认参数应为恒等变换', () => {
    const src = grid([
      [10, 128, 250, 255],
      [0, 0, 0, 0],
    ]);
    const out = adjust(src, DEFAULT_ADJUST);
    expect([...out.data]).toEqual([...src.data]);
  });

  it('brightness > 1 应变亮', () => {
    const out = adjust(grid([[100, 100, 100, 255]]), { ...DEFAULT_ADJUST, brightness: 1.5 });
    expect(out.data[0]!).toBeGreaterThan(100);
  });

  it('saturation = 0 应变灰（三通道相等）', () => {
    const out = adjust(grid([[200, 50, 20, 255]]), { ...DEFAULT_ADJUST, saturation: 0 });
    expect(out.data[0]).toBe(out.data[1]);
    expect(out.data[1]).toBe(out.data[2]);
  });

  it('contrast > 1 应把中灰以上推更亮、以下推更暗', () => {
    const out = adjust(
      grid([
        [200, 200, 200, 255],
        [50, 50, 50, 255],
      ]),
      { ...DEFAULT_ADJUST, contrast: 1.6 },
    );
    expect(out.data[0]!).toBeGreaterThan(200);
    expect(out.data[4]!).toBeLessThan(50);
  });

  it('gamma > 1 应提亮暗部，< 1 应压暗（与 Photoshop / ImageMagick 一致）', () => {
    expect(adjust(grid([[60, 60, 60, 255]]), { ...DEFAULT_ADJUST, gamma: 2 }).data[0]!).toBeGreaterThan(60);
    expect(adjust(grid([[60, 60, 60, 255]]), { ...DEFAULT_ADJUST, gamma: 0.5 }).data[0]!).toBeLessThan(60);
  });

  it('alpha 通道不应被任何调整改变', () => {
    const out = adjust(grid([[100, 100, 100, 77]]), {
      brightness: 2,
      contrast: 2,
      saturation: 0,
      gamma: 0.5,
    });
    expect(out.data[3]).toBe(77);
  });

  it('不应修改输入', () => {
    const src = grid([[100, 100, 100, 255]]);
    adjust(src, { ...DEFAULT_ADJUST, brightness: 2 });
    expect(src.data[0]).toBe(100);
  });

  it('极端参数不应产生越界值', () => {
    const out = adjust(grid([[250, 5, 128, 255]]), {
      brightness: 5,
      contrast: 5,
      saturation: 5,
      gamma: 0.2,
    });
    for (let i = 0; i < 3; i++) {
      expect(out.data[i]!).toBeGreaterThanOrEqual(0);
      expect(out.data[i]!).toBeLessThanOrEqual(255);
    }
  });
});
