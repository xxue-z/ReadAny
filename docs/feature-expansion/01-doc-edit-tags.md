# Phase 1 — 文档编辑 + 标签管理 + MD 导入

## 现状核对

以下核对基于 2026-10-16 代码库实际状态，区分"已有/已实现"与"待实现"。

### 已实现（无需新建）

| 功能 | 现有实现 | 说明 |
|---|---|---|
| Book 标签字段 | `Book.tags: string[]`（`packages/core/src/types/book.ts:53`） | 已存在 |
| 标签选择器（桌面） | `TagSelector` 组件（`packages/app/src/components/home/BookDetailsDialog.tsx:1706`） | 已实现 tag input + 自动补全 |
| 标签管理（移动） | `TagManagementSheet` 组件（`packages/app-expo/src/screens/library/TagManagementSheet.tsx:41`） | 增删改标签、重命名（同步更新所有书籍） |
| 标签字段（移动详情） | `TagField` 组件（`packages/app-expo/src/screens/BookDetailsScreen.tsx:1588`） | 已实现 |
| allTags 聚合 | 两个 `library-store` 的 `allTags` 字段，从 books 计算去重 | 已实现 |
| 分组类型 | `BookGroup` 接口（`packages/core/src/types/book.ts:58`） | `id, name, sortOrder, createdAt, updatedAt` — 无 `parentId`（扁平分组） |
| Book 分组字段 | `Book.groupId?: string`（`packages/core/src/types/book.ts:44`） | 已存在 |
| 分组 CRUD | `packages/core/src/db/group-queries.ts` | `getGroups, insertGroup, updateGroup, deleteGroup` |
| 分组管理（Store） | 两个 `library-store` 的 `groups, createGroup, renameGroup, removeGroup, moveBookToGroup` | 已实现 |
| 分组卡片（桌面） | `GroupCard`（`packages/app/src/components/home/GroupCard.tsx:84`） | 已实现 |
| 分组卡片（移动） | `GroupCard`（`packages/app-expo/src/components/library/GroupCard.tsx:142`） | 已实现 |
| 分组选择器（桌面） | `GroupPickerPopover`（`packages/app/src/components/home/`） | 已实现 |
| 分组选择器（移动） | `GroupPickerSheet`（`packages/app-expo/src/components/library/GroupPickerSheet.tsx`） | 已实现 |

### 待实现

| 功能 | 说明 |
|---|---|
| MD 文件导入 → EPUB | 新建 `MdToEpubConverter`，走 `buildStoreOnlyZip` 打包 |
| MD 编辑器（桌面） | 复用现有 tiptap `MarkdownEditor`，增加两文件存储模型 |
| MD 编辑器（移动） | 新建轻量 MD 编辑器（移动端 tiptap 体积过大） |
| 新建文档入口 | 书架/资料库按钮入口 |

---

## 1.1 Markdown 文件导入

### 转换器

新建 `packages/core/src/utils/md-to-epub.ts`：`MdToEpubConverter`，参考 `UmdToEpubConverter`（`packages/core/src/utils/umd-to-epub.ts:208`）模式：

- 用已安装的 `marked` 将 Markdown 转为 XHTML（**不用** `remark-gfm`，项目无此依赖）
- `#`/`##` 标题行作为章节边界切分
- 代码块用 `<pre><code>` 包裹，表格保留 GFM 结构（marked 原生支持）
- 复用 `buildStoreOnlyZip`（`packages/core/src/utils/store-only-zip.ts:22`）打包为 EPUB ZIP
- 复用 `TxtToEpubConverter` 的 XHTML 模板（container.xml、content.opf、toc.ncx 等），差异仅在章节内容由 marked 渲染而非纯文本 escape

### 类型

`packages/core/src/types/book.ts`：`BookFormat` 新增 `"md"`

### 导入管线

- `packages/app/src/stores/library-store.ts`：`formatMap` 加 `md: "md"`，导入分支加 `ext === "md"` 调 `MdToEpubConverter`
- `packages/app/src/lib/library/open-book.ts`：`BOOK_IMPORT_FILTERS` 加 `"md"`
- `packages/app-expo/src/stores/library-store.ts`：同上同步

---

## 1.2 Markdown 编辑器（新建/编辑文档）

### 存储模型

每个"MD 文档"在磁盘上存两个文件：

```
books/{bookId}.md    ← 源文件（Markdown 原文），编辑器读写
books/{bookId}.epub  ← 派生文件（EPUB），由 MdToEpubConverter 从 .md 生成
```

- `Book.filePath` 指向 `.epub` 文件（阅读器打开它）
- 编辑器始终读写 `.md` 文件（`filePath.replace(/\.epub$/, ".md")`）
- 保存时：写 `.md` → 调 `MdToEpubConverter` 重新生成 `.epub` → 更新 Book 元数据

### 桌面端

复用现有 tiptap `MarkdownEditor` 组件（`packages/app/src/components/ui/markdown-editor.tsx:37`）：

- 基于 `@tiptap/extension-markdown` 的所见即所得编辑器，已有工具栏（加粗、斜体、标题、列表、引用、链接、图片、撤销/重做）
- 增加 MD 文档模式：从 `.md` 文件读取 → tiptap 编辑 → 写回 `.md` → 触发 EPUB 重生成
- 不需要左右分栏预览（tiptap 本身是 WYSIWYG）

### 移动端

新建轻量 MD 编辑器组件（tiptap 体积过大，不适合移动端）：

- 新建 `packages/app-expo/src/components/editor/MarkdownEditor.tsx`
- 方案：`TextInput`（multiline）编辑区，可选 `marked` 渲染预览（底部 Sheet 或切换 tab）
- 工具栏：加粗、斜体、标题、列表、链接（插入 Markdown 语法标记）
- 保存逻辑同桌面：写 `.md` → 调 `MdToEpubConverter` 生成 `.epub` → 更新 Book

### 入口

- 桌面：书架页/侧栏"新建文档"按钮 → 弹出标题输入 → 创建空白 `.md` 文件 → 打开编辑器
- 移动：资料库页 FAB / 右上角 "+" → 同流程
- **不用** "File > New" 菜单项（项目没有传统菜单栏）

---

## 1.3 标签分类管理 ✅ 已有/已实现

标签和分组功能已在现有代码中完整实现，本节仅记录现有实现供参考，**无需新建任何代码**。

### 标签

- **数据模型**：`Book.tags: string[]`（`packages/core/src/types/book.ts:53`）
- **桌面编辑**：`TagSelector` 组件（`packages/app/src/components/home/BookDetailsDialog.tsx`）— tag input + 已有标签自动补全
- **移动编辑**：`TagField`（`packages/app-expo/src/screens/BookDetailsScreen.tsx`）+ `TagManagementSheet`（`packages/app-expo/src/screens/library/TagManagementSheet.tsx`）— 增删改标签、重命名同步更新所有关联书籍
- **聚合**：两个 `library-store` 的 `allTags` 从 `books` 实时计算去重

### 分组

- **数据模型**：`BookGroup`（`packages/core/src/types/book.ts:58`）— `id, name, sortOrder, createdAt, updatedAt`。扁平结构，不支持嵌套（无 `parentId`）
- **Book 关联**：`Book.groupId?: string`（`packages/core/src/types/book.ts:44`）
- **CRUD**：`packages/core/src/db/group-queries.ts` — `getGroups, insertGroup, updateGroup, deleteGroup`
- **Store**：两个 `library-store` 均有 `groups, createGroup, renameGroup, removeGroup, moveBookToGroup, moveBooksToGroup`
- **桌面 UI**：`GroupCard`（`packages/app/src/components/home/GroupCard.tsx`）+ `GroupPickerPopover`
- **移动 UI**：`GroupCard`（`packages/app-expo/src/components/library/GroupCard.tsx`）+ `GroupPickerSheet`

---

## 关键文件变更

| 文件 | 变更 | 状态 |
|---|---|---|
| `packages/core/src/utils/md-to-epub.ts` | **新增** MD→EPUB 转换器（marked + buildStoreOnlyZip） | 待实现 |
| `packages/core/src/types/book.ts` | `BookFormat` 加 `"md"` | 待实现 |
| `packages/app/src/stores/library-store.ts` | `formatMap`/导入分支加 `md` | 待实现 |
| `packages/app/src/lib/library/open-book.ts` | `BOOK_IMPORT_FILTERS` 加 `"md"` | 待实现 |
| `packages/app-expo/src/stores/library-store.ts` | `formatMap`/导入分支加 `md` | 待实现 |
| `packages/app/src/components/ui/markdown-editor.tsx` | 增加 MD 文档读写模式（复用现有 tiptap） | 待修改 |
| `packages/app-expo/src/components/editor/MarkdownEditor.tsx` | **新增** 移动端轻量 MD 编辑器 | 待实现 |
| `packages/core/src/types/book.ts` | `BookGroup` 已存在，无需修改 | ✅ 已有 |
| `packages/core/src/db/group-queries.ts` | 已存在，无需修改 | ✅ 已有 |
| `packages/app/src/components/home/BookDetailsDialog.tsx` | `TagSelector` 已存在，无需修改 | ✅ 已有 |
| `packages/app-expo/src/screens/library/TagManagementSheet.tsx` | 已存在，无需修改 | ✅ 已有 |

---

## 测试策略

- **MD 转换器**：参考 `packages/core/src/utils/txt-to-epub.test.ts` 和 `packages/core/src/utils/umd-to-epub.test.ts`，用固定 MD 输入验证输出 EPUB 结构（章节数、XHTML 内容、元数据）
- **MD 编辑器**：保存→EPUB 重生成→Book 更新 的端到端流程测试
- **标签/分组**：已有测试覆盖，无需新增

---

## 假设

- MD 转换用 `marked`（项目已有依赖），不用 `remark-gfm`（项目无此依赖）。marked 原生支持 GFM 表格、代码块
- 桌面 MD 编辑器复用现有 tiptap `MarkdownEditor`（`packages/app/src/components/ui/markdown-editor.tsx`），不新建 textarea+mared 分栏组件。tiptap 本身是 WYSIWYG，无需额外预览
- 移动端不引入 tiptap（体积过大），新建轻量 `TextInput` + 可选 marked 预览方案
- 分组为扁平结构，不支持嵌套（`BookGroup` 无 `parentId` 字段）
- 每篇 MD 文档存两个文件：`books/{id}.md`（源）+ `books/{id}.epub`（派生），`Book.filePath` 指向 epub
- 新建文档入口为书架/资料库按钮，非菜单栏（项目无传统 File 菜单）
- `MdToEpubConverter` 遵循 `UmdToEpubConverter` 的 `convertToBytes` 接口模式，不引入新的抽象层
