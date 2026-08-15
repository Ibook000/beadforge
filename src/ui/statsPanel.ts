import type { Store } from './state';
import { computeStats } from '../model/stats';
import { getPalette } from '../palette/registry';
import { statsToCsv, downloadText } from '../export/csv';
import { exportSheetPng } from '../export/png';
import { exportSheetPdf } from '../export/pdf';

type SortMode = 'count' | 'code';

export interface StatsPanelHandlers {
  /** 点击图例里的颜色 = 把画笔设成该色 */
  onPickBrush: (beadIndex: number) => void;
  getBrush: () => number | null;
  /** 批量替换：把 fromIndex 色全部替换成当前画笔色 */
  onReplaceAll: (fromIndex: number, toIndex: number) => Promise<void>;
  /** 切换拼图高亮色号（再点同一行 = 取消）。传 null 取消高亮 */
  onHighlight: (beadIndex: number | null) => void;
  /** 读当前高亮色号（供表格高亮当前行） */
  getHighlight: () => number | null;
}

export function mountStatsPanel(root: HTMLElement, store: Store, h: StatsPanelHandlers): void {
  let sort: SortMode = 'count';
  let busy = false;

  /** 导出期间禁用全部导出按钮 —— 只禁用被点的那个，其余按钮点了会静默无反应 */
  function exportButtons(): HTMLButtonElement[] {
    return [...root.querySelectorAll<HTMLButtonElement>('[data-export]')];
  }

  async function runExport(btn: HTMLButtonElement, label: string, job: () => Promise<void>) {
    if (busy) return;
    busy = true;
    const original = btn.textContent;
    const others = exportButtons();
    others.forEach((b) => (b.disabled = true));
    btn.textContent = `${label}…`;
    try {
      await job();
    } catch (err) {
      alert(`导出失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      busy = false;
      others.forEach((b) => (b.disabled = false));
      btn.textContent = original;
    }
  }

  function render(): void {
    const s = store.get();
    if (!s.grid) {
      root.innerHTML =
        '<h1>用量统计</h1><div class="empty-hint"><p class="hint-title">✨ 还没有图纸呀</p>' +
        '<p class="hint-sub">在左边上传图片，就能看到每种颜色要买多少颗豆子啦 ♡</p></div>';
      return;
    }

    const palette = getPalette(s.grid.paletteId);
    const stats = computeStats(s.grid, palette);
    const brush = h.getBrush();
    const highlight = h.getHighlight();

    const usages =
      sort === 'count'
        ? stats.usages
        : [...stats.usages].sort((a, b) =>
            a.bead.code.localeCompare(b.bead.code, 'en', { numeric: true }),
          );

    let cumulative = 0;
    const rows = usages
      .map((u) => {
        cumulative += u.ratio;
        const isBrush = u.beadIndex === brush;
        const isHighlight = u.beadIndex === highlight;
        const cls = isHighlight ? ' hl' : isBrush ? ' brush' : '';
        return `<tr data-bead="${u.beadIndex}" class="${cls.trim()}"${isBrush ? ' data-brush' : ''} title="点击设为画笔 + 高亮同色">
          <td><span class="dot" style="background:${u.bead.hex}"></span></td>
          <td><code>${u.bead.code}</code></td>
          <td>${u.bead.nameZh}</td>
          <td class="num">${u.count}</td>
          <td class="num">${(u.ratio * 100).toFixed(1)}%</td>
          <td class="num">${(cumulative * 100).toFixed(0)}%</td>
          <td><button class="btn-replace" data-replace="${u.beadIndex}" title="将此色全部替换为画笔颜色">替换</button></td>
        </tr>`;
      })
      .join('');

    const baseName = (s.imageName || '拼豆图纸').replace(/\.[^.]+$/, '');
    const ext = (s.imageName || '').match(/\.([^.]+)$/)?.[1] || 'png';

    root.innerHTML = `
      <h1>用量统计</h1>
      <div class="readout">
        总计 <b>${stats.totalBeads.toLocaleString('zh-CN')}</b> 颗 · <b>${stats.colorCount}</b> 色<br>
        空格 ${stats.emptyCount.toLocaleString('zh-CN')} 格
      </div>
      <div class="row">
        <button class="btn" id="sortCount"${sort === 'count' ? ' disabled' : ''}>按颗数</button>
        <button class="btn" id="sortCode"${sort === 'code' ? ' disabled' : ''}>按色号</button>
      </div>
      <table class="stats">
        <thead><tr>
          <th></th><th>色号</th><th>颜色</th>
          <th class="num">颗数</th><th class="num">占比</th><th class="num">累计</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <h2>导出</h2>
      <div class="row"><button class="btn primary" id="pngSheet" data-export>下载图纸 PNG</button></div>
      <div class="row"><button class="btn" id="pdf" data-export>下载分页打印 PDF</button></div>
      <div class="row"><button class="btn" id="pngRound" data-export>下载圆豆预览图</button></div>
      <div class="row"><button class="btn" id="csv" data-export>下载采购清单 CSV</button></div>
    `;

    root.querySelector('#sortCount')!.addEventListener('click', () => {
      sort = 'count';
      render();
    });
    root.querySelector('#sortCode')!.addEventListener('click', () => {
      sort = 'code';
      render();
    });

    root.querySelectorAll<HTMLElement>('tr[data-bead]').forEach((tr) => {
      tr.addEventListener('click', () => {
        const bead = Number(tr.dataset.bead);
        // 设为画笔
        h.onPickBrush(bead);
        // 点同一行 = 取消高亮；点其他行 = 高亮该色
        h.onHighlight(h.getHighlight() === bead ? null : bead);
        render();
      });
    });

    // 批量替换：把某色的所有格子替换成当前画笔颜色
    root.querySelectorAll<HTMLButtonElement>('.btn-replace').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fromIndex = Number(btn.dataset.replace);
        const toIndex = h.getBrush();
        if (toIndex === null) return;
        if (fromIndex === toIndex) return;
        void h.onReplaceAll(fromIndex, toIndex);
      });
    });

    const btn = (id: string) => root.querySelector(`#${id}`) as HTMLButtonElement;

    btn('csv').addEventListener('click', () => {
      // 采购清单也要带上扩展名，但保留原名便于识别
      downloadText(`${baseName}-采购清单.${ext}`, statsToCsv(stats));
    });

    btn('pngSheet').addEventListener('click', (e) => {
      void runExport(e.currentTarget as HTMLButtonElement, '生成中', () =>
        exportSheetPng(s.grid!, palette, s.sheet, `${baseName}.png`),
      );
    });

    btn('pngRound').addEventListener('click', (e) => {
      void runExport(e.currentTarget as HTMLButtonElement, '生成中', () =>
        exportSheetPng(
          s.grid!,
          palette,
          {
            ...s.sheet,
            style: 'round',
            showCoords: false,
            showGrid: false,
            showMajorLines: false,
            showBoardLines: false,
          },
          `${baseName}-预览.png`,
        ),
      );
    });

    btn('pdf').addEventListener('click', (e) => {
      void runExport(e.currentTarget as HTMLButtonElement, '排版中', () =>
        exportSheetPdf(s.grid!, palette, s.sheet, `${baseName}.pdf`),
      );
    });
  }

  store.subscribe(render);
  render();
}