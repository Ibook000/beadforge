import './ui/styles.css';
import { createStore } from './ui/state';
import { mountControls, mountColorWarning } from './ui/controls';
import { mountPalettePanel } from './ui/palettePanel';
import { mountStatsPanel } from './ui/statsPanel';
import { mountEditor } from './ui/editor';
import { createPreview } from './render/preview';
import { buildGrid } from './pipeline/build';
import { getPalette } from './palette/registry';
import { PatchHistory } from './model/patch';
import { saveArchive, loadArchive } from './model/persist';
import { loadImageDataUrl } from './ui/imageLoad';

const store = createStore();
const history = new PatchHistory();

const controlsEl = document.getElementById('controls') as HTMLElement;
const statsEl = document.getElementById('stats') as HTMLElement;
const stage = document.getElementById('stage') as HTMLElement;
const hint = document.getElementById('hint') as HTMLElement;
const fsBtn = document.getElementById('fsBtn') as HTMLButtonElement;

const canvas = document.createElement('canvas');
canvas.style.display = 'none';
stage.appendChild(canvas);
const preview = createPreview(canvas, stage);

// ---------------------------------------------------------------- 管线

/** 重跑整条管线，然后把手改 patch 覆盖上去 */
function rebuild(): void {
  const s = store.get();
  if (!s.image) return;

  const allowed = new Set(s.allowed[s.build.paletteId] ?? []);
  const grid = buildGrid(s.image, { ...s.build, allowedBeads: allowed });

  const patch = history.current;
  for (const [i, bead] of patch) {
    // 越界或落在空格上的 patch 直接忽略（换过颗粒度的残留）
    if (i < grid.cells.length && grid.mask[i] === 1 && bead < getPalette(grid.paletteId).beads.length) {
      grid.cells[i] = bead;
    }
  }

  store.set({ grid, patch: new Map(patch) });
}

/** 参数变更 → debounce 重跑，避免拖滑块时每一帧都算一遍 */
let rebuildTimer: number | undefined;
function scheduleRebuild(): void {
  clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(rebuild, 120);
}

/** 改颗粒度会让格子下标失去意义，必须丢弃 patch —— 先确认 */
function setGranularity(w: number, h: number): void {
  const s = store.get();
  const changed = w !== s.build.widthCells || h !== s.build.heightCells;

  if (changed && history.size > 0) {
    if (!confirm(`改变颗粒度会丢弃 ${history.size} 处手动修改，继续吗？`)) {
      store.set({ build: { ...s.build } }); // 触发订阅，把滑块弹回原值
      return;
    }
    history.clear();
  }

  store.set({ build: { ...store.get().build, widthCells: w, heightCells: h } });
  rebuild();
}

// ---------------------------------------------------------------- 装配

mountControls(controlsEl, store, { onRebuild: scheduleRebuild, onGranularity: setGranularity });
mountPalettePanel(controlsEl, store, scheduleRebuild);
mountColorWarning(controlsEl);

const editor = mountEditor(canvas, store, preview, history, rebuild);

mountStatsPanel(statsEl, store, {
  onPickBrush: (i) => editor.setBrush(i),
  getBrush: () => editor.getBrush(),
  onHighlight: (i) => store.set({ highlightBead: i }),
  getHighlight: () => store.get().highlightBead,
  // 批量替换：把某色全部替换成当前画笔色，一次批量操作 = 一步可撤销历史
  onReplaceAll: async (fromIndex, toIndex) => {
    const s = store.get();
    if (!s.grid) return;
    const entries: Array<[number, number]> = [];
    for (let i = 0; i < s.grid.cells.length; i++) {
      if (s.grid.mask[i] === 1 && s.grid.cells[i] === fromIndex) {
        entries.push([i, toIndex]);
      }
    }
    if (entries.length > 0) {
      history.batchApply(entries);
      rebuild();
    }
  },
});

// 切色卡也会让 patch 的豆号失去意义
let lastPaletteId = store.get().build.paletteId;
store.subscribe((s) => {
  if (s.build.paletteId !== lastPaletteId) {
    lastPaletteId = s.build.paletteId;
    history.clear();
  }
});

// ---- 重绘（含拼图高亮） ----
let pulseStart = 0;
function renderPreview(): void {
  const s = store.get();
  if (!s.grid) return;
  hint.style.display = 'none';
  canvas.style.display = 'block';
  const highlight =
    s.highlightBead != null && s.grid
      ? { index: s.highlightBead, pulsePhase: (performance.now() - pulseStart) / 1000 * Math.PI * 2 }
      : null;
  preview.render(s.grid, getPalette(s.grid.paletteId), s.sheet, highlight);
}

let pulseRAF = 0;
function startPulseIfNeeded(): void {
  const s = store.get();
  const active = s.highlightBead != null && s.grid != null;
  if (active && !pulseRAF) {
    pulseStart = performance.now();
    const tick = () => {
      renderPreview();
      pulseRAF = requestAnimationFrame(tick);
    };
    pulseRAF = requestAnimationFrame(tick);
  } else if (!active && pulseRAF) {
    cancelAnimationFrame(pulseRAF);
    pulseRAF = 0;
    renderPreview();
  }
}

// 网格或样式、高亮、全屏变化 → 重绘
store.subscribe((s) => {
  renderPreview();
  startPulseIfNeeded();
});

window.addEventListener('resize', () => {
  const s = store.get();
  if (s.grid) renderPreview();
});

// ---- 全屏拼豆模式 ----
function setFullscreen(on: boolean): void {
  store.set({ fullscreen: on });
  if (on) {
    stage.classList.add('fullscreen');
    fsBtn.title = '退出全屏 (Esc)';
    fsBtn.textContent = '✕';
  } else {
    stage.classList.remove('fullscreen');
    fsBtn.title = '全屏拼豆模式';
    fsBtn.textContent = '⛶';
  }
  // 尺寸变化后重渲染
  requestAnimationFrame(() => renderPreview());
}

fsBtn.addEventListener('click', () => setFullscreen(!store.get().fullscreen));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && store.get().fullscreen) setFullscreen(false);
});

// ---------------------------------------------------------------- 存档

let saveTimer: number | undefined;
store.subscribe(() => {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const s = store.get();
    if (!s.image) return;
    saveArchive({
      version: 1,
      imageName: s.imageName,
      imageDataUrl: s.imageDataUrl,
      build: s.build,
      sheet: s.sheet,
      patch: [...history.current],
      savedAt: Date.now(),
    });
  }, 800);
});

async function tryRestore(): Promise<void> {
  const a = loadArchive();
  if (!a) return;

  const when = new Date(a.savedAt).toLocaleString('zh-CN');
  if (!confirm(`发现 ${when} 的编辑存档（${a.imageName || '未命名'}），要恢复吗？`)) return;

  store.set({ build: a.build, sheet: a.sheet });
  history.restore(a.patch);
  lastPaletteId = a.build.paletteId;

  if (!a.imageDataUrl) {
    alert('存档太大，原图没能保存下来。参数和手动修改已恢复，请重新选择同一张图片。');
    return;
  }

  try {
    const grid = await loadImageDataUrl(a.imageDataUrl);
    store.set({ image: grid, imageName: a.imageName, imageDataUrl: a.imageDataUrl });
    rebuild();
  } catch {
    alert('存档里的图片读取失败，请重新选择图片。参数和手动修改已恢复。');
  }
}

void tryRestore();