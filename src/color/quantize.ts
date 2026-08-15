import { rgbToLab, labToRgb, type RGB, type Lab } from './space';

interface Entry {
  lab: Lab;
  rgb: RGB;
  /** 该颜色在输入中出现的次数，作为加权 */
  weight: number;
}

interface Box {
  entries: Entry[];
  /** Lab 三轴中跨度最大的那一轴的跨度，用于挑下一个要切的箱子 */
  spread: number;
  axis: 0 | 1 | 2;
}

function makeBox(entries: Entry[]): Box {
  let axis: 0 | 1 | 2 = 0;
  let spread = -1;
  for (const k of [0, 1, 2] as const) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const e of entries) {
      const v = e.lab[k];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const s = hi - lo;
    if (s > spread) {
      spread = s;
      axis = k;
    }
  }
  return { entries, spread, axis };
}

/**
 * 在已按 axis 排序的条目里挑切点，返回切点下标（左闭右开）。
 *
 * 打分 = 相邻两点在该轴上的间隙 × 切分平衡度。
 *
 * 为什么不用经典的加权中位数：中位数往往落在色簇内部而不是色簇之间。
 * 红/绿/蓝三团各占 1/3 权重时，中位数切法会把第一刀切成
 * "全部蓝 + 部分红 | 剩余红 + 全部绿"，代表色算出来是紫红和黄绿 ——
 * 用户设"最多 8 色"时拿到的就是这种糊色。
 *
 * 平衡度项负责兜底：平滑渐变时所有间隙都差不多，平衡度主导，
 * 退化成中位数切；同时也避免被单个离群色骗去切出只含一个元素的箱子。
 */
function chooseCut(sorted: readonly Entry[], axis: 0 | 1 | 2): number {
  const totalW = sorted.reduce((s, e) => s + e.weight, 0);
  let leftW = 0;
  let bestCut = 1;
  let bestScore = -1;

  for (let i = 0; i < sorted.length - 1; i++) {
    leftW += sorted[i]!.weight;
    const gap = sorted[i + 1]!.lab[axis] - sorted[i]!.lab[axis];
    const balance = Math.min(leftW, totalW - leftW) / totalW;
    const score = gap * balance;
    if (score > bestScore) {
      bestScore = score;
      bestCut = i + 1;
    }
  }

  return bestCut;
}

/** 箱内加权平均色 */
function boxAverage(box: Box): RGB {
  let L = 0;
  let a = 0;
  let b = 0;
  let w = 0;
  for (const e of box.entries) {
    L += e.lab[0] * e.weight;
    a += e.lab[1] * e.weight;
    b += e.lab[2] * e.weight;
    w += e.weight;
  }
  return labToRgb([L / w, a / w, b / w]);
}

/**
 * 在 Lab 空间做 median-cut 量化，返回不超过 maxColors 个代表色。
 *
 * 与经典 RGB median-cut 的区别：切分轴按 Lab 跨度选，代表色按 Lab 加权平均。
 * Lab 近似感知均匀，切出来的簇在人眼看来更合理。
 *
 * 用在匹配之前 —— 先量化出 N 个代表色再各自匹配到调色板，
 * 比"先全量匹配再合并相近豆号"效果好一个档次：后者在匹配阶段
 * 已经把相近色打散到不同豆号，合并时无法恢复全局最优。
 */
export function medianCutLab(colors: readonly RGB[], maxColors: number): RGB[] {
  if (colors.length === 0 || maxColors < 1) return [];

  // 去重并计数
  const counts = new Map<number, { rgb: RGB; n: number }>();
  for (const c of colors) {
    const key = (c[0] << 16) | (c[1] << 8) | c[2];
    const hit = counts.get(key);
    if (hit) hit.n++;
    else counts.set(key, { rgb: c, n: 1 });
  }

  const entries: Entry[] = [...counts.values()].map((v) => ({
    rgb: v.rgb,
    lab: rgbToLab(v.rgb),
    weight: v.n,
  }));

  if (entries.length <= maxColors) return entries.map((e) => e.rgb);

  let boxes: Box[] = [makeBox(entries)];

  while (boxes.length < maxColors) {
    // 选跨度最大且还能再切的箱子
    let target = -1;
    let best = -1;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]!;
      if (b.entries.length < 2) continue;
      if (b.spread > best) {
        best = b.spread;
        target = i;
      }
    }
    if (target === -1) break; // 全都切不动了

    const box = boxes[target]!;
    const axis = box.axis;
    const sorted = [...box.entries].sort((p, q) => p.lab[axis] - q.lab[axis]);
    const cut = chooseCut(sorted, axis);

    boxes = [
      ...boxes.slice(0, target),
      makeBox(sorted.slice(0, cut)),
      makeBox(sorted.slice(cut)),
      ...boxes.slice(target + 1),
    ];
  }

  return boxes.map(boxAverage);
}
