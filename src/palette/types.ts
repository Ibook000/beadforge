import type { RGB, Lab } from '../color/space';

export type PaletteId = 'mard' | 'artkal-s' | 'artkal-c' | 'perler' | 'hama';

/**
 * 一颗豆子在某品牌色卡中的定义。
 *
 * 注意这里没有 symbol 字段 —— 符号是按每张图纸实际用到的颜色动态分配的
 * （见 palette/symbols.ts）。数据源自带的 symbol 列是机器按 ASCII 码序
 * 生成的，人眼无法区分，不可用。
 */
export interface Bead {
  /** 品牌色号，如 "F4" / "S01" / "80-15179"。图纸上写的就是它。 */
  code: string;
  /** 原始颜色名。MARD 体系无颜色名，此处等于 code。 */
  name: string;
  /** 中文名，由 scripts/build-palettes.ts 生成 */
  nameZh: string;
  hex: string;
  rgb: RGB;
  lab: Lab;
}

export interface Palette {
  id: PaletteId;
  label: string;
  beadSizeMm: 5 | 2.6;
  beads: readonly Bead[];
}
