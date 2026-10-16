# AGENTS.md — ReadAny

## 项目概述

ReadAny 是一个本地优先的 AI 电子书阅读器，支持桌面端（macOS / Windows / Linux）和移动端（iOS / Android）。

**核心能力**：AI 对话阅读、RAG 语义检索、高亮笔记、TTS 语音朗读、阅读统计、WebDAV/S3 跨设备同步。

**仓库地址**：`https://github.com/xxue-z/ReadAny`（fork 自 `codedogQBY/ReadAny`）

**技术栈**：

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2 (Rust) |
| 移动端 | Expo (React Native) |
| 前端 | React 19 + TypeScript |
| 构建 | Vite 7 |
| 样式 | Tailwind CSS 4 + Radix UI |
| 状态管理 | Zustand |
| 数据库 | SQLite (better-sqlite3 / expo-sqlite) + sqlite-vec |
| 电子书渲染 | foliate-js |
| AI / LLM | LangChain.js + LangGraph |
| 本地嵌入模型 | Transformers.js (桌面) / ONNX Runtime (移动) |
| 包管理 | pnpm 9 (monorepo workspace) |
| 代码规范 | Biome (lint + format) |

## 项目结构

```
ReadAny/
├── packages/
│   ├── core/            # 共享核心：类型、DB、AI、RAG、状态、工具
│   ├── app/             # 桌面端 (Tauri + React)
│   ├── app-expo/        # 移动端 (Expo / React Native)
│   ├── cli/             # CLI 工具 (readany 命令)
│   ├── feedback-worker/ # 反馈收集 Worker
│   └── foliate-js/      # 电子书渲染引擎 (fork 自 johnfactotum/foliate-js)
├── docs/                # 设计文档
│   ├── feature-expansion/  # 功能扩展方案
│   ├── readany-cli/        # CLI 设计文档
│   ├── stats-design/       # 统计模块设计
│   └── webdav-import/      # WebDAV 导入设计
├── scripts/             # 构建/发布脚本
├── website/             # 官网 (pnpm workspace 成员)
└── assets/              # 截图等静态资源
```

### 核心包（`packages/core/src/`）关键子目录

| 目录 | 职责 |
|------|------|
| `ai/` | LLM provider、agent、tools、embedding、streaming、system-prompt |
| `db/` | SQLite 查询封装（book / highlight / note / session / chunk 等） |
| `epub/` | EPUB 草稿编辑系统（draft / chapter / metadata / toc / export） |
| `pdf/` | PDF 章节提取 |
| `rag/` | RAG 管道：向量化、搜索 (hybrid: vector+BM25)、chunker、tokenizer |
| `reader/` | 阅读器逻辑：弹出菜单、进度、TOC、注释排序 |
| `stats/` | 阅读统计服务：热力图、趋势、连续天数 |
| `stores/` | Zustand 状态管理：settings、library、reader、chat、vector-model 等 |
| `sync/` | 同步后端：WebDAV / S3 |
| `types/` | TypeScript 类型定义 |
| `utils/` | 工具函数：txt-to-epub、umd-parser、api 等 |
| `i18n/` | 多语言（zh / en / ja / ko / fr / es / zh-TW） |

## 常用命令

```bash
# 安装依赖
pnpm install

# 桌面端开发
pnpm tauri dev

# 移动端开发 (需要 Xcode 或 Android Studio)
pnpm expo:ios              # iOS 设备
pnpm expo:ios:simulator    # iOS 模拟器
pnpm expo:android          # Android
pnpm expo:start            # 启动 Metro bundler

# 构建
pnpm tauri build           # 桌面端构建
pnpm build                 # app 包构建

# 测试
pnpm test                  # core 包测试
pnpm --filter @readany/cli test  # CLI 测试

# 代码检查
pnpm lint                  # Biome check
pnpm lint:fix              # Biome check --write

# CLI 工具
pnpm cli                   # 开发模式运行 CLI
pnpm cli:build             # 构建 CLI
```

## 代码规范

- **格式化**：Biome，2 空格缩进，双引号，分号，行宽 100
- **命名**：组件 PascalCase，函数 camelCase，文件 kebab-case 或 camelCase
- **类型**：严格模式，禁止 `any`（warn），未使用变量/导入 warn
- **导入顺序**：Biome `organizeImports` 自动排序
- **测试**：Vitest，测试文件以 `.test.ts` 结尾，放在 `__tests__/` 下或与源文件并列
- **提交**：使用 `git commit` 直接提交（已配置 prefix_rule），commit message 使用约定式提交格式

## 架构要点

### AI / LLM 配置

- LLM provider 系统在 `packages/core/src/ai/llm-provider.ts`，支持 OpenAI / Anthropic / Google / DeepSeek / Ollama / LM Studio / Custom
- 所有 AI 调用通过 LangChain 的 `BaseChatModel` 统一接口
- 流式响应通过 `streaming.ts` 处理，`think-tag-parser.ts` 处理深度思考模型的 ` 标签

### 本地小模型 (RAG)

- 桌面端：Transformers.js（onnxruntime-web）在 Web Worker 中运行，模型从 HuggingFace 下载，缓存于 Cache Storage
- 移动端：onnxruntime-react-native 原生推理，模型下载到 `documentDirectory/readany-models/`
- 内置模型在 `packages/core/src/ai/builtin-embedding-models.ts`：all-MiniLM-L6-v2 (23MB)、bge-small-zh-v1.5 (24MB) 等
- 引擎抽象：`ILocalEmbeddingEngine` → `WebWorkerEmbeddingEngine`（桌面）/ `NativeOnnxEmbeddingEngine`（移动）
- 向量化管道：`vectorize-trigger.ts` → chunker → generateLocalEmbeddings → sqlite-vec 存储
- 检索：`search.ts` 的 hybridSearch（向量 + BM25），查询和建库必须用同一模型（dimension provenance 校验）

### 电子书格式

支持的 10 种格式：EPUB、PDF、MOBI、AZW、AZW3、CBZ、FB2、FBZ、TXT、UMD

- **直接渲染**（foliate-js）：EPUB、PDF、MOBI/AZW/AZW3、CBZ、FB2/FBZ
- **转 EPUB 后渲染**：TXT（`TxtToEpubConverter`）、UMD（`UmdToEpubConverter`）
- 格式检测：`document-loader.ts` 通过魔术字节判断

### 桌面端架构

- Tauri 2 + React，入口 `packages/app/src/main.tsx`
- Rust 端提供：文件系统访问、vector DB (sqlite-vec)、HTTP fetch (绕过 CORS)
- `tauri-platform-service.ts` 封装所有平台 API
- ZIP 处理用 `@zip.js/zip.js`
- 反馈 Worker 部署在 `https://feedback.readany.top`

### 移动端架构

- Expo SDK 54 + React Native，入口 `packages/app-expo/`
- 原生模块：onnxruntime-react-native、react-native-track-player (TTS)、expo-sqlite
- metro.config.js 重定向 `onnxruntime-node` / `onnxruntime-web` 到空 stub
- `expo-platform-service.ts` 封装平台 API

### 数据持久化

- 所有数据存 SQLite（通过 `packages/core/src/db/database.ts` 统一访问）
- 同步：WebDAV 或 S3，通过 `sync-backend-factory.ts` 创建后端
- Zustand store 通过 `persist.ts` 中间件持久化到 JSON 文件

## 功能扩展方案

详见 [`docs/feature-expansion/`](./docs/feature-expansion/)：

| Phase | 文档 | 内容 |
|---|---|---|
| Phase 1 | `01-doc-edit-tags.md` | MD 导入、文档编辑器、标签/分组管理 |
| Phase 2 | `02-cross-format-notes.md` | PDF 高亮与笔记、全格式笔记覆盖 |
| Phase 3 | `03-ai-quiz.md` | AI 测验生成、题库、自定义测验、报告 |

## 开发注意事项

- **分支命名**：使用 `codex/` 前缀（如 `codex/phase1-doc-edit`）
- **最小改动**：数据模型变更只追加列/表，不做破坏性修改（除非有 migration）
- **恢复数据路径**：`resolveDesktopDataPath` 或 `getPlatformService().getDataDir()`
- **混淆 Long 型**：`bookId` 是 `number` 但可能很大，序列化时注意精度
- **Hermes 限制**：移动端 Hermes 引擎只支持 UTF-8 TextDecoder，需要 `text-encoding` polyfill 处理 GBK 等编码
- **中文 TXT 编码**：`TxtToEpubConverter` 自动检测 GBK/GB18030/UTF-8/UTF-16/Shift-JIS

<!-- CODEGRAPH_START -->
## CodeGraph

当仓库中包含 `.codegraph/` 目录时，优先使用 CodeGraph 来理解代码结构和定位符号，它在一个请求中返回相关符号的源码及其调用路径。可以用 codegraph 的 MCP 工具（`codegraph_explore`）或 shell 命令（`codegraph explore`）查询。如果有 `.codegraph/` 目录但没有结果，则回退到 grep/Read 等方式。
<!-- CODEGRAPH_END -->
