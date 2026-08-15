/**
 * 从 maxcleme/beadcolors (MIT) 的 v3 CSV 生成色卡 TS 常量。
 * 运行：npm run palettes
 *
 * v3 CSV 列：
 *   reference_code, name, symbol, rgb_r, rgb_g, rgb_b,
 *   hsl_h, hsl_s, hsl_l, lab_l, lab_a, lab_b, contributor
 *
 * 我们只取 code / name / rgb，Lab 自己算 —— 保证与运行时 rgbToLab 完全一致。
 * 否则匹配用的 Lab 和数据里存的 Lab 会有微小偏差，测试也没法互相校验。
 * symbol 列直接丢弃：那是机器按 ASCII 码序生成的，人眼分不清。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rgbToLab, rgbToHex, type RGB } from '../src/color/space.ts';
import { ZH_NAME_OVERRIDES } from './zh-name-overrides.ts';

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
  const [r, g, b] = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 || l === 0 || l === 1 ? 0 : d / (1 - Math.abs(2 * l - 1));

  if (s < 0.08) {
    if (l > 0.93) return '白';
    if (l > 0.8) return '亮灰';
    if (l > 0.66) return '浅灰';
    if (l > 0.45) return '中灰';
    if (l > 0.28) return '深灰';
    if (l > 0.12) return '暗灰';
    return '黑';
  }

  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;

  const HUES: Array<[number, string]> = [
    [10, '红'], [22, '朱红'], [33, '橙'], [45, '橘黄'], [55, '金黄'],
    [68, '黄'], [80, '黄绿'], [100, '嫩绿'], [140, '绿'], [160, '青绿'],
    [175, '碧绿'], [190, '青'], [205, '天青'], [225, '湛蓝'], [250, '蓝'],
    [275, '蓝紫'], [295, '紫'], [320, '紫红'], [345, '品红'], [361, '红'],
  ];
  const hue = HUES.find(([bound]) => h < bound)?.[1] ?? '红';

  // 明度与饱和度各出一个前缀，组合起来约 270 种，摊在 291 色上够用
  const lightness =
    l > 0.88 ? '极浅' : l > 0.76 ? '浅' : l > 0.6 ? '亮' : l > 0.34 ? '' : l > 0.18 ? '深' : '暗';
  const chroma = s < 0.28 ? '灰' : s > 0.85 ? '艳' : '';
  return `${lightness}${chroma}${hue}`;
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

async function main(): Promise<void> {
  mkdirSync(resolve(ROOT, 'src/palette/data'), { recursive: true });

  for (const src of SOURCES) {
    const res = await fetch(`${BASE}/${src.file}.csv`);
    if (!res.ok) throw new Error(`拉取 ${src.file}.csv 失败：HTTP ${res.status}`);
    const rows = parseCsv(await res.text());

    const beads = rows.map((row) => {
      const hex = rgbToHex(row.rgb);
      const lab = rgbToLab(row.rgb);
      return {
        code: row.code,
        name: row.name,
        nameZh: ZH_NAME_OVERRIDES[hex] ?? autoZhName(row.rgb),
        hex,
        rgb: row.rgb,
        lab: [
          Number(lab[0].toFixed(4)),
          Number(lab[1].toFixed(4)),
          Number(lab[2].toFixed(4)),
        ],
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
  beads: ${JSON.stringify(beads, null, 2).replace(/\n/g, '\n  ')},
};
`;
    writeFileSync(resolve(ROOT, `src/palette/data/${src.id}.ts`), body, 'utf8');
    console.log(`${src.id}: ${beads.length} 色`);
  }
}

await main();
