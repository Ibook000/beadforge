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

以下内容为本项目自行生成，不属于上述数据：

- 中文颜色名 `nameZh`（`scripts/build-palettes.ts` 按色相自动生成，常用色人工校对）
- 图纸符号（`src/palette/symbols.ts` 按每张图纸实际用色动态分配）

上游 CSV 自带的 `symbol` 列未被采用 —— 那是按 ASCII 码序机器分配的，人眼无法区分。

## CIEDE2000 测试数据

`src/color/ciede2000-testdata.ts` 取自：

Sharma, G., Wu, W. & Dalal, E.N. (2005), "The CIEDE2000 color-difference
formula: Implementation notes, supplementary test data, and mathematical
observations", *Color Research & Application*, 30(1), 21-30.

https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/

## 运行时依赖

- **jsPDF** — MIT License，用于 PDF 分页导出
