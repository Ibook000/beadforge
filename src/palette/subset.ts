import type { PaletteId } from './types';

export const SUBSET_STORAGE_KEY = 'pindou.subset.v1';

type SubsetMap = Partial<Record<PaletteId, number[]>>;

function readAll(): SubsetMap {
  try {
    const raw = localStorage.getItem(SUBSET_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as SubsetMap) : {};
  } catch {
    // 坏数据（手工改过、版本不兼容）当作没有存档 —— 不能让整个应用起不来
    return {};
  }
}

/** 返回该色卡勾选的豆号下标。空数组表示「全选」。 */
export function loadSubset(paletteId: PaletteId): number[] {
  const v = readAll()[paletteId];
  return Array.isArray(v) ? v : [];
}

export function saveSubset(paletteId: PaletteId, indices: readonly number[]): void {
  const all = readAll();
  all[paletteId] = [...new Set(indices)].sort((a, b) => a - b);
  try {
    localStorage.setItem(SUBSET_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // 存不下就算了，不影响当前会话
  }
}
