---
title: "Designing for Dark Mode — Typography, Color, and Depth"
titleZh: "暗色模式设计 — 字体、色彩与层次"
date: 2025-11-20
lang: zh
image: "https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=1200"
category: "Design"
subcategory: "Typography"
tags: ["design", "dark-mode", "typography", "ui"]
featured: false
---

暗色模式不是简单地把白色背景改成黑色。

## 为什么暗色模式更「累」

人眼在暗背景上辨认浅色文字时瞳孔放大，景深变浅。因此文字不能太细、不能太白。

## 核心原则

1. **不要用纯黑**：`#000` 太刺眼，用 `#0a0a0c`
2. **文字不要纯白**：`#f5f5f7` 比 `#fff` 更舒适
3. **字重适当上调**：SF Pro 在暗色下应当用 Medium 替代 Regular
4. **阴影变边框**：暗色下 `box-shadow` 几乎不可见，改用 `border` 或 glow

## 色彩系统

饱和度要降低 10-15%。同一色相在暗背景上感知饱和度更高。

## 总结

暗色模式的难点不是颜色，是光。
