import { DEFAULT_BUILD_PARAMS, type BuildParams } from '../pipeline/build';
import { DEFAULT_SHEET_OPTIONS, type SheetOptions } from '../render/sheet';
import type { RgbaGrid } from '../pipeline/sample';
import type { BeadGrid } from '../model/grid';

export interface AppState {
  /** 解码后的原图。null = 还没上传 */
  image: RgbaGrid | null;
  imageName: string;
  /** 用于 localStorage 存档的原图 dataURL（已降质） */
  imageDataUrl: string | null;
  build: BuildParams;
  sheet: SheetOptions;
  /** 管线跑出来并叠加 patch 后的结果。null = 还没算 */
  grid: BeadGrid | null;
  /** 「我有的豆子」子集，按色卡分别记。空数组 = 全选。 */
  allowed: Record<string, number[]>;
  /**
   * 手动编辑层的只读镜像：格子下标 → 豆号。
   * 真正的历史管理在 model/patch.ts 的 PatchHistory 里，这里只是给 UI 读的快照。
   */
  patch: Map<number, number>;
  /** 当前高亮的豆号下标（拼图模式同色高亮）。null = 不高亮任何色 */
  highlightBead: number | null;
  /** 是否处于全屏拼图模式 */
  fullscreen: boolean;
}

export interface Store {
  get(): AppState;
  set(patch: Partial<AppState>): void;
  subscribe(fn: (s: AppState) => void): () => void;
}

function initialState(): AppState {
  return {
    image: null,
    imageName: '',
    imageDataUrl: null,
    build: { ...DEFAULT_BUILD_PARAMS, widthCells: 29, heightCells: 29 },
    sheet: { ...DEFAULT_SHEET_OPTIONS },
    grid: null,
    allowed: {},
    patch: new Map(),
    highlightBead: null,
    fullscreen: false,
  };
}

export function createStore(): Store {
  let state = initialState();
  const listeners = new Set<(s: AppState) => void>();

  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      // 拷一份再遍历：订阅者在回调里退订不会打乱本轮迭代
      for (const fn of [...listeners]) fn(state);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
