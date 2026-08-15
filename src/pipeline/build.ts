import { sampleImage, type RgbaGrid, type SampleMode } from './sample';
import { adjust, DEFAULT_ADJUST, type AdjustParams } from './adjust';
import { buildMask } from './matte';
import { despeckle, type DespeckleLevel } from './despeckle';
import { createMatcher } from '../color/matcher';
import { quantizeToCells, type DitherMode } from '../color/dither';
import { medianCutLab } from '../color/quantize';
import { getPalette } from '../palette/registry';
import type { PaletteId } from '../palette/types';
import { createGrid, type BeadGrid } from '../model/grid';
import { rgbToLab, type RGB } from '../color/space';

export interface BuildParams {
  widthCells: number;
  heightCells: number;
  paletteId: PaletteId;
  /** 「我有的豆子」子集，undefined 或空集视为全选 */
  allowedBeads?: ReadonlySet<number>;
  sampleMode: SampleMode;
  adjust: AdjustParams;
  /** alpha 低于此值视为空格 */
  alphaThreshold: number;
  /** 纯色背景剔除容差 0–100，0 = 关闭 */
  bgTolerance: number;
  /** 色数上限，0 = 不限制 */
  maxColors: number;
  dither: DitherMode;
  despeckle: DespeckleLevel;
}

export const DEFAULT_BUILD_PARAMS: Omit<BuildParams, 'widthCells' | 'heightCells'> = {
  paletteId: 'mard',
  sampleMode: 'average',
  adjust: DEFAULT_ADJUST,
  alphaThreshold: 128,
  bgTolerance: 0,
  maxColors: 0,
  dither: 'none',
  despeckle: 'weak',
};

/**
 * 跑完整条管线，产出 BeadGrid。
 *
 * 顺序不可随意调换：
 *   采样 → 调整 → 抠图 → 量化 → 匹配(±抖动) → 去孤点
 *
 * 量化必须在匹配之前（见 medianCutLab 的注释）；
 * 去孤点必须在最后 —— 否则抖动会重新引入噪点。
 */
export function buildGrid(src: RgbaGrid, params: BuildParams): BeadGrid {
  const palette = getPalette(params.paletteId);

  // 1. 采样
  const sampled = sampleImage(src, params.widthCells, params.heightCells, params.sampleMode);

  // 2. 调整
  const adjusted = adjust(sampled, params.adjust);

  // 3. 抠图
  const mask = buildMask(adjusted, params.alphaThreshold, params.bgTolerance);

  // 4. 量化（可选）
  const working =
    params.maxColors > 0 ? applyQuantize(adjusted, mask, params.maxColors) : adjusted;

  // 5. 匹配（可选抖动）
  const matcher = createMatcher(palette.beads, params.allowedBeads);
  const cells = quantizeToCells(working, mask, matcher, palette.beads, params.dither);

  const grid = createGrid(params.widthCells, params.heightCells, params.paletteId);
  grid.cells.set(cells);
  grid.mask.set(mask);

  // 6. 去孤点
  return despeckle(grid, params.despeckle);
}

/** 在 Lab 空间取 maxColors 个代表色，把每个非空格像素替换成最近的代表色 */
function applyQuantize(src: RgbaGrid, mask: Uint8Array, maxColors: number): RgbaGrid {
  const colors: RGB[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 1) continue;
    const o = i * 4;
    colors.push([src.data[o]!, src.data[o + 1]!, src.data[o + 2]!]);
  }
  if (colors.length === 0) return src;

  const reps = medianCutLab(colors, maxColors);
  if (reps.length === 0) return src;

  // 复用匹配器：把代表色包装成伪 Bead，这样量化和最终匹配用的是同一套色差逻辑
  const pseudo = reps.map((rgb, i) => ({
    code: String(i),
    name: String(i),
    nameZh: String(i),
    hex: '#000000',
    rgb,
    lab: rgbToLab(rgb),
  }));
  const repMatcher = createMatcher(pseudo);

  const out = new Uint8ClampedArray(src.data);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 1) continue;
    const o = i * 4;
    const rep = reps[repMatcher.match([out[o]!, out[o + 1]!, out[o + 2]!])]!;
    out[o] = rep[0];
    out[o + 1] = rep[1];
    out[o + 2] = rep[2];
  }
  return { width: src.width, height: src.height, data: out };
}
