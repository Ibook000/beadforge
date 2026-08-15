import type { Palette, PaletteId } from './types';
import { MARD } from './data/mard';
import { ARTKAL_S } from './data/artkal-s';
import { ARTKAL_C } from './data/artkal-c';
import { PERLER } from './data/perler';
import { HAMA } from './data/hama';

const REGISTRY: Record<PaletteId, Palette> = {
  mard: MARD,
  'artkal-s': ARTKAL_S,
  'artkal-c': ARTKAL_C,
  perler: PERLER,
  hama: HAMA,
};

export const PALETTE_IDS: readonly PaletteId[] = ['mard', 'artkal-s', 'artkal-c', 'perler', 'hama'];

export function getPalette(id: PaletteId): Palette {
  const p = REGISTRY[id];
  if (!p) throw new Error(`未知色卡：${id}`);
  return p;
}

/** 按豆径筛选可用色卡。不传则返回全部。 */
export function listPalettes(beadSizeMm?: 5 | 2.6): readonly Palette[] {
  const all = PALETTE_IDS.map(getPalette);
  return beadSizeMm === undefined ? all : all.filter((p) => p.beadSizeMm === beadSizeMm);
}
