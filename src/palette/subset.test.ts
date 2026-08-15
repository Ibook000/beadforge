import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadSubset, saveSubset, SUBSET_STORAGE_KEY } from './subset';

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  });
});

describe('subset 持久化', () => {
  it('没有存档时返回空数组', () => {
    expect(loadSubset('mard')).toEqual([]);
  });

  it('存了能读回来，且已排序', () => {
    saveSubset('mard', [3, 1, 7]);
    expect(loadSubset('mard')).toEqual([1, 3, 7]);
  });

  it('不同色卡互不干扰', () => {
    saveSubset('mard', [1, 2]);
    saveSubset('hama', [9]);
    expect(loadSubset('mard')).toEqual([1, 2]);
    expect(loadSubset('hama')).toEqual([9]);
  });

  it('存重复值应去重', () => {
    saveSubset('perler', [5, 5, 2, 2]);
    expect(loadSubset('perler')).toEqual([2, 5]);
  });

  it('存空数组表示全选，能正确读回', () => {
    saveSubset('mard', [1, 2]);
    saveSubset('mard', []);
    expect(loadSubset('mard')).toEqual([]);
  });

  it('localStorage 里是坏数据时应返回空数组而不是抛异常', () => {
    localStorage.setItem(SUBSET_STORAGE_KEY, '{不是 json');
    expect(loadSubset('mard')).toEqual([]);
  });

  it('localStorage 写入失败不应把异常抛给调用方', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    });
    expect(() => saveSubset('mard', [1])).not.toThrow();
  });
});
