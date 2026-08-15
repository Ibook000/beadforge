/** 标准方形底板的钉数：5mm 大豆 29×29，2.6mm 小豆 57×57 */
const BOARD_PEGS: Record<5 | 2.6, number> = { 5: 29, 2.6: 57 };

export interface GridGeometry {
  widthCells: number;
  heightCells: number;
  totalCells: number;
  beadSizeMm: 5 | 2.6;
  /** 拼出来的物理宽度，厘米 */
  widthCm: number;
  heightCm: number;
  /** 横向需要几块底板 */
  boardsX: number;
  boardsY: number;
  /** 一块底板的钉数（单边） */
  boardPegs: number;
}

export function computeGeometry(
  widthCells: number,
  heightCells: number,
  beadSizeMm: 5 | 2.6,
): GridGeometry {
  const pegs = BOARD_PEGS[beadSizeMm];
  return {
    widthCells,
    heightCells,
    totalCells: widthCells * heightCells,
    beadSizeMm,
    widthCm: (widthCells * beadSizeMm) / 10,
    heightCm: (heightCells * beadSizeMm) / 10,
    boardsX: Math.ceil(widthCells / pegs),
    boardsY: Math.ceil(heightCells / pegs),
    boardPegs: pegs,
  };
}

/**
 * 一行人类可读的摘要，例如：
 * "29 × 34 格 · 986 颗 · 5mm 豆 ≈ 14.5 × 17.0 cm · 需 1×2 块底板"
 *
 * 这行的存在理由：颗粒度的真实含义不是"多少格"，
 * 而是"拼出来多大、要买几块板、要拼多久"。
 */
export function formatGeometry(geo: GridGeometry, beadCount: number): string {
  return (
    `${geo.widthCells} × ${geo.heightCells} 格 · ` +
    `${beadCount.toLocaleString('zh-CN')} 颗 · ` +
    `${geo.beadSizeMm}mm 豆 ≈ ${geo.widthCm.toFixed(1)} × ${geo.heightCm.toFixed(1)} cm · ` +
    `需 ${geo.boardsX}×${geo.boardsY} 块底板`
  );
}
