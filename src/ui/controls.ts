import type { Store } from './state';
import { listPalettes } from '../palette/registry';
import type { PaletteId } from '../palette/types';
import { computeGeometry, formatGeometry } from '../model/geometry';
import { loadImageFile } from './imageLoad';
import type { BuildParams } from '../pipeline/build';
import type { SampleMode } from '../pipeline/sample';
import type { DitherMode } from '../color/dither';
import type { DespeckleLevel } from '../pipeline/despeckle';
import type { SheetOptions, SheetStyle } from '../render/sheet';

const PRESETS: Array<[string, number, number]> = [
  ['钥匙扣 20×20', 20, 20],
  ['单板 29×29', 29, 29],
  ['四板 58×58', 58, 58],
  ['大图 100×100', 100, 100],
];

export interface ControlsHandlers {
  /** 参数变更，需要重跑管线 */
  onRebuild: () => void;
  /** 改变颗粒度，会作废手改 patch，由调用方负责确认 */
  onGranularity: (w: number, h: number) => void;
}

export function mountControls(root: HTMLElement, store: Store, h: ControlsHandlers): void {
  const section = document.createElement('div');
  section.innerHTML = `
    <h1>开始拼豆吧 ♡</h1>

    <input type="file" id="file" accept="image/*" hidden>
    <button class="btn primary" id="upload" style="width:100%;padding:11px;font-size:15px">🌸 选择一张图片</button>
    <div class="readout" id="fileName">还没有选择图片呀(｡•ㅅ•｡)</div>

    <h2>颗粒度</h2>
    <label>宽度 <b id="wLabel">29</b> 格</label>
    <input type="range" id="width" min="10" max="200" value="29">
    <label class="inline"><input type="checkbox" id="square"> 锁定正方形</label>
    <div class="presets" id="presets"></div>
    <div class="readout" id="geo">—</div>

    <h2>豆子与色卡</h2>
    <label>豆子尺寸</label>
    <select id="beadSize">
      <option value="5">5mm 大豆</option>
      <option value="2.6">2.6mm 小豆</option>
    </select>
    <label>品牌色卡</label>
    <select id="palette"></select>

    <h2>图像调整</h2>
    <label>亮度 <b id="brightnessLabel">1.00</b></label>
    <input type="range" id="brightness" min="0.4" max="1.8" step="0.02" value="1">
    <label>对比度 <b id="contrastLabel">1.00</b></label>
    <input type="range" id="contrast" min="0.4" max="2" step="0.02" value="1">
    <label>饱和度 <b id="saturationLabel">1.00</b></label>
    <input type="range" id="saturation" min="0" max="2" step="0.02" value="1">
    <label>去背景容差 <b id="bgLabel">0</b></label>
    <input type="range" id="bgTolerance" min="0" max="60" step="1" value="0">

    <h2>算法</h2>
    <label>采样方式</label>
    <select id="sampleMode">
      <option value="average">区域平均（推荐）</option>
      <option value="median">中位数（抗噪点）</option>
      <option value="nearest">最近邻（像素画）</option>
    </select>
    <label>色数上限</label>
    <select id="maxColors">
      <option value="0">不限制</option>
      <option value="24">24 色</option>
      <option value="20">20 色</option>
      <option value="15">15 色（新手友好）</option>
      <option value="12">12 色</option>
      <option value="8">8 色</option>
    </select>
    <label>抖动</label>
    <select id="dither">
      <option value="none">关闭（推荐）</option>
      <option value="atkinson">Atkinson</option>
      <option value="floyd-steinberg">Floyd–Steinberg</option>
    </select>
    <label>去孤点</label>
    <select id="despeckle">
      <option value="off">关闭</option>
      <option value="weak" selected>弱（清孤立单颗）</option>
      <option value="strong">强（连对子一起清）</option>
    </select>

    <h2>图纸样式</h2>
    <select id="style">
      <option value="code">色块 + 色号</option>
      <option value="symbol">色块 + 符号</option>
      <option value="plain">纯色块</option>
      <option value="round">圆豆拟真</option>
    </select>
    <label class="inline"><input type="checkbox" id="showGrid" checked> 网格线</label>
    <label class="inline"><input type="checkbox" id="showCoords" checked> 行列坐标</label>
    <label class="inline"><input type="checkbox" id="showMajorLines" checked> 每 10 格加粗</label>
    <label class="inline"><input type="checkbox" id="showBoardLines"> 底板分界虚线</label>
  `;
  root.appendChild(section);

  const $ = <T extends HTMLElement>(id: string): T => section.querySelector(`#${id}`) as T;

  // ---------- 上传 ----------
  const fileInput = $<HTMLInputElement>('file');
  const uploadBtn = $<HTMLButtonElement>('upload');
  uploadBtn.addEventListener('click', () => fileInput.click());

  /** 处理单个图片文件：读取并更新 store（文件选择 / 拖拽共用） */
  function handleFile(file: File | undefined): void {
    if (!file) return;
    uploadBtn.disabled = true;
    uploadBtn.textContent = '正在读取…';

    void loadImageFile(file)
      .then(({ grid, dataUrl }) => {
        $('fileName').textContent = `${file.name} · ${grid.width}×${grid.height}`;
        store.set({ image: grid, imageName: file.name, imageDataUrl: dataUrl });
        // 按原图比例重算高度
        const w = store.get().build.widthCells;
        const square = $<HTMLInputElement>('square').checked;
        h.onGranularity(w, square ? w : Math.max(1, Math.round((w * grid.height) / grid.width)));
      })
      .catch((err: unknown) => {
        $('fileName').textContent = `读取失败：${err instanceof Error ? err.message : String(err)}`;
      })
      .finally(() => {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '🌸 选择一张图片';
        fileInput.value = ''; // 允许重复选同一个文件
      });
  }

  fileInput.addEventListener('change', () => handleFile(fileInput.files?.[0]));

  // 拖拽上传：拖到控制面板顶层即可
  const dragHosts = [section, uploadBtn];
  function isImageFile(f: File | undefined): boolean {
    return !!f && f.type.startsWith('image/');
  }
  for (const host of dragHosts) {
    host.addEventListener('dragover', (e) => {
      const dt = (e as DragEvent).dataTransfer;
      if (dt && [...dt.types].includes('Files')) {
        e.preventDefault();
        uploadBtn.classList.add('drag-over');
      }
    });
    host.addEventListener('dragleave', () => uploadBtn.classList.remove('drag-over'));
    host.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadBtn.classList.remove('drag-over');
      const f = (e as DragEvent).dataTransfer?.files?.[0];
      if (isImageFile(f)) handleFile(f);
    });
  }

  // ---------- 颗粒度 ----------
  const widthInput = $<HTMLInputElement>('width');
  const squareInput = $<HTMLInputElement>('square');

  const applyWidth = (): void => {
    const w = Number(widthInput.value);
    const img = store.get().image;
    const height =
      squareInput.checked || !img ? w : Math.max(1, Math.round((w * img.height) / img.width));
    h.onGranularity(w, height);
  };
  widthInput.addEventListener('input', () => {
    $('wLabel').textContent = widthInput.value;
  });
  widthInput.addEventListener('change', applyWidth);
  squareInput.addEventListener('change', applyWidth);

  const presetBox = $('presets');
  const presetBtns: HTMLButtonElement[] = [];
  for (const [label, w, ph] of PRESETS) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => {
      widthInput.value = String(w);
      $('wLabel').textContent = String(w);
      squareInput.checked = w === ph;
      presetBtns.forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      h.onGranularity(w, ph);
    });
    presetBtns.push(b);
    presetBox.appendChild(b);
  }

  // ---------- 色卡 ----------
  const beadSizeSel = $<HTMLSelectElement>('beadSize');
  const paletteSel = $<HTMLSelectElement>('palette');

  const refreshPalettes = (notify: boolean): void => {
    const size = Number(beadSizeSel.value) as 5 | 2.6;
    paletteSel.innerHTML = '';
    for (const p of listPalettes(size)) {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = `${p.label} · ${p.beads.length} 色`;
      paletteSel.appendChild(o);
    }
    const s = store.get();
    store.set({
      build: { ...s.build, paletteId: paletteSel.value as PaletteId },
      sheet: { ...s.sheet, beadSizeMm: size },
    });
    if (notify) h.onRebuild();
  };

  beadSizeSel.addEventListener('change', () => refreshPalettes(true));
  paletteSel.addEventListener('change', () => {
    const s = store.get();
    store.set({ build: { ...s.build, paletteId: paletteSel.value as PaletteId } });
    h.onRebuild();
  });

  // ---------- 绑定辅助 ----------
  const bindBuild = (
    id: string,
    read: (el: HTMLInputElement & HTMLSelectElement) => Partial<BuildParams>,
  ): void => {
    $<HTMLInputElement>(id).addEventListener('change', (e) => {
      const s = store.get();
      store.set({ build: { ...s.build, ...read(e.target as HTMLInputElement & HTMLSelectElement) } });
      h.onRebuild();
    });
  };

  const bindAdjust = (
    id: string,
    key: 'brightness' | 'contrast' | 'saturation',
    digits = 2,
  ): void => {
    const el = $<HTMLInputElement>(id);
    el.addEventListener('input', () => {
      $(`${id}Label`).textContent = Number(el.value).toFixed(digits);
    });
    el.addEventListener('change', () => {
      const s = store.get();
      store.set({ build: { ...s.build, adjust: { ...s.build.adjust, [key]: Number(el.value) } } });
      h.onRebuild();
    });
  };

  bindAdjust('brightness', 'brightness');
  bindAdjust('contrast', 'contrast');
  bindAdjust('saturation', 'saturation');

  const bgEl = $<HTMLInputElement>('bgTolerance');
  bgEl.addEventListener('input', () => {
    $('bgLabel').textContent = bgEl.value;
  });
  bindBuild('bgTolerance', (el) => ({ bgTolerance: Number(el.value) }));
  bindBuild('sampleMode', (el) => ({ sampleMode: el.value as SampleMode }));
  bindBuild('maxColors', (el) => ({ maxColors: Number(el.value) }));
  bindBuild('dither', (el) => ({ dither: el.value as DitherMode }));
  bindBuild('despeckle', (el) => ({ despeckle: el.value as DespeckleLevel }));

  // 图纸样式只影响绘制，不重跑管线
  const bindSheet = (
    id: string,
    read: (el: HTMLInputElement & HTMLSelectElement) => Partial<SheetOptions>,
  ): void => {
    $<HTMLInputElement>(id).addEventListener('change', (e) => {
      const s = store.get();
      store.set({ sheet: { ...s.sheet, ...read(e.target as HTMLInputElement & HTMLSelectElement) } });
    });
  };

  bindSheet('style', (el) => ({ style: el.value as SheetStyle }));
  bindSheet('showGrid', (el) => ({ showGrid: el.checked }));
  bindSheet('showCoords', (el) => ({ showCoords: el.checked }));
  bindSheet('showMajorLines', (el) => ({ showMajorLines: el.checked }));
  bindSheet('showBoardLines', (el) => ({ showBoardLines: el.checked }));

  // ---------- 几何回显 ----------
  store.subscribe((s) => {
    const geo = computeGeometry(s.build.widthCells, s.build.heightCells, s.sheet.beadSizeMm);
    // 有图纸时用真实豆数（去掉了空格），没有时用总格数估算
    let beads = geo.totalCells;
    if (s.grid) {
      beads = 0;
      for (let i = 0; i < s.grid.mask.length; i++) beads += s.grid.mask[i]!;
    }
    $('geo').textContent = formatGeometry(geo, beads);
    widthInput.value = String(s.build.widthCells);
    $('wLabel').textContent = String(s.build.widthCells);
  });

  refreshPalettes(false);
}

/** 色差提示。物理豆子与屏幕必然有色差，这个限制必须让用户知道。 */
export function mountColorWarning(root: HTMLElement): void {
  const el = document.createElement('div');
  el.className = 'readout note';
  el.innerHTML =
    '⚠️ 屏幕颜色与实物豆子存在色差（塑料材质、批次、光照、显示器校准都有影响）。' +
    '<b>色号是权威标识</b>，颜色仅供参考，建议对照实体色卡确认。';
  root.appendChild(el);
}