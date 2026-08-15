import { describe, it, expect } from 'vitest';
import { assignSymbols } from './symbols';

describe('assignSymbols', () => {
  it('每个传入的豆号都应拿到一个符号', () => {
    const indices = [0, 5, 10, 20, 40];
    const m = assignSymbols(indices);
    expect(m.size).toBe(5);
    for (const i of indices) expect(m.get(i)!.length).toBeGreaterThan(0);
  });

  it('同一张图纸内符号不应重复', () => {
    const indices = Array.from({ length: 30 }, (_, i) => i * 3);
    const symbols = [...assignSymbols(indices).values()];
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it('结果应稳定：同样输入两次调用得到同样映射', () => {
    const indices = [3, 1, 7, 2];
    expect([...assignSymbols(indices)]).toEqual([...assignSymbols(indices)]);
  });

  it('输入顺序不影响结果（内部先排序）', () => {
    const a = assignSymbols([7, 1, 3]);
    const b = assignSymbols([1, 3, 7]);
    expect(a.get(1)).toBe(b.get(1));
    expect(a.get(7)).toBe(b.get(7));
  });

  it('重复的豆号应被去重', () => {
    expect(assignSymbols([5, 5, 5]).size).toBe(1);
  });

  it('豆号数超过符号库容量时应回退到双字符组合而不重复', () => {
    const indices = Array.from({ length: 200 }, (_, i) => i);
    const symbols = [...assignSymbols(indices).values()];
    expect(symbols).toHaveLength(200);
    expect(new Set(symbols).size).toBe(200);
  });

  it('空输入返回空映射', () => {
    expect(assignSymbols([]).size).toBe(0);
  });
});
