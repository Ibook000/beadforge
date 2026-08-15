import { describe, it, expect } from 'vitest';
import { createGrid, cloneGrid, idx, getCell, setCell, clearCell, isFilled, countFilled, inBounds } from './grid';

describe('BeadGrid', () => {
  it('新建的网格全部为空格', () => {
    const g = createGrid(3, 2, 'mard');
    expect(g.width).toBe(3);
    expect(g.height).toBe(2);
    expect(g.cells.length).toBe(6);
    expect(g.mask.length).toBe(6);
    expect([...g.mask]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('idx 应按行主序', () => {
    const g = createGrid(3, 2, 'mard');
    expect(idx(g, 0, 0)).toBe(0);
    expect(idx(g, 2, 0)).toBe(2);
    expect(idx(g, 0, 1)).toBe(3);
    expect(idx(g, 2, 1)).toBe(5);
  });

  it('setCell 应同时置位 mask', () => {
    const g = createGrid(2, 2, 'mard');
    setCell(g, 1, 1, 42);
    expect(getCell(g, 1, 1)).toBe(42);
    expect(isFilled(g, 1, 1)).toBe(true);
    expect(isFilled(g, 0, 0)).toBe(false);
  });

  it('clearCell 应把格子置空但不影响别的格子', () => {
    const g = createGrid(2, 1, 'mard');
    setCell(g, 0, 0, 3);
    setCell(g, 1, 0, 4);
    clearCell(g, 0, 0);
    expect(isFilled(g, 0, 0)).toBe(false);
    expect(isFilled(g, 1, 0)).toBe(true);
  });

  it('cells 应能存下 291 色的下标', () => {
    const g = createGrid(1, 1, 'mard');
    setCell(g, 0, 0, 290);
    expect(getCell(g, 0, 0)).toBe(290);
  });

  it('cloneGrid 应深拷贝，改副本不影响原件', () => {
    const g = createGrid(2, 2, 'mard');
    setCell(g, 0, 0, 5);
    const c = cloneGrid(g);
    setCell(c, 0, 0, 9);
    expect(getCell(g, 0, 0)).toBe(5);
    expect(getCell(c, 0, 0)).toBe(9);
  });

  it('countFilled 应只数非空格', () => {
    const g = createGrid(3, 1, 'mard');
    setCell(g, 0, 0, 1);
    setCell(g, 2, 0, 1);
    expect(countFilled(g)).toBe(2);
  });

  it('inBounds 应正确判定边界', () => {
    const g = createGrid(3, 2, 'mard');
    expect(inBounds(g, 0, 0)).toBe(true);
    expect(inBounds(g, 2, 1)).toBe(true);
    expect(inBounds(g, 3, 1)).toBe(false);
    expect(inBounds(g, -1, 0)).toBe(false);
  });
});
