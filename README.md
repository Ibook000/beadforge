# 🧸 Picabead · 拼豆图纸生成器

> 把喜欢的照片、头像，变成一颗一颗的彩色拼豆图纸。完全在你的浏览器里完成，**不上传任何服务器**。

![Picabead Logo](public/logo.png)

**在线体验**（GitHub Pages 自动部署）：
- **GitHub Pages**：https://ibook000.github.io/beadforge/
- **Vercel**：https://perler-bead-drab.vercel.app
- **EdgeOne**：`beadforge.zh-cn.edgeone.cool`（需在 EdgeOne 控制台关闭部署保护）

---

## ✨ 功能

### 🎯 生成图纸
- 拖拽/点击上传图片，自动生成拼豆图纸
- **颗粒度可调**：10–200 格自由调节，钥匙扣 / 单板 / 四板 / 大图预设
- **实时尺寸回显**：`29 × 34 格 · 986 颗 · 5mm 豆 ≈ 14.5 × 17.0 cm · 需 1×2 块底板`
- 图像预处理：亮度 / 对比度 / 饱和度 / 裁剪 / 旋转 / 翻转

### 🎨 五套主流色卡
| 色卡 | 色数 | 尺寸 |
|------|------|------|
| **MARD（漫漫 / COCO 系）** | 291 色 | 5mm |
| Artkal S | 199 色 | 5mm |
| Artkal C | 174 色 | 2.6mm |
| Perler | 103 色 | 5mm |
| Hama | 92 色 | 5mm |

### 🧩 拼图辅助（实拼时最有用）
- **同色高亮**：点击统计表格某色 → 图纸上所有同色格子呼吸闪烁，其他色自动变淡，一眼看到要拼哪里
- **全屏拼豆模式**：`⛶` 按钮整屏显示图纸，**滚轮缩放**（25%–400%）、**拖拽平移**，方便对照实拼
- **全屏右侧面板**：颜色列表，点击即高亮对应色号
- **批量替换颜色**：粉色「替换」按钮，把某色全部替换为当前画笔色，可撤销

### 🔧 核心算法
- **CIEDE2000 感知色差匹配**（Sharma/Wu/Dalal 2005，官方 34 组测试数据验证）
- **Median-cut Lab 量化**：先量化出最接近的 N 个颜色再匹配
- **三种降采样**：区域平均（细腻）/ 中位数（抗噪）/ 最近邻（像素画）
- **两种抖动**：Atkinson / Floyd–Steinberg（linear RGB 空间累加误差）
- **去孤点**：3×3 窗口内孤立单颗自动归并到众数色

### ✏️ 轻量编辑
- 单格改色（点击或拖动连续涂）
- 吸管取色（`Alt` + 点击）
- 撤销重做（`⌘Z` / `⌘⇧Z`）
- 手改存在管线之上的 patch 层，调亮度重跑管线后手改保留

### 📊 统计
- 每色颗数、占比、累计占比
- 按颗数 / 色号排序
- 点击表格行 = 设为画笔 + 高亮同色

### 📤 导出
- **PNG**：高清图纸 + 色号图例（每格色块 + 色号 + 数量）
- **PDF**：A4 分页打印，带拼接指引与总览用量页，矢量格子不模糊
- **CSV**：采购清单（色号 / 名称 / RGB / 颗数 / 占比）
- 导出文件默认用**上传图片的原名**命名
- 图纸 / 网站背景带 **IBO0OK 水印**

### 💾 存档
- localStorage 自动保存参数与手动修改
- 刷新 / 关闭浏览器后自动恢复

---

## 🚀 快速开始

```bash
npm install
npm run dev
```

浏览器打开 http://localhost:5173

> 本地开发无需先跑 `palettes`——色卡数据已在仓库中（`src/palette/data/*.ts`）。只有需要从上游更新色卡时才运行 `npm run palettes`。

## 🧪 测试

```bash
npm test        # 运行全部测试
```

## 📦 构建

```bash
npm run build
```

产物在 `dist/` 目录：

```
dist/
├── index.html              ← 3KB（纯 HTML 入口）
├── logo.png                ← 拼豆小熊 logo
└── assets/
    ├── index-*.js          ← 应用逻辑 + 色卡数据
    ├── index-*.css         ← 样式
    └── *.js                ← 依赖库
```

### 部署到任意静态托管

因为 `index.html` 很薄（3KB），JS 拆分独立文件，**任何静态托管平台都能正确渲染**（不会像"全内联单文件 900KB"那样被误判为纯文本）。

把 `dist/` 里的**所有文件**一起上传即可。

## ⚙️ CI/CD

`.github/workflows/deploy.yml` 已配置：**push 到 `main` 分支自动构建并部署到 GitHub Pages**。

## 🎨 设计取舍

**抖动默认关闭。** 误差扩散在屏幕上看着平滑，但在拼豆上每一颗孤立噪点都是一次实打实的手工劳动，拼出来往往比轻微色带更难看。需要时可开 Atkinson（只扩散 3/4 误差，平面更干净）或 Floyd–Steinberg。

**降采样用区域平均而非最近邻。** 降到 29×29 是极端压缩，最近邻会整个丢掉特征（一只眼睛可能凭空消失）。代价是细线条会糊，所以另提供中位数和最近邻。

**色数上限在匹配之前生效。** 先在 Lab 空间 median-cut 出 N 个代表色，再各自匹配到调色板，比"先全量匹配再合并相近豆号"效果好一个档次。

**去孤点是算法问题，不是让用户手动擦。** 3×3 窗口内完全孤立的单颗豆自动归并到众数色。

**PDF 里的格子是矢量。** 色号全是 ASCII，不需要嵌入中文字体；只有中文页眉和图例名走小图片。同一张图纸的 PDF 因此从 13 MB 降到 0.13 MB，且放大不糊。

## ⚠️ 已知限制

- **屏幕颜色与实物豆子存在色差**（塑料材质、批次、光照、显示器校准都有影响）。色号是权威标识，颜色仅供参考，建议对照实体色卡确认。
- 各拼豆品牌**没有官方统一编号标准**，跨品牌只能靠 HEX/Lab 换算。
- 中文颜色名为程序按色相自动生成（常用色人工校对过），仅作辅助。
- 存档基于 localStorage（约 5 MB）。原图过大时只保存参数和手动修改，恢复时需重新选择图片。
- 改变颗粒度或切换色卡会让格子下标失去意义，因此会丢弃手动修改（会先弹确认）。

## 🙏 致谢

- 色卡数据来自 [maxcleme/beadcolors](https://github.com/maxcleme/beadcolors)（MIT）。详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- 项目结构参考 [g1111yn/Perler-Bead-Pattern-Generator](https://github.com/g1111yn/Perler-Bead-Pattern-Generator)

## 📄 文档

- 设计文档：[docs/superpowers/specs/2026-08-09-pindou-pattern-generator-design.md](docs/superpowers/specs/2026-08-09-pindou-pattern-generator-design.md)
- 实现计划：[docs/superpowers/plans/2026-08-09-pindou-pattern-generator.md](docs/superpowers/plans/2026-08-09-pindou-pattern-generator.md)
- EdgeOne 部署：[EDGEONE_DEPLOY.md](EDGEONE_DEPLOY.md)