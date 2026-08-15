# 拼豆图纸生成器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一个纯前端网页应用，上传图片后生成可照着拼的拼豆图纸，并统计每种颜色的豆子用量。

**Architecture:** 一条纯函数管线（采样 → 调整 → 抠图 → 量化 → 匹配 → 清理）产出唯一真相 `BeadGrid`；渲染器、统计器、导出器全部从 `BeadGrid` 派生。管线每步是纯函数，可独立单测；UI 层只负责收集参数和触发重跑。

**Tech Stack:** Vite + 原生 TypeScript（无框架）、Vitest、jsPDF、vite-plugin-singlefile

设计文档：`docs/superpowers/specs/2026-08-09-pindou-pattern-generator-design.md`

## Global Constraints

- 纯前端，无后端。图片不得离开浏览器。
- 不引入 React / Vue 等框架。核心是 Canvas 像素操作。
- 所有第三方库打进 bundle，**不得引用 CDN**（保证离线可用）。
- 色卡数据来源 [maxcleme/beadcolors](https://github.com/maxcleme/beadcolors)，MIT 协议，必须在仓库根目录保留 `THIRD_PARTY_NOTICES.md`。
- **不得引入** `liangdabiao/perlerBeadsApplet` 的任何数据（该仓库无 LICENSE 文件）。
- 管线模块（`src/color/`、`src/pipeline/`、`src/model/`）必须是纯函数：不碰 DOM、不碰全局状态、不做 I/O。
- 色卡最大 291 色，`BeadGrid.cells` 用 `Uint16Array`（291 > 255，`Uint8Array` 不够）。
- 空格（不放豆）用 `mask` 数组表示，值 0；`cells` 在空格处的值无意义，统计与渲染都必须先查 `mask`。
- CSV 导出必须带 UTF-8 BOM（`﻿`），否则 Excel 打开中文乱码。
- 提交信息用中文，格式 `<type>: <描述>`，type 取 `feat` / `fix` / `test` / `chore` / `docs`。

---

### Task 1: 项目脚手架 + 色彩空间转换

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `index.html`
- Create: `src/color/space.ts`
- Test: `src/color/space.test.ts`

**Interfaces:**
- Consumes: 无（第一个任务）
- Produces:
  - `type RGB = readonly [number, number, number]`（0–255 整数）
  - `type Lab = readonly [number, number, number]`
  - `srgbToLinear(c: number): number`（入参出参均 0–1）
  - `linearToSrgb(c: number): number`
  - `rgbToLab(rgb: RGB): Lab`
  - `labToRgb(lab: Lab): RGB`
  - `hexToRgb(hex: string): RGB`
  - `rgbToHex(rgb: RGB): string`
  - `luma(rgb: RGB): number`（0–1，用于决定图纸上文字取黑还是白）

- [ ] **Step 1: 初始化项目并安装依赖**

```bash
cd "/Users/sleepy_gyn/Documents/拼豆图纸生成项目"
git init
npm init -y
npm install -D vite typescript vitest vite-plugin-singlefile @types/node
npm install jspdf
```

- [ ] **Step 2: 写配置文件**

`package.json` 的 `scripts` 段替换为：

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "palettes": "tsx scripts/build-palettes.ts"
  }
}
```

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "scripts", "vite.config.ts"]
}
```

`vite.config.ts`：

```ts
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  test: { globals: true, environment: 'node' },
});
```

`.gitignore`：

```
node_modules/
dist/
.superpowers/
.DS_Store
```

`index.html`（占位，Task 14 会填充）：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>拼豆图纸生成器</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

创建 `src/main.ts`，内容暂时只有一行 `export {};`

- [ ] **Step 3: 写失败的测试**

`src/color/space.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { rgbToLab, labToRgb, hexToRgb, rgbToHex, luma, srgbToLinear, linearToSrgb } from './space';

describe('srgb ↔ linear', () => {
  it('往返转换应还原', () => {
    for (const c of [0, 0.04, 0.5, 0.9, 1]) {
      expect(linearToSrgb(srgbToLinear(c))).toBeCloseTo(c, 10);
    }
  });

  it('线性段与幂函数段的分界点应连续', () => {
    // sRGB 传输函数在 0.04045 处切换分段
    expect(srgbToLinear(0.04045)).toBeCloseTo(0.04045 / 12.92, 6);
  });
});

describe('rgbToLab', () => {
  it('纯白应为 L=100, a=0, b=0', () => {
    const [L, a, b] = rgbToLab([255, 255, 255]);
    expect(L).toBeCloseTo(100, 3);
    expect(a).toBeCloseTo(0, 3);
    expect(b).toBeCloseTo(0, 3);
  });

  it('纯黑应为 L=0', () => {
    expect(rgbToLab([0, 0, 0])[0]).toBeCloseTo(0, 3);
  });

  it('中灰的 a/b 应为 0', () => {
    const [, a, b] = rgbToLab([128, 128, 128]);
    expect(a).toBeCloseTo(0, 3);
    expect(b).toBeCloseTo(0, 3);
  });

  it('往返 rgb → lab → rgb 应还原（误差 ≤ 1）', () => {
    const samples: Array<[number, number, number]> = [
      [255, 0, 0], [0, 255, 0], [0, 0, 255],
      [252, 40, 60], [29, 20, 20], [245, 236, 210],
    ];
    for (const rgb of samples) {
      const back = labToRgb(rgbToLab(rgb));
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(back[i]! - rgb[i]!)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('hex', () => {
  it('解析与还原', () => {
    expect(hexToRgb('#FC283C')).toEqual([252, 40, 60]);
    expect(rgbToHex([252, 40, 60])).toBe('#FC283C');
  });

  it('应接受不带 # 和小写', () => {
    expect(hexToRgb('fc283c')).toEqual([252, 40, 60]);
  });
});

describe('luma', () => {
  it('白接近 1，黑为 0', () => {
    expect(luma([255, 255, 255])).toBeCloseTo(1, 6);
    expect(luma([0, 0, 0])).toBeCloseTo(0, 6);
  });

  it('绿的亮度应高于红和蓝（Rec.709 权重）', () => {
    expect(luma([0, 255, 0])).toBeGreaterThan(luma([255, 0, 0]));
    expect(luma([255, 0, 0])).toBeGreaterThan(luma([0, 0, 255]));
  });
});
```

- [ ] **Step 4: 运行测试确认失败**

Run: `npx vitest run src/color/space.test.ts`
Expected: FAIL — `Failed to resolve import "./space"`

- [ ] **Step 5: 实现**

`src/color/space.ts`：

```ts
export type RGB = readonly [number, number, number];
export type Lab = readonly [number, number, number];

/** D65 白点，2° 观察者 */
const Xn = 95.047;
const Yn = 100.0;
const Zn = 108.883;

/** sRGB 传输函数的逆：伽马编码值 → 线性光。入参出参均 0–1。 */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** sRGB 传输函数：线性光 → 伽马编码值。入参出参均 0–1。 */
export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function labF(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29;
}

function labFInv(t: number): number {
  return t > 6 / 29 ? t * t * t : (108 / 841) * (t - 4 / 29);
}

export function rgbToLab(rgb: RGB): Lab {
  const r = srgbToLinear(rgb[0] / 255);
  const g = srgbToLinear(rgb[1] / 255);
  const b = srgbToLinear(rgb[2] / 255);

  // sRGB → XYZ (D65)，乘 100 使 Y 落在 0–100
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) * 100;
  const Y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) * 100;
  const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) * 100;

  const fx = labF(X / Xn);
  const fy = labF(Y / Yn);
  const fz = labF(Z / Zn);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb(lab: Lab): RGB {
  const fy = (lab[0] + 16) / 116;
  const fx = fy + lab[1] / 500;
  const fz = fy - lab[2] / 200;

  const X = labFInv(fx) * Xn;
  const Y = labFInv(fy) * Yn;
  const Z = labFInv(fz) * Zn;

  const x = X / 100;
  const y = Y / 100;
  const z = Z / 100;

  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;

  const to8 = (v: number) =>
    Math.max(0, Math.min(255, Math.round(linearToSrgb(Math.max(0, Math.min(1, v))) * 255)));

  return [to8(r), to8(g), to8(b)];
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '').trim();
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex(rgb: RGB): string {
  return (
    '#' +
    rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')
      .toUpperCase()
  );
}

/**
 * Rec.709 相对亮度，0–1。
 * 用于决定图纸格子里的文字取黑还是白：> 0.55 取黑。
 */
export function luma(rgb: RGB): number {
  const r = srgbToLinear(rgb[0] / 255);
  const g = srgbToLinear(rgb[1] / 255);
  const b = srgbToLinear(rgb[2] / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npx vitest run src/color/space.test.ts`
Expected: PASS，全部 9 个用例

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: 项目脚手架与 sRGB/Lab 色彩空间转换"
```

---

### Task 2: CIEDE2000 色差

**Files:**
- Create: `src/color/distance.ts`
- Create: `src/color/ciede2000-testdata.ts`（Sharma 官方 34 组测试数据）
- Test: `src/color/distance.test.ts`

**Interfaces:**
- Consumes: `Lab` from `src/color/space.ts`
- Produces:
  - `ciede2000(a: Lab, b: Lab): number`
  - `cie76(a: Lab, b: Lab): number`

**为什么单独一个任务：** CIEDE2000 有多处色相角环绕（0°/360°）和分段判断，凭直觉实现几乎必错。错了之后的表现是"匹配结果略微有点怪"，肉眼极难发现。官方测试集是唯一可靠的验证手段，必须独立通过后才能往下走。

- [ ] **Step 1: 写入官方测试数据**

`src/color/ciede2000-testdata.ts`：

```ts
import type { Lab } from './space';

/**
 * CIEDE2000 官方测试数据，34 组。
 * 来源：Sharma, G., Wu, W. & Dalal, E.N. (2005),
 * "The CIEDE2000 color-difference formula: Implementation notes,
 *  supplementary test data, and mathematical observations",
 * Color Research & Application, 30(1), 21-30.
 * https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/
 *
 * 格式：[参考色 Lab, 样本色 Lab, 期望 ΔE00]
 */
export const CIEDE2000_TEST_DATA: ReadonlyArray<readonly [Lab, Lab, number]> = [
  [[50.0, 2.6772, -79.7751], [50.0, 0.0, -82.7485], 2.0425],
  [[50.0, 3.1571, -77.2803], [50.0, 0.0, -82.7485], 2.8615],
  [[50.0, 2.8361, -74.02], [50.0, 0.0, -82.7485], 3.4412],
  [[50.0, -1.3802, -84.2814], [50.0, 0.0, -82.7485], 1.0],
  [[50.0, -1.1848, -84.8006], [50.0, 0.0, -82.7485], 1.0],
  [[50.0, -0.9009, -85.5211], [50.0, 0.0, -82.7485], 1.0],
  [[50.0, 0.0, 0.0], [50.0, -1.0, 2.0], 2.3669],
  [[50.0, -1.0, 2.0], [50.0, 0.0, 0.0], 2.3669],
  [[50.0, 2.49, -0.001], [50.0, -2.49, 0.0009], 7.1792],
  [[50.0, 2.49, -0.001], [50.0, -2.49, 0.001], 7.1792],
  [[50.0, 2.49, -0.001], [50.0, -2.49, 0.0011], 7.2195],
  [[50.0, 2.49, -0.001], [50.0, -2.49, 0.0012], 7.2195],
  [[50.0, -0.001, 2.49], [50.0, 0.0009, -2.49], 4.8045],
  [[50.0, -0.001, 2.49], [50.0, 0.001, -2.49], 4.8045],
  [[50.0, -0.001, 2.49], [50.0, 0.0011, -2.49], 4.7461],
  [[50.0, 2.5, 0.0], [50.0, 0.0, -2.5], 4.3065],
  [[50.0, 2.5, 0.0], [73.0, 25.0, -18.0], 27.1492],
  [[50.0, 2.5, 0.0], [61.0, -5.0, 29.0], 22.8977],
  [[50.0, 2.5, 0.0], [56.0, -27.0, -3.0], 31.9030],
  [[50.0, 2.5, 0.0], [58.0, 24.0, 15.0], 19.4535],
  [[50.0, 2.5, 0.0], [50.0, 3.1736, 0.5854], 1.0],
  [[50.0, 2.5, 0.0], [50.0, 3.2972, 0.0], 1.0],
  [[50.0, 2.5, 0.0], [50.0, 1.8634, 0.5757], 1.0],
  [[50.0, 2.5, 0.0], [50.0, 3.2592, 0.335], 1.0],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
  [[61.2901, 3.7196, -5.3901], [61.4292, 2.248, -4.962], 1.8731],
  [[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
  [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
  [[36.4612, 47.858, 18.3852], [36.2715, 50.5065, 21.2231], 1.4146],
  [[90.8027, -2.0831, 1.441], [91.1528, -1.6435, 0.0447], 1.4441],
  [[90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239], 1.5381],
  [[6.7747, -0.2908, -2.4247], [5.8714, -0.0985, -2.2286], 0.6377],
  [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
];
```

- [ ] **Step 2: 写失败的测试**

`src/color/distance.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { ciede2000, cie76 } from './distance';
import { CIEDE2000_TEST_DATA } from './ciede2000-testdata';

describe('ciede2000', () => {
  it('应通过 Sharma 官方 34 组测试数据', () => {
    expect(CIEDE2000_TEST_DATA).toHaveLength(34);
    for (const [ref, sample, expected] of CIEDE2000_TEST_DATA) {
      const got = ciede2000(ref, sample);
      expect(got).toBeCloseTo(expected, 4);
    }
  });

  it('应对称：ΔE(a,b) === ΔE(b,a)', () => {
    for (const [ref, sample] of CIEDE2000_TEST_DATA) {
      expect(ciede2000(ref, sample)).toBeCloseTo(ciede2000(sample, ref), 10);
    }
  });

  it('同色应为 0', () => {
    expect(ciede2000([50, 2.5, -3], [50, 2.5, -3])).toBeCloseTo(0, 10);
  });
});

describe('cie76', () => {
  it('就是 Lab 空间欧氏距离', () => {
    expect(cie76([50, 0, 0], [53, 4, 0])).toBeCloseTo(5, 10);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run src/color/distance.test.ts`
Expected: FAIL — `Failed to resolve import "./distance"`

- [ ] **Step 4: 实现**

`src/color/distance.ts`：

```ts
import type { Lab } from './space';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Lab 空间欧氏距离（ΔE*ab, CIE 1976） */
export function cie76(a: Lab, b: Lab): number {
  const dL = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * CIEDE2000 色差，kL = kC = kH = 1。
 * 实现严格依照 Sharma/Wu/Dalal (2005) 的公式编号。
 * 注意色相角必须换算到 [0, 360)，且平均色相在两角差 > 180° 时需要修正 —— 这是最常见的实现错误。
 */
export function ciede2000(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  // (2) C*ab
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);

  // (3) 平均 C*ab
  const Cbar = (C1 + C2) / 2;

  // (4) G —— 对 a* 的补偿，让近中性色的色相更稳定
  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 6103515625))); // 25^7 = 6103515625

  // (5) a'
  const ap1 = (1 + G) * a1;
  const ap2 = (1 + G) * a2;

  // (6) C'
  const Cp1 = Math.sqrt(ap1 * ap1 + b1 * b1);
  const Cp2 = Math.sqrt(ap2 * ap2 + b2 * b2);

  // (7) h' —— atan2 结果换算到 [0, 360)；a'=b'=0 时定义为 0
  const hp = (ap: number, bp: number): number => {
    if (ap === 0 && bp === 0) return 0;
    const h = Math.atan2(bp, ap) * RAD;
    return h >= 0 ? h : h + 360;
  };
  const hp1 = hp(ap1, b1);
  const hp2 = hp(ap2, b2);

  // (8) ΔL'
  const dLp = L2 - L1;

  // (9) ΔC'
  const dCp = Cp2 - Cp1;

  // (10) Δh' —— 任一 C' 为 0 时定义为 0；否则取绝对差 ≤ 180 的那个方向
  let dhp: number;
  if (Cp1 * Cp2 === 0) {
    dhp = 0;
  } else {
    const diff = hp2 - hp1;
    if (Math.abs(diff) <= 180) dhp = diff;
    else if (diff > 180) dhp = diff - 360;
    else dhp = diff + 360;
  }

  // (11) ΔH'
  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dhp / 2) * DEG);

  // (12) 平均 L'
  const Lbarp = (L1 + L2) / 2;

  // (13) 平均 C'
  const Cbarp = (Cp1 + Cp2) / 2;

  // (14) 平均 h' —— 这里是最容易写错的地方
  let hbarp: number;
  if (Cp1 * Cp2 === 0) {
    hbarp = hp1 + hp2;
  } else {
    const sum = hp1 + hp2;
    const absDiff = Math.abs(hp1 - hp2);
    if (absDiff <= 180) hbarp = sum / 2;
    else if (sum < 360) hbarp = (sum + 360) / 2;
    else hbarp = (sum - 360) / 2;
  }

  // (15) T
  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * DEG) +
    0.24 * Math.cos(2 * hbarp * DEG) +
    0.32 * Math.cos((3 * hbarp + 6) * DEG) -
    0.2 * Math.cos((4 * hbarp - 63) * DEG);

  // (16) Δθ
  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));

  // (17) R_C
  const Cbarp7 = Math.pow(Cbarp, 7);
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 6103515625));

  // (18) S_L
  const Lm50sq = (Lbarp - 50) * (Lbarp - 50);
  const SL = 1 + (0.015 * Lm50sq) / Math.sqrt(20 + Lm50sq);

  // (19) S_C
  const SC = 1 + 0.045 * Cbarp;

  // (20) S_H
  const SH = 1 + 0.015 * Cbarp * T;

  // (21) R_T —— 蓝区旋转项
  const RT = -Math.sin(2 * dTheta * DEG) * RC;

  // (22) ΔE00，kL = kC = kH = 1
  const termL = dLp / SL;
  const termC = dCp / SC;
  const termH = dHp / SH;

  return Math.sqrt(termL * termL + termC * termC + termH * termH + RT * termC * termH);
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/color/distance.test.ts`
Expected: PASS，4 个用例。若"官方 34 组"这条失败，先看失败的是哪一组：第 1–6 组考色相角环绕，第 9–15 组考近中性色的 G 补偿，第 17–20 组考大色差。不要靠调容差蒙混过关。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: CIEDE2000 色差，通过 Sharma 官方 34 组测试数据"
```

---

### Task 3: 色卡数据编译 + 中文名

**Files:**
- Create: `scripts/build-palettes.ts`
- Create: `scripts/zh-name-overrides.ts`
- Create: `src/palette/types.ts`
- Create: `src/palette/registry.ts`
- Create: `src/palette/data/*.ts`（由脚本生成，5 个文件）
- Create: `THIRD_PARTY_NOTICES.md`
- Test: `src/palette/registry.test.ts`

**Interfaces:**
- Consumes: `RGB`, `Lab`, `hexToRgb`, `rgbToLab` from `src/color/space.ts`
- Produces:
  - `type PaletteId = 'mard' | 'artkal-s' | 'artkal-c' | 'perler' | 'hama'`
  - `interface Bead { code: string; name: string; nameZh: string; hex: string; rgb: RGB; lab: Lab }`
  - `interface Palette { id: PaletteId; label: string; beadSizeMm: 5 | 2.6; beads: readonly Bead[] }`
  - `getPalette(id: PaletteId): Palette`
  - `listPalettes(beadSizeMm?: 5 | 2.6): readonly Palette[]`
  - `PALETTE_IDS: readonly PaletteId[]`

**注意：** `Bead` 上**没有** `symbol` 字段。符号是按每张图纸实际用到的颜色动态分配的（见 Task 12），数据源自带的 symbol 列不可用（红色分到 `è`、黑色分到 `Ζ`，人眼无法区分）。

- [ ] **Step 1: 安装 tsx 并写数据编译脚本**

```bash
npm install -D tsx
```

`scripts/zh-name-overrides.ts` —— 常用色的人工校对表，覆盖自动生成的名字：

```ts
/**
 * 中文名人工覆盖表，键为 HEX（大写，带 #）。
 * 自动生成的名字够用但生硬，常用色人工校一遍。
 */
export const ZH_NAME_OVERRIDES: Record<string, string> = {
  '#FFFFFF': '纯白',
  '#FEFFFF': '纯白',
  '#FDFBFF': '象牙白',
  '#000000': '纯黑',
  '#1D1414': '墨黑',
  '#2F2B2F': '炭黑',
  '#48464E': '深灰',
  '#89858C': '中灰',
  '#B6B1BA': '浅灰',
  '#EDEDED': '银灰',
  '#FC283C': '正红',
  '#F5ECD2': '米白',
  '#F7B4C6': '樱花粉',
  '#1C9C4F': '正绿',
  '#27523A': '墨绿',
};
```

`scripts/build-palettes.ts`：

```ts
/**
 * 从 maxcleme/beadcolors (MIT) 的 v3 CSV 生成色卡 TS 常量。
 * 运行：npm run palettes
 *
 * v3 CSV 列：
 *   reference_code, name, symbol, rgb_r, rgb_g, rgb_b,
 *   hsl_h, hsl_s, hsl_l, lab_l, lab_a, lab_b, contributor
 * 我们只取 code / name / rgb，Lab 自己算（保证与运行时 rgbToLab 完全一致，
 * 否则匹配用的 Lab 和测试算的 Lab 会有微小偏差）。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rgbToLab, rgbToHex, type RGB } from '../src/color/space';
import { ZH_NAME_OVERRIDES } from './zh-name-overrides';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://raw.githubusercontent.com/maxcleme/beadcolors/master/gen/v3';

const SOURCES = [
  { id: 'mard', file: 'mard', label: 'MARD（漫漫 / COCO 系）', beadSizeMm: 5 },
  { id: 'artkal-s', file: 'artkal_s', label: 'Artkal S（5mm）', beadSizeMm: 5 },
  { id: 'artkal-c', file: 'artkal_c', label: 'Artkal C（2.6mm）', beadSizeMm: 2.6 },
  { id: 'perler', file: 'perler', label: 'Perler', beadSizeMm: 5 },
  { id: 'hama', file: 'hama', label: 'Hama', beadSizeMm: 5 },
] as const;

/** 由 HSL 推一个中文名。够用即可，常用色由 overrides 覆盖。 */
function autoZhName(rgb: RGB): string {
  const [r, g, b] = rgb.map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  // 明度前缀
  const lightness = l > 0.82 ? '浅' : l > 0.58 ? '亮' : l > 0.32 ? '' : '深';

  if (s < 0.08) {
    if (l > 0.93) return '白';
    if (l > 0.72) return '浅灰';
    if (l > 0.45) return '中灰';
    if (l > 0.18) return '深灰';
    return '黑';
  }

  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;

  const HUES: Array<[number, string]> = [
    [15, '红'], [40, '橙'], [65, '黄'], [90, '黄绿'], [150, '绿'],
    [180, '青绿'], [200, '青'], [240, '蓝'], [280, '紫'], [330, '品红'], [360, '红'],
  ];
  const hue = HUES.find(([bound]) => h < bound)?.[1] ?? '红';
  const muted = s < 0.35 ? '灰' : '';
  return `${lightness}${muted}${hue}`;
}

function parseCsv(text: string): Array<{ code: string; name: string; rgb: RGB }> {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const c = line.split(',');
      return {
        code: c[0]!,
        name: c[1]!,
        rgb: [Number(c[3]), Number(c[4]), Number(c[5])] as RGB,
      };
    });
}

async function main() {
  mkdirSync(resolve(ROOT, 'src/palette/data'), { recursive: true });

  for (const src of SOURCES) {
    const res = await fetch(`${BASE}/${src.file}.csv`);
    if (!res.ok) throw new Error(`拉取 ${src.file}.csv 失败：HTTP ${res.status}`);
    const rows = parseCsv(await res.text());

    const beads = rows.map((row) => {
      const hex = rgbToHex(row.rgb);
      return {
        code: row.code,
        name: row.name,
        nameZh: ZH_NAME_OVERRIDES[hex] ?? autoZhName(row.rgb),
        hex,
        rgb: row.rgb,
        lab: rgbToLab(row.rgb).map((v) => Number(v.toFixed(4))),
      };
    });

    const varName = src.id.replace(/-/g, '_').toUpperCase();
    const body = `// 由 scripts/build-palettes.ts 自动生成，请勿手工编辑。
// 数据来源：https://github.com/maxcleme/beadcolors (MIT)
import type { Palette } from '../types';

export const ${varName}: Palette = {
  id: '${src.id}',
  label: '${src.label}',
  beadSizeMm: ${src.beadSizeMm},
  beads: ${JSON.stringify(beads, null, 2)},
};
`;
    writeFileSync(resolve(ROOT, `src/palette/data/${src.id}.ts`), body, 'utf8');
    console.log(`${src.id}: ${beads.length} 色`);
  }
}

main();
```

- [ ] **Step 2: 写类型与注册表**

`src/palette/types.ts`：

```ts
import type { RGB, Lab } from '../color/space';

export type PaletteId = 'mard' | 'artkal-s' | 'artkal-c' | 'perler' | 'hama';

/** 一颗豆子在某品牌色卡中的定义 */
export interface Bead {
  /** 品牌色号，如 "F4" / "S01" / "80-15179"。图纸上写的就是它。 */
  code: string;
  /** 原始颜色名。MARD 无颜色名，此处等于 code。 */
  name: string;
  /** 中文名，由 scripts/build-palettes.ts 生成 */
  nameZh: string;
  hex: string;
  rgb: RGB;
  lab: Lab;
}

export interface Palette {
  id: PaletteId;
  label: string;
  beadSizeMm: 5 | 2.6;
  beads: readonly Bead[];
}
```

`src/palette/registry.ts`：

```ts
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
```

- [ ] **Step 3: 运行生成脚本**

```bash
npm run palettes
```

Expected 输出：
```
mard: 291 色
artkal-s: 199 色
artkal-c: 174 色
perler: 103 色
hama: 92 色
```

- [ ] **Step 4: 写第三方声明**

`THIRD_PARTY_NOTICES.md`：

```markdown
# 第三方数据与许可

## 拼豆色卡数据

`src/palette/data/` 下的色卡数据由 `scripts/build-palettes.ts` 从以下项目生成：

**maxcleme/beadcolors** — https://github.com/maxcleme/beadcolors
许可：MIT License, Copyright (c) 2020 maxcleme

> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

中文名（`nameZh`）与符号分配为本项目自行生成，不属于上述数据。

## CIEDE2000 测试数据

`src/color/ciede2000-testdata.ts` 取自：

Sharma, G., Wu, W. & Dalal, E.N. (2005), "The CIEDE2000 color-difference
formula: Implementation notes, supplementary test data, and mathematical
observations", *Color Research & Application*, 30(1), 21-30.
https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/
```

- [ ] **Step 5: 写测试**

`src/palette/registry.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { getPalette, listPalettes, PALETTE_IDS } from './registry';
import { rgbToLab, hexToRgb } from '../color/space';

describe('色卡注册表', () => {
  it('五套色卡的色数应符合预期', () => {
    const expected: Record<string, number> = {
      mard: 291, 'artkal-s': 199, 'artkal-c': 174, perler: 103, hama: 92,
    };
    for (const id of PALETTE_IDS) {
      expect(getPalette(id).beads.length).toBe(expected[id]);
    }
  });

  it('每颗豆的 lab 应与 rgbToLab(rgb) 一致', () => {
    for (const id of PALETTE_IDS) {
      for (const bead of getPalette(id).beads) {
        const computed = rgbToLab(bead.rgb);
        for (let i = 0; i < 3; i++) {
          expect(Math.abs(bead.lab[i]! - computed[i]!)).toBeLessThan(0.001);
        }
      }
    }
  });

  it('hex 应与 rgb 一致', () => {
    for (const id of PALETTE_IDS) {
      for (const bead of getPalette(id).beads) {
        expect(hexToRgb(bead.hex)).toEqual(bead.rgb);
      }
    }
  });

  it('每颗豆都应有非空的中文名', () => {
    for (const id of PALETTE_IDS) {
      for (const bead of getPalette(id).beads) {
        expect(bead.nameZh.length).toBeGreaterThan(0);
      }
    }
  });

  it('同一色卡内色号不应重复', () => {
    for (const id of PALETTE_IDS) {
      const codes = getPalette(id).beads.map((b) => b.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it('按豆径筛选应生效', () => {
    expect(listPalettes(2.6).map((p) => p.id)).toEqual(['artkal-c']);
    expect(listPalettes(5).length).toBe(4);
    expect(listPalettes().length).toBe(5);
  });
});
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npx vitest run src/palette/registry.test.ts`
Expected: PASS，6 个用例

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: 五套品牌色卡数据编译与注册表"
```

---

### Task 4: 最近色匹配器

**Files:**
- Create: `src/color/matcher.ts`
- Test: `src/color/matcher.test.ts`

**Interfaces:**
- Consumes: `RGB`, `rgbToLab` from `src/color/space.ts`；`ciede2000` from `src/color/distance.ts`；`Bead` from `src/palette/types.ts`
- Produces:
  - `interface Matcher { match(rgb: RGB): number; matchLab(lab: Lab): number }`（返回 `beads` 数组下标）
  - `createMatcher(beads: readonly Bead[], allowed?: ReadonlySet<number>): Matcher`

**性能设计：** `match(rgb)` 内部按 32 位打包的 RGB 做缓存。降采样后的独立颜色数远小于格数，缓存命中率极高，因此 200×200 的图也不需要 Web Worker。

- [ ] **Step 1: 写失败的测试**

`src/color/matcher.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { createMatcher } from './matcher';
import { getPalette } from '../palette/registry';
import type { Bead } from '../palette/types';
import { rgbToLab, type RGB } from './space';

function bead(code: string, rgb: RGB): Bead {
  return { code, name: code, nameZh: code, hex: '#000000', rgb, lab: rgbToLab(rgb) };
}

describe('createMatcher', () => {
  const beads = [
    bead('W', [255, 255, 255]),
    bead('K', [0, 0, 0]),
    bead('R', [255, 0, 0]),
    bead('G', [0, 255, 0]),
    bead('B', [0, 0, 255]),
  ];

  it('精确色应匹配到自己', () => {
    const m = createMatcher(beads);
    expect(m.match([255, 255, 255])).toBe(0);
    expect(m.match([0, 0, 0])).toBe(1);
    expect(m.match([255, 0, 0])).toBe(2);
  });

  it('近似色应匹配到最近的', () => {
    const m = createMatcher(beads);
    expect(m.match([250, 10, 12])).toBe(2); // 近红
    expect(m.match([246, 246, 250])).toBe(0); // 近白
  });

  it('allowed 子集应限制候选范围', () => {
    // 只允许黑白，纯红必须落到其中之一而不是红
    const m = createMatcher(beads, new Set([0, 1]));
    expect([0, 1]).toContain(m.match([255, 0, 0]));
  });

  it('allowed 为空集时视为全选', () => {
    const m = createMatcher(beads, new Set());
    expect(m.match([255, 0, 0])).toBe(2);
  });

  it('重复查询应走缓存并返回相同结果', () => {
    const m = createMatcher(beads);
    const first = m.match([123, 45, 67]);
    expect(m.match([123, 45, 67])).toBe(first);
  });

  it('真实色卡：纯黑应匹配到 MARD 的黑色系', () => {
    const mard = getPalette('mard');
    const m = createMatcher(mard.beads);
    const idx = m.match([0, 0, 0]);
    const matched = mard.beads[idx]!;
    // 匹配到的应该确实是很暗的颜色
    expect(matched.lab[0]).toBeLessThan(15);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/color/matcher.test.ts`
Expected: FAIL — `Failed to resolve import "./matcher"`

- [ ] **Step 3: 实现**

`src/color/matcher.ts`：

```ts
import { rgbToLab, type RGB, type Lab } from './space';
import { ciede2000 } from './distance';
import type { Bead } from '../palette/types';

export interface Matcher {
  /** 返回最近豆子在 beads 数组中的下标 */
  match(rgb: RGB): number;
  matchLab(lab: Lab): number;
}

/**
 * 创建一个最近色匹配器。
 *
 * @param beads   候选豆子（通常是整套色卡）
 * @param allowed 只在这些下标中匹配（「我有的豆子」子集）。
 *                传 undefined 或空集视为全选。
 */
export function createMatcher(beads: readonly Bead[], allowed?: ReadonlySet<number>): Matcher {
  const candidates: number[] =
    allowed && allowed.size > 0
      ? [...allowed].filter((i) => i >= 0 && i < beads.length).sort((a, b) => a - b)
      : beads.map((_, i) => i);

  if (candidates.length === 0) {
    throw new Error('匹配器至少需要一个候选颜色');
  }

  // 预取候选的 Lab，避免每次匹配都走属性访问
  const labs: Lab[] = candidates.map((i) => beads[i]!.lab);

  // 缓存：打包的 RGB → 候选数组下标
  const cache = new Map<number, number>();

  function matchLab(lab: Lab): number {
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < labs.length; k++) {
      const d = ciede2000(lab, labs[k]!);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return candidates[best]!;
  }

  return {
    match(rgb: RGB): number {
      const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const result = matchLab(rgbToLab(rgb));
      cache.set(key, result);
      return result;
    },
    matchLab,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/color/matcher.test.ts`
Expected: PASS，6 个用例

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: CIEDE2000 最近色匹配器，带唯一色缓存与子集限制"
```

---

### Task 5: BeadGrid 模型与统计

**Files:**
- Create: `src/model/grid.ts`
- Create: `src/model/stats.ts`
- Test: `src/model/grid.test.ts`, `src/model/stats.test.ts`

**Interfaces:**
- Consumes: `Palette`, `Bead`, `PaletteId` from `src/palette/types.ts`
- Produces:
  - `interface BeadGrid { width: number; height: number; paletteId: PaletteId; cells: Uint16Array; mask: Uint8Array }`
  - `createGrid(width: number, height: number, paletteId: PaletteId): BeadGrid`
  - `cloneGrid(g: BeadGrid): BeadGrid`
  - `idx(g: BeadGrid, x: number, y: number): number`
  - `getCell(g: BeadGrid, x: number, y: number): number`
  - `setCell(g: BeadGrid, x: number, y: number, beadIndex: number): void`
  - `isFilled(g: BeadGrid, x: number, y: number): boolean`
  - `interface BeadUsage { beadIndex: number; bead: Bead; count: number; ratio: number }`
  - `interface GridStats { totalBeads: number; colorCount: number; emptyCount: number; usages: BeadUsage[] }`
  - `computeStats(grid: BeadGrid, palette: Palette): GridStats`

- [ ] **Step 1: 写失败的测试**

`src/model/grid.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { createGrid, cloneGrid, idx, getCell, setCell, isFilled } from './grid';

describe('BeadGrid', () => {
  it('新建的网格全部为空格', () => {
    const g = createGrid(3, 2, 'mard');
    expect(g.width).toBe(3);
    expect(g.height).toBe(2);
    expect(g.cells.length).toBe(6);
    expect(g.mask.length).toBe(6);
    expect([...g.mask]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('idx 应按行主序', () => {
    const g = createGrid(3, 2, 'mard');
    expect(idx(g, 0, 0)).toBe(0);
    expect(idx(g, 2, 0)).toBe(2);
    expect(idx(g, 0, 1)).toBe(3);
    expect(idx(g, 2, 1)).toBe(5);
  });

  it('setCell 应同时置位 mask', () => {
    const g = createGrid(2, 2, 'mard');
    setCell(g, 1, 1, 42);
    expect(getCell(g, 1, 1)).toBe(42);
    expect(isFilled(g, 1, 1)).toBe(true);
    expect(isFilled(g, 0, 0)).toBe(false);
  });

  it('cells 应能存下 291 色的下标', () => {
    const g = createGrid(1, 1, 'mard');
    setCell(g, 0, 0, 290);
    expect(getCell(g, 0, 0)).toBe(290);
  });

  it('cloneGrid 应深拷贝，改副本不影响原件', () => {
    const g = createGrid(2, 2, 'mard');
    setCell(g, 0, 0, 5);
    const c = cloneGrid(g);
    setCell(c, 0, 0, 9);
    expect(getCell(g, 0, 0)).toBe(5);
    expect(getCell(c, 0, 0)).toBe(9);
  });
});
```

`src/model/stats.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { createGrid, setCell } from './grid';
import { computeStats } from './stats';
import type { Palette } from '../palette/types';
import { rgbToLab, type RGB } from '../color/space';

function fakePalette(): Palette {
  const mk = (code: string, rgb: RGB) => ({
    code, name: code, nameZh: code, hex: '#000000', rgb, lab: rgbToLab(rgb),
  });
  return {
    id: 'mard',
    label: 'test',
    beadSizeMm: 5,
    beads: [mk('A', [255, 0, 0]), mk('B', [0, 255, 0]), mk('C', [0, 0, 255])],
  };
}

describe('computeStats', () => {
  it('应统计各色颗数并按降序排列', () => {
    const g = createGrid(3, 2, 'mard');
    setCell(g, 0, 0, 0);
    setCell(g, 1, 0, 0);
    setCell(g, 2, 0, 0);
    setCell(g, 0, 1, 1);
    setCell(g, 1, 1, 1);
    // (2,1) 留空

    const s = computeStats(g, fakePalette());
    expect(s.totalBeads).toBe(5);
    expect(s.emptyCount).toBe(1);
    expect(s.colorCount).toBe(2);
    expect(s.usages.map((u) => u.bead.code)).toEqual(['A', 'B']);
    expect(s.usages[0]!.count).toBe(3);
    expect(s.usages[1]!.count).toBe(2);
  });

  it('占比之和应为 1', () => {
    const g = createGrid(3, 1, 'mard');
    setCell(g, 0, 0, 0);
    setCell(g, 1, 0, 1);
    setCell(g, 2, 0, 2);
    const s = computeStats(g, fakePalette());
    const sum = s.usages.reduce((a, u) => a + u.ratio, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('空格的 cells 值不应被计入', () => {
    const g = createGrid(2, 1, 'mard');
    // 直接写 cells 但不置 mask —— 模拟管线里残留的脏值
    g.cells[0] = 2;
    setCell(g, 1, 0, 0);
    const s = computeStats(g, fakePalette());
    expect(s.totalBeads).toBe(1);
    expect(s.colorCount).toBe(1);
    expect(s.usages[0]!.bead.code).toBe('A');
  });

  it('全空网格应返回空统计而不崩', () => {
    const s = computeStats(createGrid(2, 2, 'mard'), fakePalette());
    expect(s.totalBeads).toBe(0);
    expect(s.usages).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/model/`
Expected: FAIL — 无法解析 `./grid` 和 `./stats`

- [ ] **Step 3: 实现 grid.ts**

`src/model/grid.ts`：

```ts
import type { PaletteId } from '../palette/types';

/**
 * 图纸的唯一真相。
 *
 * cells 用 Uint16Array 因为最大色卡 291 色，超出 Uint8Array 上限。
 * mask 为 0 的格子表示不放豆（透明或背景），此时 cells 的值无意义 ——
 * 所有消费方必须先查 mask。
 */
export interface BeadGrid {
  width: number;
  height: number;
  paletteId: PaletteId;
  /** 长度 width*height，行主序，值为色卡 beads 数组的下标 */
  cells: Uint16Array;
  /** 长度 width*height，1 = 放豆，0 = 空格 */
  mask: Uint8Array;
}

export function createGrid(width: number, height: number, paletteId: PaletteId): BeadGrid {
  const n = width * height;
  return { width, height, paletteId, cells: new Uint16Array(n), mask: new Uint8Array(n) };
}

export function cloneGrid(g: BeadGrid): BeadGrid {
  return {
    width: g.width,
    height: g.height,
    paletteId: g.paletteId,
    cells: new Uint16Array(g.cells),
    mask: new Uint8Array(g.mask),
  };
}

export function idx(g: BeadGrid, x: number, y: number): number {
  return y * g.width + x;
}

export function inBounds(g: BeadGrid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.width && y < g.height;
}

export function getCell(g: BeadGrid, x: number, y: number): number {
  return g.cells[idx(g, x, y)]!;
}

/** 写入一格并置位 mask */
export function setCell(g: BeadGrid, x: number, y: number, beadIndex: number): void {
  const i = idx(g, x, y);
  g.cells[i] = beadIndex;
  g.mask[i] = 1;
}

/** 把一格置为空（不放豆） */
export function clearCell(g: BeadGrid, x: number, y: number): void {
  g.mask[idx(g, x, y)] = 0;
}

export function isFilled(g: BeadGrid, x: number, y: number): boolean {
  return g.mask[idx(g, x, y)] === 1;
}
```

- [ ] **Step 4: 实现 stats.ts**

`src/model/stats.ts`：

```ts
import type { BeadGrid } from './grid';
import type { Bead, Palette } from '../palette/types';

export interface BeadUsage {
  beadIndex: number;
  bead: Bead;
  count: number;
  /** 占比 0–1，分母是 totalBeads */
  ratio: number;
}

export interface GridStats {
  /** 需要的豆子总颗数（不含空格） */
  totalBeads: number;
  /** 用到的颜色种数 */
  colorCount: number;
  /** 空格数 */
  emptyCount: number;
  /** 按颗数降序；颗数相同时按色号升序，保证输出稳定 */
  usages: BeadUsage[];
}

export function computeStats(grid: BeadGrid, palette: Palette): GridStats {
  const counts = new Map<number, number>();
  let total = 0;
  let empty = 0;

  for (let i = 0; i < grid.cells.length; i++) {
    if (grid.mask[i] !== 1) {
      empty++;
      continue;
    }
    const b = grid.cells[i]!;
    counts.set(b, (counts.get(b) ?? 0) + 1);
    total++;
  }

  const usages: BeadUsage[] = [...counts.entries()]
    .map(([beadIndex, count]) => ({
      beadIndex,
      bead: palette.beads[beadIndex]!,
      count,
      ratio: total === 0 ? 0 : count / total,
    }))
    .sort((a, b) => b.count - a.count || a.bead.code.localeCompare(b.bead.code));

  return { totalBeads: total, colorCount: usages.length, emptyCount: empty, usages };
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/model/`
Expected: PASS，9 个用例

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: BeadGrid 数据结构与用量统计"
```

---

### Task 6: 图片降采样

**Files:**
- Create: `src/pipeline/sample.ts`
- Test: `src/pipeline/sample.test.ts`

**Interfaces:**
- Consumes: `srgbToLinear`, `linearToSrgb` from `src/color/space.ts`
- Produces:
  - `type SampleMode = 'average' | 'median' | 'nearest'`
  - `interface RgbaGrid { width: number; height: number; data: Uint8ClampedArray }`（RGBA，长度 `width*height*4`）
  - `sampleImage(src: RgbaGrid, outW: number, outH: number, mode: SampleMode): RgbaGrid`

**关键：** `average` 模式必须在 **linear RGB** 空间做平均。在 sRGB 空间直接平均会让结果偏暗 —— 黑白棋盘格平均出来应该是中灰（约 188），而不是 sRGB 直接平均的 128。这条正是测试要卡的点。

- [ ] **Step 1: 写失败的测试**

`src/pipeline/sample.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { sampleImage, type RgbaGrid } from './sample';

function makeGrid(w: number, h: number, fill: (x: number, y: number) => [number, number, number, number]): RgbaGrid {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    }
  }
  return { width: w, height: h, data };
}

function px(g: RgbaGrid, x: number, y: number): [number, number, number, number] {
  const i = (y * g.width + x) * 4;
  return [g.data[i]!, g.data[i + 1]!, g.data[i + 2]!, g.data[i + 3]!];
}

describe('sampleImage', () => {
  it('纯色图降采样后仍是纯色', () => {
    const src = makeGrid(40, 40, () => [200, 100, 50, 255]);
    const out = sampleImage(src, 8, 8, 'average');
    expect(out.width).toBe(8);
    expect(out.height).toBe(8);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const [r, g, b] = px(out, x, y);
        expect(Math.abs(r - 200)).toBeLessThanOrEqual(1);
        expect(Math.abs(g - 100)).toBeLessThanOrEqual(1);
        expect(Math.abs(b - 50)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('黑白棋盘格的 average 应在 linear 空间平均（约 188，不是 128）', () => {
    const src = makeGrid(16, 16, (x, y) => {
      const v = (x + y) % 2 === 0 ? 255 : 0;
      return [v, v, v, 255];
    });
    const out = sampleImage(src, 1, 1, 'average');
    const [r] = px(out, 0, 0);
    // linear 平均：linearToSrgb(0.5) * 255 ≈ 188
    expect(r).toBeGreaterThan(180);
    expect(r).toBeLessThan(196);
  });

  it('median 模式应抗单点噪声', () => {
    // 4×4 全为 100，中间塞一个 255 的噪点
    const src = makeGrid(4, 4, (x, y) => (x === 1 && y === 1 ? [255, 255, 255, 255] : [100, 100, 100, 255]));
    const out = sampleImage(src, 1, 1, 'median');
    expect(px(out, 0, 0)[0]).toBe(100);
  });

  it('nearest 模式应取区域中心像素', () => {
    // 左半黑右半白，降到 2×1
    const src = makeGrid(4, 1, (x) => (x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const out = sampleImage(src, 2, 1, 'nearest');
    expect(px(out, 0, 0)[0]).toBe(0);
    expect(px(out, 1, 0)[0]).toBe(255);
  });

  it('alpha 应被保留并参与平均', () => {
    const src = makeGrid(4, 4, (x) => (x < 2 ? [255, 0, 0, 0] : [255, 0, 0, 255]));
    const out = sampleImage(src, 1, 1, 'average');
    expect(px(out, 0, 0)[3]).toBeGreaterThan(100);
    expect(px(out, 0, 0)[3]).toBeLessThan(155);
  });

  it('目标尺寸大于源尺寸时不应崩（每格至少覆盖一个源像素）', () => {
    const src = makeGrid(2, 2, () => [10, 20, 30, 255]);
    const out = sampleImage(src, 5, 5, 'average');
    expect(out.width).toBe(5);
    expect(px(out, 4, 4)[0]).toBe(10);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/pipeline/sample.test.ts`
Expected: FAIL — `Failed to resolve import "./sample"`

- [ ] **Step 3: 实现**

`src/pipeline/sample.ts`：

```ts
import { srgbToLinear, linearToSrgb } from '../color/space';

export type SampleMode = 'average' | 'median' | 'nearest';

/** 一张 RGBA 位图。data 长度为 width*height*4。 */
export interface RgbaGrid {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** 预建 sRGB → linear 查找表，256 项，避免逐像素调 Math.pow */
const LINEAR_LUT = new Float64Array(256);
for (let i = 0; i < 256; i++) LINEAR_LUT[i] = srgbToLinear(i / 255);

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  const mid = values.length >> 1;
  return values.length % 2 === 1 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
}

/**
 * 把图片降采样到 outW × outH 格。
 *
 * average — 区域算术平均，在 linear RGB 空间做（sRGB 空间直接平均会偏暗）
 * median  — 区域各通道中位数，抗噪点，适合手机拍的照片
 * nearest — 取区域中心像素，适合输入本来就是像素画
 */
export function sampleImage(src: RgbaGrid, outW: number, outH: number, mode: SampleMode): RgbaGrid {
  const out = new Uint8ClampedArray(outW * outH * 4);
  const sx = src.width / outW;
  const sy = src.height / outH;

  for (let oy = 0; oy < outH; oy++) {
    // 每格至少覆盖一个源像素，即使放大
    const y0 = Math.min(src.height - 1, Math.floor(oy * sy));
    const y1 = Math.max(y0 + 1, Math.min(src.height, Math.ceil((oy + 1) * sy)));

    for (let ox = 0; ox < outW; ox++) {
      const x0 = Math.min(src.width - 1, Math.floor(ox * sx));
      const x1 = Math.max(x0 + 1, Math.min(src.width, Math.ceil((ox + 1) * sx)));
      const o = (oy * outW + ox) * 4;

      if (mode === 'nearest') {
        const cx = Math.min(src.width - 1, (x0 + x1 - 1) >> 1);
        const cy = Math.min(src.height - 1, (y0 + y1 - 1) >> 1);
        const s = (cy * src.width + cx) * 4;
        out[o] = src.data[s]!;
        out[o + 1] = src.data[s + 1]!;
        out[o + 2] = src.data[s + 2]!;
        out[o + 3] = src.data[s + 3]!;
        continue;
      }

      if (mode === 'median') {
        const rs: number[] = [], gs: number[] = [], bs: number[] = [], as: number[] = [];
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const s = (y * src.width + x) * 4;
            rs.push(src.data[s]!); gs.push(src.data[s + 1]!);
            bs.push(src.data[s + 2]!); as.push(src.data[s + 3]!);
          }
        }
        out[o] = median(rs); out[o + 1] = median(gs);
        out[o + 2] = median(bs); out[o + 3] = median(as);
        continue;
      }

      // average：在 linear 空间累加
      let lr = 0, lg = 0, lb = 0, sa = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const s = (y * src.width + x) * 4;
          lr += LINEAR_LUT[src.data[s]!]!;
          lg += LINEAR_LUT[src.data[s + 1]!]!;
          lb += LINEAR_LUT[src.data[s + 2]!]!;
          sa += src.data[s + 3]!;
          n++;
        }
      }
      out[o] = Math.round(linearToSrgb(lr / n) * 255);
      out[o + 1] = Math.round(linearToSrgb(lg / n) * 255);
      out[o + 2] = Math.round(linearToSrgb(lb / n) * 255);
      out[o + 3] = Math.round(sa / n);
    }
  }

  return { width: outW, height: outH, data: out };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/pipeline/sample.test.ts`
Expected: PASS，6 个用例

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: 图片降采样，支持平均/中位数/最近邻三种模式"
```

---

### Task 7: 图像调整与抠图

**Files:**
- Create: `src/pipeline/adjust.ts`
- Create: `src/pipeline/matte.ts`
- Test: `src/pipeline/adjust.test.ts`, `src/pipeline/matte.test.ts`

**Interfaces:**
- Consumes: `RgbaGrid` from `src/pipeline/sample.ts`
- Produces:
  - `interface AdjustParams { brightness: number; contrast: number; saturation: number; gamma: number }`（brightness/contrast/saturation 中性值为 1，gamma 中性值为 1）
  - `DEFAULT_ADJUST: AdjustParams`
  - `adjust(src: RgbaGrid, p: AdjustParams): RgbaGrid`
  - `buildMask(src: RgbaGrid, alphaThreshold: number, bgTolerance: number): Uint8Array`

- [ ] **Step 1: 写失败的测试**

`src/pipeline/adjust.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { adjust, DEFAULT_ADJUST } from './adjust';
import type { RgbaGrid } from './sample';

function grid(pixels: Array<[number, number, number, number]>): RgbaGrid {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a], i) => {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = a;
  });
  return { width: pixels.length, height: 1, data };
}

describe('adjust', () => {
  it('默认参数应为恒等变换', () => {
    const src = grid([[10, 128, 250, 255], [0, 0, 0, 0]]);
    const out = adjust(src, DEFAULT_ADJUST);
    expect([...out.data]).toEqual([...src.data]);
  });

  it('brightness > 1 应变亮', () => {
    const out = adjust(grid([[100, 100, 100, 255]]), { ...DEFAULT_ADJUST, brightness: 1.5 });
    expect(out.data[0]!).toBeGreaterThan(100);
  });

  it('saturation = 0 应变灰（三通道相等）', () => {
    const out = adjust(grid([[200, 50, 20, 255]]), { ...DEFAULT_ADJUST, saturation: 0 });
    expect(out.data[0]).toBe(out.data[1]);
    expect(out.data[1]).toBe(out.data[2]);
  });

  it('contrast > 1 应把中灰以上推更亮、以下推更暗', () => {
    const out = adjust(grid([[200, 200, 200, 255], [50, 50, 50, 255]]), { ...DEFAULT_ADJUST, contrast: 1.6 });
    expect(out.data[0]!).toBeGreaterThan(200);
    expect(out.data[4]!).toBeLessThan(50);
  });

  it('alpha 通道不应被任何调整改变', () => {
    const out = adjust(grid([[100, 100, 100, 77]]), { brightness: 2, contrast: 2, saturation: 0, gamma: 0.5 });
    expect(out.data[3]).toBe(77);
  });

  it('不应修改输入', () => {
    const src = grid([[100, 100, 100, 255]]);
    adjust(src, { ...DEFAULT_ADJUST, brightness: 2 });
    expect(src.data[0]).toBe(100);
  });
});
```

`src/pipeline/matte.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { buildMask } from './matte';
import type { RgbaGrid } from './sample';

function grid(w: number, h: number, pixels: Array<[number, number, number, number]>): RgbaGrid {
  const data = new Uint8ClampedArray(w * h * 4);
  pixels.forEach(([r, g, b, a], i) => {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = a;
  });
  return { width: w, height: h, data };
}

describe('buildMask', () => {
  it('alpha < 阈值的格子应为空', () => {
    const g = grid(3, 1, [[0, 0, 0, 255], [0, 0, 0, 127], [0, 0, 0, 0]]);
    expect([...buildMask(g, 128, 0)]).toEqual([1, 0, 0]);
  });

  it('bgTolerance = 0 时不做背景剔除', () => {
    // 四角全白，中心黑
    const g = grid(3, 3, [
      [255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255],
      [255, 255, 255, 255], [0, 0, 0, 255], [255, 255, 255, 255],
      [255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255],
    ]);
    expect([...buildMask(g, 128, 0)].every((v) => v === 1)).toBe(true);
  });

  it('bgTolerance > 0 应剔除接近四角中位色的格子', () => {
    const g = grid(3, 3, [
      [255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255],
      [255, 255, 255, 255], [0, 0, 0, 255], [255, 255, 255, 255],
      [255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255],
    ]);
    const m = buildMask(g, 128, 30);
    expect(m[4]).toBe(1); // 中心黑保留
    expect(m[0]).toBe(0); // 角落白剔除
    expect(m.reduce((a, v) => a + v, 0)).toBe(1);
  });

  it('容差应能吃掉接近但不相同的背景色', () => {
    const g = grid(2, 2, [
      [250, 250, 250, 255], [248, 251, 249, 255],
      [252, 249, 250, 255], [10, 10, 10, 255],
    ]);
    const m = buildMask(g, 128, 20);
    expect(m[3]).toBe(1);
    expect(m[0]).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/pipeline/adjust.test.ts src/pipeline/matte.test.ts`
Expected: FAIL — 无法解析 `./adjust` 和 `./matte`

- [ ] **Step 3: 实现 adjust.ts**

`src/pipeline/adjust.ts`：

```ts
import type { RgbaGrid } from './sample';

export interface AdjustParams {
  /** 亮度倍数，1 = 不变 */
  brightness: number;
  /** 对比度，1 = 不变，围绕中灰 128 拉伸 */
  contrast: number;
  /** 饱和度，1 = 不变，0 = 灰度 */
  saturation: number;
  /** 伽马，1 = 不变，< 1 提亮暗部 */
  gamma: number;
}

export const DEFAULT_ADJUST: AdjustParams = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  gamma: 1,
};

/** Rec.709 亮度权重，用于饱和度调整时的灰度基准 */
const LR = 0.2126, LG = 0.7152, LB = 0.0722;

/**
 * 亮度 / 对比度 / 饱和度 / 伽马调整。
 * 不改 alpha 通道，返回新的 RgbaGrid，不修改输入。
 */
export function adjust(src: RgbaGrid, p: AdjustParams): RgbaGrid {
  const out = new Uint8ClampedArray(src.data);

  const isIdentity =
    p.brightness === 1 && p.contrast === 1 && p.saturation === 1 && p.gamma === 1;
  if (isIdentity) return { width: src.width, height: src.height, data: out };

  for (let i = 0; i < out.length; i += 4) {
    let r = out[i]!, g = out[i + 1]!, b = out[i + 2]!;

    // 亮度
    if (p.brightness !== 1) {
      r *= p.brightness; g *= p.brightness; b *= p.brightness;
    }

    // 对比度：围绕中灰 128
    if (p.contrast !== 1) {
      r = (r - 128) * p.contrast + 128;
      g = (g - 128) * p.contrast + 128;
      b = (b - 128) * p.contrast + 128;
    }

    // 饱和度：向亮度灰插值
    if (p.saturation !== 1) {
      const gray = LR * r + LG * g + LB * b;
      r = gray + (r - gray) * p.saturation;
      g = gray + (g - gray) * p.saturation;
      b = gray + (b - gray) * p.saturation;
    }

    // 伽马
    if (p.gamma !== 1) {
      const inv = 1 / p.gamma;
      r = 255 * Math.pow(Math.max(0, Math.min(1, r / 255)), inv);
      g = 255 * Math.pow(Math.max(0, Math.min(1, g / 255)), inv);
      b = 255 * Math.pow(Math.max(0, Math.min(1, b / 255)), inv);
    }

    // Uint8ClampedArray 自动截断到 0–255
    out[i] = r; out[i + 1] = g; out[i + 2] = b;
  }

  return { width: src.width, height: src.height, data: out };
}
```

- [ ] **Step 4: 实现 matte.ts**

`src/pipeline/matte.ts`：

```ts
import type { RgbaGrid } from './sample';

/**
 * 决定每格放不放豆。
 *
 * @param alphaThreshold alpha 低于此值视为空格，默认 128
 * @param bgTolerance    纯色背景剔除容差 0–100，0 = 关闭。
 *                       背景色取四角像素各通道的中位数。
 */
export function buildMask(src: RgbaGrid, alphaThreshold: number, bgTolerance: number): Uint8Array {
  const n = src.width * src.height;
  const mask = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    mask[i] = src.data[i * 4 + 3]! >= alphaThreshold ? 1 : 0;
  }

  if (bgTolerance <= 0) return mask;

  const bg = cornerMedian(src);
  // 容差 0–100 映射到 RGB 欧氏距离 0–255*sqrt(3)
  const maxDist = (bgTolerance / 100) * 441.673;

  for (let i = 0; i < n; i++) {
    if (mask[i] === 0) continue;
    const o = i * 4;
    const dr = src.data[o]! - bg[0];
    const dg = src.data[o + 1]! - bg[1];
    const db = src.data[o + 2]! - bg[2];
    if (Math.sqrt(dr * dr + dg * dg + db * db) <= maxDist) mask[i] = 0;
  }

  return mask;
}

/** 取四角像素各通道的中位数作为背景色 */
function cornerMedian(src: RgbaGrid): [number, number, number] {
  const { width: w, height: h, data } = src;
  const corners = [
    0,
    (w - 1) * 4,
    (h - 1) * w * 4,
    ((h - 1) * w + (w - 1)) * 4,
  ];
  const chan = (k: number): number => {
    const vs = corners.map((o) => data[o + k]!).sort((a, b) => a - b);
    return (vs[1]! + vs[2]!) / 2;
  };
  return [chan(0), chan(1), chan(2)];
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/pipeline/adjust.test.ts src/pipeline/matte.test.ts`
Expected: PASS，10 个用例

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: 亮度/对比度/饱和度/伽马调整与抠图掩码"
```

---

### Task 8: Lab 空间 median-cut 量化

**Files:**
- Create: `src/color/quantize.ts`
- Test: `src/color/quantize.test.ts`

**Interfaces:**
- Consumes: `RGB`, `Lab`, `rgbToLab`, `labToRgb` from `src/color/space.ts`
- Produces:
  - `medianCutLab(colors: readonly RGB[], maxColors: number): RGB[]`

**为什么在匹配之前量化：** 用户设"最多 15 色"时，先 median-cut 出 15 个代表色再各自匹配到调色板，比"先全量匹配再合并相近豆号"效果好一个档次 —— 后者在匹配阶段已经把相近色打散到不同豆号，合并时无法恢复全局最优。

- [ ] **Step 1: 写失败的测试**

`src/color/quantize.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { medianCutLab } from './quantize';
import type { RGB } from './space';

describe('medianCutLab', () => {
  it('输入色数 ≤ maxColors 时应原样返回去重结果', () => {
    const colors: RGB[] = [[255, 0, 0], [0, 255, 0], [255, 0, 0]];
    const out = medianCutLab(colors, 8);
    expect(out).toHaveLength(2);
  });

  it('应产出恰好 maxColors 个代表色', () => {
    const colors: RGB[] = [];
    for (let i = 0; i < 200; i++) {
      colors.push([(i * 37) % 256, (i * 91) % 256, (i * 53) % 256]);
    }
    expect(medianCutLab(colors, 8)).toHaveLength(8);
    expect(medianCutLab(colors, 3)).toHaveLength(3);
  });

  it('三个分离明显的聚簇，取 3 色时每簇应各出一个代表', () => {
    const colors: RGB[] = [];
    const clusters: RGB[] = [[240, 20, 20], [20, 240, 20], [20, 20, 240]];
    for (const [r, g, b] of clusters) {
      for (let k = 0; k < 30; k++) {
        colors.push([r + (k % 5), g + (k % 5), b + (k % 5)]);
      }
    }
    const out = medianCutLab(colors, 3);
    expect(out).toHaveLength(3);
    // 每个原始簇心附近都应有一个代表色
    for (const c of clusters) {
      const near = out.some(
        (o) => Math.abs(o[0] - c[0]) < 40 && Math.abs(o[1] - c[1]) < 40 && Math.abs(o[2] - c[2]) < 40,
      );
      expect(near).toBe(true);
    }
  });

  it('maxColors 为 1 时应返回单个平均色', () => {
    const out = medianCutLab([[0, 0, 0], [255, 255, 255]], 1);
    expect(out).toHaveLength(1);
  });

  it('空输入应返回空数组', () => {
    expect(medianCutLab([], 8)).toEqual([]);
  });

  it('单色输入应返回该色', () => {
    expect(medianCutLab([[7, 8, 9], [7, 8, 9]], 5)).toEqual([[7, 8, 9]]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/color/quantize.test.ts`
Expected: FAIL — `Failed to resolve import "./quantize"`

- [ ] **Step 3: 实现**

`src/color/quantize.ts`：

```ts
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
    let lo = Infinity, hi = -Infinity;
    for (const e of entries) {
      const v = e.lab[k];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const s = hi - lo;
    if (s > spread) { spread = s; axis = k; }
  }
  return { entries, spread, axis };
}

/** 箱内加权平均色 */
function boxAverage(box: Box): RGB {
  let L = 0, a = 0, b = 0, w = 0;
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
 * 与经典 RGB median-cut 的区别：切分轴按 Lab 跨度选，代表色按 Lab 加权平均 ——
 * 因为 Lab 近似感知均匀，切出来的簇在人眼看来更合理。
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
      if (b.spread > best) { best = b.spread; target = i; }
    }
    if (target === -1) break; // 全都切不动了

    const box = boxes[target]!;
    const axis = box.axis;
    const sorted = [...box.entries].sort((p, q) => p.lab[axis] - q.lab[axis]);

    // 按累计权重找中位切点，保证两侧各至少一个元素
    const totalW = sorted.reduce((s, e) => s + e.weight, 0);
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      acc += sorted[i]!.weight;
      if (acc >= totalW / 2) { cut = i + 1; break; }
      cut = i + 2;
    }
    cut = Math.max(1, Math.min(sorted.length - 1, cut));

    boxes.splice(target, 1, makeBox(sorted.slice(0, cut)), makeBox(sorted.slice(cut)));
  }

  return boxes.map(boxAverage);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/color/quantize.test.ts`
Expected: PASS，6 个用例

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: Lab 空间 median-cut 色数量化"
```

---

### Task 9: 抖动与量化落地

**Files:**
- Create: `src/color/dither.ts`
- Test: `src/color/dither.test.ts`

**Interfaces:**
- Consumes: `RgbaGrid` from `src/pipeline/sample.ts`；`Matcher` from `src/color/matcher.ts`；`Bead` from `src/palette/types.ts`；`srgbToLinear`, `linearToSrgb` from `src/color/space.ts`
- Produces:
  - `type DitherMode = 'none' | 'atkinson' | 'floyd-steinberg'`
  - `quantizeToCells(src: RgbaGrid, mask: Uint8Array, matcher: Matcher, beads: readonly Bead[], mode: DitherMode): Uint16Array`

**关键：** 误差在 **linear RGB** 空间累加，不在 Lab 空间。在感知空间累加误差会扭曲扩散权重。同时注意：抖动模式下每个像素的输入色都不同，匹配器的缓存基本失效 —— 这是抖动的隐性成本，实现时不必优化，但要知道。

- [ ] **Step 1: 写失败的测试**

`src/color/dither.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { quantizeToCells } from './dither';
import { createMatcher } from './matcher';
import type { RgbaGrid } from '../pipeline/sample';
import { rgbToLab, type RGB } from './space';
import type { Bead } from '../palette/types';

function bead(code: string, rgb: RGB): Bead {
  return { code, name: code, nameZh: code, hex: '#000000', rgb, lab: rgbToLab(rgb) };
}

/** 只有黑白两色的调色板 —— 抖动效果最容易观察 */
const BW = [bead('K', [0, 0, 0]), bead('W', [255, 255, 255])];

function solid(w: number, h: number, v: number): RgbaGrid {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

describe('quantizeToCells', () => {
  it('none 模式：纯色应全部落到同一豆号', () => {
    const src = solid(8, 8, 250);
    const cells = quantizeToCells(src, new Uint8Array(64).fill(1), createMatcher(BW), BW, 'none');
    expect([...new Set(cells)]).toEqual([1]);
  });

  it('none 模式：50% 灰在黑白调色板下不应出现混合', () => {
    const src = solid(8, 8, 128);
    const cells = quantizeToCells(src, new Uint8Array(64).fill(1), createMatcher(BW), BW, 'none');
    expect(new Set(cells).size).toBe(1);
  });

  it('atkinson：中灰应产生黑白混合', () => {
    const src = solid(16, 16, 128);
    const cells = quantizeToCells(src, new Uint8Array(256).fill(1), createMatcher(BW), BW, 'atkinson');
    expect(new Set(cells).size).toBe(2);
  });

  it('floyd-steinberg：中灰应产生黑白混合，且黑白大致各半', () => {
    const src = solid(32, 32, 128);
    const cells = quantizeToCells(src, new Uint8Array(1024).fill(1), createMatcher(BW), BW, 'floyd-steinberg');
    const white = [...cells].filter((c) => c === 1).length;
    const ratio = white / cells.length;
    expect(ratio).toBeGreaterThan(0.25);
    expect(ratio).toBeLessThan(0.75);
  });

  it('空格不应参与误差扩散，且其 cells 值无所谓但不能越界', () => {
    const src = solid(4, 4, 128);
    const mask = new Uint8Array(16).fill(1);
    mask[5] = 0;
    const cells = quantizeToCells(src, mask, createMatcher(BW), BW, 'atkinson');
    expect(cells.length).toBe(16);
    for (const c of cells) expect(c).toBeLessThan(BW.length);
  });

  it('输出长度应等于像素数', () => {
    const src = solid(5, 3, 100);
    const cells = quantizeToCells(src, new Uint8Array(15).fill(1), createMatcher(BW), BW, 'none');
    expect(cells.length).toBe(15);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/color/dither.test.ts`
Expected: FAIL — `Failed to resolve import "./dither"`

- [ ] **Step 3: 实现**

`src/color/dither.ts`：

```ts
import { srgbToLinear, linearToSrgb, type RGB } from './space';
import type { Matcher } from './matcher';
import type { Bead } from '../palette/types';
import type { RgbaGrid } from '../pipeline/sample';

export type DitherMode = 'none' | 'atkinson' | 'floyd-steinberg';

/** [dx, dy, 权重] —— 权重之和即扩散比例 */
const KERNELS: Record<Exclude<DitherMode, 'none'>, ReadonlyArray<readonly [number, number, number]>> = {
  // Atkinson 只扩散 3/4 误差，平面更干净，孤立噪点更少
  atkinson: [
    [1, 0, 1 / 8], [2, 0, 1 / 8],
    [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8],
    [0, 2, 1 / 8],
  ],
  'floyd-steinberg': [
    [1, 0, 7 / 16],
    [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16],
  ],
};

/**
 * 把采样后的图量化成豆号网格。
 *
 * 误差扩散在 linear RGB 空间累加 —— 在感知空间（Lab）累加会扭曲扩散权重。
 * 空格（mask=0）不参与匹配也不接收误差。
 */
export function quantizeToCells(
  src: RgbaGrid,
  mask: Uint8Array,
  matcher: Matcher,
  beads: readonly Bead[],
  mode: DitherMode,
): Uint16Array {
  const { width: w, height: h, data } = src;
  const cells = new Uint16Array(w * h);

  if (mode === 'none') {
    for (let i = 0; i < w * h; i++) {
      if (mask[i] !== 1) continue;
      const o = i * 4;
      cells[i] = matcher.match([data[o]!, data[o + 1]!, data[o + 2]!]);
    }
    return cells;
  }

  const kernel = KERNELS[mode];

  // linear 空间的工作缓冲，误差累加在这里
  const buf = new Float64Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    buf[i * 3] = srgbToLinear(data[o]! / 255);
    buf[i * 3 + 1] = srgbToLinear(data[o + 1]! / 255);
    buf[i * 3 + 2] = srgbToLinear(data[o + 2]! / 255);
  }

  const to8 = (lin: number) =>
    Math.max(0, Math.min(255, Math.round(linearToSrgb(Math.max(0, Math.min(1, lin))) * 255)));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] !== 1) continue;

      const b = i * 3;
      const rgb: RGB = [to8(buf[b]!), to8(buf[b + 1]!), to8(buf[b + 2]!)];
      const beadIndex = matcher.match(rgb);
      cells[i] = beadIndex;

      // 在 linear 空间算误差
      const chosen = beads[beadIndex]!.rgb;
      const err = [
        buf[b]! - srgbToLinear(chosen[0] / 255),
        buf[b + 1]! - srgbToLinear(chosen[1] / 255),
        buf[b + 2]! - srgbToLinear(chosen[2] / 255),
      ];

      for (const [dx, dy, weight] of kernel) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (mask[ni] !== 1) continue; // 空格不接收误差
        const nb = ni * 3;
        buf[nb] += err[0]! * weight;
        buf[nb + 1] += err[1]! * weight;
        buf[nb + 2] += err[2]! * weight;
      }
    }
  }

  return cells;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/color/dither.test.ts`
Expected: PASS，6 个用例

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: Atkinson/Floyd-Steinberg 抖动与量化落地"
```

---

### Task 10: 去孤点

**Files:**
- Create: `src/pipeline/despeckle.ts`
- Test: `src/pipeline/despeckle.test.ts`

**Interfaces:**
- Consumes: `BeadGrid`, `cloneGrid`, `idx` from `src/model/grid.ts`
- Produces:
  - `type DespeckleLevel = 'off' | 'weak' | 'strong'`
  - `despeckle(grid: BeadGrid, level: DespeckleLevel): BeadGrid`

**为什么需要：** 误差扩散和照片噪点都会产生孤立单豆。在屏幕上是一个像素，在实拼时是一次找豆、一次插针的手工劳动，而且拼出来往往比轻微色带更难看。把它当算法问题解决，而不是丢给用户手动擦。

- [ ] **Step 1: 写失败的测试**

`src/pipeline/despeckle.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { despeckle } from './despeckle';
import { createGrid, setCell, getCell, clearCell } from '../model/grid';

/** 用二维数组建网格，-1 表示空格 */
function build(rows: number[][]) {
  const g = createGrid(rows[0]!.length, rows.length, 'mard');
  rows.forEach((row, y) =>
    row.forEach((v, x) => {
      if (v < 0) clearCell(g, x, y);
      else setCell(g, x, y, v);
    }),
  );
  return g;
}

function dump(g: ReturnType<typeof build>): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < g.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < g.width; x++) row.push(g.mask[y * g.width + x] === 1 ? getCell(g, x, y) : -1);
    out.push(row);
  }
  return out;
}

describe('despeckle', () => {
  it('off 应原样返回', () => {
    const g = build([[0, 0, 0], [0, 5, 0], [0, 0, 0]]);
    expect(dump(despeckle(g, 'off'))).toEqual([[0, 0, 0], [0, 5, 0], [0, 0, 0]]);
  });

  it('weak 应清掉完全孤立的单颗', () => {
    const g = build([[0, 0, 0], [0, 5, 0], [0, 0, 0]]);
    expect(dump(despeckle(g, 'weak'))).toEqual([[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  });

  it('weak 不应误伤成片色块', () => {
    const g = build([
      [0, 0, 0, 0],
      [0, 7, 7, 0],
      [0, 7, 7, 0],
      [0, 0, 0, 0],
    ]);
    expect(dump(despeckle(g, 'weak'))).toEqual([
      [0, 0, 0, 0],
      [0, 7, 7, 0],
      [0, 7, 7, 0],
      [0, 0, 0, 0],
    ]);
  });

  it('weak 保留孤立的对子，strong 清掉', () => {
    const rows = [
      [0, 0, 0, 0],
      [0, 9, 9, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    // 对子里每颗在自己的 3×3 窗口内都能看到同伴，计数为 2
    expect(dump(despeckle(build(rows), 'weak'))).toEqual(rows);
    expect(dump(despeckle(build(rows), 'strong'))).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
  });

  it('空格不应被填充', () => {
    const g = build([[0, 0, 0], [0, -1, 0], [0, 0, 0]]);
    expect(dump(despeckle(g, 'strong'))[1]![1]).toBe(-1);
  });

  it('不应修改输入网格', () => {
    const g = build([[0, 0, 0], [0, 5, 0], [0, 0, 0]]);
    despeckle(g, 'weak');
    expect(getCell(g, 1, 1)).toBe(5);
  });

  it('全部同色时应原样返回', () => {
    const rows = [[3, 3], [3, 3]];
    expect(dump(despeckle(build(rows), 'strong'))).toEqual(rows);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/pipeline/despeckle.test.ts`
Expected: FAIL — `Failed to resolve import "./despeckle"`

- [ ] **Step 3: 实现**

`src/pipeline/despeckle.ts`：

```ts
import { cloneGrid, type BeadGrid } from '../model/grid';

export type DespeckleLevel = 'off' | 'weak' | 'strong';

/**
 * 阈值含义：中心格的颜色在 3×3 窗口内（含自身）出现次数 ≤ 阈值时被替换。
 * weak = 1 只清完全孤立的单颗；strong = 2 连孤立的对子一起清。
 */
const THRESHOLD: Record<DespeckleLevel, number> = { off: 0, weak: 1, strong: 2 };

/**
 * 去除孤立的单颗/对子豆，替换为 3×3 窗口内的众数色。
 * 空格不参与统计也不被填充。读取全部来自输入，写入全部到输出 ——
 * 因此不会出现"刚改过的格子影响后续判断"的级联效应。
 */
export function despeckle(grid: BeadGrid, level: DespeckleLevel): BeadGrid {
  const threshold = THRESHOLD[level];
  if (threshold === 0) return cloneGrid(grid);

  const out = cloneGrid(grid);
  const { width: w, height: h } = grid;
  const counts = new Map<number, number>();

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (grid.mask[i] !== 1) continue;

      counts.clear();
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const ni = ny * w + nx;
          if (grid.mask[ni] !== 1) continue;
          const v = grid.cells[ni]!;
          counts.set(v, (counts.get(v) ?? 0) + 1);
        }
      }

      const self = grid.cells[i]!;
      if ((counts.get(self) ?? 0) > threshold) continue;

      // 找众数；平局时取豆号较小的，保证结果确定
      let mode = self;
      let modeCount = -1;
      for (const [v, c] of counts) {
        if (c > modeCount || (c === modeCount && v < mode)) { mode = v; modeCount = c; }
      }
      out.cells[i] = mode;
    }
  }

  return out;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/pipeline/despeckle.test.ts`
Expected: PASS，7 个用例

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: 去孤点，清除孤立单豆与对子"
```

---

### Task 11: 几何计算与符号分配

**Files:**
- Create: `src/model/geometry.ts`
- Create: `src/palette/symbols.ts`
- Test: `src/model/geometry.test.ts`, `src/palette/symbols.test.ts`

**Interfaces:**
- Consumes: `Palette`, `Bead` from `src/palette/types.ts`
- Produces:
  - `interface GridGeometry { widthCells, heightCells, totalCells, beadSizeMm, widthCm, heightCm, boardsX, boardsY, boardPegs }`
  - `computeGeometry(widthCells: number, heightCells: number, beadSizeMm: 5 | 2.6): GridGeometry`
  - `formatGeometry(geo: GridGeometry, beadCount: number): string`
  - `assignSymbols(beadIndices: readonly number[], palette: Palette): Map<number, string>`

**符号为什么动态分配：** 数据源自带的 symbol 列是机器按 ASCII 码序生成的（MARD 红色 `F4` 分到 `è`，黑色 `H16` 分到 `Ζ`），人眼无法区分。而一张图纸通常只用 10–30 色，只需保证**这几种之间**可辨即可，不必给全色卡 291 个静态符号。

- [ ] **Step 1: 写失败的测试**

`src/model/geometry.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { computeGeometry, formatGeometry } from './geometry';

describe('computeGeometry', () => {
  it('5mm 豆 29×29 应为一块标准底板、约 14.5cm 见方', () => {
    const g = computeGeometry(29, 29, 5);
    expect(g.widthCm).toBeCloseTo(14.5, 2);
    expect(g.heightCm).toBeCloseTo(14.5, 2);
    expect(g.boardsX).toBe(1);
    expect(g.boardsY).toBe(1);
    expect(g.totalCells).toBe(841);
  });

  it('5mm 豆 29×34 应需要 1×2 块底板', () => {
    const g = computeGeometry(29, 34, 5);
    expect(g.boardsX).toBe(1);
    expect(g.boardsY).toBe(2);
  });

  it('5mm 豆 58×58 应需要 2×2 块底板', () => {
    const g = computeGeometry(58, 58, 5);
    expect(g.boardsX).toBe(2);
    expect(g.boardsY).toBe(2);
  });

  it('2.6mm 豆的底板为 57×57 钉', () => {
    expect(computeGeometry(57, 57, 2.6).boardsX).toBe(1);
    expect(computeGeometry(58, 57, 2.6).boardsX).toBe(2);
  });

  it('2.6mm 豆的物理尺寸应按 2.6mm 算', () => {
    expect(computeGeometry(100, 100, 2.6).widthCm).toBeCloseTo(26, 2);
  });
});

describe('formatGeometry', () => {
  it('应输出人类可读的一行摘要', () => {
    const s = formatGeometry(computeGeometry(29, 34, 5), 986);
    expect(s).toContain('29 × 34 格');
    expect(s).toContain('986 颗');
    expect(s).toContain('14.5');
    expect(s).toContain('17.0');
    expect(s).toContain('1×2');
  });
});
```

`src/palette/symbols.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { assignSymbols } from './symbols';
import { getPalette } from './registry';

describe('assignSymbols', () => {
  const mard = getPalette('mard');

  it('每个传入的豆号都应拿到一个符号', () => {
    const indices = [0, 5, 10, 20, 40];
    const m = assignSymbols(indices, mard);
    expect(m.size).toBe(5);
    for (const i of indices) expect(m.get(i)!.length).toBeGreaterThan(0);
  });

  it('同一张图纸内符号不应重复', () => {
    const indices = Array.from({ length: 30 }, (_, i) => i * 3);
    const symbols = [...assignSymbols(indices, mard).values()];
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it('结果应稳定：同样输入两次调用得到同样映射', () => {
    const indices = [3, 1, 7, 2];
    expect([...assignSymbols(indices, mard)]).toEqual([...assignSymbols(indices, mard)]);
  });

  it('输入顺序不影响结果（内部先排序）', () => {
    const a = assignSymbols([7, 1, 3], mard);
    const b = assignSymbols([1, 3, 7], mard);
    expect(a.get(1)).toBe(b.get(1));
    expect(a.get(7)).toBe(b.get(7));
  });

  it('豆号数超过符号库容量时应回退到双字符组合而不重复', () => {
    const indices = Array.from({ length: 200 }, (_, i) => i);
    const symbols = [...assignSymbols(indices, mard).values()];
    expect(symbols).toHaveLength(200);
    expect(new Set(symbols).size).toBe(200);
  });

  it('空输入返回空映射', () => {
    expect(assignSymbols([], mard).size).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/model/geometry.test.ts src/palette/symbols.test.ts`
Expected: FAIL — 无法解析 `./geometry` 和 `./symbols`

- [ ] **Step 3: 实现 geometry.ts**

`src/model/geometry.ts`：

```ts
/** 标准方形底板的钉数：5mm 大豆 29×29，2.6mm 小豆 57×57 */
const BOARD_PEGS: Record<5 | 2.6, number> = { 5: 29, 2.6: 57 };

export interface GridGeometry {
  widthCells: number;
  heightCells: number;
  totalCells: number;
  beadSizeMm: 5 | 2.6;
  /** 拼出来的物理宽度，厘米 */
  widthCm: number;
  heightCm: number;
  /** 横向需要几块底板 */
  boardsX: number;
  boardsY: number;
  /** 一块底板的钉数（单边） */
  boardPegs: number;
}

export function computeGeometry(
  widthCells: number,
  heightCells: number,
  beadSizeMm: 5 | 2.6,
): GridGeometry {
  const pegs = BOARD_PEGS[beadSizeMm];
  return {
    widthCells,
    heightCells,
    totalCells: widthCells * heightCells,
    beadSizeMm,
    widthCm: (widthCells * beadSizeMm) / 10,
    heightCm: (heightCells * beadSizeMm) / 10,
    boardsX: Math.ceil(widthCells / pegs),
    boardsY: Math.ceil(heightCells / pegs),
    boardPegs: pegs,
  };
}

/**
 * 一行人类可读的摘要，例如：
 * "29 × 34 格 · 986 颗 · 5mm 豆 ≈ 14.5 × 17.0 cm · 需 1×2 块底板"
 *
 * 这行的存在理由：颗粒度的真实含义不是"多少格"，
 * 而是"拼出来多大、要买几块板"。
 */
export function formatGeometry(geo: GridGeometry, beadCount: number): string {
  const boards = `${geo.boardsX}×${geo.boardsY}`;
  return (
    `${geo.widthCells} × ${geo.heightCells} 格 · ` +
    `${beadCount.toLocaleString('zh-CN')} 颗 · ` +
    `${geo.beadSizeMm}mm 豆 ≈ ${geo.widthCm.toFixed(1)} × ${geo.heightCm.toFixed(1)} cm · ` +
    `需 ${boards} 块底板`
  );
}
```

- [ ] **Step 4: 实现 symbols.ts**

`src/palette/symbols.ts`：

```ts
import type { Palette } from './types';

/**
 * 高辨识度符号库。挑选原则：字形轮廓差异大，小字号下仍可分辨，
 * 且黑白打印不糊。刻意避开了形近的（如 ○ 与 ◦、■ 与 ▪）。
 */
const SYMBOLS = [
  '■', '○', '▲', '◆', '★', '●', '□', '△', '◇', '☆',
  '▼', '▽', '✚', '✕', '♥', '♦', '♣', '♠', '☀', '☁',
  '◐', '◑', '◒', '◓', '⬢', '⬡', '➤', '➜', '⌘', '⌂',
  '§', '¶', '†', '‡', '№', '℮', 'Ω', 'π', 'µ', 'λ',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K',
  'L', 'M', 'N', 'P', 'R', 'S', 'T', 'U', 'V', 'W',
  'X', 'Y', 'Z', 'a', 'b', 'c', 'd', 'e', 'f', 'g',
] as const;

/**
 * 为一张图纸实际用到的颜色分配符号。
 *
 * 只需保证**这几种之间**可辨，不必给全色卡 291 个静态符号 ——
 * 一张图纸通常只用 10–30 色。
 *
 * 分配顺序按豆号升序（不是传入顺序），保证结果稳定可复现。
 * 超出符号库容量时回退到双字符组合。
 */
export function assignSymbols(
  beadIndices: readonly number[],
  _palette: Palette,
): Map<number, string> {
  const sorted = [...new Set(beadIndices)].sort((a, b) => a - b);
  const map = new Map<number, string>();

  sorted.forEach((beadIndex, i) => {
    if (i < SYMBOLS.length) {
      map.set(beadIndex, SYMBOLS[i]!);
    } else {
      // 回退：用两个符号的组合，仍然保证唯一
      const k = i - SYMBOLS.length;
      const a = SYMBOLS[Math.floor(k / SYMBOLS.length) % SYMBOLS.length]!;
      const b = SYMBOLS[k % SYMBOLS.length]!;
      map.set(beadIndex, a + b);
    }
  });

  return map;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/model/geometry.test.ts src/palette/symbols.test.ts`
Expected: PASS，12 个用例

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: 底板与物理尺寸计算、动态符号分配"
```

---

### Task 12: 管线编排

**Files:**
- Create: `src/pipeline/build.ts`
- Test: `src/pipeline/build.test.ts`

**Interfaces:**
- Consumes: 全部前序模块
- Produces:
  - `interface BuildParams { widthCells, heightCells, paletteId, allowedBeads?, sampleMode, adjust, alphaThreshold, bgTolerance, maxColors, dither, despeckle }`
  - `DEFAULT_BUILD_PARAMS: Omit<BuildParams, 'widthCells' | 'heightCells'>`
  - `buildGrid(src: RgbaGrid, params: BuildParams): BeadGrid`

**管线顺序（不可随意调换）：** 采样 → 调整 → 抠图 → 量化 → 匹配（±抖动）→ 去孤点。量化必须在匹配之前（见 Task 8 说明）；去孤点必须在最后，否则抖动会重新引入噪点。

- [ ] **Step 1: 写失败的测试**

`src/pipeline/build.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { buildGrid, DEFAULT_BUILD_PARAMS } from './build';
import type { RgbaGrid } from './sample';
import { computeStats } from '../model/stats';
import { getPalette } from '../palette/registry';

function solid(w: number, h: number, rgb: [number, number, number], alpha = 255): RgbaGrid {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgb[0]; data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2]; data[i * 4 + 3] = alpha;
  }
  return { width: w, height: h, data };
}

describe('buildGrid', () => {
  it('应产出正确尺寸的网格', () => {
    const g = buildGrid(solid(100, 100, [200, 30, 40]), {
      ...DEFAULT_BUILD_PARAMS, widthCells: 29, heightCells: 29,
    });
    expect(g.width).toBe(29);
    expect(g.height).toBe(29);
    expect(g.cells.length).toBe(841);
    expect(g.paletteId).toBe('mard');
  });

  it('纯红图应全部匹配到同一个偏红的豆号', () => {
    const g = buildGrid(solid(60, 60, [252, 40, 60]), {
      ...DEFAULT_BUILD_PARAMS, widthCells: 10, heightCells: 10,
    });
    expect(new Set(g.cells).size).toBe(1);
    const bead = getPalette('mard').beads[g.cells[0]!]!;
    expect(bead.rgb[0]).toBeGreaterThan(bead.rgb[1]);
    expect(bead.rgb[0]).toBeGreaterThan(bead.rgb[2]);
  });

  it('全透明图应全部是空格', () => {
    const g = buildGrid(solid(40, 40, [200, 30, 40], 0), {
      ...DEFAULT_BUILD_PARAMS, widthCells: 8, heightCells: 8,
    });
    expect([...g.mask].every((v) => v === 0)).toBe(true);
    expect(computeStats(g, getPalette('mard')).totalBeads).toBe(0);
  });

  it('maxColors 应限制用色数', () => {
    // 造一张彩色噪声图
    const w = 80, h = 80;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = (i * 37) % 256;
      data[i * 4 + 1] = (i * 91) % 256;
      data[i * 4 + 2] = (i * 53) % 256;
      data[i * 4 + 3] = 255;
    }
    const g = buildGrid({ width: w, height: h, data }, {
      ...DEFAULT_BUILD_PARAMS, widthCells: 40, heightCells: 40, maxColors: 8,
    });
    expect(computeStats(g, getPalette('mard')).colorCount).toBeLessThanOrEqual(8);
  });

  it('allowedBeads 子集应被遵守', () => {
    const allowed = new Set([0, 1, 2]);
    const g = buildGrid(solid(50, 50, [10, 200, 90]), {
      ...DEFAULT_BUILD_PARAMS, widthCells: 12, heightCells: 12, allowedBeads: allowed,
    });
    for (let i = 0; i < g.cells.length; i++) {
      if (g.mask[i] === 1) expect(allowed.has(g.cells[i]!)).toBe(true);
    }
  });

  it('切换色卡应产出对应色卡的豆号', () => {
    const g = buildGrid(solid(50, 50, [10, 200, 90]), {
      ...DEFAULT_BUILD_PARAMS, widthCells: 10, heightCells: 10, paletteId: 'hama',
    });
    expect(g.paletteId).toBe('hama');
    for (const c of g.cells) expect(c).toBeLessThan(getPalette('hama').beads.length);
  });

  it('同样输入同样参数应产出完全相同的结果（确定性）', () => {
    const src = solid(60, 60, [123, 77, 200]);
    const p = { ...DEFAULT_BUILD_PARAMS, widthCells: 20, heightCells: 20, dither: 'atkinson' as const };
    const a = buildGrid(src, p);
    const b = buildGrid(src, p);
    expect([...a.cells]).toEqual([...b.cells]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/pipeline/build.test.ts`
Expected: FAIL — `Failed to resolve import "./build"`

- [ ] **Step 3: 实现**

`src/pipeline/build.ts`：

```ts
import { sampleImage, type RgbaGrid, type SampleMode } from './sample';
import { adjust, DEFAULT_ADJUST, type AdjustParams } from './adjust';
import { buildMask } from './matte';
import { despeckle, type DespeckleLevel } from './despeckle';
import { createMatcher } from '../color/matcher';
import { quantizeToCells, type DitherMode } from '../color/dither';
import { medianCutLab } from '../color/quantize';
import { getPalette } from '../palette/registry';
import type { PaletteId } from '../palette/types';
import { createGrid, type BeadGrid } from '../model/grid';
import { rgbToLab, type RGB } from '../color/space';

export interface BuildParams {
  widthCells: number;
  heightCells: number;
  paletteId: PaletteId;
  /** 「我有的豆子」子集，undefined 或空集视为全选 */
  allowedBeads?: ReadonlySet<number>;
  sampleMode: SampleMode;
  adjust: AdjustParams;
  /** alpha 低于此值视为空格 */
  alphaThreshold: number;
  /** 纯色背景剔除容差 0–100，0 = 关闭 */
  bgTolerance: number;
  /** 色数上限，0 = 不限制 */
  maxColors: number;
  dither: DitherMode;
  despeckle: DespeckleLevel;
}

export const DEFAULT_BUILD_PARAMS: Omit<BuildParams, 'widthCells' | 'heightCells'> = {
  paletteId: 'mard',
  sampleMode: 'average',
  adjust: DEFAULT_ADJUST,
  alphaThreshold: 128,
  bgTolerance: 0,
  maxColors: 0,
  dither: 'none',
  despeckle: 'weak',
};

/**
 * 跑完整条管线，产出 BeadGrid。
 *
 * 顺序不可随意调换：
 *   采样 → 调整 → 抠图 → 量化 → 匹配(±抖动) → 去孤点
 * 量化必须在匹配之前，去孤点必须在最后（否则抖动会重新引入噪点）。
 */
export function buildGrid(src: RgbaGrid, params: BuildParams): BeadGrid {
  const palette = getPalette(params.paletteId);

  // 1. 采样
  const sampled = sampleImage(src, params.widthCells, params.heightCells, params.sampleMode);

  // 2. 调整
  const adjusted = adjust(sampled, params.adjust);

  // 3. 抠图
  const mask = buildMask(adjusted, params.alphaThreshold, params.bgTolerance);

  // 4. 量化（可选）—— 把非空格像素替换为 median-cut 的代表色
  const working = params.maxColors > 0 ? applyQuantize(adjusted, mask, params.maxColors) : adjusted;

  // 5. 匹配（可选抖动）
  const matcher = createMatcher(palette.beads, params.allowedBeads);
  const cells = quantizeToCells(working, mask, matcher, palette.beads, params.dither);

  const grid = createGrid(params.widthCells, params.heightCells, params.paletteId);
  grid.cells.set(cells);
  grid.mask.set(mask);

  // 6. 去孤点
  return despeckle(grid, params.despeckle);
}

/** 在 Lab 空间取 maxColors 个代表色，把每个非空格像素替换成最近的代表色 */
function applyQuantize(src: RgbaGrid, mask: Uint8Array, maxColors: number): RgbaGrid {
  const colors: RGB[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 1) continue;
    const o = i * 4;
    colors.push([src.data[o]!, src.data[o + 1]!, src.data[o + 2]!]);
  }
  if (colors.length === 0) return src;

  const reps = medianCutLab(colors, maxColors);
  if (reps.length === 0) return src;

  // 复用匹配器逻辑：把代表色包装成伪 Bead
  const pseudo = reps.map((rgb, i) => ({
    code: String(i), name: String(i), nameZh: String(i),
    hex: '#000000', rgb, lab: rgbToLab(rgb),
  }));
  const repMatcher = createMatcher(pseudo);

  const out = new Uint8ClampedArray(src.data);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 1) continue;
    const o = i * 4;
    const rep = reps[repMatcher.match([out[o]!, out[o + 1]!, out[o + 2]!])]!;
    out[o] = rep[0]; out[o + 1] = rep[1]; out[o + 2] = rep[2];
  }
  return { width: src.width, height: src.height, data: out };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/pipeline/build.test.ts`
Expected: PASS，7 个用例

- [ ] **Step 5: 跑全量测试确保没打破前面的**

Run: `npm test`
Expected: PASS，全部用例

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: 管线编排，从图片到 BeadGrid"
```

---

### Task 13: 图纸渲染

**Files:**
- Create: `src/render/decorations.ts`
- Create: `src/render/sheet.ts`
- Test: `src/render/sheet.test.ts`

**Interfaces:**
- Consumes: `BeadGrid` from `src/model/grid.ts`；`Palette` from `src/palette/types.ts`；`luma` from `src/color/space.ts`；`assignSymbols` from `src/palette/symbols.ts`；`computeGeometry` from `src/model/geometry.ts`
- Produces:
  - `type SheetStyle = 'code' | 'symbol' | 'plain' | 'round'`
  - `interface SheetOptions { style, cellSize, showGrid, showCoords, showBoardLines, showMajorLines }`
  - `DEFAULT_SHEET_OPTIONS: SheetOptions`
  - `sheetPixelSize(grid: BeadGrid, opts: SheetOptions): { width: number; height: number; originX: number; originY: number }`
  - `drawSheet(ctx: CanvasRenderingContext2D, grid: BeadGrid, palette: Palette, opts: SheetOptions): void`

**测试策略：** Canvas 在 Node 下不可用，因此单测只覆盖**纯计算**部分（`sheetPixelSize` 和内部的文字取色逻辑），`drawSheet` 用一个手写的 mock ctx 记录调用序列来验证关键行为（空格不画、色号写对）。

- [ ] **Step 1: 写失败的测试**

`src/render/sheet.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { sheetPixelSize, drawSheet, inkColor, DEFAULT_SHEET_OPTIONS } from './sheet';
import { createGrid, setCell, clearCell } from '../model/grid';
import { getPalette } from '../palette/registry';

/** 记录调用的假 ctx，只实现 drawSheet 用到的方法 */
function mockCtx() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const rec = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); };
  const ctx = {
    calls,
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '',
    textAlign: '' as CanvasTextAlign, textBaseline: '' as CanvasTextBaseline,
    fillRect: rec('fillRect'),
    strokeRect: rec('strokeRect'),
    fillText: (text: string, x: number, y: number) => { calls.push({ op: 'fillText', args: [text, x, y] }); },
    beginPath: rec('beginPath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    stroke: rec('stroke'),
    arc: rec('arc'),
    fill: rec('fill'),
    save: rec('save'),
    restore: rec('restore'),
    setLineDash: rec('setLineDash'),
  };
  return ctx as unknown as CanvasRenderingContext2D & { calls: typeof calls };
}

describe('sheetPixelSize', () => {
  it('不显示坐标时尺寸就是格数 × 格宽', () => {
    const g = createGrid(10, 6, 'mard');
    const s = sheetPixelSize(g, { ...DEFAULT_SHEET_OPTIONS, cellSize: 20, showCoords: false });
    expect(s.width).toBe(200);
    expect(s.height).toBe(120);
    expect(s.originX).toBe(0);
    expect(s.originY).toBe(0);
  });

  it('显示坐标时四边应留出边距', () => {
    const g = createGrid(10, 6, 'mard');
    const s = sheetPixelSize(g, { ...DEFAULT_SHEET_OPTIONS, cellSize: 20, showCoords: true });
    expect(s.originX).toBeGreaterThan(0);
    expect(s.width).toBeGreaterThan(200);
  });
});

describe('inkColor', () => {
  it('浅底取黑字，深底取白字', () => {
    expect(inkColor([255, 255, 255])).toBe('#111111');
    expect(inkColor([0, 0, 0])).toBe('#FFFFFF');
    expect(inkColor([252, 40, 60])).toBe('#FFFFFF');
  });
});

describe('drawSheet', () => {
  const palette = getPalette('mard');

  it('code 样式应为每个非空格写出色号', () => {
    const g = createGrid(2, 1, 'mard');
    setCell(g, 0, 0, 0);
    clearCell(g, 1, 0);

    const ctx = mockCtx() as ReturnType<typeof mockCtx>;
    drawSheet(ctx, g, palette, { ...DEFAULT_SHEET_OPTIONS, style: 'code', showCoords: false });

    const texts = ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    expect(texts).toEqual([palette.beads[0]!.code]);
  });

  it('plain 样式不应写任何文字', () => {
    const g = createGrid(2, 2, 'mard');
    setCell(g, 0, 0, 0); setCell(g, 1, 1, 1);

    const ctx = mockCtx() as ReturnType<typeof mockCtx>;
    drawSheet(ctx, g, palette, { ...DEFAULT_SHEET_OPTIONS, style: 'plain', showCoords: false });
    expect(ctx.calls.some((c) => c.op === 'fillText')).toBe(false);
  });

  it('round 样式应用 arc 画圆', () => {
    const g = createGrid(1, 1, 'mard');
    setCell(g, 0, 0, 0);

    const ctx = mockCtx() as ReturnType<typeof mockCtx>;
    drawSheet(ctx, g, palette, { ...DEFAULT_SHEET_OPTIONS, style: 'round', showCoords: false });
    expect(ctx.calls.some((c) => c.op === 'arc')).toBe(true);
  });

  it('symbol 样式写出的应是符号而不是色号', () => {
    const g = createGrid(1, 1, 'mard');
    setCell(g, 0, 0, 0);

    const ctx = mockCtx() as ReturnType<typeof mockCtx>;
    drawSheet(ctx, g, palette, { ...DEFAULT_SHEET_OPTIONS, style: 'symbol', showCoords: false });
    const texts = ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    expect(texts).toHaveLength(1);
    expect(texts[0]).not.toBe(palette.beads[0]!.code);
  });

  it('全空网格不应崩', () => {
    const ctx = mockCtx();
    expect(() => drawSheet(ctx, createGrid(3, 3, 'mard'), palette, DEFAULT_SHEET_OPTIONS)).not.toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/render/sheet.test.ts`
Expected: FAIL — `Failed to resolve import "./sheet"`

- [ ] **Step 3: 实现 decorations.ts**

`src/render/decorations.ts`：

```ts
import type { BeadGrid } from '../model/grid';
import { computeGeometry } from '../model/geometry';

export interface DecorOptions {
  cellSize: number;
  originX: number;
  originY: number;
  showGrid: boolean;
  showCoords: boolean;
  showBoardLines: boolean;
  showMajorLines: boolean;
  beadSizeMm: 5 | 2.6;
}

const GRID_COLOR = 'rgba(0,0,0,0.12)';
const MAJOR_COLOR = 'rgba(0,0,0,0.32)';
const BOARD_COLOR = 'rgba(220,40,60,0.65)';
const COORD_COLOR = '#555555';

/** 画网格线、每 10 格的加粗辅助线、底板分界虚线、四边行列坐标 */
export function drawDecorations(
  ctx: CanvasRenderingContext2D,
  grid: BeadGrid,
  o: DecorOptions,
): void {
  const { cellSize: cs, originX: ox, originY: oy } = o;
  const w = grid.width * cs;
  const h = grid.height * cs;

  ctx.save();

  if (o.showGrid) {
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= grid.width; x++) {
      ctx.moveTo(ox + x * cs, oy);
      ctx.lineTo(ox + x * cs, oy + h);
    }
    for (let y = 0; y <= grid.height; y++) {
      ctx.moveTo(ox, oy + y * cs);
      ctx.lineTo(ox + w, oy + y * cs);
    }
    ctx.stroke();
  }

  if (o.showMajorLines) {
    ctx.strokeStyle = MAJOR_COLOR;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= grid.width; x += 10) {
      ctx.moveTo(ox + x * cs, oy);
      ctx.lineTo(ox + x * cs, oy + h);
    }
    for (let y = 0; y <= grid.height; y += 10) {
      ctx.moveTo(ox, oy + y * cs);
      ctx.lineTo(ox + w, oy + y * cs);
    }
    ctx.stroke();
  }

  if (o.showBoardLines) {
    const pegs = computeGeometry(grid.width, grid.height, o.beadSizeMm).boardPegs;
    ctx.strokeStyle = BOARD_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let x = pegs; x < grid.width; x += pegs) {
      ctx.moveTo(ox + x * cs, oy);
      ctx.lineTo(ox + x * cs, oy + h);
    }
    for (let y = pegs; y < grid.height; y += pegs) {
      ctx.moveTo(ox, oy + y * cs);
      ctx.lineTo(ox + w, oy + y * cs);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (o.showCoords) {
    const fontSize = Math.max(8, Math.min(13, cs * 0.5));
    ctx.fillStyle = COORD_COLOR;
    ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 每 5 格标一个，避免拥挤
    const step = cs < 14 ? 5 : 1;
    for (let x = 0; x < grid.width; x++) {
      if ((x + 1) % step !== 0 && x !== 0) continue;
      const cx = ox + x * cs + cs / 2;
      ctx.fillText(String(x + 1), cx, oy - fontSize);
      ctx.fillText(String(x + 1), cx, oy + h + fontSize);
    }
    ctx.textAlign = 'right';
    for (let y = 0; y < grid.height; y++) {
      if ((y + 1) % step !== 0 && y !== 0) continue;
      const cy = oy + y * cs + cs / 2;
      ctx.fillText(String(y + 1), ox - 4, cy);
      ctx.textAlign = 'left';
      ctx.fillText(String(y + 1), ox + w + 4, cy);
      ctx.textAlign = 'right';
    }
  }

  ctx.restore();
}
```

- [ ] **Step 4: 实现 sheet.ts**

`src/render/sheet.ts`：

```ts
import type { BeadGrid } from '../model/grid';
import type { Palette } from '../palette/types';
import { luma, type RGB } from '../color/space';
import { assignSymbols } from '../palette/symbols';
import { drawDecorations } from './decorations';

export type SheetStyle = 'code' | 'symbol' | 'plain' | 'round';

export interface SheetOptions {
  style: SheetStyle;
  /** 每格边长，像素 */
  cellSize: number;
  showGrid: boolean;
  showCoords: boolean;
  showBoardLines: boolean;
  showMajorLines: boolean;
  beadSizeMm: 5 | 2.6;
  /** 空格的背景色。导出透明 PNG 时传 null */
  emptyColor: string | null;
}

export const DEFAULT_SHEET_OPTIONS: SheetOptions = {
  style: 'code',
  cellSize: 24,
  showGrid: true,
  showCoords: true,
  showBoardLines: false,
  showMajorLines: true,
  beadSizeMm: 5,
  emptyColor: '#F6F6FA',
};

/** 浅底取黑字、深底取白字。阈值 0.55 是实测下来对拼豆色卡最舒服的分界。 */
export function inkColor(rgb: RGB): string {
  return luma(rgb) > 0.55 ? '#111111' : '#FFFFFF';
}

export function sheetPixelSize(
  grid: BeadGrid,
  opts: SheetOptions,
): { width: number; height: number; originX: number; originY: number } {
  const margin = opts.showCoords ? Math.max(20, opts.cellSize * 1.2) : 0;
  return {
    width: grid.width * opts.cellSize + margin * 2,
    height: grid.height * opts.cellSize + margin * 2,
    originX: margin,
    originY: margin,
  };
}

export function drawSheet(
  ctx: CanvasRenderingContext2D,
  grid: BeadGrid,
  palette: Palette,
  opts: SheetOptions,
): void {
  const { originX: ox, originY: oy } = sheetPixelSize(grid, opts);
  const cs = opts.cellSize;

  // symbol 样式需要先知道用到了哪些颜色
  const symbols =
    opts.style === 'symbol'
      ? assignSymbols(
          [...new Set([...grid.cells].filter((_, i) => grid.mask[i] === 1))],
          palette,
        )
      : null;

  const fontSize =
    opts.style === 'symbol' ? Math.max(7, cs * 0.55) : Math.max(6, cs * 0.38);
  ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const i = y * grid.width + x;
      const px = ox + x * cs;
      const py = oy + y * cs;

      if (grid.mask[i] !== 1) {
        if (opts.emptyColor !== null) {
          ctx.fillStyle = opts.emptyColor;
          ctx.fillRect(px, py, cs, cs);
        }
        continue;
      }

      const bead = palette.beads[grid.cells[i]!]!;

      if (opts.style === 'round') {
        // 底色留白，画一颗带孔的圆珠
        if (opts.emptyColor !== null) {
          ctx.fillStyle = opts.emptyColor;
          ctx.fillRect(px, py, cs, cs);
        }
        const cx = px + cs / 2;
        const cy = py + cs / 2;
        ctx.fillStyle = bead.hex;
        ctx.beginPath();
        ctx.arc(cx, cy, cs * 0.46, 0, Math.PI * 2);
        ctx.fill();
        // 中间的孔
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.beginPath();
        ctx.arc(cx, cy, cs * 0.16, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      ctx.fillStyle = bead.hex;
      ctx.fillRect(px, py, cs, cs);

      if (opts.style === 'plain') continue;

      const label = opts.style === 'symbol' ? symbols!.get(grid.cells[i]!)! : bead.code;
      ctx.fillStyle = inkColor(bead.rgb);
      ctx.fillText(label, px + cs / 2, py + cs / 2 + fontSize * 0.05);
    }
  }

  drawDecorations(ctx, grid, {
    cellSize: cs,
    originX: ox,
    originY: oy,
    showGrid: opts.showGrid,
    showCoords: opts.showCoords,
    showBoardLines: opts.showBoardLines,
    showMajorLines: opts.showMajorLines,
    beadSizeMm: opts.beadSizeMm,
  });
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/render/sheet.test.ts`
Expected: PASS，8 个用例

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: 四种图纸样式渲染与网格/坐标/分板线装饰"
```

---

### Task 14: 应用状态与 UI 骨架

**Files:**
- Create: `src/ui/state.ts`
- Create: `src/ui/styles.css`
- Modify: `index.html`
- Modify: `src/main.ts`
- Test: `src/ui/state.test.ts`

**Interfaces:**
- Consumes: `BuildParams`, `DEFAULT_BUILD_PARAMS` from `src/pipeline/build.ts`；`SheetOptions`, `DEFAULT_SHEET_OPTIONS` from `src/render/sheet.ts`
- Produces:
  - `interface AppState { image, imageName, imageDataUrl, build, sheet, grid, allowed, patch }`
  - `createStore(): Store`
  - `interface Store { get(): AppState; set(patch: Partial<AppState>): void; subscribe(fn: (s: AppState) => void): () => void }`

- [ ] **Step 1: 写失败的测试**

`src/ui/state.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest';
import { createStore } from './state';

describe('createStore', () => {
  it('初始状态应带默认参数', () => {
    const s = createStore().get();
    expect(s.build.widthCells).toBe(29);
    expect(s.build.paletteId).toBe('mard');
    expect(s.sheet.style).toBe('code');
    expect(s.image).toBeNull();
  });

  it('set 应合并而不是替换', () => {
    const store = createStore();
    store.set({ imageName: 'a.png' });
    expect(store.get().imageName).toBe('a.png');
    expect(store.get().build.widthCells).toBe(29);
  });

  it('subscribe 应在 set 后被调用', () => {
    const store = createStore();
    const fn = vi.fn();
    store.subscribe(fn);
    store.set({ imageName: 'x' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]![0].imageName).toBe('x');
  });

  it('unsubscribe 后不应再被调用', () => {
    const store = createStore();
    const fn = vi.fn();
    const off = store.subscribe(fn);
    off();
    store.set({ imageName: 'y' });
    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/ui/state.test.ts`
Expected: FAIL — `Failed to resolve import "./state"`

- [ ] **Step 3: 实现 state.ts**

`src/ui/state.ts`：

```ts
import { DEFAULT_BUILD_PARAMS, type BuildParams } from '../pipeline/build';
import { DEFAULT_SHEET_OPTIONS, type SheetOptions } from '../render/sheet';
import type { RgbaGrid } from '../pipeline/sample';
import type { BeadGrid } from '../model/grid';

export interface AppState {
  /** 解码后的原图。null = 还没上传 */
  image: RgbaGrid | null;
  imageName: string;
  /** 用于 localStorage 存档的原图 dataURL（降质后） */
  imageDataUrl: string | null;
  build: BuildParams;
  sheet: SheetOptions;
  /** 管线跑出来并叠加 patch 后的结果。null = 还没算 */
  grid: BeadGrid | null;
  /** 「我有的豆子」子集，按色卡分别记 */
  allowed: Record<string, number[]>;
  /**
   * 手动编辑层的只读镜像：格子下标 → 豆号。
   * 真正的历史管理在 Task 18 的 PatchHistory 里，这里只是给 UI 读的快照。
   */
  patch: Map<number, number>;
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
  };
}

export function createStore(): Store {
  let state = initialState();
  const listeners = new Set<(s: AppState) => void>();

  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      for (const fn of listeners) fn(state);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}
```

- [ ] **Step 4: 写样式与页面骨架**

`src/ui/styles.css`：

```css
:root {
  --bg: #f7f7fb;
  --panel: #ffffff;
  --border: #e2e2ec;
  --text: #1a1a22;
  --muted: #6b6b7b;
  --accent: #d94a5c;
  color-scheme: light;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font: 14px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  background: var(--bg);
  color: var(--text);
}

#app {
  display: grid;
  grid-template-columns: 300px 1fr 300px;
  height: 100vh;
}

.panel {
  background: var(--panel);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 16px;
}

.panel:last-child { border-right: none; border-left: 1px solid var(--border); }

.stage {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  background:
    repeating-conic-gradient(#eeeef4 0% 25%, #f7f7fb 0% 50%) 50% / 16px 16px;
}

.stage canvas { cursor: crosshair; }

h1 { font-size: 16px; margin: 0 0 14px; }
h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 20px 0 8px; }

label { display: block; margin: 10px 0 4px; font-size: 13px; }
input[type="range"] { width: 100%; }
select, input[type="number"] { width: 100%; padding: 5px 7px; border: 1px solid var(--border); border-radius: 6px; background: #fff; font: inherit; }

.readout {
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--muted);
  background: #f2f2f8;
  border-radius: 6px;
  padding: 7px 9px;
  margin-top: 6px;
}

.presets { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.presets button, .btn {
  padding: 5px 10px; border: 1px solid var(--border); border-radius: 6px;
  background: #fff; font: inherit; font-size: 12px; cursor: pointer;
}
.presets button:hover, .btn:hover { border-color: var(--accent); color: var(--accent); }
.btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn.primary:hover { opacity: .88; color: #fff; }
.btn:disabled { opacity: .45; cursor: not-allowed; }

.row { display: flex; gap: 6px; margin-top: 8px; }
.row .btn { flex: 1; }

.swatch-grid { display: grid; grid-template-columns: repeat(auto-fill, 22px); gap: 3px; margin-top: 8px; }
.swatch {
  width: 22px; height: 22px; border-radius: 4px; border: 1px solid rgba(0,0,0,.18);
  cursor: pointer; position: relative;
}
.swatch.off { opacity: .22; }
.swatch.off::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(45deg, transparent 45%, #999 45%, #999 55%, transparent 55%);
}

table.stats { width: 100%; border-collapse: collapse; font-size: 12px; }
table.stats th { text-align: left; color: var(--muted); font-weight: 500; padding: 4px 3px; border-bottom: 1px solid var(--border); }
table.stats td { padding: 3px; border-bottom: 1px solid #f2f2f6; }
table.stats td.num { text-align: right; font-variant-numeric: tabular-nums; }
.dot { display: inline-block; width: 13px; height: 13px; border-radius: 3px; border: 1px solid rgba(0,0,0,.18); vertical-align: -2px; }

.empty-hint { color: var(--muted); text-align: center; padding: 40px 20px; }

@media (max-width: 1100px) {
  #app { grid-template-columns: 1fr; height: auto; }
  .panel { border: none; border-bottom: 1px solid var(--border); }
  .stage { min-height: 60vh; }
}
```

`index.html` 的 `<body>` 替换为：

```html
  <body>
    <div id="app">
      <aside class="panel" id="controls"></aside>
      <main class="stage" id="stage">
        <div class="empty-hint" id="hint">上传一张图片开始</div>
      </main>
      <aside class="panel" id="stats"></aside>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
```

`src/main.ts`：

```ts
import './ui/styles.css';
import { createStore } from './ui/state';

const store = createStore();

// 后续任务会往这里挂载各个面板
export { store };
```

- [ ] **Step 5: 运行测试并启动开发服务器确认页面能开**

Run: `npx vitest run src/ui/state.test.ts`
Expected: PASS，4 个用例

Run: `npm run dev`
手工确认：浏览器打开 `http://localhost:5173`，看到三栏布局，中间显示"上传一张图片开始"，控制台无报错。确认后 `Ctrl+C` 停掉。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: 应用状态容器与三栏 UI 骨架"
```

---

### Task 15: 控制面板与实时预览

**Files:**
- Create: `src/ui/controls.ts`
- Create: `src/render/preview.ts`
- Create: `src/ui/imageLoad.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Store` from `src/ui/state.ts`；`buildGrid` from `src/pipeline/build.ts`；`drawSheet`, `sheetPixelSize` from `src/render/sheet.ts`；`computeGeometry`, `formatGeometry` from `src/model/geometry.ts`；`listPalettes` from `src/palette/registry.ts`
- Produces:
  - `loadImageFile(file: File): Promise<{ grid: RgbaGrid; dataUrl: string }>`
  - `createPreview(canvas: HTMLCanvasElement): Preview`，`interface Preview { render(grid, palette, opts): void; fit(): void; cellAt(clientX, clientY): {x,y} | null }`
  - `mountControls(root: HTMLElement, store: Store, onRebuild: () => void): void`

**无单测：** 按 spec §14，UI 层不写单测。本任务用手工验收步骤代替。

- [ ] **Step 1: 实现图片加载**

`src/ui/imageLoad.ts`：

```ts
import type { RgbaGrid } from '../pipeline/sample';

/** 存档用的降质上限：最长边 1200px，避免 localStorage 超限 */
const ARCHIVE_MAX_EDGE = 1200;
/** 管线处理上限：再大也没意义，降采样目标最多 200 格 */
const PROCESS_MAX_EDGE = 2000;

export async function loadImageFile(file: File): Promise<{ grid: RgbaGrid; dataUrl: string }> {
  const bitmap = await createImageBitmap(file);
  try {
    return {
      grid: toRgbaGrid(bitmap, PROCESS_MAX_EDGE),
      dataUrl: toDataUrl(bitmap, ARCHIVE_MAX_EDGE),
    };
  } finally {
    bitmap.close();
  }
}

/** 从 dataURL 恢复（localStorage 存档回读用） */
export async function loadImageDataUrl(dataUrl: string): Promise<RgbaGrid> {
  const res = await fetch(dataUrl);
  const bitmap = await createImageBitmap(await res.blob());
  try {
    return toRgbaGrid(bitmap, PROCESS_MAX_EDGE);
  } finally {
    bitmap.close();
  }
}

function scaledSize(bitmap: ImageBitmap, maxEdge: number): [number, number] {
  const longest = Math.max(bitmap.width, bitmap.height);
  const k = longest > maxEdge ? maxEdge / longest : 1;
  return [Math.max(1, Math.round(bitmap.width * k)), Math.max(1, Math.round(bitmap.height * k))];
}

function toRgbaGrid(bitmap: ImageBitmap, maxEdge: number): RgbaGrid {
  const [w, h] = scaledSize(bitmap, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: img.data };
}

function toDataUrl(bitmap: ImageBitmap, maxEdge: number): string {
  const [w, h] = scaledSize(bitmap, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}
```

- [ ] **Step 2: 实现预览渲染器**

`src/render/preview.ts`：

```ts
import type { BeadGrid } from '../model/grid';
import type { Palette } from '../palette/types';
import { drawSheet, sheetPixelSize, type SheetOptions } from './sheet';

export interface Preview {
  render(grid: BeadGrid, palette: Palette, opts: SheetOptions): void;
  /** 屏幕坐标 → 格子坐标，落在图外返回 null */
  cellAt(clientX: number, clientY: number): { x: number; y: number } | null;
}

/**
 * 屏幕预览。格宽由可用空间自动决定 —— 用户拖颗粒度滑块时
 * 画布尺寸保持稳定，不会一会儿撑满一会儿缩成一团。
 */
export function createPreview(canvas: HTMLCanvasElement, stage: HTMLElement): Preview {
  let lastGrid: BeadGrid | null = null;
  let lastCellSize = 1;
  let lastOrigin = { x: 0, y: 0 };

  return {
    render(grid, palette, opts) {
      const pad = 24;
      const availW = stage.clientWidth - pad * 2;
      const availH = stage.clientHeight - pad * 2;
      const marginRatio = opts.showCoords ? 2.4 : 0;
      const cellSize = Math.max(
        2,
        Math.floor(Math.min(availW / (grid.width + marginRatio), availH / (grid.height + marginRatio))),
      );

      const effective: SheetOptions = { ...opts, cellSize };
      const size = sheetPixelSize(grid, effective);
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
      canvas.style.width = `${size.width}px`;
      canvas.style.height = `${size.height}px`;

      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.width, size.height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size.width, size.height);
      drawSheet(ctx, grid, palette, effective);

      lastGrid = grid;
      lastCellSize = cellSize;
      lastOrigin = { x: size.originX, y: size.originY };
    },

    cellAt(clientX, clientY) {
      if (!lastGrid) return null;
      const r = canvas.getBoundingClientRect();
      const x = Math.floor((clientX - r.left - lastOrigin.x) / lastCellSize);
      const y = Math.floor((clientY - r.top - lastOrigin.y) / lastCellSize);
      if (x < 0 || y < 0 || x >= lastGrid.width || y >= lastGrid.height) return null;
      return { x, y };
    },
  };
}
```

- [ ] **Step 3: 实现控制面板**

`src/ui/controls.ts`：

```ts
import type { Store } from './state';
import { listPalettes } from '../palette/registry';
import type { PaletteId } from '../palette/types';
import { computeGeometry, formatGeometry } from '../model/geometry';
import { loadImageFile } from './imageLoad';
import type { BuildParams } from '../pipeline/build';
import type { SampleMode } from '../pipeline/sample';
import type { DitherMode } from '../color/dither';
import type { DespeckleLevel } from '../pipeline/despeckle';
import type { SheetStyle } from '../render/sheet';

const PRESETS: Array<[string, number, number]> = [
  ['钥匙扣 20×20', 20, 20],
  ['单板 29×29', 29, 29],
  ['四板 58×58', 58, 58],
  ['大图 100×100', 100, 100],
];

/**
 * @param onRebuild        参数变更后需要重跑管线时调用
 * @param onGranularity    改变颗粒度时调用（会作废手改 patch，需先确认）
 */
export function mountControls(
  root: HTMLElement,
  store: Store,
  onRebuild: () => void,
  onGranularity: (w: number, h: number) => void,
): void {
  root.innerHTML = `
    <h1>🍄 拼豆图纸生成器</h1>

    <input type="file" id="file" accept="image/*" style="display:none">
    <button class="btn primary" id="upload" style="width:100%">选择图片…</button>
    <div class="readout" id="fileName">还没有选择图片</div>

    <h2>颗粒度</h2>
    <label>宽度 <span id="wLabel">29</span> 格</label>
    <input type="range" id="width" min="10" max="200" value="29">
    <label style="display:flex;align-items:center;gap:6px;margin-top:8px">
      <input type="checkbox" id="square"> 锁定正方形
    </label>
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
    <label>亮度 <span id="brightLabel">1.00</span></label>
    <input type="range" id="brightness" min="0.4" max="1.8" step="0.02" value="1">
    <label>对比度 <span id="contrastLabel">1.00</span></label>
    <input type="range" id="contrast" min="0.4" max="2" step="0.02" value="1">
    <label>饱和度 <span id="satLabel">1.00</span></label>
    <input type="range" id="saturation" min="0" max="2" step="0.02" value="1">
    <label>去背景容差 <span id="bgLabel">0</span></label>
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
    <label style="display:flex;align-items:center;gap:6px;margin-top:8px">
      <input type="checkbox" id="showGrid" checked> 网格线
    </label>
    <label style="display:flex;align-items:center;gap:6px">
      <input type="checkbox" id="showCoords" checked> 行列坐标
    </label>
    <label style="display:flex;align-items:center;gap:6px">
      <input type="checkbox" id="showBoardLines"> 底板分界虚线
    </label>
  `;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector(`#${id}`) as T;

  // ---- 上传 ----
  const fileInput = $<HTMLInputElement>('file');
  $('upload').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const { grid, dataUrl } = await loadImageFile(file);
    $('fileName').textContent = `${file.name} · ${grid.width}×${grid.height}`;
    // 按原图比例算高度
    const w = store.get().build.widthCells;
    const h = Math.max(1, Math.round((w * grid.height) / grid.width));
    store.set({ image: grid, imageName: file.name, imageDataUrl: dataUrl });
    onGranularity(w, h);
  });

  // ---- 颗粒度 ----
  const widthInput = $<HTMLInputElement>('width');
  const squareInput = $<HTMLInputElement>('square');

  const applyWidth = () => {
    const w = Number(widthInput.value);
    $('wLabel').textContent = String(w);
    const img = store.get().image;
    const h = squareInput.checked || !img ? w : Math.max(1, Math.round((w * img.height) / img.width));
    onGranularity(w, h);
  };
  widthInput.addEventListener('change', applyWidth);
  widthInput.addEventListener('input', () => { $('wLabel').textContent = widthInput.value; });
  squareInput.addEventListener('change', applyWidth);

  const presetBox = $('presets');
  for (const [label, w, h] of PRESETS) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => {
      widthInput.value = String(w);
      $('wLabel').textContent = String(w);
      squareInput.checked = w === h;
      onGranularity(w, h);
    });
    presetBox.appendChild(b);
  }

  // ---- 色卡 ----
  const beadSizeSel = $<HTMLSelectElement>('beadSize');
  const paletteSel = $<HTMLSelectElement>('palette');

  const refreshPalettes = () => {
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
  };
  beadSizeSel.addEventListener('change', () => { refreshPalettes(); onRebuild(); });
  paletteSel.addEventListener('change', () => {
    const s = store.get();
    store.set({ build: { ...s.build, paletteId: paletteSel.value as PaletteId } });
    onRebuild();
  });
  refreshPalettes();

  // ---- 参数绑定辅助 ----
  const bindBuild = (id: string, read: (el: HTMLInputElement | HTMLSelectElement) => Partial<BuildParams>) => {
    const el = $<HTMLInputElement>(id);
    const handler = () => {
      const s = store.get();
      store.set({ build: { ...s.build, ...read(el) } });
      onRebuild();
    };
    el.addEventListener('change', handler);
  };

  const bindSlider = (id: string, labelId: string, key: 'brightness' | 'contrast' | 'saturation') => {
    const el = $<HTMLInputElement>(id);
    el.addEventListener('input', () => { $(labelId).textContent = Number(el.value).toFixed(2); });
    el.addEventListener('change', () => {
      const s = store.get();
      store.set({ build: { ...s.build, adjust: { ...s.build.adjust, [key]: Number(el.value) } } });
      onRebuild();
    });
  };
  bindSlider('brightness', 'brightLabel', 'brightness');
  bindSlider('contrast', 'contrastLabel', 'contrast');
  bindSlider('saturation', 'satLabel', 'saturation');

  const bgEl = $<HTMLInputElement>('bgTolerance');
  bgEl.addEventListener('input', () => { $('bgLabel').textContent = bgEl.value; });
  bindBuild('bgTolerance', (el) => ({ bgTolerance: Number((el as HTMLInputElement).value) }));

  bindBuild('sampleMode', (el) => ({ sampleMode: (el as HTMLSelectElement).value as SampleMode }));
  bindBuild('maxColors', (el) => ({ maxColors: Number((el as HTMLSelectElement).value) }));
  bindBuild('dither', (el) => ({ dither: (el as HTMLSelectElement).value as DitherMode }));
  bindBuild('despeckle', (el) => ({ despeckle: (el as HTMLSelectElement).value as DespeckleLevel }));

  // ---- 图纸样式（不重跑管线，只重绘）----
  const bindSheet = (id: string, read: (el: HTMLInputElement | HTMLSelectElement) => object) => {
    const el = $<HTMLInputElement>(id);
    el.addEventListener('change', () => {
      const s = store.get();
      store.set({ sheet: { ...s.sheet, ...read(el) } });
    });
  };
  bindSheet('style', (el) => ({ style: (el as HTMLSelectElement).value as SheetStyle }));
  bindSheet('showGrid', (el) => ({ showGrid: (el as HTMLInputElement).checked }));
  bindSheet('showCoords', (el) => ({ showCoords: (el as HTMLInputElement).checked }));
  bindSheet('showBoardLines', (el) => ({ showBoardLines: (el as HTMLInputElement).checked }));

  // ---- 几何回显 ----
  store.subscribe((s) => {
    const geo = computeGeometry(s.build.widthCells, s.build.heightCells, s.sheet.beadSizeMm);
    const beads = s.grid ? [...s.grid.mask].reduce((a: number, v) => a + v, 0) : geo.totalCells;
    $('geo').textContent = formatGeometry(geo, beads);
    widthInput.value = String(s.build.widthCells);
    $('wLabel').textContent = String(s.build.widthCells);
  });
}
```

- [ ] **Step 4: 接线 main.ts**

`src/main.ts`：

```ts
import './ui/styles.css';
import { createStore } from './ui/state';
import { mountControls } from './ui/controls';
import { createPreview } from './render/preview';
import { buildGrid } from './pipeline/build';
import { getPalette } from './palette/registry';

const store = createStore();
const stage = document.getElementById('stage') as HTMLElement;
const hint = document.getElementById('hint') as HTMLElement;

const canvas = document.createElement('canvas');
canvas.style.display = 'none';
stage.appendChild(canvas);
const preview = createPreview(canvas, stage);

/** 重跑整条管线 */
function rebuild(): void {
  const s = store.get();
  if (!s.image) return;
  const allowed = new Set(s.allowed[s.build.paletteId] ?? []);
  const grid = buildGrid(s.image, { ...s.build, allowedBeads: allowed });
  // 叠加手改 patch
  for (const [i, bead] of s.patch) {
    if (i < grid.cells.length && grid.mask[i] === 1) grid.cells[i] = bead;
  }
  store.set({ grid });
}

/** 改颗粒度：会让 patch 失效，先确认 */
function setGranularity(w: number, h: number): void {
  const s = store.get();
  const changed = w !== s.build.widthCells || h !== s.build.heightCells;
  if (changed && s.patch.size > 0) {
    const ok = confirm(`改变颗粒度会丢弃 ${s.patch.size} 处手动修改，继续吗？`);
    if (!ok) {
      store.set({ build: { ...s.build } }); // 触发一次订阅，把滑块弹回原值
      return;
    }
    store.set({ patch: new Map() });
  }
  store.set({ build: { ...store.get().build, widthCells: w, heightCells: h } });
  rebuild();
}

// 参数变更 → debounce 重跑
let timer: number | undefined;
function scheduleRebuild(): void {
  clearTimeout(timer);
  timer = window.setTimeout(rebuild, 120);
}

mountControls(document.getElementById('controls') as HTMLElement, store, scheduleRebuild, setGranularity);

// 网格变化 → 重绘
store.subscribe((s) => {
  if (!s.grid) return;
  hint.style.display = 'none';
  canvas.style.display = 'block';
  preview.render(s.grid, getPalette(s.grid.paletteId), s.sheet);
});

window.addEventListener('resize', () => {
  const s = store.get();
  if (s.grid) preview.render(s.grid, getPalette(s.grid.paletteId), s.sheet);
});

export { store, preview, rebuild };
```

- [ ] **Step 5: 手工验收**

Run: `npm run dev`

逐条确认：
1. 上传一张照片 → 中间出现 29×29 的图纸，每格写着 MARD 色号
2. 拖动宽度滑块到 60 → 图纸变细，回显那行变成 `60 × ?? 格 · … · 需 3×? 块底板`
3. 点"钥匙扣 20×20" → 变成 20×20 正方形
4. 切换图纸样式为"圆豆拟真" → 变成圆珠
5. 切"豆子尺寸"到 2.6mm → 色卡下拉只剩 Artkal C，回显的厘米数变小
6. 拖饱和度到 0 → 图纸变灰
7. 选"色数上限 8 色" → 明显只剩 8 种颜色
8. 控制台无报错

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: 控制面板、图片加载与实时预览"
```

---

### Task 16: 我有的豆子（色卡子集）

**Files:**
- Create: `src/palette/subset.ts`
- Create: `src/ui/palettePanel.ts`
- Modify: `src/main.ts`
- Test: `src/palette/subset.test.ts`

**Interfaces:**
- Consumes: `PaletteId` from `src/palette/types.ts`
- Produces:
  - `loadSubset(paletteId: PaletteId): number[]`
  - `saveSubset(paletteId: PaletteId, indices: readonly number[]): void`
  - `mountPalettePanel(root: HTMLElement, store: Store, onRebuild: () => void): void`

- [ ] **Step 1: 写失败的测试**

`src/palette/subset.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadSubset, saveSubset, SUBSET_STORAGE_KEY } from './subset';

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });
});

describe('subset 持久化', () => {
  it('没有存档时返回空数组', () => {
    expect(loadSubset('mard')).toEqual([]);
  });

  it('存了能读回来', () => {
    saveSubset('mard', [3, 1, 7]);
    expect(loadSubset('mard')).toEqual([1, 3, 7]); // 存的时候排序去重
  });

  it('不同色卡互不干扰', () => {
    saveSubset('mard', [1, 2]);
    saveSubset('hama', [9]);
    expect(loadSubset('mard')).toEqual([1, 2]);
    expect(loadSubset('hama')).toEqual([9]);
  });

  it('存重复值应去重', () => {
    saveSubset('perler', [5, 5, 2, 2]);
    expect(loadSubset('perler')).toEqual([2, 5]);
  });

  it('localStorage 里是坏数据时应返回空数组而不是抛异常', () => {
    localStorage.setItem(SUBSET_STORAGE_KEY, '{不是 json');
    expect(loadSubset('mard')).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/palette/subset.test.ts`
Expected: FAIL — `Failed to resolve import "./subset"`

- [ ] **Step 3: 实现 subset.ts**

`src/palette/subset.ts`：

```ts
import type { PaletteId } from './types';

export const SUBSET_STORAGE_KEY = 'pindou.subset.v1';

type SubsetMap = Partial<Record<PaletteId, number[]>>;

function readAll(): SubsetMap {
  try {
    const raw = localStorage.getItem(SUBSET_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as SubsetMap) : {};
  } catch {
    // 坏数据（手工改过、版本不兼容）当作没有存档，不要让整个应用起不来
    return {};
  }
}

/** 返回该色卡勾选的豆号下标；空数组表示"全选" */
export function loadSubset(paletteId: PaletteId): number[] {
  const v = readAll()[paletteId];
  return Array.isArray(v) ? v : [];
}

export function saveSubset(paletteId: PaletteId, indices: readonly number[]): void {
  const all = readAll();
  all[paletteId] = [...new Set(indices)].sort((a, b) => a - b);
  try {
    localStorage.setItem(SUBSET_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // 存不下就算了，不影响当前会话
  }
}
```

- [ ] **Step 4: 实现色卡面板**

`src/ui/palettePanel.ts`：

```ts
import type { Store } from './state';
import { getPalette } from '../palette/registry';
import { loadSubset, saveSubset } from '../palette/subset';

/**
 * 「我有的豆子」勾选面板。
 *
 * 实拼时最刚需的功能：买的是 48 色套装，图纸却给了 80 种颜色，等于白生成。
 * 空集表示全选 —— 这样新用户不用先勾 291 个格子才能开始用。
 */
export function mountPalettePanel(root: HTMLElement, store: Store, onRebuild: () => void): void {
  const section = document.createElement('div');
  root.appendChild(section);

  function render(): void {
    const s = store.get();
    const palette = getPalette(s.build.paletteId);
    const selected = new Set(s.allowed[palette.id] ?? []);
    const isAll = selected.size === 0;

    section.innerHTML = `
      <h2>我有的豆子</h2>
      <div class="readout">${isAll ? `未筛选，使用全部 ${palette.beads.length} 色` : `已选 ${selected.size} / ${palette.beads.length} 色`}</div>
      <div class="row">
        <button class="btn" data-act="all">全选</button>
        <button class="btn" data-act="none">清空</button>
        <button class="btn" data-act="invert">反选</button>
      </div>
      <div class="swatch-grid" id="swatches"></div>
    `;

    const grid = section.querySelector('#swatches') as HTMLElement;
    palette.beads.forEach((bead, i) => {
      const el = document.createElement('div');
      el.className = 'swatch' + (isAll || selected.has(i) ? '' : ' off');
      el.style.background = bead.hex;
      el.title = `${bead.code} ${bead.nameZh}`;
      el.addEventListener('click', () => {
        // 从"全选"状态点第一下时，视为除了这颗以外全都有
        const next = isAll ? new Set(palette.beads.map((_, k) => k)) : new Set(selected);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        commit([...next]);
      });
      grid.appendChild(el);
    });

    section.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'all') commit([]);
        else if (act === 'none') commit([0]); // 至少留一色，否则匹配器无候选
        else if (act === 'invert') {
          const cur = isAll ? new Set(palette.beads.map((_, k) => k)) : selected;
          commit(palette.beads.map((_, k) => k).filter((k) => !cur.has(k)));
        }
      });
    });
  }

  function commit(indices: number[]): void {
    const s = store.get();
    const id = s.build.paletteId;
    // 全选就存空数组，语义更清晰，也省 localStorage 空间
    const normalized = indices.length === getPalette(id).beads.length ? [] : indices;
    saveSubset(id, normalized);
    store.set({ allowed: { ...s.allowed, [id]: normalized } });
    render();
    onRebuild();
  }

  // 切色卡时重绘面板
  let lastPaletteId = store.get().build.paletteId;
  store.subscribe((s) => {
    if (s.build.paletteId !== lastPaletteId) {
      lastPaletteId = s.build.paletteId;
      render();
    }
  });

  // 启动时从 localStorage 恢复
  const s = store.get();
  const restored: Record<string, number[]> = { ...s.allowed };
  for (const id of ['mard', 'artkal-s', 'artkal-c', 'perler', 'hama'] as const) {
    restored[id] = loadSubset(id);
  }
  store.set({ allowed: restored });

  render();
}
```

- [ ] **Step 5: 接线到 main.ts**

在 `src/main.ts` 的 `mountControls(...)` 调用之后加：

```ts
import { mountPalettePanel } from './ui/palettePanel';

mountPalettePanel(document.getElementById('controls') as HTMLElement, store, scheduleRebuild);
```

- [ ] **Step 6: 运行测试与手工验收**

Run: `npx vitest run src/palette/subset.test.ts`
Expected: PASS，5 个用例

Run: `npm run dev`
确认：
1. 左栏底部出现色卡网格
2. 点几个色块 → 变暗打叉，图纸重新生成且不再出现这些颜色
3. 刷新页面 → 勾选状态还在
4. 点"全选" → 恢复全部色

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: 我有的豆子子集勾选与持久化"
```

---

### Task 17: 统计面板与 CSV 导出

**Files:**
- Create: `src/export/csv.ts`
- Create: `src/ui/statsPanel.ts`
- Modify: `src/main.ts`
- Test: `src/export/csv.test.ts`

**Interfaces:**
- Consumes: `GridStats` from `src/model/stats.ts`；`Palette` from `src/palette/types.ts`
- Produces:
  - `statsToCsv(stats: GridStats, palette: Palette): string`
  - `downloadText(filename: string, text: string, mime?: string): void`
  - `mountStatsPanel(root: HTMLElement, store: Store): void`

- [ ] **Step 1: 写失败的测试**

`src/export/csv.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { statsToCsv, CSV_BOM } from './csv';
import { computeStats } from '../model/stats';
import { createGrid, setCell } from '../model/grid';
import { getPalette } from '../palette/registry';

describe('statsToCsv', () => {
  const palette = getPalette('mard');

  function sample() {
    const g = createGrid(2, 2, 'mard');
    setCell(g, 0, 0, 0);
    setCell(g, 1, 0, 0);
    setCell(g, 0, 1, 1);
    return computeStats(g, palette);
  }

  it('应以 UTF-8 BOM 开头（否则 Excel 打开中文乱码）', () => {
    expect(statsToCsv(sample(), palette).startsWith(CSV_BOM)).toBe(true);
  });

  it('第一行应是表头', () => {
    const lines = statsToCsv(sample(), palette).replace(CSV_BOM, '').split('\n');
    expect(lines[0]).toBe('色号,颜色名,中文名,HEX,颗数,占比');
  });

  it('数据行数应等于用色数，且按颗数降序', () => {
    const csv = statsToCsv(sample(), palette).replace(CSV_BOM, '').trim().split('\n');
    expect(csv).toHaveLength(3); // 表头 + 2 色
    expect(csv[1]).toContain(palette.beads[0]!.code);
    expect(csv[1]).toContain('2');
  });

  it('含逗号或引号的字段应被正确转义', () => {
    const fake = {
      totalBeads: 1, colorCount: 1, emptyCount: 0,
      usages: [{
        beadIndex: 0, count: 1, ratio: 1,
        bead: { code: 'A,1', name: 'Red "Hot"', nameZh: '正红', hex: '#FF0000', rgb: [255, 0, 0] as const, lab: [0, 0, 0] as const },
      }],
    };
    const line = statsToCsv(fake, palette).replace(CSV_BOM, '').split('\n')[1]!;
    expect(line).toContain('"A,1"');
    expect(line).toContain('"Red ""Hot"""');
  });

  it('空统计应只有表头', () => {
    const empty = { totalBeads: 0, colorCount: 0, emptyCount: 4, usages: [] };
    expect(statsToCsv(empty, palette).replace(CSV_BOM, '').trim().split('\n')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/export/csv.test.ts`
Expected: FAIL — `Failed to resolve import "./csv"`

- [ ] **Step 3: 实现 csv.ts**

`src/export/csv.ts`：

```ts
import type { GridStats } from '../model/stats';
import type { Palette } from '../palette/types';

/** UTF-8 BOM。没有它 Excel 打开中文会乱码。 */
export const CSV_BOM = '﻿';

function escapeCsv(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** 采购清单 CSV。列：色号,颜色名,中文名,HEX,颗数,占比 */
export function statsToCsv(stats: GridStats, _palette: Palette): string {
  const rows = [['色号', '颜色名', '中文名', 'HEX', '颗数', '占比']];
  for (const u of stats.usages) {
    rows.push([
      u.bead.code,
      u.bead.name,
      u.bead.nameZh,
      u.bead.hex,
      String(u.count),
      `${(u.ratio * 100).toFixed(2)}%`,
    ]);
  }
  return CSV_BOM + rows.map((r) => r.map(escapeCsv).join(',')).join('\n') + '\n';
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // 立刻 revoke 会让 Safari 下载失败，延后一拍
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 4: 实现统计面板**

`src/ui/statsPanel.ts`：

```ts
import type { Store } from './state';
import { computeStats } from '../model/stats';
import { getPalette } from '../palette/registry';
import { statsToCsv, downloadText } from '../export/csv';

type SortMode = 'count' | 'code';

export function mountStatsPanel(root: HTMLElement, store: Store): void {
  let sort: SortMode = 'count';

  function render(): void {
    const s = store.get();
    if (!s.grid) {
      root.innerHTML = '<h1>用量统计</h1><div class="empty-hint">还没有图纸</div>';
      return;
    }

    const palette = getPalette(s.grid.paletteId);
    const stats = computeStats(s.grid, palette);
    const usages =
      sort === 'count'
        ? stats.usages
        : [...stats.usages].sort((a, b) => a.bead.code.localeCompare(b.bead.code, 'en', { numeric: true }));

    let cumulative = 0;
    const rows = usages
      .map((u) => {
        cumulative += u.ratio;
        return `<tr>
          <td><span class="dot" style="background:${u.bead.hex}"></span></td>
          <td><code>${u.bead.code}</code></td>
          <td>${u.bead.nameZh}</td>
          <td class="num">${u.count}</td>
          <td class="num">${(u.ratio * 100).toFixed(1)}%</td>
          <td class="num">${(cumulative * 100).toFixed(0)}%</td>
        </tr>`;
      })
      .join('');

    root.innerHTML = `
      <h1>用量统计</h1>
      <div class="readout">
        总计 ${stats.totalBeads.toLocaleString('zh-CN')} 颗 · ${stats.colorCount} 色<br>
        空格 ${stats.emptyCount.toLocaleString('zh-CN')} 格
      </div>
      <div class="row">
        <button class="btn" id="sortCount"${sort === 'count' ? ' disabled' : ''}>按颗数</button>
        <button class="btn" id="sortCode"${sort === 'code' ? ' disabled' : ''}>按色号</button>
      </div>
      <table class="stats">
        <thead><tr><th></th><th>色号</th><th>颜色</th><th class="num">颗数</th><th class="num">占比</th><th class="num">累计</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="row" style="margin-top:14px">
        <button class="btn primary" id="csv" style="flex:1">下载采购清单 CSV</button>
      </div>
      <div id="exportSlot"></div>
    `;

    root.querySelector('#sortCount')!.addEventListener('click', () => { sort = 'count'; render(); });
    root.querySelector('#sortCode')!.addEventListener('click', () => { sort = 'code'; render(); });
    root.querySelector('#csv')!.addEventListener('click', () => {
      const name = (s.imageName || '拼豆图纸').replace(/\.[^.]+$/, '');
      downloadText(`${name}-采购清单.csv`, statsToCsv(stats, palette));
    });
  }

  store.subscribe(render);
  render();
}
```

- [ ] **Step 5: 接线到 main.ts**

在 `src/main.ts` 末尾（`export` 之前）加：

```ts
import { mountStatsPanel } from './ui/statsPanel';

mountStatsPanel(document.getElementById('stats') as HTMLElement, store);
```

- [ ] **Step 6: 运行测试与手工验收**

Run: `npx vitest run src/export/csv.test.ts`
Expected: PASS，5 个用例

Run: `npm run dev`
确认：
1. 生成图纸后，右栏出现用量表，总颗数与格数吻合
2. 点"按色号"排序生效
3. 点"下载采购清单 CSV"，用 Excel 或 Numbers 打开，中文不乱码

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: 用量统计面板与 CSV 采购清单导出"
```

---

### Task 18: 编辑三件套与撤销重做

**Files:**
- Create: `src/model/patch.ts`
- Create: `src/ui/editor.ts`
- Modify: `src/main.ts`
- Test: `src/model/patch.test.ts`

**Interfaces:**
- Consumes: `BeadGrid` from `src/model/grid.ts`
- Produces:
  - `class PatchHistory`，方法：`apply(index: number, beadIndex: number): void`、`undo(): boolean`、`redo(): boolean`、`get current(): ReadonlyMap<number, number>`、`get canUndo(): boolean`、`get canRedo(): boolean`、`clear(): void`、`get size(): number`
  - `mountEditor(canvas: HTMLElement, store: Store, preview: Preview, onPatch: () => void): void`

- [ ] **Step 1: 写失败的测试**

`src/model/patch.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { PatchHistory } from './patch';

describe('PatchHistory', () => {
  it('初始为空，不能撤销也不能重做', () => {
    const h = new PatchHistory();
    expect(h.size).toBe(0);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });

  it('apply 后能读到改动', () => {
    const h = new PatchHistory();
    h.apply(5, 12);
    expect(h.current.get(5)).toBe(12);
    expect(h.size).toBe(1);
    expect(h.canUndo).toBe(true);
  });

  it('undo 应回到上一状态', () => {
    const h = new PatchHistory();
    h.apply(5, 12);
    h.apply(6, 3);
    expect(h.undo()).toBe(true);
    expect(h.current.has(6)).toBe(false);
    expect(h.current.get(5)).toBe(12);
  });

  it('redo 应重做被撤销的改动', () => {
    const h = new PatchHistory();
    h.apply(5, 12);
    h.undo();
    expect(h.canRedo).toBe(true);
    expect(h.redo()).toBe(true);
    expect(h.current.get(5)).toBe(12);
  });

  it('undo 后再 apply 应清空 redo 栈', () => {
    const h = new PatchHistory();
    h.apply(1, 1);
    h.apply(2, 2);
    h.undo();
    h.apply(3, 3);
    expect(h.canRedo).toBe(false);
    expect(h.current.has(2)).toBe(false);
    expect(h.current.get(3)).toBe(3);
  });

  it('同一格重复涂同色不应产生新的历史条目', () => {
    const h = new PatchHistory();
    h.apply(5, 12);
    h.apply(5, 12);
    h.undo();
    expect(h.current.size).toBe(0);
  });

  it('空栈上 undo/redo 应返回 false 而不抛异常', () => {
    const h = new PatchHistory();
    expect(h.undo()).toBe(false);
    expect(h.redo()).toBe(false);
  });

  it('clear 应清空一切', () => {
    const h = new PatchHistory();
    h.apply(1, 1);
    h.clear();
    expect(h.size).toBe(0);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });

  it('current 应是只读快照，外部改动不影响内部', () => {
    const h = new PatchHistory();
    h.apply(1, 1);
    (h.current as Map<number, number>).set(99, 99);
    expect(h.current.has(99)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/model/patch.test.ts`
Expected: FAIL — `Failed to resolve import "./patch"`

- [ ] **Step 3: 实现 patch.ts**

`src/model/patch.ts`：

```ts
/**
 * 手动编辑层：格子下标 → 豆号。
 *
 * 之所以不直接改 BeadGrid，是为了让参数变更（改图纸样式、切色号显示、
 * 调亮度）重跑管线后手改仍然生效 —— patch 在管线跑完后覆盖上去。
 *
 * 快照式历史：每次 apply 存一份完整 Map。一张图纸的手改通常只有几十处，
 * 每份快照几 KB，比维护正反向操作对简单得多，也不可能出现状态漂移。
 */
export class PatchHistory {
  #stack: Array<Map<number, number>> = [new Map()];
  #cursor = 0;
  #maxDepth = 200;

  get current(): ReadonlyMap<number, number> {
    // 返回副本，防止外部改动污染历史
    return new Map(this.#stack[this.#cursor]!);
  }

  get size(): number {
    return this.#stack[this.#cursor]!.size;
  }

  get canUndo(): boolean {
    return this.#cursor > 0;
  }

  get canRedo(): boolean {
    return this.#cursor < this.#stack.length - 1;
  }

  apply(index: number, beadIndex: number): void {
    const cur = this.#stack[this.#cursor]!;
    if (cur.get(index) === beadIndex) return; // 无变化，不记历史

    const next = new Map(cur);
    next.set(index, beadIndex);

    // 丢弃 redo 分支
    this.#stack = this.#stack.slice(0, this.#cursor + 1);
    this.#stack.push(next);

    if (this.#stack.length > this.#maxDepth) this.#stack.shift();
    this.#cursor = this.#stack.length - 1;
  }

  undo(): boolean {
    if (!this.canUndo) return false;
    this.#cursor--;
    return true;
  }

  redo(): boolean {
    if (!this.canRedo) return false;
    this.#cursor++;
    return true;
  }

  clear(): void {
    this.#stack = [new Map()];
    this.#cursor = 0;
  }

  /** 从存档恢复 */
  restore(entries: ReadonlyArray<readonly [number, number]>): void {
    this.#stack = [new Map(entries)];
    this.#cursor = 0;
  }
}
```

- [ ] **Step 4: 实现编辑交互**

`src/ui/editor.ts`：

```ts
import type { Store } from './state';
import type { Preview } from '../render/preview';
import type { PatchHistory } from '../model/patch';
import { getPalette } from '../palette/registry';

/**
 * 编辑三件套：单格改色（点/拖）、吸管（Alt+点）、撤销重做（⌘Z / ⌘⇧Z）。
 *
 * 当前画笔颜色初始为图纸里用量最多的那色 —— 比默认第一个豆号有用得多。
 */
export function mountEditor(
  canvas: HTMLCanvasElement,
  store: Store,
  preview: Preview,
  history: PatchHistory,
  onPatch: () => void,
): { getBrush: () => number; setBrush: (i: number) => void } {
  let brush = 0;
  let painting = false;

  const paintAt = (clientX: number, clientY: number): void => {
    const s = store.get();
    if (!s.grid) return;
    const cell = preview.cellAt(clientX, clientY);
    if (!cell) return;
    const i = cell.y * s.grid.width + cell.x;
    if (s.grid.mask[i] !== 1) return; // 空格不涂
    history.apply(i, brush);
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
        const bead = getPalette(s.grid.paletteId).beads[brush]!;
        canvas.title = `画笔：${bead.code} ${bead.nameZh}`;
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

  const stop = (e: PointerEvent) => {
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

  return {
    getBrush: () => brush,
    setBrush: (i: number) => { brush = i; },
  };
}
```

- [ ] **Step 5: 接线到 main.ts**

`src/main.ts` 需要三处改动。

其一，顶部加导入并创建 history：

```ts
import { PatchHistory } from './model/patch';
import { mountEditor } from './ui/editor';

const history = new PatchHistory();
```

其二，`rebuild()` 里把 patch 来源换成 history：

```ts
function rebuild(): void {
  const s = store.get();
  if (!s.image) return;
  const allowed = new Set(s.allowed[s.build.paletteId] ?? []);
  const grid = buildGrid(s.image, { ...s.build, allowedBeads: allowed });
  for (const [i, bead] of history.current) {
    if (i < grid.cells.length && grid.mask[i] === 1) grid.cells[i] = bead;
  }
  store.set({ grid, patch: new Map(history.current) });
}
```

其三，`setGranularity` 里改用 `history`，并在文件末尾挂载编辑器：

```ts
function setGranularity(w: number, h: number): void {
  const s = store.get();
  const changed = w !== s.build.widthCells || h !== s.build.heightCells;
  if (changed && history.size > 0) {
    if (!confirm(`改变颗粒度会丢弃 ${history.size} 处手动修改，继续吗？`)) {
      store.set({ build: { ...s.build } });
      return;
    }
    history.clear();
  }
  store.set({ build: { ...store.get().build, widthCells: w, heightCells: h } });
  rebuild();
}

const editor = mountEditor(canvas, store, preview, history, rebuild);
export { editor, history };
```

同时，切换色卡也会让 patch 的豆号失去意义。在 `controls.ts` 的 `paletteSel` change 处理里，改色卡前先清空 history —— 在 `main.ts` 里通过订阅实现：

```ts
let lastPaletteId = store.get().build.paletteId;
store.subscribe((s) => {
  if (s.build.paletteId !== lastPaletteId) {
    lastPaletteId = s.build.paletteId;
    if (history.size > 0) history.clear();
  }
});
```

- [ ] **Step 6: 运行测试与手工验收**

Run: `npx vitest run src/model/patch.test.ts`
Expected: PASS，9 个用例

Run: `npm run dev`
确认：
1. `Alt` + 点击图纸某格 → 鼠标悬停提示显示"画笔：XX"
2. 点击另一格 → 该格变成吸到的颜色，右栏统计数字同步变化
3. 按住拖动 → 连续涂色
4. `⌘Z` → 撤销一步；`⌘⇧Z` → 重做
5. 拖动亮度滑块重跑管线 → 手改的格子仍然保留
6. 改颗粒度 → 弹确认框，确认后手改清空

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: 编辑三件套（单格改色/吸管/撤销重做）与 patch 层"
```

---

### Task 19: localStorage 自动存档

**Files:**
- Create: `src/model/persist.ts`
- Modify: `src/main.ts`
- Test: `src/model/persist.test.ts`

**Interfaces:**
- Consumes: `BuildParams` from `src/pipeline/build.ts`；`SheetOptions` from `src/render/sheet.ts`
- Produces:
  - `interface Archive { version: 1; imageName: string; imageDataUrl: string | null; build: BuildParams; sheet: SheetOptions; patch: Array<[number, number]>; savedAt: number }`
  - `saveArchive(a: Archive): 'ok' | 'no-image' | 'failed'`
  - `loadArchive(): Archive | null`
  - `clearArchive(): void`

**设计取舍：** 用户没要工程文件下载按钮，但要了手动编辑 —— 关掉标签页手改就全没了。localStorage 自动存档解决这个矛盾：不多一个按钮，但刷新、崩溃、误关都能恢复。

localStorage 约 5MB，原图 dataURL 可能超限。降级策略：先试完整存；超限就丢掉原图只存参数与 patch，恢复时提示重新选图。

- [ ] **Step 1: 写失败的测试**

`src/model/persist.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveArchive, loadArchive, clearArchive, ARCHIVE_KEY, type Archive } from './persist';
import { DEFAULT_BUILD_PARAMS } from '../pipeline/build';
import { DEFAULT_SHEET_OPTIONS } from '../render/sheet';

function makeStorage(limitBytes = Infinity) {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v.length > limitBytes) {
        const e = new Error('QuotaExceededError');
        e.name = 'QuotaExceededError';
        throw e;
      }
      map.set(k, v);
    },
    removeItem: (k: string) => { map.delete(k); },
  };
}

function archive(overrides: Partial<Archive> = {}): Archive {
  return {
    version: 1,
    imageName: 'a.png',
    imageDataUrl: 'data:image/jpeg;base64,AAAA',
    build: { ...DEFAULT_BUILD_PARAMS, widthCells: 29, heightCells: 29 },
    sheet: { ...DEFAULT_SHEET_OPTIONS },
    patch: [[3, 7]],
    savedAt: 1700000000000,
    ...overrides,
  };
}

beforeEach(() => { vi.stubGlobal('localStorage', makeStorage()); });

describe('存档', () => {
  it('没有存档时 load 返回 null', () => {
    expect(loadArchive()).toBeNull();
  });

  it('存了能完整读回来', () => {
    expect(saveArchive(archive())).toBe('ok');
    const a = loadArchive()!;
    expect(a.imageName).toBe('a.png');
    expect(a.build.widthCells).toBe(29);
    expect(a.patch).toEqual([[3, 7]]);
  });

  it('超限时应降级为不存原图', () => {
    vi.stubGlobal('localStorage', makeStorage(200));
    const big = archive({ imageDataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(5000) });
    expect(saveArchive(big)).toBe('no-image');
    const a = loadArchive()!;
    expect(a.imageDataUrl).toBeNull();
    expect(a.patch).toEqual([[3, 7]]);
  });

  it('连不存原图都放不下时返回 failed', () => {
    vi.stubGlobal('localStorage', makeStorage(10));
    expect(saveArchive(archive())).toBe('failed');
  });

  it('坏数据应返回 null 而不抛异常', () => {
    localStorage.setItem(ARCHIVE_KEY, '{坏了');
    expect(loadArchive()).toBeNull();
  });

  it('版本号不匹配的存档应被忽略', () => {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify({ ...archive(), version: 99 }));
    expect(loadArchive()).toBeNull();
  });

  it('clearArchive 应删掉存档', () => {
    saveArchive(archive());
    clearArchive();
    expect(loadArchive()).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/model/persist.test.ts`
Expected: FAIL — `Failed to resolve import "./persist"`

- [ ] **Step 3: 实现**

`src/model/persist.ts`：

```ts
import type { BuildParams } from '../pipeline/build';
import type { SheetOptions } from '../render/sheet';

export const ARCHIVE_KEY = 'pindou.archive.v1';
const ARCHIVE_VERSION = 1;

export interface Archive {
  version: 1;
  imageName: string;
  /** 降质后的原图。存不下时为 null，恢复时提示用户重新选图。 */
  imageDataUrl: string | null;
  build: BuildParams;
  sheet: SheetOptions;
  /** patch 序列化成数组，因为 Map 不能直接 JSON.stringify */
  patch: Array<[number, number]>;
  savedAt: number;
}

export type SaveResult = 'ok' | 'no-image' | 'failed';

/**
 * 写入存档。
 * 原图 dataURL 可能撑爆 localStorage（约 5MB），因此分两级降级：
 * 完整存 → 丢掉原图只存参数 → 彻底放弃。
 */
export function saveArchive(a: Archive): SaveResult {
  const write = (payload: Archive): boolean => {
    try {
      localStorage.setItem(ARCHIVE_KEY, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  };

  if (write(a)) return 'ok';
  if (write({ ...a, imageDataUrl: null })) return 'no-image';
  return 'failed';
}

export function loadArchive(): Archive | null {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Archive;
    // 版本不匹配就当没有 —— 老存档的字段可能对不上，强行恢复会崩得更难看
    if (parsed?.version !== ARCHIVE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearArchive(): void {
  try {
    localStorage.removeItem(ARCHIVE_KEY);
  } catch {
    // 忽略
  }
}
```

- [ ] **Step 4: 接线到 main.ts**

在 `src/main.ts` 加：

```ts
import { saveArchive, loadArchive, type Archive } from './model/persist';
import { loadImageDataUrl } from './ui/imageLoad';

// ---- 自动存档（debounce 800ms，避免拖滑块时疯狂写盘）----
let saveTimer: number | undefined;
function scheduleSave(): void {
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
}
store.subscribe(scheduleSave);

// ---- 启动时尝试恢复 ----
async function tryRestore(): Promise<void> {
  const a = loadArchive();
  if (!a) return;

  const when = new Date(a.savedAt).toLocaleString('zh-CN');
  if (!confirm(`发现 ${when} 的编辑存档（${a.imageName || '未命名'}），要恢复吗？`)) return;

  store.set({ build: a.build, sheet: a.sheet });
  history.restore(a.patch);

  if (a.imageDataUrl) {
    const grid = await loadImageDataUrl(a.imageDataUrl);
    store.set({ image: grid, imageName: a.imageName, imageDataUrl: a.imageDataUrl });
    rebuild();
  } else {
    alert('存档太大，原图没能保存下来。参数和手动修改已恢复，请重新选择同一张图片。');
  }
}
void tryRestore();
```

- [ ] **Step 5: 运行测试与手工验收**

Run: `npx vitest run src/model/persist.test.ts`
Expected: PASS，7 个用例

Run: `npm run dev`
确认：
1. 上传图、改几处颜色、调一下滑块
2. 刷新页面 → 弹出"发现 …的编辑存档，要恢复吗？"
3. 点确定 → 图片、参数、手改全部回来
4. 点取消 → 空白状态，不报错

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: localStorage 自动存档与会话恢复"
```

---

### Task 20: PNG 导出

**Files:**
- Create: `src/export/png.ts`
- Modify: `src/ui/statsPanel.ts`
- Test: `src/export/png.test.ts`

**Interfaces:**
- Consumes: `BeadGrid`、`Palette`、`SheetOptions`、`drawSheet`、`sheetPixelSize`、`downloadBlob`
- Produces:
  - `exportCellSize(grid: BeadGrid, style: SheetStyle, maxPixels?: number): number`
  - `renderSheetToCanvas(grid, palette, opts): HTMLCanvasElement`
  - `exportSheetPng(grid, palette, opts, filename): Promise<void>`

**为什么另起一个离屏 canvas：** 屏幕预览有 DPR 缩放和自适应格宽，直接复用会让导出分辨率不可控 —— 同一张图在 Retina 和普通屏上导出的尺寸会不一样。

- [ ] **Step 1: 写失败的测试**

`src/export/png.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { exportCellSize } from './png';
import { createGrid } from '../model/grid';

describe('exportCellSize', () => {
  it('小图应给足够大的格宽让色号看得清', () => {
    const g = createGrid(29, 29, 'mard');
    expect(exportCellSize(g, 'code')).toBeGreaterThanOrEqual(24);
  });

  it('大图应缩小格宽以免超出像素上限', () => {
    const g = createGrid(200, 200, 'mard');
    const cs = exportCellSize(g, 'code', 16_000_000);
    expect(200 * cs * (200 * cs)).toBeLessThanOrEqual(16_000_000);
  });

  it('plain 样式不需要放字，可以用更小的格宽', () => {
    const g = createGrid(100, 100, 'mard');
    expect(exportCellSize(g, 'plain')).toBeLessThanOrEqual(exportCellSize(g, 'code'));
  });

  it('结果永远是 ≥ 1 的整数', () => {
    const g = createGrid(200, 200, 'mard');
    const cs = exportCellSize(g, 'code', 1000);
    expect(Number.isInteger(cs)).toBe(true);
    expect(cs).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/export/png.test.ts`
Expected: FAIL — `Failed to resolve import "./png"`

- [ ] **Step 3: 实现**

`src/export/png.ts`：

```ts
import type { BeadGrid } from '../model/grid';
import type { Palette } from '../palette/types';
import { drawSheet, sheetPixelSize, type SheetOptions, type SheetStyle } from '../render/sheet';
import { downloadBlob } from './csv';

/** 浏览器 canvas 的实际上限因平台而异，1600 万像素是各家都吃得下的保守值 */
const DEFAULT_MAX_PIXELS = 16_000_000;

/**
 * 决定导出时每格多少像素。
 *
 * code/symbol 样式要放得下文字，理想格宽更大；plain/round 无文字可以小一些。
 * 大图会撞到 canvas 像素上限，此时按面积等比缩小。
 */
export function exportCellSize(
  grid: BeadGrid,
  style: SheetStyle,
  maxPixels = DEFAULT_MAX_PIXELS,
): number {
  const ideal = style === 'code' || style === 'symbol' ? 32 : 16;
  const cells = grid.width * grid.height;
  const capped = Math.floor(Math.sqrt(maxPixels / cells));
  return Math.max(1, Math.min(ideal, capped));
}

export function renderSheetToCanvas(
  grid: BeadGrid,
  palette: Palette,
  opts: SheetOptions,
): HTMLCanvasElement {
  const size = sheetPixelSize(grid, opts);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size.width, size.height);
  drawSheet(ctx, grid, palette, opts);
  return canvas;
}

export async function exportSheetPng(
  grid: BeadGrid,
  palette: Palette,
  opts: SheetOptions,
  filename: string,
): Promise<void> {
  const effective: SheetOptions = { ...opts, cellSize: exportCellSize(grid, opts.style) };
  const canvas = renderSheetToCanvas(grid, palette, effective);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG 导出失败：canvas.toBlob 返回空');
  downloadBlob(filename, blob);
}
```

- [ ] **Step 4: 在统计面板加导出按钮**

在 `src/ui/statsPanel.ts` 的 `render()` 里，把 `<div id="exportSlot"></div>` 替换为：

```html
      <h2>导出</h2>
      <div class="row"><button class="btn" id="pngSheet" style="flex:1">下载图纸 PNG</button></div>
      <div class="row"><button class="btn" id="pngRound" style="flex:1">下载圆豆预览图</button></div>
```

并在事件绑定处加（放在 `#csv` 的绑定之后）：

```ts
    const baseName = (s.imageName || '拼豆图纸').replace(/\.[^.]+$/, '');

    root.querySelector('#pngSheet')!.addEventListener('click', () => {
      void exportSheetPng(s.grid!, palette, s.sheet, `${baseName}-图纸.png`);
    });

    root.querySelector('#pngRound')!.addEventListener('click', () => {
      void exportSheetPng(
        s.grid!,
        palette,
        { ...s.sheet, style: 'round', showCoords: false, showGrid: false, showMajorLines: false },
        `${baseName}-预览.png`,
      );
    });
```

文件顶部加导入：

```ts
import { exportSheetPng } from '../export/png';
```

- [ ] **Step 5: 运行测试与手工验收**

Run: `npx vitest run src/export/png.test.ts`
Expected: PASS，4 个用例

Run: `npm run dev`
确认：
1. 点"下载图纸 PNG" → 得到一张高清 PNG，放大能看清每格色号，四边有行列坐标
2. 点"下载圆豆预览图" → 得到圆珠渲染图，无网格无坐标
3. 把颗粒度拉到 150×150 再导出 → 仍能成功，不报 canvas 超限

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: 图纸与圆豆预览 PNG 导出"
```

---

### Task 21: PDF 分页导出

**Files:**
- Create: `src/export/pdf.ts`
- Modify: `src/ui/statsPanel.ts`
- Test: `src/export/pdf.test.ts`

**Interfaces:**
- Consumes: `BeadGrid`、`Palette`、`SheetOptions`、`renderSheetToCanvas`、`computeStats`、jsPDF
- Produces:
  - `interface PageSpec { index: number; col: number; row: number; x0: number; y0: number; x1: number; y1: number }`
  - `planPages(grid: BeadGrid, cellsPerPageX: number, cellsPerPageY: number, overlap: number): PageSpec[]`
  - `exportSheetPdf(grid, palette, opts, filename): Promise<void>`

**为什么需要：** 颗粒度一上 60×60，屏幕和单页都看不清色号。分页打印时每页带一行/一列重叠和拼接指引，避免"两页交界处那一行到底属于哪页"的经典困惑。

- [ ] **Step 1: 写失败的测试**

`src/export/pdf.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { planPages } from './pdf';
import { createGrid } from '../model/grid';

describe('planPages', () => {
  it('图纸放得下一页时只产出一页', () => {
    const pages = planPages(createGrid(29, 29, 'mard'), 40, 50, 1);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ index: 0, col: 0, row: 0, x0: 0, y0: 0, x1: 29, y1: 29 });
  });

  it('超出时应按列行切页', () => {
    const pages = planPages(createGrid(100, 60, 'mard'), 40, 50, 1);
    // 宽 100 / 40 → 3 列（含重叠后仍是 3 列）；高 60 / 50 → 2 行
    expect(new Set(pages.map((p) => p.col)).size).toBe(3);
    expect(new Set(pages.map((p) => p.row)).size).toBe(2);
    expect(pages).toHaveLength(6);
  });

  it('相邻页应有重叠', () => {
    const pages = planPages(createGrid(100, 20, 'mard'), 40, 50, 1);
    const first = pages.find((p) => p.col === 0)!;
    const second = pages.find((p) => p.col === 1)!;
    expect(second.x0).toBeLessThan(first.x1);
  });

  it('页面范围不应越界', () => {
    const g = createGrid(100, 60, 'mard');
    for (const p of planPages(g, 40, 50, 1)) {
      expect(p.x0).toBeGreaterThanOrEqual(0);
      expect(p.y0).toBeGreaterThanOrEqual(0);
      expect(p.x1).toBeLessThanOrEqual(g.width);
      expect(p.y1).toBeLessThanOrEqual(g.height);
      expect(p.x1).toBeGreaterThan(p.x0);
      expect(p.y1).toBeGreaterThan(p.y0);
    }
  });

  it('index 应从 0 连续递增', () => {
    const pages = planPages(createGrid(100, 60, 'mard'), 40, 50, 1);
    expect(pages.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('页面应覆盖整张图纸不留缝', () => {
    const g = createGrid(93, 47, 'mard');
    const pages = planPages(g, 40, 50, 1);
    const covered = new Set<string>();
    for (const p of pages) {
      for (let y = p.y0; y < p.y1; y++) for (let x = p.x0; x < p.x1; x++) covered.add(`${x},${y}`);
    }
    expect(covered.size).toBe(g.width * g.height);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/export/pdf.test.ts`
Expected: FAIL — `Failed to resolve import "./pdf"`

- [ ] **Step 3: 实现**

`src/export/pdf.ts`：

```ts
import { jsPDF } from 'jspdf';
import type { BeadGrid } from '../model/grid';
import type { Palette } from '../palette/types';
import type { SheetOptions } from '../render/sheet';
import { createGrid } from '../model/grid';
import { renderSheetToCanvas } from './png';
import { computeStats } from '../model/stats';
import { computeGeometry, formatGeometry } from '../model/geometry';
import { downloadBlob } from './csv';

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

/** A4 横向可用区，毫米 */
const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 12;

/** 一页放多少格 —— 按每格 5mm 打印、留出页眉，实测下来色号刚好看得清 */
const CELLS_X = 50;
const CELLS_Y = 32;
const OVERLAP = 1;

/**
 * 把图纸切成若干页，相邻页保留 overlap 格重叠。
 * 重叠的作用：拼接时能对上，不会出现"交界那行到底算谁的"。
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
      if (s + per >= total) { out.push(Math.max(0, total - per)); break; }
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
function sliceGrid(grid: BeadGrid, p: PageSpec): BeadGrid {
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

export async function exportSheetPdf(
  grid: BeadGrid,
  palette: Palette,
  opts: SheetOptions,
  filename: string,
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pages = planPages(grid, CELLS_X, CELLS_Y, OVERLAP);
  const cols = Math.max(...pages.map((p) => p.col)) + 1;
  const rows = Math.max(...pages.map((p) => p.row)) + 1;

  for (const p of pages) {
    if (p.index > 0) doc.addPage();

    const slice = sliceGrid(grid, p);
    const canvas = renderSheetToCanvas(slice, palette, {
      ...opts,
      cellSize: 28,
      showCoords: false,
      showBoardLines: false,
    });

    // 页眉
    doc.setFontSize(9);
    doc.text(
      `第 ${p.index + 1} / ${pages.length} 页  ·  第 ${p.row + 1} 行 第 ${p.col + 1} 列  ·  ` +
        `覆盖格子 X ${p.x0 + 1}–${p.x1}  Y ${p.y0 + 1}–${p.y1}`,
      MARGIN,
      MARGIN - 4,
    );

    // 拼接指引
    const hints: string[] = [];
    if (p.col > 0) hints.push(`左接第 ${p.index} 页`);
    if (p.col < cols - 1) hints.push(`右接第 ${p.index + 2} 页`);
    if (p.row > 0) hints.push(`上接第 ${p.index - cols + 1} 页`);
    if (p.row < rows - 1) hints.push(`下接第 ${p.index + cols + 1} 页`);
    if (hints.length > 0) {
      doc.text(hints.join('   '), MARGIN, PAGE_H - MARGIN + 6);
    }

    // 等比放进可用区
    const availW = PAGE_W - MARGIN * 2;
    const availH = PAGE_H - MARGIN * 2 - 6;
    const k = Math.min(availW / canvas.width, availH / canvas.height);
    doc.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      MARGIN,
      MARGIN,
      canvas.width * k,
      canvas.height * k,
    );
  }

  // 末页：总览 + 用量表
  doc.addPage();
  const stats = computeStats(grid, palette);
  const geo = computeGeometry(grid.width, grid.height, opts.beadSizeMm);

  doc.setFontSize(13);
  doc.text('总览与用量', MARGIN, MARGIN + 2);
  doc.setFontSize(9);
  doc.text(formatGeometry(geo, stats.totalBeads), MARGIN, MARGIN + 9);
  doc.text(`共 ${stats.colorCount} 种颜色 · ${palette.label}`, MARGIN, MARGIN + 15);

  const overview = renderSheetToCanvas(grid, palette, {
    ...opts,
    style: 'plain',
    cellSize: Math.max(2, Math.floor(600 / Math.max(grid.width, grid.height))),
    showCoords: false,
    showGrid: false,
    showMajorLines: false,
    showBoardLines: false,
  });
  const ok = Math.min(90 / overview.width, 90 / overview.height);
  doc.addImage(overview.toDataURL('image/png'), 'PNG', MARGIN, MARGIN + 20,
    overview.width * ok, overview.height * ok);

  // 用量表，分两栏排
  let x = MARGIN + 105;
  let y = MARGIN + 22;
  doc.setFontSize(8);
  for (const u of stats.usages) {
    doc.setFillColor(u.bead.rgb[0], u.bead.rgb[1], u.bead.rgb[2]);
    doc.rect(x, y - 2.6, 3, 3, 'F');
    doc.text(`${u.bead.code}  ${u.bead.nameZh}  ${u.count} 颗  ${(u.ratio * 100).toFixed(1)}%`, x + 4.5, y);
    y += 4.4;
    if (y > PAGE_H - MARGIN) { y = MARGIN + 22; x += 92; }
  }

  downloadBlob(filename, doc.output('blob'));
}
```

- [ ] **Step 4: 在统计面板加 PDF 按钮**

在 `src/ui/statsPanel.ts` 的导出区加一行：

```html
      <div class="row"><button class="btn" id="pdf" style="flex:1">下载分页打印 PDF</button></div>
```

绑定：

```ts
    root.querySelector('#pdf')!.addEventListener('click', () => {
      void exportSheetPdf(s.grid!, palette, s.sheet, `${baseName}-图纸.pdf`);
    });
```

导入：

```ts
import { exportSheetPdf } from '../export/pdf';
```

- [ ] **Step 5: 运行测试与手工验收**

Run: `npx vitest run src/export/pdf.test.ts`
Expected: PASS，6 个用例

Run: `npm run dev`
确认：
1. 29×29 图纸导 PDF → 2 页（图纸 1 页 + 总览 1 页）
2. 把颗粒度拉到 120×120 再导 → 多页，每页页眉有页码和覆盖范围，页脚有"右接第 N 页"
3. 末页有缩略总览图和完整用量表
4. 用预览打开，中文不乱码（jsPDF 内置字体不支持中文的话，本步会暴露 —— 若中文变成方块，改用 `doc.addFont` 嵌入一个中文字体子集，或把页眉页脚改为纯数字与英文）

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: PDF 分页打印导出，含拼接指引与总览页"
```

---

### Task 22: 单文件打包与收尾

**Files:**
- Create: `README.md`
- Modify: `vite.config.ts`
- Modify: `src/ui/controls.ts`（补一句色差提示）

- [ ] **Step 1: 补上色差提示**

物理豆子的颜色受塑料材质、批次、光照和显示器校准影响，屏幕上的 HEX 不等于实物。这个限制必须让用户知道，否则会以为工具算错了。

在 `src/ui/controls.ts` 的 `root.innerHTML` 末尾追加：

```html
    <div class="readout" style="margin-top:18px;line-height:1.6">
      ⚠️ 屏幕颜色与实物豆子存在色差（塑料材质、批次、光照、显示器校准都有影响）。
      色号是权威标识，颜色仅供参考，建议对照实体色卡确认。
    </div>
```

- [ ] **Step 2: 写 README**

`README.md`：

```markdown
# 拼豆图纸生成器

上传一张图片，生成可以照着拼的拼豆图纸，并统计每种颜色需要多少颗豆子。

纯前端应用 —— 图片全程在浏览器内处理，不上传任何服务器。

## 功能

- **颗粒度可调**：10–200 格自由调节，预设钥匙扣 / 单板 / 四板 / 大图；实时显示拼出来多大、需要几块底板
- **五套主流色卡**：MARD（漫漫/COCO 系）291 色、Artkal S 199 色、Artkal C 174 色、Perler 103 色、Hama 92 色
- **我有的豆子**：勾选手头实际拥有的颜色，只在这个子集里匹配
- **CIEDE2000 感知色差匹配**：在 Lab 空间找最近色，比 RGB 欧氏距离在肤色和渐变上准得多
- **四种图纸样式**：色块+色号 / 色块+符号 / 纯色块 / 圆豆拟真预览
- **轻量编辑**：单格改色、吸管取色、撤销重做
- **用量统计**：每色颗数、占比、累计，一键导出 CSV 采购清单
- **导出**：高清 PNG（带行列坐标）、A4 分页打印 PDF（带拼接指引）、圆豆预览图

## 开发

```bash
npm install
npm run palettes   # 从上游拉取并编译色卡数据（首次必须跑）
npm run dev
npm test
npm run build      # 产出 dist/index.html，单个自包含文件
```

`npm run build` 的产物是**一个 HTML 文件**，双击即可使用，也可以直接发给别人。

## 已知限制

- 屏幕颜色与实物豆子存在色差（塑料材质、批次、光照、显示器校准）。色号是权威标识。
- 各拼豆品牌没有官方统一编号标准，跨品牌只能靠 HEX/Lab 换算，色差需实拼确认。
- 中文颜色名为程序按色相自动生成（常用色人工校对过），仅作辅助。
- 存档基于 localStorage（约 5MB）。原图过大时只保存参数和手动修改，恢复时需重新选图。

## 第三方数据

见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
```

- [ ] **Step 3: 跑全量测试**

Run: `npm test`
Expected: PASS，全部用例（约 100 个）

- [ ] **Step 4: 类型检查与生产构建**

Run: `npm run build`
Expected: 构建成功，`dist/` 下只有 `index.html` 一个文件（可能还有 favicon）。若 `tsc --noEmit` 报错，逐个修掉 —— 不要用 `any` 或 `@ts-ignore` 绕过。

- [ ] **Step 5: 验证单文件产物**

```bash
open dist/index.html
```

确认：直接用 `file://` 打开（不经过任何服务器）时，页面能正常加载、能上传图片、能生成图纸、能导出 PNG 和 CSV。若有 CORS 或模块加载报错，说明 singlefile 插件没把资源全部内联，检查 `vite.config.ts`。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "docs: README 与色差提示，完成单文件打包"
```

---

## 自查记录

**Spec 覆盖检查**（对照 `docs/superpowers/specs/2026-08-09-pindou-pattern-generator-design.md`）：

| Spec 章节 | 对应任务 |
|---|---|
| §3 技术栈 | Task 1、Task 22 |
| §4 架构与 BeadGrid | Task 5、Task 12 |
| §5 颗粒度与物理尺寸 | Task 11、Task 15 |
| §6.1 色卡数据源 | Task 3 |
| §6.2 颜色名缺失 / 符号不可用 | Task 3（中文名）、Task 11（符号） |
| §6.3 我有的豆子 | Task 16 |
| §7 编辑三件套 + patch 失效 + localStorage | Task 18、Task 19 |
| §8.1 区域平均降采样 | Task 6 |
| §8.2 CIEDE2000 + 唯一色去重 | Task 2、Task 4 |
| §8.3 抖动默认关闭 | Task 9、Task 15 |
| §8.4 量化在匹配之前 | Task 8、Task 12 |
| §8.5 去孤点 | Task 10 |
| §8.6 抠图 | Task 7 |
| §9 四种图纸样式 + 装饰 | Task 13 |
| §10 统计 + CSV | Task 5、Task 17 |
| §11 导出 PNG / PDF / 圆豆 | Task 20、Task 21 |
| §12 UI 布局 | Task 14、Task 15 |
| §13 模块划分 | 全部任务的 Files 段 |
| §14 测试策略 | 各任务的测试步骤 |
| §15 已知风险 | Task 22（色差提示、README 限制说明） |

无遗漏。

**类型一致性**：`RGB` / `Lab` / `Bead` / `Palette` / `BeadGrid` / `RgbaGrid` / `Matcher` / `SheetOptions` 在各任务间的签名已逐一比对，命名一致。`Bead` 上刻意没有 `symbol` 字段（符号动态分配），Task 13 的 `drawSheet` 通过 `assignSymbols` 取符号，与 Task 3 的类型定义一致。
