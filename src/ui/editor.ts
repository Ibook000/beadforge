import type { Store } from './state';
import type { Preview } from '../render/preview';
import type { PatchHistory } from '../model/patch';
import { getPalette } from '../palette/registry';

/** patch 里的特殊值：表示「擦除该格」（去豆）。正常豆号都是 >= 0。 */
export const ERASE = -1;

export interface Editor {
  getBrush: () => number | null;
  setBrush: (beadIndex: number) => void;
  /** 切换橡皮擦模式（true = 进入擦除） */
  setEraser: (on: boolean) => void;
}

/**
 * 编辑四件套：单格改色（点/拖）、吸管（Alt+点）、橡皮擦（E 键切换）、撤销重做（⌘Z / ⌘⇧Z）。
 *
 * 画笔颜色未设置时自动取图纸里用量最多的那色 —— 比默认第一个豆号有用得多。
 * 橡皮擦模式下，点击的格子会被标记为 ERASE（去豆），重跑管线后该格留空。
 */
export function mountEditor(
  canvas: HTMLCanvasElement,
  store: Store,
  preview: Preview,
  history: PatchHistory,
  onPatch: () => void,
): Editor {
  let brush: number | null = null;
  let painting = false;
  let eraser = false;

  const currentBrush = (): number | null => {
    if (brush !== null) return brush;
    const g = store.get().grid;
    if (!g) return null;
    // 用量最多的颜色作为默认画笔
    const counts = new Map<number, number>();
    for (let i = 0; i < g.cells.length; i++) {
      if (g.mask[i] !== 1) continue;
      const v = g.cells[i]!;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    let best: number | null = null;
    let bestN = -1;
    for (const [v, n] of counts) {
      if (n > bestN) {
        bestN = n;
        best = v;
      }
    }
    return best;
  };

  const describeBrush = (): void => {
    const g = store.get().grid;
    if (eraser) {
      canvas.title = '橡皮擦：点击去除豆子（E 切换 · Alt+点击取色）';
      return;
    }
    const b = currentBrush();
    if (!g || b === null) return;
    const bead = getPalette(g.paletteId).beads[b];
    if (bead) canvas.title = `画笔：${bead.code}　${bead.nameZh}（E 擦除 · Alt+点击取色）`;
  };

  const setEraser = (on: boolean): void => {
    if (eraser === on) return;
    eraser = on;
    describeBrush();
  };

  const paintAt = (clientX: number, clientY: number): void => {
    const s = store.get();
    if (!s.grid) return;
    // 全屏模式是看图拼图用，触摸/点击用于缩放平移，不触发单格编辑
    if (s.fullscreen) return;
    const cell = preview.cellAt(clientX, clientY);
    if (!cell) return;
    const i = cell.y * s.grid.width + cell.x;

    if (eraser) {
      // 橡皮擦：只在有豆的格子上生效
      if (s.grid.mask[i] !== 1) return;
      history.apply(i, ERASE);
    } else {
      const b = currentBrush();
      if (b === null) return;
      if (s.grid.mask[i] !== 1) return; // 空格不涂
      if (s.grid.cells[i] === b) return;
      history.apply(i, b);
    }
    onPatch();
  };

  canvas.addEventListener('pointerdown', (e) => {
    const s = store.get();
    if (!s.grid) return;

    // Alt + 点击 = 吸管
    if (e.altKey) {
      if (s.fullscreen) return;
      const cell = preview.cellAt(e.clientX, e.clientY);
      if (!cell) return;
      const i = cell.y * s.grid.width + cell.x;
      if (s.grid.mask[i] === 1) {
        brush = s.grid.cells[i]!;
        describeBrush();
        onPatch(); // 让统计面板高亮当前画笔
      }
      return;
    }

    painting = true;
    canvas.setPointerCapture(e.pointerId);
    paintAt(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (painting) paintAt(e.clientX, e.clientY);
  });

  const stop = (e: PointerEvent): void => {
    painting = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  window.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod) {
      if (e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey ? history.redo() : history.undo()) onPatch();
      return;
    }
    // E 切换橡皮擦
    if (e.key.toLowerCase() === 'e' && !e.altKey) {
      e.preventDefault();
      setEraser(!eraser);
    }
  });

  store.subscribe(describeBrush);

  // 同步 store 的 eraser 状态（来自 UI 复选框）
  store.subscribe((s) => {
    if (s.eraser !== eraser) {
      eraser = s.eraser;
      describeBrush();
    }
  });

  return {
    getBrush: currentBrush,
    setBrush: (i: number) => {
      brush = i;
      setEraser(false); // 选色时退出橡皮擦
      store.set({ eraser: false });
      describeBrush();
    },
    setEraser: (on: boolean) => {
      setEraser(on);
      store.set({ eraser: on });
    },
  };
}
