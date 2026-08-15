import { describe, it, expect } from 'vitest';
import { buildGrid, DEFAULT_BUILD_PARAMS } from './build';
import type { RgbaGrid } from './sample';
import { computeStats } from '../model/stats';
import { getPalette } from '../palette/registry';

function solid(w: number, h: number, rgb: [number, number, number], alpha = 255): RgbaGrid {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = alpha;
  }
  return { width: w, height: h, data };
}

function noise(w: number, h: number): RgbaGrid {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = (i * 37) % 256;
    data[i * 4 + 1] = (i * 91) % 256;
    data[i * 4 + 2] = (i * 53) % 256;
    data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

describe('buildGrid', () => {
  it('应产出正确尺寸的网格', () => {
    const g = buildGrid(solid(100, 100, [200, 30, 40]), {
      ...DEFAULT_BUILD_PARAMS,
      widthCells: 29,
      heightCells: 29,
    });
    expect(g.width).toBe(29);
    expect(g.height).toBe(29);
    expect(g.cells.length).toBe(841);
    expect(g.paletteId).toBe('mard');
  });

  it('纯红图应全部匹配到同一个偏红的豆号', () => {
    const g = buildGrid(solid(60, 60, [252, 40, 60]), {
      ...DEFAULT_BUILD_PARAMS,
      widthCells: 10,
      heightCells: 10,
    });
    expect(new Set(g.cells).size).toBe(1);
    const bead = getPalette('mard').beads[g.cells[0]!]!;
    expect(bead.rgb[0]).toBeGreaterThan(bead.rgb[1]);
    expect(bead.rgb[0]).toBeGreaterThan(bead.rgb[2]);
  });

  it('全透明图应全部是空格', () => {
    const g = buildGrid(solid(40, 40, [200, 30, 40], 0), {
      ...DEFAULT_BUILD_PARAMS,
      widthCells: 8,
      heightCells: 8,
    });
    expect([...g.mask].every((v) => v === 0)).toBe(true);
    expect(computeStats(g, getPalette('mard')).totalBeads).toBe(0);
  });

  it('maxColors 应限制用色数', () => {
    const g = buildGrid(noise(80, 80), {
      ...DEFAULT_BUILD_PARAMS,
      widthCells: 40,
      heightCells: 40,
      maxColors: 8,
      despeckle: 'off',
    });
    expect(computeStats(g, getPalette('mard')).colorCount).toBeLessThanOrEqual(8);
  });

  it('allowedBeads 子集应被遵守', () => {
    const allowed = new Set([0, 1, 2]);
    const g = buildGrid(solid(50, 50, [10, 200, 90]), {
      ...DEFAULT_BUILD_PARAMS,
      widthCells: 12,
      heightCells: 12,
      allowedBeads: allowed,
    });
    for (let i = 0; i < g.cells.length; i++) {
      if (g.mask[i] === 1) expect(allowed.has(g.cells[i]!)).toBe(true);
    }
  });

  it('切换色卡应产出对应色卡的豆号', () => {
    const g = buildGrid(solid(50, 50, [10, 200, 90]), {
      ...DEFAULT_BUILD_PARAMS,
      widthCells: 10,
      heightCells: 10,
      paletteId: 'hama',
    });
    expect(g.paletteId).toBe('hama');
    for (const c of g.cells) expect(c).toBeLessThan(getPalette('hama').beads.length);
  });

  it('同样输入同样参数应产出完全相同的结果（确定性）', () => {
    const src = noise(60, 60);
    const p = {
      ...DEFAULT_BUILD_PARAMS,
      widthCells: 20,
      heightCells: 20,
      dither: 'atkinson' as const,
    };
    expect([...buildGrid(src, p).cells]).toEqual([...buildGrid(src, p).cells]);
  });

  it('去孤点应减少噪声图的用色数', () => {
    const src = noise(60, 60);
    const base = { ...DEFAULT_BUILD_PARAMS, widthCells: 30, heightCells: 30 };
    const palette = getPalette('mard');
    const off = computeStats(buildGrid(src, { ...base, despeckle: 'off' }), palette).colorCount;
    const strong = computeStats(
      buildGrid(src, { ...base, despeckle: 'strong' }),
      palette,
    ).colorCount;
    expect(strong).toBeLessThanOrEqual(off);
  });

  it('200×200 大图应在合理时间内跑完（唯一色去重生效）', () => {
    const t0 = performance.now();
    const g = buildGrid(noise(800, 800), {
      ...DEFAULT_BUILD_PARAMS,
      widthCells: 200,
      heightCells: 200,
    });
    const ms = performance.now() - t0;
    expect(g.cells.length).toBe(40000);
    // 不做严格性能断言（CI 机器差异大），但超过 15 秒说明缓存没生效
    expect(ms).toBeLessThan(15000);
  });
});
