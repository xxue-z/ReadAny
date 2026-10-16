# Phase 1 — 文档编辑 + 标签管理 + MD 导入

## 1.1 Markdown 文件导入

- 新建 `packages/core/src/utils/md-to-epub.ts`：`MdToEpubConverter`，复用 `TxtToEpubConverter` 的 EPUB 打包框架（`buildStoreOnlyZip`、编码检测、元数据生成），差异点：
  - 用已安装的 `marked` + `remark-gfm` 将 Markdown 转为 XHTML
  - `#`/`##` 标题行作为章节边界
  - 代码块用 `<pre><code>` 包裹，表格保留 GFM 结构
- `packages/core/src/types/book.ts`：`BookFormat` 新增 `"md"`
- `packages/app/src/stores/library-store.ts`：三处 `formatMap` 加 `md: "md"`，`BOOK_IMPORT_FILTERS` 加 `"md"`，导入分支加 `ext === "md"` 调 `MdToEpubConverter`
- 移动端同理同步

## 1.2 Markdown 编辑器（新建/编辑文档）

- 新建 `packages/app/src/components/editor/MarkdownEditor.tsx`：
  - 左右分栏：左侧编辑区，右侧 `marked` 实时预览
  - 工具栏：加粗、斜体、标题、列表、引用、链接、图片
  - 保存时调用 `MdToEpubConverter` 生成 EPUB → 走正常导入管线入库
- 新建 `packages/app/src/components/editor/NewDocumentDialog.tsx`：输入标题 → 创建空白 MD 文档
- 入口：书架页 "新建" 按钮、顶部菜单 "File > New"

## 1.3 标签分类管理

### 多标签

Book 已有 `tags: string[]`，增强 UI：
- `BookDetailsDialog` 标签编辑改为 tag input（输入+自动补全已有标签）
- 新增 `TagManager` 组件：增删改标签、标签重命名（同步更新所有关联书籍）

### 文件夹分组

- 新建 `book_groups` 表（`id, name, sortOrder, parentId`），Book 已有 `groupId` 字段
- 书架页左侧增加分组树面板（可折叠）
- 拖拽书籍到分组
- 右键菜单：新建分组、重命名、删除、排序
- 新建 `packages/core/src/db/group-queries.ts`：CRUD 操作
- 新建 `packages/core/src/stores/group-store.ts`

## 关键文件变更

| 文件 | 变更 |
|---|---|
| `packages/core/src/utils/md-to-epub.ts` | **新增** MD→EPUB 转换器 |
| `packages/core/src/types/book.ts` | BookFormat 加 `"md"` |
| `packages/app/src/stores/library-store.ts` | formatMap/导入分支加 md |
| `packages/app/src/components/editor/MarkdownEditor.tsx` | **新增** |
| `packages/app/src/components/editor/NewDocumentDialog.tsx` | **新增** |
| `packages/core/src/db/group-queries.ts` | **新增** |
| `packages/core/src/stores/group-store.ts` | **新增** |
| `packages/app/src/components/library/TagManager.tsx` | **新增** |
| `packages/app/src/components/library/GroupTree.tsx` | **新增** |

## 测试策略

- **MD 转换器**：参考 `umd-parser.test.ts`，用固定 MD 输入验证输出 EPUB 结构
- **标签/分组**：CRUD 操作的 zustand store 测试

## 假设

- MD 编辑器使用 `textarea` + `marked` 左右分栏（不依赖 Monaco，保持包体积小）
- 分组只支持一级（无嵌套子树），与现有 `groupId` 字段兼容
