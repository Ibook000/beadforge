import { describe, it, expect } from 'vitest';
import { PatchHistory } from './patch';

describe('PatchHistory', () => {
  it('初始为空，不能撤销也不能重做', () => {
    const h = new PatchHistory();
    expect(h.size).toBe(0);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });

  it('apply 后能读到改动', () => {
    const h = new PatchHistory();
    h.apply(5, 12);
    expect(h.current.get(5)).toBe(12);
    expect(h.size).toBe(1);
    expect(h.canUndo).toBe(true);
  });

  it('undo 应回到上一状态', () => {
    const h = new PatchHistory();
    h.apply(5, 12);
    h.apply(6, 3);
    expect(h.undo()).toBe(true);
    expect(h.current.has(6)).toBe(false);
    expect(h.current.get(5)).toBe(12);
  });

  it('redo 应重做被撤销的改动', () => {
    const h = new PatchHistory();
    h.apply(5, 12);
    h.undo();
    expect(h.canRedo).toBe(true);
    expect(h.redo()).toBe(true);
    expect(h.current.get(5)).toBe(12);
  });

  it('undo 后再 apply 应清空 redo 栈', () => {
    const h = new PatchHistory();
    h.apply(1, 1);
    h.apply(2, 2);
    h.undo();
    h.apply(3, 3);
    expect(h.canRedo).toBe(false);
    expect(h.current.has(2)).toBe(false);
    expect(h.current.get(3)).toBe(3);
  });

  it('同一格重复涂同色不应产生新的历史条目', () => {
    const h = new PatchHistory();
    h.apply(5, 12);
    h.apply(5, 12);
    h.undo();
    expect(h.current.size).toBe(0);
  });

  it('同一格改成不同色应记为新的一步', () => {
    const h = new PatchHistory();
    h.apply(5, 12);
    h.apply(5, 13);
    expect(h.current.get(5)).toBe(13);
    h.undo();
    expect(h.current.get(5)).toBe(12);
  });

  it('空栈上 undo/redo 应返回 false 而不抛异常', () => {
    const h = new PatchHistory();
    expect(h.undo()).toBe(false);
    expect(h.redo()).toBe(false);
  });

  it('clear 应清空一切', () => {
    const h = new PatchHistory();
    h.apply(1, 1);
    h.clear();
    expect(h.size).toBe(0);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });

  it('restore 应载入存档且不保留旧历史', () => {
    const h = new PatchHistory();
    h.apply(1, 1);
    h.restore([
      [7, 7],
      [8, 8],
    ]);
    expect(h.size).toBe(2);
    expect(h.current.get(7)).toBe(7);
    expect(h.canUndo).toBe(false);
  });

  it('current 应是只读快照，外部改动不影响内部', () => {
    const h = new PatchHistory();
    h.apply(1, 1);
    (h.current as Map<number, number>).set(99, 99);
    expect(h.current.has(99)).toBe(false);
  });

  it('超过深度上限后仍可用，且保留最近的改动', () => {
    const h = new PatchHistory();
    for (let i = 0; i < 260; i++) h.apply(i, i);
    expect(h.current.get(259)).toBe(259);
    expect(h.canUndo).toBe(true);
    expect(h.undo()).toBe(true);
    expect(h.current.has(259)).toBe(false);
  });

  it('batchApply 应把多个改动记为一个历史条目', () => {
    const h = new PatchHistory();
    h.batchApply([[5, 12], [6, 13], [7, 14]]);
    expect(h.size).toBe(3);
    expect(h.current.get(5)).toBe(12);
    expect(h.current.get(6)).toBe(13);
    expect(h.current.get(7)).toBe(14);
    expect(h.canUndo).toBe(true);
    h.undo();
    expect(h.size).toBe(0);
  });

  it('batchApply 空数组不应创建历史', () => {
    const h = new PatchHistory();
    h.batchApply([]);
    expect(h.canUndo).toBe(false);
  });

  it('batchApply 应跳过无变化的条目', () => {
    const h = new PatchHistory();
    h.apply(5, 12);
    h.batchApply([[5, 12]]); // 和现状态一样，不应产生新历史
    expect(h.canUndo).toBe(true);
    h.undo();
    expect(h.current.size).toBe(0);
  });

  it('支持橡皮擦语义（-1 = 擦除该格）', () => {
    const h = new PatchHistory();
    h.apply(5, 12);
    h.apply(5, -1); // 擦除第 5 格
    expect(h.current.get(5)).toBe(-1);
    h.undo(); // 撤销擦除，回到有豆状态
    expect(h.current.get(5)).toBe(12);
    h.undo(); // 撤销上一步
    expect(h.current.has(5)).toBe(false);
  });

  it('橡皮擦后同一格改色应记为新一步', () => {
    const h = new PatchHistory();
    h.apply(5, -1);
    h.apply(5, 7);
    expect(h.current.get(5)).toBe(7);
    h.undo();
    expect(h.current.get(5)).toBe(-1);
  });
});