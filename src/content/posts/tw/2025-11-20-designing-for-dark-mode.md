---
title: "暗色模式設計 — 字型、色彩與層次"
date: 2025-11-20
lang: zh-tw
image: "https://images.unsplash.com/photo-1550684376-efcbd6e3f031?w=1200"
category: "Design"
subcategory: "Typography"
tags: ["design", "dark-mode", "typography", "ui"]
featured: true
---

暗色模式不是簡單地把白色背景改成黑色。

## 為什麼暗色模式更「累」

人眼在暗背景上辨認淺色文字時瞳孔放大，景深變淺。因此文字不能太細、不能太白。

## 核心原則

1. **不要用純黑**：`#000` 太刺眼，用 `#0a0a0c`
2. **文字不要純白**：`#f5f5f7` 比 `#fff` 更舒適
3. **字重適當上調**：SF Pro 在暗色下應當用 Medium 替代 Regular
4. **陰影變邊框**：暗色下 `box-shadow` 幾乎不可見，改用 `border` 或 glow

## 色彩系統

飽和度要降低 10-15%。同一色相在暗背景上感知飽和度更高。

## 總結

暗色模式的難點不是顏色，是光。
