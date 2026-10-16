# Phase 3 — AI 测验模块

## 3.1 数据模型

新建 SQLite 表：

```sql
CREATE TABLE quiz_sessions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,   -- daily | monthly | quarterly | custom
  config TEXT NOT NULL, -- JSON
  status TEXT NOT NULL, -- pending | in_progress | completed | graded
  score REAL,
  time_spent INTEGER,
  created_at INTEGER,
  completed_at INTEGER
);

CREATE TABLE quiz_questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES quiz_sessions(id),
  type TEXT NOT NULL,   -- single_choice | multi_choice | true_false | short_answer
  stem TEXT NOT NULL,
  options TEXT,         -- JSON array: [{key, content}]
  answer TEXT NOT NULL, -- JSON: {correct, explanation}
  source_book_id TEXT,
  source_chapter TEXT,
  difficulty INTEGER,   -- 1-3
  user_answer TEXT,
  is_correct INTEGER,
  created_at INTEGER
);

CREATE TABLE question_bank (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES quiz_questions(id),
  tags TEXT,            -- JSON: 知识点标签
  usage_count INTEGER DEFAULT 0,
  correct_rate REAL,
  variant_of TEXT,
  created_at INTEGER
);
```

## 3.2 测验生成器

新建 `packages/core/src/quiz/quiz-generator.ts`：

- 输入：`QuizConfig`（书本范围 `bookIds[]`、时间范围 `{start, end}`、题型占比、题目总数、难度、题库/AI 占比、错题占比）
- 流程：
  1. 根据时间范围从 `reading_sessions` 表获取用户读过的书和章节
  2. 通过 RAG（`search.ts` 的 `hybridSearch`）检索相关文本片段作为出题素材
  3. 如果题库占比 > 0，从 `question_bank` 按标签/正确率/使用次数加权抽取
  4. 如果错题占比 > 0，从历史错题（`is_correct=0` 的 `quiz_questions`）抽取
  5. 调用 LLM（复用 `llm-provider.ts`）批量生成题目，prompt 包含：
     - 文本素材 + 题目类型 + 数量 + 难度要求
     - 已有题库题目（用于生成变种题时参考）
     - 输出格式要求：结构化 JSON
  6. LLM 返回的题目解析入库 → `quiz_questions` + `question_bank`
- 变种题生成：对题库中题目调 LLM 改变表述、替换选项、调整难度

## 3.3 测验模板

- 每日测验 = `QuizConfig{ timeRange: [today-7d, today], count: 10, difficulty: 1-2 }`
- 月度测验 = `QuizConfig{ timeRange: [today-30d, today], count: 50, difficulty: 1-3 }`
- 季度同模式，`timeRange: [today-90d, today]`
- 自定义测验：用户可调所有参数

## 3.4 测验 UI

新建独立 Tab "测验"，包含子页面：

| 页面 | 内容 |
|---|---|
| 今日测验 | 每日测验入口卡片 + 最近7天完成情况 + 开始按钮 |
| 自定义测验 | 配置表单：书本选择、时间范围、题型占比滑块、题目数量、难度、题库/AI占比、错题占比 |
| 题库浏览 | 按书/标签/题型/正确率筛选，支持逐题预览 |
| 答题界面 | 逐题展示，倒计时，答题后立即显示对错+解析 |
| 测验报告 | 总分、各题型正确率、知识点薄弱分析、历史趋势图、原卷回顾 |

## 3.5 测验报告

新建 `packages/core/src/quiz/report-builder.ts`：
- 汇总统计：总分、正确率、用时、各题型正确率
- 薄弱知识点分析：按 `question_bank.tags` 聚合错误率
- 历史趋势：多场测验的分数/正确率折线图
- 原卷列表：每场测验的所有题目详览

## 关键文件变更

| 文件 | 变更 |
|---|---|
| `packages/core/src/quiz/quiz-generator.ts` | **新增** LLM 出题引擎 |
| `packages/core/src/quiz/report-builder.ts` | **新增** 报告生成 |
| `packages/core/src/db/database.ts` | migration: quiz 相关表 |
| `packages/app/src/components/quiz/` | **新增** QuizTab、DailyQuiz、CustomQuiz、QuizPlayer、QuizReport、QuestionBank 等 |
| `packages/core/src/stores/quiz-store.ts` | **新增** 测验状态管理 |

## 测试策略

- **测验生成器**：mock LLM 响应，验证题目解析、题库抽取、变种逻辑
- **每日测验模板**：固定日期注入 `reading_sessions`，验证生成的 config 参数

## 假设

- 测验 LLM 调用复用现有 `llm-provider.ts`（支持用户已配置的任意 AI endpoint）
- 题库中题目以 `source_book_id + stem_hash` 做去重
- 变种题生成复用同一 LLM 调用（prompt 中带参考题）
- 问答题不自动批改，由用户自行对照答案
