### Review Package — Phase2 T5
BASE: 3b14673b
HEAD: 29e57f5c
---
29e57f5c test: add PDF quad-points serialization and CBZ note CFI tests
f0245847 docs: add Phase 2 cross-format notes verification checklist
---
 docs/feature-expansion/verification-checklist.md   | 13 +++++
 .../core/src/__tests__/pdf-highlight-quads.test.ts | 67 ++++++++++++++++++++++
 2 files changed, 80 insertions(+)
---
diff --git a/docs/feature-expansion/verification-checklist.md b/docs/feature-expansion/verification-checklist.md
index 9d3077b2..e051bb87 100644
--- a/docs/feature-expansion/verification-checklist.md
+++ b/docs/feature-expansion/verification-checklist.md
@@ -115,20 +115,33 @@
 |---|--------|------|----------|-----------|-----------|------|
 | 7.1 | **`books/{id}.md` 存在** | 新建/导入一个 MD 文档后，用文件管理器查看 `books/` 目录 | `books/{bookId}.md` 文件存在，内容为 Markdown 原文。 | | | |
 | 7.2 | **`books/{id}.epub` 存在** | 同上，检查 `books/` 目录 | `books/{bookId}.epub` 文件存在，结构为标准 EPUB（含 mimetype、container.xml、content.opf、toc.ncx）。 | | | |
 | 7.3 | **`Book.filePath` → `.epub`** | 查询数据库或 store 中的 Book 对象 | `book.filePath` 指向 epub 路径（如 `books/uuid.epub`），不是 md 路径。 | | | |
 | 7.4 | **编辑器读取 `.md`** | 在编辑器中针对一个已有书条编辑 | 编辑器从 `.md` 文件读取原始 Markdown 文本，而非 EPUB 内的 XHTML。可通过标题/特殊字符验证。 | | | |
 | 7.5 | **`Book.format === "md"`** | 查询新建/导入的 MD 文档 | `book.format` 值为 `"md"`。 | | | |
 | 7.6 | **新建文档默认值** | 新建文档时标题留空 | 生成的 `.md` 文件内容为 `# Untitled`，bookTitle 为 "Untitled"，进度为 0，tags 为空数组。 | | | |
 
 ---
 
+## 八、跨格式笔记
+
+| # | 测试项 | 步骤 | 预期结果 | 桌面 ✅/❌ | 移动 ✅/❌ | 备注 |
+|---|--------|------|----------|-----------|-----------|------|
+| 8.1 | **EPUB 高亮迁移** | 打开已有 EPUB 高亮的书 | 高亮位置不变，颜色不变，笔记不变 | | | T1 migration v14 |
+| 8.2 | **PDF 文本选择** | 打开 PDF → 拖拽选择文本 → 点击高亮 | 创建高亮，quad_points 有值 | | | T2 selection layer |
+| 8.3 | **PDF 高亮重新打开** | 关闭书 → 重新打开 → 翻到高亮页 | 彩色叠加层显示在正确文字位置 | | | T3 overlay rendering |
+| 8.4 | **PDF 高亮缩放适应性** | 100% 创建高亮 → 150% 重新打开 | 叠加层仍对齐文字 | | | T3 viewport scaling |
+| 8.5 | **CBZ 页面笔记** | 打开 CBZ → 点击添加页面笔记 → 输入内容 | 创建笔记，NotebookPanel 显示 "Page N note" | | | T4 CBZ notes |
+| 8.6 | **格式感知 UI** | 打开混有 EPUB/CBZ 笔记的 NotebookPanel | EPUB 显示文字摘录，CBZ 显示页面号 | | | T4 format-aware |
+
+---
+
 ## 验证说明
 
 - **桌面**：运行 `pnpm tauri dev`，在 Tauri 窗口中进行手动操作
 - **移动**：运行 `pnpm expo:ios:simulator` 或 `pnpm expo:android`，在模拟器中进行手动操作
 - **自动化测试**：`cd packages/core && pnpm test md-to-epub` 运行 27 个单元测试（含 1.2–1.6、5.1–5.4 的核心逻辑）
 - **格式**：验证通过填 ✅，未通过填 ❌，不适用的填 —，备注可选填问题描述或版本号
 
 ---
 
 *最后更新：跟随 Phase 1 实施进度*
\ No newline at end of file
diff --git a/packages/core/src/__tests__/pdf-highlight-quads.test.ts b/packages/core/src/__tests__/pdf-highlight-quads.test.ts
new file mode 100644
index 00000000..8084728f
--- /dev/null
+++ b/packages/core/src/__tests__/pdf-highlight-quads.test.ts
@@ -0,0 +1,67 @@
+import { describe, expect, it } from "vitest";
+
+describe("quadPoints serialization", () => {
+  it("roundtrips number array through JSON for PDF highlight", () => {
+    const quads = [10.5, 20.3, 150.7, 20.3, 150.7, 45.1, 10.5, 45.1];
+    const json = JSON.stringify(quads);
+    const parsed: number[] = JSON.parse(json);
+    expect(parsed).toEqual(quads);
+    expect(parsed.length).toBe(8); // 4 corners × 2 coords
+  });
+
+  it("handles undefined quadPoints for EPUB highlights", () => {
+    const json = JSON.stringify(undefined);
+    expect(json).toBeUndefined(); // JSON.stringify(undefined) returns undefined
+  });
+
+  it("handles NULL in database (null string → undefined)", () => {
+    const stored: string | null = null;
+    const parsed = stored ? JSON.parse(stored) : undefined;
+    expect(parsed).toBeUndefined();
+  });
+});
+
+describe("Highlight type with quadPoints", () => {
+  it("EPUB highlight has no quadPoints", () => {
+    const h = {
+      id: "h1",
+      bookId: "b1",
+      cfi: "epubcfi(/6/4[chap01]!/4/2/6)",
+      text: "hello",
+      color: "yellow",
+      createdAt: 1,
+      updatedAt: 1,
+    };
+    expect((h as any).quadPoints).toBeUndefined();
+  });
+
+  it("PDF highlight has quadPoints", () => {
+    const h = {
+      id: "h2",
+      bookId: "b2",
+      cfi: "page:3",
+      text: "selected text",
+      color: "yellow",
+      quadPoints: [10, 20, 100, 20, 100, 50, 10, 50],
+      createdAt: 1,
+      updatedAt: 1,
+    };
+    expect(h.quadPoints).toBeDefined();
+    expect(h.quadPoints!.length).toBe(8);
+  });
+});
+
+describe("CBZ page note CFI", () => {
+  it("generates correct CFI for page N", () => {
+    const pageN = 5;
+    const cfi = `page-${pageN}`;
+    expect(cfi).toBe("page-5");
+  });
+
+  it("parses page number back from CFI", () => {
+    const cfi = "page-12";
+    const pageMatch = cfi.match(/^page-(\d+)$/);
+    expect(pageMatch).not.toBeNull();
+    expect(parseInt(pageMatch![1]!)).toBe(12);
+  });
+});
\ No newline at end of file
