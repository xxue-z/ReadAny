# AGENTS.md

## 技术栈

TypeScript (strict), React 19, Tauri 2 (桌面), Expo 54 (移动), Vite 7, Tailwind CSS 4, Radix UI, Zustand, SQLite, foliate-js, LangChain.js, Transformers.js / ONNX Runtime, pnpm 9 monorepo.

## 项目结构

```
packages/core/src/   — 共享：类型、DB、AI、RAG、状态、工具。不依赖任何平台。
packages/app/        — 桌面端 Tauri + React
packages/app-expo/   — 移动端 Expo / React Native
packages/cli/        — CLI 工具
packages/foliate-js/ — 电子书渲染引擎
docs/                — 设计文档
```

core 关键子目录：`ai/`（LLM provider / agent / tools / embedding）、`db/`（SQLite 查询）、`epub/`（EPUB 草稿编辑）、`rag/`（向量化 + hybrid search）、`stores/`（Zustand）、`sync/`（WebDAV / S3）、`types/`、`utils/`

## 常用命令

```bash
pnpm install
pnpm tauri dev              # 桌面端
pnpm expo:ios:simulator     # 移动端 iOS 模拟器
pnpm expo:android           # 移动端 Android
pnpm test                   # 运行 core 测试
pnpm --filter @readany/cli test
pnpm lint                   # Biome check
pnpm lint:fix               # Biome check --write
```

## 代码规范

- **格式化**：Biome — 2 空格、双引号、分号、行宽 100
- **命名**：组件 PascalCase，函数 camelCase，文件 kebab-case 或 camelCase
- **类型**：strict 模式，禁止显式 `any`（warn），未使用变量/导入 warn
- **导入**：Biome `organizeImports` 自动排序
- **测试**：Vitest，`*.test.ts`，放在 `__tests__/` 或与源文件并列
- **commit**：约定式提交格式（如 `feat:` / `fix:` / `docs:`）
- **分支**：`codex/` 前缀

## 架构关键点

### AI / LLM
- `llm-provider.ts`：统一 LLM 入口，支持 OpenAI / Anthropic / Google / DeepSeek / Ollama / LM Studio / Custom
- 流式响应经 `streaming.ts` 处理，深度思考模型的 ` 标签由 `think-tag-parser.ts` 剥离

### 本地嵌入模型 (RAG)
- 引擎抽象：`ILocalEmbeddingEngine`，桌面用 `WebWorkerEmbeddingEngine`（Transformers.js in Worker），移动用 `NativeOnnxEmbeddingEngine`（onnxruntime-react-native）
- 内置模型：`builtin-embedding-models.ts`（all-MiniLM-L6-v2、bge-small-zh-v1.5 等）
- 建库查询必须同模型：`EmbeddingProvenance` 校验维度一致性

### 电子书格式
- 10 种格式：epub、pdf、mobi、azw、azw3、cbz、fb2、fbz、txt、umd
- TXT/UMD 导入时经 `TxtToEpubConverter` / `UmdToEpubConverter` 转为 EPUB
- 读取时 `DocumentLoader` 通过魔术字节检测格式，转发给对应 foliate-js 解析器

### 数据层
- SQLite 为主存储（`db/database.ts` 统一入口），Zustand store 通过 `persist.ts` 中间件持久化 JSON
- 同步后端：WebDAV / S3，通过 `sync-backend-factory.ts` 创建

### 桌面 vs 移动差异
- 桌面用 `@huggingface/transformers` (onnxruntime-web) 跑本地模型；移动用 `onnxruntime-react-native`
- 移动端 Metro bundler 将 `onnxruntime-node`/`onnxruntime-web` 重定向到空 stub
- 移动端 Hermes 引擎 TextDecoder 只支持 UTF-8，需 `text-encoding` polyfill 处理 GBK 等编码
- 桌面用 `@tauri-apps/plugin-fs` / `@tauri-apps/plugin-http`；移动用 `expo-file-system`

## 开发注意事项

- 数据模型变更只追加，不做破坏性修改（除非有 migration）
- 文件写入使用 UTF8NoBOM 编码
- `bookId` 序列化时注意 Long 型精度
<!-- CODEGRAPH_START -->
## CodeGraph

当仓库包含 `.codegraph/` 目录时，优先用 CodeGraph（MCP 工具 `codegraph_explore` 或 shell `codegraph explore`）理解代码结构和定位符号，它会返回相关符号源码及调用路径。无结果时回退到 grep/Read。
<!-- CODEGRAPH_END -->

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **ReadAny** (13654 symbols, 35557 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/ReadAny/context` | Codebase overview, check index freshness |
| `gitnexus://repo/ReadAny/clusters` | All functional areas |
| `gitnexus://repo/ReadAny/processes` | All execution flows |
| `gitnexus://repo/ReadAny/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
