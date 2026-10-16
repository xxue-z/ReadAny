# Phase 2 — 跨格式全量笔记

## 2.1 PDF 高亮与笔记

- `packages/core/src/pdf/chapter.ts` 已有 `listPdfPagesFromBookFile` / `readPdfPageFromBookFile`
- 扩展到支持 PDF 文本选择和位置定位：
  - PDF 页面渲染层增加文本选区能力（基于 pdf.js 的 `getTextContent()`）
  - 高亮位置用 `pageNumber + textQuadPoints` 替代 EPUB 的 CFI
- `packages/core/src/types/annotation.ts`：`Highlight` 类型扩展 `location` 字段（联合类型 `{ type: "epub"; cfi: string } | { type: "pdf"; page: number; quads: number[] }`）
- 数据库 migration：`highlights` 表新增 `location_type`、`location_data` 列

## 2.2 CBZ/TXT/MD 笔记

- CBZ（漫画）：不支持文本高亮，但支持页面级笔记卡片
- TXT/MD：已转为 EPUB，天然继承 EPUB 的完整笔记能力
- 笔记 UI 增加格式感知：非文本格式显示 "页面笔记" 而非文本高亮

## 关键文件变更

| 文件 | 变更 |
|---|---|
| `packages/core/src/types/annotation.ts` | Highlight.location 联合类型 |
| `packages/core/src/reader/selection-note.ts` | PDF 选区能力 |
| `packages/core/src/db/database.ts` | migration: highlights 表加 location 列 |
| `packages/app/src/components/reader/FoliateViewer.tsx` | PDF 高亮+笔记交互 |

## 测试策略

- **PDF 笔记**：pdf.js `getTextContent` 位置计算的单元测试

## 假设

- PDF 高亮位置使用 pdf.js 的 `TextContent` + `getBoundingRect`
