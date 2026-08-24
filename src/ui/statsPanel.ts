import type { Store } from './state';
import { computeStats } from '../model/stats';
import { getPalette } from '../palette/registry';
import type { Palette } from '../palette/types';
import { statsToCsv, downloadText } from '../export/csv';
import { exportSheetPng } from '../export/png';
import { exportSheetPdf, exportSheetPdfByBoard } from '../export/pdf';
import { suggestSubstitutes } from '../model/substitute';

type SortMode = 'count' | 'code';

export interface StatsPanelHandlers {
  /** 点击图例里的颜色 = 把画笔设成该色 */
  onPickBrush: (beadIndex: number) => void;
  getBrush: () => number | null;
  /** 批量替换：把 fromIndex 色全部替换成当前画笔色 */
  onReplaceAll: (fromIndex: number, toIndex: number) => Promise<void>;
  /** 批量擦除：把某色全部去豆 */
  onEraseAll: (beadIndex: number) => Promise<void>;
  /** 切换拼图高亮色号（再点同一行 = 取消）。传 null 取消高亮 */
  onHighlight: (beadIndex: number | null) => void;
  /** 读当前高亮色号（供表格高亮当前行） */
  getHighlight: () => number | null;
}

export function mountStatsPanel(root: HTMLElement, store: Store, h: StatsPanelHandlers): void {
  let sort: SortMode = 'count';
  let busy = false;
  /** 当前展开详情的行（豆号下标），null = 无展开 */
  let expanded: number | null = null;

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

    // 缺色推荐：只在用户限制了子集时计算
    const allowedSet = new Set(s.allowed[s.grid.paletteId] ?? []);
    const isSubset = allowedSet.size > 0 && allowedSet.size < palette.beads.length;
    const subs = isSubset ? suggestSubstitutes(s.grid, palette, allowedSet) : [];
    const subByMissing = new Map(subs.map((su) => [su.missingIndex, su]));

    const rows = usages
      .map((u) => {
        const isBrush = u.beadIndex === brush;
        const isHighlight = u.beadIndex === highlight;
        const isExpanded = u.beadIndex === expanded;
        const cls = isHighlight ? 'hl' : isBrush ? 'brush' : '';
        const rowCls = [cls, isExpanded ? 'expanded' : ''].filter(Boolean).join(' ');
        // 缺色标记：该色不在用户子集里
        const sub = subByMissing.get(u.beadIndex);
        const missingTag = sub ? '<span class="missing-tag" title="你没有这个色，点开看替代推荐">缺</span>' : '';
        // 行末箭头：展开/收起详情（独立按钮，不触发行点击）
        const arrow = isExpanded ? '⌄' : '›';

        return `<tr data-bead="${u.beadIndex}" class="${rowCls}"${isBrush ? ' data-brush' : ''} title="${isBrush ? '再点取消画笔；点别的行=替换为画笔色' : '点此设为画笔；再点别的行替换'}">
          <td><span class="dot" style="background:${u.bead.hex}"></span></td>
          <td><code>${u.bead.code}</code></td>
          <td class="name">${u.bead.nameZh}</td>
          <td class="num">${u.count.toLocaleString('zh-CN')} 颗${missingTag}</td>
          <td class="expand-cell"><button class="expand-btn" data-expand="${u.beadIndex}" title="展开详情">${arrow}</button></td>
        </tr>${isExpanded ? renderDetail(u, stats, sub, brush, palette) : ''}`;
      })
      .join('');

    const baseName = (s.imageName || '拼豆图纸').replace(/\.[^.]+$/, '');
    const ext = (s.imageName || '').match(/\.([^.]+)$/)?.[1] || 'png';

    // 缺色汇总提示条
    const subBanner = subs.length > 0
      ? `<div class="sub-banner">⚠️ 你没有其中的 ${subs.length} 种色，已标"缺"。点开行查看替代色推荐</div>`
      : '';

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
      ${subBanner}
      <table class="stats">
        <thead><tr>
          <th></th><th>色号</th><th>颜色</th><th class="num">颗数</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <h2>导出</h2>
      <div class="row"><button class="btn primary" id="pngSheet" data-export>下载图纸 PNG</button></div>
      <div class="row"><button class="btn" id="pdf" data-export>下载分页打印 PDF</button></div>
      <div class="row"><button class="btn" id="pdfByBoard" data-export>下载按板分页 PDF</button></div>
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

    // 点行：设为画笔（粉色高亮）+ 高亮同色。再点已设画笔的行 = 取消
    root.querySelectorAll<HTMLElement>('tr[data-bead]').forEach((tr) => {
      tr.addEventListener('click', () => {
        const bead = Number(tr.dataset.bead);
        h.onPickBrush(bead);
        h.onHighlight(h.getHighlight() === bead ? null : bead);
        render();
      });
    });

    // 箭头：展开/收起详情（独立按钮，不触发行点击设画笔）
    root.querySelectorAll<HTMLButtonElement>('.expand-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const bead = Number(btn.dataset.expand);
        expanded = expanded === bead ? null : bead;
        render();
      });
    });

    // 详情区里的按钮（事件冒泡到行会触发设画笔，这里 stopPropagation）
    // 替换：把当前行色替换成画笔色（点行 A 设画笔，展开 B，点替换 → B→A）
    root.querySelectorAll<HTMLButtonElement>('.btn-replace').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fromIndex = Number(btn.dataset.replace);
        const toIndex = h.getBrush();
        if (toIndex === null || fromIndex === toIndex) return;
        const fromBead = palette.beads[fromIndex]!;
        const toBead = palette.beads[toIndex]!;
        if (confirm(`把 ${fromBead.code}（${fromBead.nameZh}）全部替换为 ${toBead.code}（${toBead.nameZh}）吗？`)) {
          void h.onReplaceAll(fromIndex, toIndex);
        }
      });
    });
    root.querySelectorAll<HTMLButtonElement>('.btn-erase').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        void h.onEraseAll(Number(btn.dataset.erase));
      });
    });
    // 缺色一键替换：把缺的色替换成选中的候选
    root.querySelectorAll<HTMLButtonElement>('.btn-sub-apply').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fromIndex = Number(btn.dataset.from);
        const toIndex = Number(btn.dataset.to);
        if (fromIndex === toIndex) return;
        void h.onReplaceAll(fromIndex, toIndex);
      });
    });

    const btn = (id: string) => root.querySelector(`#${id}`) as HTMLButtonElement;

    btn('csv').addEventListener('click', () => {
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

    btn('pdfByBoard').addEventListener('click', (e) => {
      void runExport(e.currentTarget as HTMLButtonElement, '排版中', () =>
        exportSheetPdfByBoard(s.grid!, palette, s.sheet, `${baseName}-按板.pdf`),
      );
    });
  }

  store.subscribe(render);
  render();
}

/** 渲染选中行下方的详情区：占比/累计 + 替换为画笔色 + 擦除 + 缺色推荐
 * 替换方向：把当前行色替换成画笔色（点行 A 设画笔，展开 B 行，点替换 → B→A） */
function renderDetail(
  u: { beadIndex: number; bead: { hex: string; code: string; nameZh: string }; count: number; ratio: number },
  stats: { usages: Array<{ ratio: number }> },
  sub: { candidates: Array<{ index: number; bead: { hex: string; code: string; nameZh: string }; deltaE: number }> } | undefined,
  brush: number | null,
  palette: Palette,
): string {
  // 累计占比：把排在前面的（包括自己）的 ratio 加起来
  let cumulative = 0;
  for (const x of stats.usages) {
    cumulative += x.ratio;
    if (x === u) break;
  }

  const subBlock = sub && sub.candidates.length > 0
    ? `<div class="sub-section">
        <div class="sub-title">🤔 没有此色？最接近的替代色（CIEDE2000）：</div>
        ${sub.candidates.map((c) => `
          <div class="sub-cand">
            <span class="dot" style="background:${c.bead.hex}"></span>
            <code>${c.bead.code}</code>
            <span class="sub-name">${c.bead.nameZh}</span>
            <span class="sub-delta">ΔE ${c.deltaE.toFixed(1)}</span>
            <button class="btn-sub-apply" data-from="${u.beadIndex}" data-to="${c.index}">用此色替换</button>
          </div>
        `).join('')}
      </div>`
    : '';

  return `<tr class="detail-row"><td colspan="5">
    <div class="detail">
      <div class="detail-stats">
        <span>占比 <b>${(u.ratio * 100).toFixed(1)}%</b></span>
        <span>累计 <b>${(cumulative * 100).toFixed(0)}%</b></span>
        <span>${u.bead.nameZh}</span>
      </div>
      <div class="detail-actions">
        ${brush !== null && brush !== u.beadIndex
          ? `<button class="btn-replace" data-replace="${u.beadIndex}">替换为画笔色 ${palette.beads[brush]!.code}</button>`
          : brush === u.beadIndex
            ? '<span class="hint-faint">此色已是画笔，先点别的行设为新画笔</span>'
            : '<span class="hint-faint">先点某行设为画笔，再回来点替换</span>'}
        <button class="btn-erase" data-erase="${u.beadIndex}">擦除此色</button>
      </div>
      ${subBlock}
    </div>
  </td></tr>`;
}


