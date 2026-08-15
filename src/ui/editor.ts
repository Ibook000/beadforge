import type { Store } from './state';
import type { Preview } from '../render/preview';
import type { PatchHistory } from '../model/patch';
import { getPalette } from '../palette/registry';

export interface Editor {
  getBrush: () => number | null;
  setBrush: (beadIndex: number) => void;
}

/**
 * 编辑三件套：单格改色（点/拖）、吸管（Alt+点）、撤销重做（⌘Z / ⌘⇧Z）。
 *
 * 画笔颜色未设置时自动取图纸里用量最多的那色 —— 比默认第一个豆号有用得多。
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
    const b = currentBrush();
    if (!g || b === null) return;
    const bead = getPalette(g.paletteId).beads[b];
    if (bead) canvas.title = `画笔：${bead.code}　${bead.nameZh}（Alt+点击取色）`;
  };

  const paintAt = (clientX: number, clientY: number): void => {
    const s = store.get();
    const b = currentBrush();
    if (!s.grid || b === null) return;
    const cell = preview.cellAt(clientX, clientY);
    if (!cell) return;
    const i = cell.y * s.grid.width + cell.x;
    if (s.grid.mask[i] !== 1) return; // 空格不涂
    if (s.grid.cells[i] === b) return; // 已经是这个色，省一次重绘
    history.apply(i, b);
    onPatch();
  };

  canvas.addEventListener('pointerdown', (e) => {
    const s = store.get();
    if (!s.grid) return;

    // Alt + 点击 = 吸管
    if (e.altKey) {
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
    if (!mod || e.key.toLowerCase() !== 'z') return;
    e.preventDefault();
    if (e.shiftKey ? history.redo() : history.undo()) onPatch();
  });

  store.subscribe(describeBrush);

  return {
    getBrush: currentBrush,
    setBrush: (i: number) => {
      brush = i;
      describeBrush();
    },
  };
}
