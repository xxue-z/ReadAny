# Flow Review — codex/feature-expansion PRD 走查报告

> 审查时间：2026-11-02
> 对照 PRD：
> - `docs/feature-expansion/01-doc-edit-tags.md` (Phase 1)
> - `docs/feature-expansion/02-cross-format-notes.md` (Phase 2)
> - `docs/feature-expansion/03-ai-quiz.md` (Phase 3)

---

## 流程 1：MD 文件导入 ✅ 通过

**追踪路径：**
用户拖拽 .md → `open-book.ts` BOOK_IMPORT_FILTERS → `library-store.ts` importBooks → `md-to-epub.ts` MdToEpubConverter → `store-only-zip.ts` buildStoreOnlyZip → 写 .md + .epub → Book 记录 (format: "md")

| 验证点 | 结果 | 位置 |
|--------|------|------|
| BOOK_IMPORT_FILTERS 含 md | ✅ | `open-book.ts:63` — `extensions: ["epub", ..., "md", "umd"]` |
| BookFormat 含 "md" | ✅ | `book.ts:38` — `"md"` |
| formatMap 含 md | ✅ | 桌面 `library-store.ts:408`，移动 `library-store.ts:358` |
| MdToEpubConverter.convertToBytes | ✅ | `md-to-epub.ts:243` — 使用 marked GFM → buildStoreOnlyZip |
| 双文件写入 (.md + .epub) | ✅ | 桌面 `library-store.ts:487-490`；移动 `library-store.ts:489, 1231` |
| filePath 指向 .epub | ✅ | 桌面 `library-store.ts:485` — `relPath = books/${bookId}.epub` |
| 去重检测 | ✅ | 桌面 `library-store.ts:946-953` (by fileHash) + `1016-1023` (MD 二次确认)；移动同逻辑 |

**注意:** 如果文件 hash 计算失败（fileHash 为 undefined），首次去重不触发，MD 二次去重也不会触发。这是一个极低概率边缘情况——hash 计算失败通常意味文件不可读，导入本身也会失败。

---

## 流程 2：新建+编辑 MD 文档（桌面） ✅ 通过

**追踪路径：**
点"新建文档" → createDocument → MdToEpubConverter → 写双文件 → 打开 DocumentWorkspace → 编辑 → saveDocument → 重新生成 EPUB → 更新 Book 元数据

| 验证点 | 结果 | 位置 |
|--------|------|------|
| "新建文档"入口 | ✅ | `DesktopImportActions.tsx:842-853` — 调用 createDocument → addTab(type: "document") |
| createDocument 写 .md + .epub | ✅ | `library-store.ts:1438-1441` — 写入 epubPath 和 mdPath |
| Book.format = "md" | ✅ | `library-store.ts:1445` |
| DocumentWorkspace 读 .md 源文件 | ✅ | `DocumentWorkspace.tsx:34-37` — readFile(mdPath), TextDecoder |
| DocumentWorkspace 使用 MarkdownEditor (tiptap) | ✅ | `DocumentWorkspace.tsx:134` |
| 保存：写 .md → 重新生成 .epub | ✅ | `saveDocument` → `library-store.ts:1459-1478` — writeFile(mdPath) 和 writeFile(epubPath) |
| 更新 Book 元数据（Title） | ✅ | `library-store.ts:1474-1477` — 如果标题变化则 updateBook |
| 自动保存 3s debounce | ✅ | `DocumentWorkspace.tsx:82-88` — setTimeout 3000ms |
| 从书架打开 MD 书 → 进编辑器 | ✅ | `open-book.ts:162-174` — `book.format === "md"` → addTab(type: "document") |
| AppLayout 渲染 DocumentWorkspace | ✅ | `AppLayout.tsx:135, 421` — filter tabs by type "document" |

---

## 流程 3：新建+编辑 MD 文档（移动） ✅ 通过

**追踪路径：**
模拟导入/新建 → createDocument → 打开 DocumentEditorScreen → 工具栏插入语法 → 编辑/预览切换 → 保存+自动保存 → 返回书架可打开阅读

| 验证点 | 结果 | 位置 |
|--------|------|------|
| 路由注册 | ✅ | `RootNavigator.tsx:132-136` — DocumentEditor screen |
| 入口：新建文档 → createDocument | ✅ | `LibraryScreen.tsx:1170-1173` → createDocument → navigate("DocumentEditor") |
| createDocument (移动) 写双文件 | ✅ | `library-store.ts:1667-1697` — 写入 .epub + .md |
| 编辑器读取 .md 源文件 | ✅ | `DocumentEditorScreen.tsx:221-227` |
| 工具栏 6 按钮: B / I / H1 / H2 / • / 🔗 | ✅ | `DocumentEditorScreen.tsx:362-398` |
| 语法插入正确 | ✅ | B=`**...**`, I=`*...*`, H1=`\n# `, H2=`\n## `, •=`\n- `, 🔗=`[...](url)` |
| 编辑/预览切换 | ✅ | `DocumentEditorScreen.tsx:332-338` — EyeIcon/EditIcon toggle |
| 自动保存 3s debounce | ✅ | `DocumentEditorScreen.tsx:242-248` |
| App 后台自动保存 | ✅ | `DocumentEditorScreen.tsx:260-273` — AppState "background"/"inactive" |
| 保存流程：写 .md → 生成 .epub | ✅ | `saveDocument` at `library-store.ts:1699-1719` |

---

## 流程 4：PDF 高亮 ⚠️ 有警告

**追踪路径：**
打开 PDF → 拖拽选文本 → createPdfTextSelector 捕获 quadPoints → 创建 Highlight → 存储 quad_points 列 → drawPdfHighlight 渲染 SVG 叠加层 → 重新打开仍可见

| 验证点 | 结果 | 位置 / 说明 |
|--------|------|------------|
| createPdfTextSelector | ✅ | `FoliateViewer.tsx:293-498` — 鼠标拖拽选文本，计算 quadPoints |
| quadPoints 存储为 PDF 页面坐标空间 | ✅ | `FoliateViewer.tsx:470-480` — viewport coords → PDF coords 转换（逆变换） |
| Highlight.quadPoints? 类型 | ✅ | `annotation.ts:25` — `quadPoints?: number[]` |
| 数据库 migration (quad_points 列) | ✅ | `db-core.ts:705-710` — ALTER TABLE highlights ADD COLUMN quad_points TEXT |
| insertHighlight 写入 quad_points | ✅ | `highlight-queries.ts:162-164` — JSON.stringify |
| getHighlights 读取 quad_points | ✅ | `highlight-queries.ts:35` — JSON.parse |
| drawPdfHighlight SVG 渲染 | ✅ | `FoliateViewer.tsx:2293-2373` — 创建 SVG overlay，PDF coords × scale → viewport coords |
| 重新打开仍可见 (highlight sync) | ✅ | `ReaderView.tsx:735-786` — 100ms debounce 同步，isPdf 分支 render |
| EPUB 高亮流程未被破坏 | ✅ | `ReaderView.tsx:767-773` — else 分支走 foliate addAnnotation |
| **CFI 格式与 PRD 设计差异** | ⚠️ | 见下方详述 |

### ⚠️ CFI 格式设计差异

**PRD 设计**（`02-cross-format-notes.md:9`）：
```
location 字段（联合类型）：
{ type: "epub"; cfi: string } | { type: "pdf"; page: number; quads: number[] }
```

**实际实现**：
- 实际代码没有创建 `location` 联合类型
- PDF 高亮使用 `quadPoints` 字段（`annotation.ts:25`）+ 伪造的 EPUB CFI 格式 `epubcfi(/6/{(pageIndex+1)*2})`（`FoliateViewer.tsx:2524`）
- 高亮同步时，通过 `isPdf = !!h.quadPoints`（`ReaderView.tsx:742`）判断是 PDF 高亮，再从 CFI 反推 pageIndex（`ReaderView.tsx:746-748`）

**影响评估**：功能正确运行——quadPoints 在 PDF 坐标空间存储，渲染时正确转换。但不符合 PRD 指定的 `location` 联合类型设计，未来扩展 PDF 专用功能时可能需要重构。

---

## 流程 5：CBZ 页面笔记 ✅ 通过

**追踪路径：**
打开 CBZ → 点"添加页面笔记" → 创建 Note（cfi=page-N） → 存储到 notes 表 → NotebookPanel 显示 "Page N Note" → 点击导航到对应页

| 验证点 | 结果 | 位置 |
|--------|------|------|
| 只在 CBZ 格式显示笔记按钮 | ✅ | `ReaderToolbar.tsx:145, 233` — `bookFormat === "CBZ"` |
| 格式比较正确 | ✅ | DocumentLoader 返回 "CBZ" (uppercase)，ReaderToolbar 比较 "CBZ" — 匹配 |
| CFI 格式 page-N | ✅ | `ReaderToolbar.tsx:148` — `cfi = "page-${pageIndex}"` (0-based) |
| Note 没有 highlightId | ✅ | `NotebookPanel.tsx:127-137` — addNote 不传 highlightId |
| 格式感知 UI：CBZ 显示页面号 | ✅ | `NotebookPanel.tsx:502-504, 524` — 从 cfi 提取 pageNumber + 1 |
| 点击导航到页 | ✅ | `NotebookPanel.tsx:396` — handleCbzNoteClick |
| 编辑/删除 CBZ 笔记 | ✅ | `NotebookPanel.tsx:397-398` |

---

## 流程 6：AI 测验生成 ✅ 通过

**追踪路径：**
配置 → startQuiz → generateQuizQuestions → 读 reading_sessions → RAG search → LLM 生成 → JSON 解析 → 去重 → 存 quiz_questions + question_bank

| 验证点 | 结果 | 位置 |
|--------|------|------|
| startQuiz 调用 generateQuizQuestions | ✅ | `quiz-store.ts:117` — 传入 config + aiConfig |
| reading_sessions 查询 | ✅ | `quiz-generator.ts:66-83` — `resolveBookIds`: prefer config.bookIds → `getReadingSessionsByDateRange` |
| RAG search 每条书 | ✅ | `quiz-generator.ts:89-118` — `fetchChunksForBook` → hybridSearch × 5 queries |
| LLM 生成 prompt | ✅ | `quiz-generator.ts:156-196` — 包含 contexts + config 参数 |
| JSON 解析（多级容错） | ✅ | `quiz-generator.ts:226-369` — extractJson → tryParseAsQuestions → findBalancedArray → findJsonObjects |
| 去重 (stemHash) | ✅ | `quiz-generator.ts:390-394` — `validateAndMapQuestion` 检查 existingHashes + seenStems |
| 容错：JSON 格式错误不崩溃 | ✅ | `quiz-generator.ts:257-259, 553-556` — tryParseAsQuestions 失败返回 null，generateQuizQuestions 返回 [] |
| 问答题 isCorrect = null | ✅ | `quiz-store.ts:170` — `short_answer` 类型 `isCorrect: undefined` |
| 数据库建表 (quiz_sessions, quiz_questions, question_bank) | ✅ | `db-core.ts:713-734` — CREATE TABLE IF NOT EXISTS |
| insertQuizQuestions 写入 DB | ✅ | `quiz-queries.ts:124-158` |
| generateVariantQuestion (变种题) | ✅ | `quiz-generator.ts:594-689` — 含 fallback |

### 🔍 调用链完整确认

```
startQuiz(QuizConfig, AIConfig?)
  → generateQuizQuestions(config, aiConfig)
    → resolveBookIds(config)
      → getReadingSessionsByDateRange(timeRange)
    → fetchChunksForBook(bookId) per book
      → search({query, bookId, mode:"hybrid"})
    → buildGenerationPrompt(config, contexts)
    → createChatModel(aiConfig) from llm-provider.ts
    → model.invoke(prompt)
    → tryParseAsQuestions(response)
      → extractJson → JSON.parse → findBalancedArray → findJsonObjects
    → validateAndMapQuestion (dedup via stemHash)
  → insertQuizSession(session)
  → insertQuizQuestions(questions)
```

---

## 流程 7：AI 测验答题+报告（桌面） ✅ 通过

**追踪路径：**
QuizPage → 点开始 → QuizPlayer → 逐题作答 → submitAnswer → completeQuiz → buildQuizReport → QuizReport

| 验证点 | 结果 | 位置 |
|--------|------|------|
| QuizPage 三态渲染 | ✅ | `QuizPage.tsx:26-60` — report→QuizReport, isTaking→QuizPlayer, isGenerating→Loading |
| submitAnswer 后立即显示对错 | ✅ | `quiz-store.ts:158-191` — autoGrade non-short_answer, immediate isCorrect |
| 解析展示 | ✅ | `quiz-store.ts:166-170` — isCorrect 字段立即反映在 currentQuestions |
| completeQuiz → buildQuizReport | ✅ | `quiz-store.ts:198-233` — 先 persist short_answer，再 buildQuizReport |
| 报告：summary | ✅ | `report-builder.ts:42-73` — totalQuestions, correctCount, correctRate, timeSpent, correctRateByType |
| 报告：weakAreas | ✅ | `report-builder.ts:79-122` — 从 question_bank tags 聚合错误率 |
| 报告：history | ✅ | `report-builder.ts:151-175` — getQuizSessions(10) → 趋势 |
| 报告：questions | ✅ | `report-builder.ts:35` — `{ summary, weakAreas, history, questions }` |
| 中断恢复：loadSession | ✅ | `quiz-store.ts:249-265` — loadSession(id) → getQuizSession + getQuizQuestions → firstUnanswered |

---

## 流程 8：AI 测验答题+报告（移动） ✅ 通过

**追踪路径：**
同流程 7 但移动端。

| 验证点 | 结果 | 位置 |
|--------|------|------|
| 底部 Tab 有 "测验" 入口 | ✅ | `TabNavigator.tsx:95-102` — Quiz tab with BrainIcon |
| TabParamList 含 Quiz | ✅ | `TabNavigator.tsx:27` — `Quiz: undefined` |
| QuizScreen 使用 useQuizStore | ✅ | `QuizScreen.tsx:18, 77` |
| QuizPlayerScreen 使用 useQuizStore | ✅ | `QuizPlayerScreen.tsx:15, 66` |
| QuizReportScreen 使用 buildQuizReport | ✅ | `QuizReportScreen.tsx:16` |
| QuizPlayer 路由注册 | ✅ | `RootNavigator.tsx:143-144` |
| QuizReport 路由注册 | ✅ | `RootNavigator.tsx:148-149` |
| startQuiz 调用一致 | ✅ | `QuizScreen.tsx:125, 152` |
| 同一天测验防重复 | ✅ | `QuizScreen.tsx:112-117`（检查 sessions 中当天已完成项） |

---

## 汇总

| 流程 | 判定 | 关键发现 |
|------|------|----------|
| 1. MD 文件导入 | ✅ 通过 | 去重、双文件、格式全部正确 |
| 2. 新建+编辑 MD (桌面) | ✅ 通过 | tiptap 编辑器、3s debounce、双文件读写 |
| 3. 新建+编辑 MD (移动) | ✅ 通过 | 6 工具栏按钮、预览切换、后台保存 |
| 4. PDF 高亮 | ⚠️ 有警告 | 功能完整但 location 字段未按 PRD 设计为联合类型；改用 quadPoints + 伪造 CFI |
| 5. CBZ 页面笔记 | ✅ 通过 | 格式感知、无 highlightId、页面号显示 |
| 6. AI 测验生成 | ✅ 通过 | 调用链完整(reading_sessions→RAG→LLM→parse→dedup)，JSON 容错良好 |
| 7. 测验答题+报告 (桌面) | ✅ 通过 | submitAnswer→autoGrade→completeQuiz→buildQuizReport→{summary,weakAreas,history,questions} |
| 8. 测验答题+报告 (移动) | ✅ 通过 | Tab 入口、路由注册、共用 useQuizStore |

### 全局说明

1. **BookFormat 类型双轨制**：`document-loader.ts:9` 定义大写 BookFormat（"CBZ", "PDF", "EPUB"...），`types/book.ts:27` 定义小写 BookFormat（"cbz", "pdf", "epub"...）。两者不相交——store/类型层面用小写，reader 渲染用大写。功能上正确（比较始终在同一域），但不一致，建议未来统一。

2. **PDF 高亮的 CFI 设计方案**：PRD 描述了一个 `location` 联合类型，但实际实现在现有 Highlight 类型上追加 `quadPoints` 字段，通过 `isPdf = !!h.quadPoints` 区分格式。这一方案避免了 schema migration 的破坏性变更，功能正确，但偏离了 PRD 设计。