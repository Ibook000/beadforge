import { describe, it, expect } from 'vitest';
import { medianCutLab } from './quantize';
import type { RGB } from './space';

describe('medianCutLab', () => {
  it('输入色数 ≤ maxColors 时应原样返回去重结果', () => {
    const colors: RGB[] = [
      [255, 0, 0],
      [0, 255, 0],
      [255, 0, 0],
    ];
    expect(medianCutLab(colors, 8)).toHaveLength(2);
  });

  it('应产出恰好 maxColors 个代表色', () => {
    const colors: RGB[] = [];
    for (let i = 0; i < 200; i++) {
      colors.push([(i * 37) % 256, (i * 91) % 256, (i * 53) % 256]);
    }
    expect(medianCutLab(colors, 8)).toHaveLength(8);
    expect(medianCutLab(colors, 3)).toHaveLength(3);
  });

  it('三个分离明显的聚簇，取 3 色时每簇应各出一个代表', () => {
    const colors: RGB[] = [];
    const clusters: RGB[] = [
      [240, 20, 20],
      [20, 240, 20],
      [20, 20, 240],
    ];
    for (const [r, g, b] of clusters) {
      for (let k = 0; k < 30; k++) colors.push([r + (k % 5), g + (k % 5), b + (k % 5)]);
    }
    const out = medianCutLab(colors, 3);
    expect(out).toHaveLength(3);
    for (const c of clusters) {
      const near = out.some(
        (o) =>
          Math.abs(o[0] - c[0]) < 40 && Math.abs(o[1] - c[1]) < 40 && Math.abs(o[2] - c[2]) < 40,
      );
      expect(near).toBe(true);
    }
  });

  it('高频色应主导代表色（按出现次数加权）', () => {
    const colors: RGB[] = [];
    for (let i = 0; i < 100; i++) colors.push([250, 10, 10]); // 大量红
    colors.push([10, 10, 250]); // 一个蓝
    const out = medianCutLab(colors, 1);
    expect(out).toHaveLength(1);
    expect(out[0]![0]).toBeGreaterThan(out[0]![2]);
  });

  it('maxColors 为 1 时应返回单个平均色', () => {
    expect(
      medianCutLab(
        [
          [0, 0, 0],
          [255, 255, 255],
        ],
        1,
      ),
    ).toHaveLength(1);
  });

  it('空输入应返回空数组', () => {
    expect(medianCutLab([], 8)).toEqual([]);
  });

  it('单色输入应返回该色', () => {
    expect(
      medianCutLab(
        [
          [7, 8, 9],
          [7, 8, 9],
        ],
        5,
      ),
    ).toEqual([[7, 8, 9]]);
  });
});
