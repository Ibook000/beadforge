import { describe, it, expect } from 'vitest';
import { ciede2000, cie76 } from './distance';
import { CIEDE2000_TEST_DATA } from './ciede2000-testdata';

describe('ciede2000', () => {
  it('应通过 Sharma 官方 34 组测试数据', () => {
    expect(CIEDE2000_TEST_DATA).toHaveLength(34);
    for (const [ref, sample, expected] of CIEDE2000_TEST_DATA) {
      const got = ciede2000(ref, sample);
      expect(got).toBeCloseTo(expected, 4);
    }
  });

  it('应对称：ΔE(a,b) === ΔE(b,a)', () => {
    for (const [ref, sample] of CIEDE2000_TEST_DATA) {
      expect(ciede2000(ref, sample)).toBeCloseTo(ciede2000(sample, ref), 10);
    }
  });

  it('同色应为 0', () => {
    expect(ciede2000([50, 2.5, -3], [50, 2.5, -3])).toBeCloseTo(0, 10);
  });
});

describe('cie76', () => {
  it('就是 Lab 空间欧氏距离', () => {
    expect(cie76([50, 0, 0], [53, 4, 0])).toBeCloseTo(5, 10);
  });
});
