import { describe, it, expect } from 'vitest';
import { createMatcher } from './matcher';
import { getPalette } from '../palette/registry';
import type { Bead } from '../palette/types';
import { rgbToLab, type RGB } from './space';

function bead(code: string, rgb: RGB): Bead {
  return { code, name: code, nameZh: code, hex: '#000000', rgb, lab: rgbToLab(rgb) };
}

describe('createMatcher', () => {
  const beads = [
    bead('W', [255, 255, 255]),
    bead('K', [0, 0, 0]),
    bead('R', [255, 0, 0]),
    bead('G', [0, 255, 0]),
    bead('B', [0, 0, 255]),
  ];

  it('精确色应匹配到自己', () => {
    const m = createMatcher(beads);
    expect(m.match([255, 255, 255])).toBe(0);
    expect(m.match([0, 0, 0])).toBe(1);
    expect(m.match([255, 0, 0])).toBe(2);
  });

  it('近似色应匹配到最近的', () => {
    const m = createMatcher(beads);
    expect(m.match([250, 10, 12])).toBe(2); // 近红
    expect(m.match([246, 246, 250])).toBe(0); // 近白
  });

  it('allowed 子集应限制候选范围', () => {
    // 只允许黑白，纯红必须落到其中之一而不是红
    const m = createMatcher(beads, new Set([0, 1]));
    expect([0, 1]).toContain(m.match([255, 0, 0]));
  });

  it('allowed 为空集时视为全选', () => {
    const m = createMatcher(beads, new Set());
    expect(m.match([255, 0, 0])).toBe(2);
  });

  it('候选为空时应抛出明确错误', () => {
    expect(() => createMatcher([])).toThrow('至少需要一个候选颜色');
  });

  it('重复查询应走缓存并返回相同结果', () => {
    const m = createMatcher(beads);
    const first = m.match([123, 45, 67]);
    expect(m.match([123, 45, 67])).toBe(first);
  });

  it('真实色卡：纯黑应匹配到很暗的豆号', () => {
    const mard = getPalette('mard');
    const m = createMatcher(mard.beads);
    const matched = mard.beads[m.match([0, 0, 0])]!;
    expect(matched.lab[0]).toBeLessThan(15);
  });

  it('真实色卡：肤色应匹配到相近的暖色而不是灰', () => {
    const mard = getPalette('mard');
    const m = createMatcher(mard.beads);
    const matched = mard.beads[m.match([240, 200, 175])]!;
    // 红通道应明显高于蓝通道 —— 匹配到中性灰就说明色差算错了
    expect(matched.rgb[0]).toBeGreaterThan(matched.rgb[2] + 15);
  });
});
