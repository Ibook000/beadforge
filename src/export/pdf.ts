import { jsPDF } from 'jspdf';
import type { BeadGrid } from '../model/grid';
import type { Palette } from '../palette/types';
import { type SheetOptions } from '../render/sheet';
import { createGrid } from '../model/grid';
import { drawSheet, inkColor, usedBeadIndices } from '../render/sheet';
import { computeStats } from '../model/stats';
import { computeGeometry, formatGeometry } from '../model/geometry';
import { assignSymbols } from '../palette/symbols';
import { downloadBlob } from './csv';
import { WATERMARK } from './watermark';

export interface PageSpec {
  index: number;
  col: number;
  row: number;
  /** 覆盖的格子范围，左闭右开 */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A4 横向，毫米 */
const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 12;
/** 页眉和页脚各占的高度 */
const HEADER_H = 9;
const FOOTER_H = 8;

/** 在 PDF 页面右下角画水印文字（矢量，浅色半透明） */
function drawPdfWatermark(doc: jsPDF): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  // 淡粉色水印
  doc.setTextColor(232, 107, 146);
  // 用浅色近似半透明：粉底文字降低对比
  doc.text(WATERMARK, PAGE_W - 16, PAGE_H - 14, { align: 'right' });
  doc.setTextColor(0, 0, 0); // 复位
}

/** 一页放多少格 —— 按 A4 横向、色号仍看得清估出来的 */
const CELLS_X = 50;
const CELLS_Y = 32;
const OVERLAP = 1;

const FONT = '600 26px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';

/**
 * 把图纸切成若干页，相邻页保留 overlap 格重叠。
 *
 * 重叠的作用：拼接时能对上，不会出现"交界那一行到底算哪页的"这种经典困惑。
 */
export function planPages(
  grid: BeadGrid,
  cellsPerPageX: number,
  cellsPerPageY: number,
  overlap: number,
): PageSpec[] {
  const starts = (total: number, per: number): number[] => {
    if (total <= per) return [0];
    const step = Math.max(1, per - overlap);
    const out: number[] = [];
    for (let s = 0; s < total; s += step) {
      // 最后一页贴右/下边缘对齐，避免出现只有两格的残页
      if (s + per >= total) {
        out.push(Math.max(0, total - per));
        break;
      }
      out.push(s);
    }
    return out;
  };

  const xs = starts(grid.width, cellsPerPageX);
  const ys = starts(grid.height, cellsPerPageY);

  const pages: PageSpec[] = [];
  let index = 0;
  for (let row = 0; row < ys.length; row++) {
    for (let col = 0; col < xs.length; col++) {
      const x0 = xs[col]!;
      const y0 = ys[row]!;
      pages.push({
        index: index++,
        col,
        row,
        x0,
        y0,
        x1: Math.min(grid.width, x0 + cellsPerPageX),
        y1: Math.min(grid.height, y0 + cellsPerPageY),
      });
    }
  }
  return pages;
}

/** 从大网格里裁出一块 */
export function sliceGrid(grid: BeadGrid, p: PageSpec): BeadGrid {
  const w = p.x1 - p.x0;
  const h = p.y1 - p.y0;
  const out = createGrid(w, h, grid.paletteId);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (p.y0 + y) * grid.width + (p.x0 + x);
      const dst = y * w + x;
      out.cells[dst] = grid.cells[src]!;
      out.mask[dst] = grid.mask[src]!;
    }
  }
  return out;
}

/**
 * 把一段中文渲染成窄图片贴进 PDF。
 *
 * jsPDF 内置字体是 WinAnsi 编码，中文会变方块；嵌入中文字体子集又会让
 * 单文件包体积暴涨。所以只有**含中文的短句**走这条路 —— 每张几 KB。
 * 格子里的色号全是 ASCII（F5 / S01 / 80-15179 / H01），直接走矢量文字。
 */
function textStrip(
  doc: jsPDF,
  text: string,
  xMm: number,
  yMm: number,
  heightMm: number,
  color: string,
): void {
  const scale = 4; // 渲染倍率，保证印出来不糊
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = FONT;
  const wPx = Math.ceil(probe.measureText(text).width) + 8;
  const hPx = 34;

  const canvas = document.createElement('canvas');
  canvas.width = wPx * (scale / 4) * 2;
  canvas.height = hPx * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);
  ctx.font = FONT;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 2, hPx / 2);

  const wMm = (canvas.width / canvas.height) * heightMm;
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', xMm, yMm, wMm, heightMm);
}

/** 用矢量画一块图纸：色块 + 色号/符号 + 网格线 + 行列坐标 */
function drawGridVector(
  doc: jsPDF,
  slice: BeadGrid,
  palette: Palette,
  opts: SheetOptions,
  originX: number,
  originY: number,
  cellMm: number,
  labelOffsetX: number,
  labelOffsetY: number,
): void {
  const used = usedBeadIndices(slice);
  const symbols = opts.style === 'symbol' ? assignSymbols(used) : null;

  // 色号字号：按实际用到的最长色号反推，保证塞得进格子
  let maxLen = 2;
  for (const i of used) maxLen = Math.max(maxLen, palette.beads[i]?.code.length ?? 2);
  const cellPt = cellMm * 2.8346; // mm → pt
  const fontPt =
    opts.style === 'symbol'
      ? Math.min(cellPt * 0.5, 11)
      : Math.max(2.6, Math.min(cellPt * 0.4, (cellPt * 0.88) / (maxLen * 0.6)));

  doc.setFont('courier', 'bold');

  // 1. 色块
  for (let y = 0; y < slice.height; y++) {
    for (let x = 0; x < slice.width; x++) {
      const i = y * slice.width + x;
      if (slice.mask[i] !== 1) continue;
      const bead = palette.beads[slice.cells[i]!]!;
      doc.setFillColor(bead.rgb[0], bead.rgb[1], bead.rgb[2]);
      doc.rect(originX + x * cellMm, originY + y * cellMm, cellMm, cellMm, 'F');
    }
  }

  // 2. 网格线
  doc.setDrawColor(170, 170, 180);
  doc.setLineWidth(0.08);
  for (let x = 0; x <= slice.width; x++) {
    doc.line(originX + x * cellMm, originY, originX + x * cellMm, originY + slice.height * cellMm);
  }
  for (let y = 0; y <= slice.height; y++) {
    doc.line(originX, originY + y * cellMm, originX + slice.width * cellMm, originY + y * cellMm);
  }

  // 3. 每 10 格加粗（对齐到整图坐标，跨页时位置一致）
  doc.setDrawColor(90, 90, 100);
  doc.setLineWidth(0.3);
  for (let x = 0; x <= slice.width; x++) {
    if ((labelOffsetX + x) % 10 !== 0) continue;
    doc.line(originX + x * cellMm, originY, originX + x * cellMm, originY + slice.height * cellMm);
  }
  for (let y = 0; y <= slice.height; y++) {
    if ((labelOffsetY + y) % 10 !== 0) continue;
    doc.line(originX, originY + y * cellMm, originX + slice.width * cellMm, originY + y * cellMm);
  }

  // 4. 色号 / 符号
  doc.setFontSize(fontPt);
  for (let y = 0; y < slice.height; y++) {
    for (let x = 0; x < slice.width; x++) {
      const i = y * slice.width + x;
      if (slice.mask[i] !== 1) continue;
      if (opts.style === 'plain' || opts.style === 'round') continue;

      const beadIndex = slice.cells[i]!;
      const bead = palette.beads[beadIndex]!;
      const label = opts.style === 'symbol' ? (symbols!.get(beadIndex) ?? '') : bead.code;
      if (!label) continue;

      const ink = inkColor(bead.rgb);
      doc.setTextColor(ink === '#111111' ? 17 : 255);
      doc.text(label, originX + (x + 0.5) * cellMm, originY + (y + 0.5) * cellMm, {
        align: 'center',
        baseline: 'middle',
      });
    }
  }

  // 5. 行列坐标（纯数字，走矢量）
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(Math.max(4, Math.min(7, cellPt * 0.45)));
  doc.setTextColor(90);
  const step = cellMm < 4 ? 5 : 1;
  for (let x = 0; x < slice.width; x++) {
    const n = labelOffsetX + x + 1;
    if (n % step !== 0 && x !== 0) continue;
    const cx = originX + (x + 0.5) * cellMm;
    doc.text(String(n), cx, originY - 1.2, { align: 'center' });
    doc.text(String(n), cx, originY + slice.height * cellMm + 3, { align: 'center' });
  }
  for (let y = 0; y < slice.height; y++) {
    const n = labelOffsetY + y + 1;
    if (n % step !== 0 && y !== 0) continue;
    const cy = originY + (y + 0.5) * cellMm;
    doc.text(String(n), originX - 1.5, cy, { align: 'right', baseline: 'middle' });
    doc.text(String(n), originX + slice.width * cellMm + 1.5, cy, { baseline: 'middle' });
  }
}

export async function exportSheetPdf(
  grid: BeadGrid,
  palette: Palette,
  opts: SheetOptions,
  filename: string,
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const pages = planPages(grid, CELLS_X, CELLS_Y, OVERLAP);
  const cols = Math.max(...pages.map((p) => p.col)) + 1;
  const rows = Math.max(...pages.map((p) => p.row)) + 1;
  const totalPages = pages.length + 1;

  for (const p of pages) {
    if (p.index > 0) doc.addPage();
    const slice = sliceGrid(grid, p);

    // 页眉（含中文，走图片）
    textStrip(
      doc,
      `第 ${p.index + 1} / ${totalPages} 页　·　第 ${p.row + 1} 行 第 ${p.col + 1} 列　·　` +
        `覆盖格子 X ${p.x0 + 1}–${p.x1}　Y ${p.y0 + 1}–${p.y1}`,
      MARGIN,
      MARGIN - 6,
      4.4,
      '#333333',
    );

    // 拼接指引
    const hints: string[] = [];
    if (p.col > 0) hints.push(`◀ 左接第 ${p.index} 页`);
    if (p.col < cols - 1) hints.push(`右接第 ${p.index + 2} 页 ▶`);
    if (p.row > 0) hints.push(`▲ 上接第 ${p.index - cols + 1} 页`);
    if (p.row < rows - 1) hints.push(`下接第 ${p.index + cols + 1} 页 ▼`);
    if (hints.length > 0) {
      textStrip(doc, hints.join('　　'), MARGIN, PAGE_H - FOOTER_H, 4.4, '#8a4a54');
    }

    // 图纸主体
    const availW = PAGE_W - MARGIN * 2 - 8; // 两侧留坐标位
    const availH = PAGE_H - MARGIN - HEADER_H - FOOTER_H - 6;
    const cellMm = Math.min(availW / slice.width, availH / slice.height);
    const gridW = slice.width * cellMm;
    const gridH = slice.height * cellMm;

    drawGridVector(
      doc,
      slice,
      palette,
      opts,
      MARGIN + 4 + (availW - gridW) / 2,
      MARGIN + HEADER_H + (availH - gridH) / 2,
      cellMm,
      p.x0,
      p.y0,
    );

    drawPdfWatermark(doc);
  }

  // ---- 末页：总览 + 用量表 ----
  doc.addPage();
  const stats = computeStats(grid, palette);
  const g = computeGeometry(grid.width, grid.height, opts.beadSizeMm);

  textStrip(doc, '总览与用量', MARGIN, MARGIN - 4, 6.5, '#111111');
  textStrip(doc, formatGeometry(g, stats.totalBeads), MARGIN, MARGIN + 6, 4.2, '#555555');
  textStrip(
    doc,
    `共 ${stats.colorCount} 种颜色　·　${palette.label}`,
    MARGIN,
    MARGIN + 12,
    4.2,
    '#555555',
  );

  // 缩略总览图（这个确实是图，但很小）
  const thumbBox = 420;
  const thumbCell = Math.max(1, Math.floor(thumbBox / Math.max(grid.width, grid.height)));
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = grid.width * thumbCell;
  thumbCanvas.height = grid.height * thumbCell;
  const tctx = thumbCanvas.getContext('2d')!;
  tctx.fillStyle = '#ffffff';
  tctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
  drawSheet(tctx, grid, palette, {
    ...opts,
    style: 'plain',
    cellSize: thumbCell,
    showCoords: false,
    showGrid: false,
    showMajorLines: false,
    showBoardLines: false,
  });
  const thumbMm = 74;
  const tk = Math.min(thumbMm / thumbCanvas.width, thumbMm / thumbCanvas.height);
  doc.addImage(
    thumbCanvas.toDataURL('image/png'),
    'PNG',
    MARGIN,
    MARGIN + 20,
    thumbCanvas.width * tk,
    thumbCanvas.height * tk,
  );

  // 用量表：色块矢量，色号/数字矢量，中文名走图片
  let x = MARGIN + thumbMm + 12;
  let y = MARGIN + 22;
  const lineH = 4.6;
  const colW = 62;

  doc.setFont('courier', 'normal');
  doc.setFontSize(7);

  for (const u of stats.usages) {
    doc.setFillColor(u.bead.rgb[0], u.bead.rgb[1], u.bead.rgb[2]);
    doc.rect(x, y - 2.6, 3, 3, 'F');
    doc.setDrawColor(120);
    doc.setLineWidth(0.1);
    doc.rect(x, y - 2.6, 3, 3, 'S');

    doc.setTextColor(34);
    doc.text(u.bead.code, x + 4.2, y);
    doc.text(`${u.count}`, x + colW - 16, y, { align: 'right' });
    doc.text(`${(u.ratio * 100).toFixed(1)}%`, x + colW - 3, y, { align: 'right' });

    textStrip(doc, u.bead.nameZh, x + 19, y - 2.9, 3.4, '#444444');

    y += lineH;
    if (y > PAGE_H - MARGIN) {
      y = MARGIN + 22;
      x += colW;
      if (x + colW > PAGE_W - MARGIN) break; // 放不下就截断，图纸页里色号本来就都有
    }
  }

  drawPdfWatermark(doc);

  downloadBlob(filename, doc.output('blob'));
}
