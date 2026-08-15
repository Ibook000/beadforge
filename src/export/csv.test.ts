import { describe, it, expect } from 'vitest';
import { statsToCsv, CSV_BOM } from './csv';
import { computeStats, type GridStats } from '../model/stats';
import { createGrid, setCell } from '../model/grid';
import { getPalette } from '../palette/registry';

const palette = getPalette('mard');

function sample(): GridStats {
  const g = createGrid(2, 2, 'mard');
  setCell(g, 0, 0, 0);
  setCell(g, 1, 0, 0);
  setCell(g, 0, 1, 1);
  return computeStats(g, palette);
}

describe('statsToCsv', () => {
  it('应以 UTF-8 BOM 开头（否则 Excel 打开中文乱码）', () => {
    expect(statsToCsv(sample()).startsWith(CSV_BOM)).toBe(true);
  });

  it('第一行应是表头', () => {
    const lines = statsToCsv(sample()).replace(CSV_BOM, '').split('\n');
    expect(lines[0]).toBe('色号,颜色名,中文名,HEX,颗数,占比');
  });

  it('数据行数应等于用色数，且按颗数降序', () => {
    const lines = statsToCsv(sample()).replace(CSV_BOM, '').trim().split('\n');
    expect(lines).toHaveLength(3); // 表头 + 2 色
    expect(lines[1]).toContain(palette.beads[0]!.code);
    expect(lines[1]!.split(',')[4]).toBe('2');
    expect(lines[2]!.split(',')[4]).toBe('1');
  });

  it('含逗号或引号的字段应被正确转义', () => {
    const fake: GridStats = {
      totalBeads: 1,
      colorCount: 1,
      emptyCount: 0,
      usages: [
        {
          beadIndex: 0,
          count: 1,
          ratio: 1,
          bead: {
            code: 'A,1',
            name: 'Red "Hot"',
            nameZh: '正红',
            hex: '#FF0000',
            rgb: [255, 0, 0],
            lab: [0, 0, 0],
          },
        },
      ],
    };
    const line = statsToCsv(fake).replace(CSV_BOM, '').split('\n')[1]!;
    expect(line).toContain('"A,1"');
    expect(line).toContain('"Red ""Hot"""');
  });

  it('占比应保留两位小数并带百分号', () => {
    const line = statsToCsv(sample()).replace(CSV_BOM, '').split('\n')[1]!;
    expect(line).toContain('66.67%');
  });

  it('空统计应只有表头', () => {
    const empty: GridStats = { totalBeads: 0, colorCount: 0, emptyCount: 4, usages: [] };
    expect(statsToCsv(empty).replace(CSV_BOM, '').trim().split('\n')).toHaveLength(1);
  });
});
